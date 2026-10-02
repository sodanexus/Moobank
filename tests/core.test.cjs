const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'core.js'), 'utf8');
const sandbox = { module: { exports: {} }, console, setTimeout, clearTimeout };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'core.js' });
const core = sandbox.module.exports;

test('la limite de concurrence est respectée et l’ordre reste stable', async () => {
  let running = 0;
  let maximum = 0;
  const values = await core.mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async value => {
    running++;
    maximum = Math.max(maximum, running);
    await new Promise(resolve => setTimeout(resolve, 4));
    running--;
    return value * 2;
  });
  assert.equal(maximum, 2);
  assert.deepEqual(Array.from(values), [2, 4, 6, 8, 10, 12]);
});

test('les cotations britanniques en pence sont normalisées en livres', () => {
  assert.deepEqual({ ...core.normalizeQuoteCurrency('GBp') }, { currency: 'GBP', unitFactor: 0.01 });
  assert.deepEqual({ ...core.normalizeQuoteCurrency('GBX') }, { currency: 'GBP', unitFactor: 0.01 });
  assert.deepEqual({ ...core.normalizeQuoteCurrency('usd') }, { currency: 'USD', unitFactor: 1 });
});

test('le plan mensuel est regroupé correctement par poche', () => {
  const accounts = [
    { id: 'house', type: 'Livret' },
    { id: 'pea', type: 'PEA' },
    { id: 'cto', type: 'CTO' },
    { id: 'btc', type: 'Crypto' },
    { id: 'second-pea', type: 'PEA' },
  ];
  const grouped = core.groupMonthlyContributions(accounts, {
    house: 1000,
    pea: 400,
    cto: 50,
    btc: 108,
    'second-pea': 25,
  });
  assert.deepEqual({ ...grouped }, { Livret: 1000, PEA: 425, CTO: 50, Crypto: 108 });
  assert.equal(Object.values(grouped).reduce((sum, amount) => sum + amount, 0), 1583);
});

test('une erreur d’historique déclenche la compensation après la position', async () => {
  const calls = [];
  await assert.rejects(
    core.runCompensatedOperation({
      commit: async () => { calls.push('position'); return 'ok'; },
      audit: async () => { calls.push('historique'); throw new Error('audit indisponible'); },
      rollback: async committed => { calls.push(`retour:${committed}`); },
    }),
    /audit indisponible/
  );
  assert.deepEqual(calls, ['position', 'historique', 'retour:ok']);
});

test('une erreur avant écriture ne lance jamais de compensation', async () => {
  let rollbackCalled = false;
  await assert.rejects(
    core.runCompensatedOperation({
      commit: async () => { throw new Error('position refusée'); },
      audit: async () => {},
      rollback: async () => { rollbackCalled = true; },
    }),
    /position refusée/
  );
  assert.equal(rollbackCalled, false);
});

test('un échec de compensation est distingué explicitement', async () => {
  await assert.rejects(
    core.runCompensatedOperation({
      commit: async () => {},
      audit: async () => { throw new Error('historique refusé'); },
      rollback: async () => { throw new Error('retour refusé'); },
    }),
    error => error.name === 'MoobankRollbackError' && error.operationError.message === 'historique refusé'
  );
});

test('une écriture temporairement refusée est retentée sans dépasser la limite', async () => {
  let attempts = 0;
  const value = await core.retryOperation(async () => {
    attempts++;
    if (attempts < 3) throw new Error('temporaire');
    return 42;
  }, { attempts: 3, delays: [0, 0], shouldRetry: () => true });
  assert.equal(value, 42);
  assert.equal(attempts, 3);
});

test('une erreur définitive n’est pas retentée', async () => {
  let attempts = 0;
  await assert.rejects(core.retryOperation(async () => {
    attempts++;
    throw new Error('définitive');
  }, { attempts: 3, shouldRetry: () => false }), /définitive/);
  assert.equal(attempts, 1);
});

test('les nouveaux livrets sont acceptés sans retirer le type historique', () => {
  for (const type of ['Livret', 'Livret A', 'LDDS', 'Autre livret']) {
    assert.doesNotThrow(() => core.validateAccountRecord({
      id: `account-${type}`,
      user_id: 'user-1',
      name: 'Épargne',
      type,
      solde: 6000,
    }));
  }
  assert.throws(() => core.validateAccountRecord({
    id: 'account-invalid', user_id: 'user-1', name: 'Test', type: 'Inconnu', solde: 0,
  }), /Type de compte/);
});

test('une cotation invalide est bloquée avant toute sauvegarde', () => {
  assert.throws(() => core.validatePositionPriceUpdate({
    id: 'position-1', current: Number.NaN, change: 0, changePercent: 0, lastUpdated: Date.now(),
  }), /positions\.current/);
  assert.throws(() => core.validatePositionPriceUpdate({
    id: 'position-1', current: null, change: null, changePercent: null, lastUpdated: null,
  }), /positions\.current/);
});

test('une position supprimée pendant le refresh est retirée sans écraser les autres champs', () => {
  const state = [
    { id: 'a', qty: 4, price: 12, current: 13 },
    { id: 'b', qty: 8, price: 20, current: 21 },
  ];
  const merged = core.mergePositionPriceUpdates(state, [
    { id: 'a', current: 14, change: 1, changePercent: 7.7, lastUpdated: 1234 },
  ], ['b']);
  assert.equal(merged.length, 1);
  assert.deepEqual({ ...merged[0] }, {
    id: 'a', qty: 4, price: 12, current: 14, change: 1, changePercent: 7.7, lastUpdated: 1234,
  });
});

test('la performance neutralise les versements quand le capital investi est connu', () => {
  const perf = core.periodPerformance(
    { value: 10000, invested: 10000 },
    { value: 10920, invested: 10510 },
  );
  assert.equal(perf.exact, true);
  assert.equal(Math.round(perf.gain * 100) / 100, 410);
  assert.equal(perf.netFlow, 510);
  assert.ok(Math.abs(perf.pct - 4.0) < 0.1);
});

test('sans capital investi au départ, la variation brute est marquée inexacte', () => {
  const perf = core.periodPerformance({ value: 10000 }, { value: 10920, invested: 10510 });
  assert.equal(perf.exact, false);
  assert.equal(perf.gain, 920);
  assert.equal(perf.netFlow, null);
});

test('limite connue : vendre une position en plus-value retire cette plus-value du calcul', () => {
  // Vente de 20 % d'une position (valeur 10 000 €, coût 9 000 €) : la plus-value
  // réalisée (200 €) sort de la plus-value latente, car seuls les coûts sont suivis.
  // Un suivi exact des ventes demanderait des flux datés (étape ultérieure).
  const perf = core.periodPerformance(
    { value: 10000, invested: 9000 },
    { value: 8000, invested: 7200 },
  );
  assert.equal(perf.exact, true);
  assert.equal(Math.round(perf.gain), -200);
});

test('le capital investi retombe sur la valeur actuelle sans PRU', () => {
  assert.equal(core.positionInvested(10, 100, 120), 1000);
  assert.equal(core.positionInvested(10, 0, 120), 1200);
  assert.equal(core.positionInvested(0, 100, 120), 0);
});

test('la validation accepte un historique avec ou sans capital investi', () => {
  const base = { user_id: 'u1', date: '2026-10-02', value: 1000 };
  assert.doesNotThrow(() => core.validateHistoryRecord(base));
  assert.doesNotThrow(() => core.validateHistoryRecord({ ...base, invested: 900 }));
  assert.throws(() => core.validateHistoryRecord({ ...base, invested: -1 }));
});

test('la reconstitution retrouve le capital investi avant et après une édition de PRU', () => {
  const pru = 10510 / 105;
  const result = core.reconstructInvestedHistory({
    accounts: [{ id: 'a1', name: 'PEA', type: 'PEA' }],
    positions: [{ accountId: 'a1', symbol: 'SP500', qty: 105, price: pru, current: 104 }],
    transactions: [{
      type: 'edit', symbol: 'SP500', accountName: 'PEA',
      qty: 105, price: pru, oldQty: 100, oldPrice: 100,
      ts: Date.parse('2026-09-15T12:00:00Z'),
    }],
    history: [
      { date: '2026-09-10', value: 10000 },
      { date: '2026-09-20', value: 10920 },
    ],
  });
  assert.equal(result.stoppedAt, null);
  assert.deepEqual(Array.from(result.points).map(p => [p.date, p.invested]), [
    ['2026-09-10', 10000],
    ['2026-09-20', 10510],
  ]);
});

test('la reconstitution annule un achat et restitue le coût d’une vente partielle', () => {
  // État actuel : 80 parts à PRU 100 (8 000 €). Avant : 100 parts (10 000 €), vendues 20, après un achat de 10 à 90.
  const result = core.reconstructInvestedHistory({
    accounts: [{ id: 'a1', name: 'CTO', type: 'CTO' }],
    positions: [{ accountId: 'a1', symbol: 'X', qty: 80, price: 100, current: 110 }],
    transactions: [
      { type: 'sell', symbol: 'X', accountName: 'CTO', qty: 20, price: 120, ts: Date.parse('2026-09-18T10:00:00Z') },
    ],
    history: [{ date: '2026-09-17', value: 11000 }, { date: '2026-09-19', value: 8800 }],
  });
  assert.deepEqual(Array.from(result.points).map(p => [p.date, p.invested]), [
    ['2026-09-17', 10000],
    ['2026-09-19', 8000],
  ]);
});

test('la reconstitution ne touche pas aux points déjà renseignés et inclut les soldes fixes', () => {
  const result = core.reconstructInvestedHistory({
    accounts: [
      { id: 'a1', name: 'PEA', type: 'PEA' },
      { id: 'a2', name: 'Livret A', type: 'Livret A', solde: 5000 },
    ],
    positions: [{ accountId: 'a1', symbol: 'X', qty: 10, price: 100, current: 100 }],
    transactions: [],
    history: [
      { date: '2026-09-01', value: 6000, invested: 5900 },
      { date: '2026-09-02', value: 6100 },
    ],
  });
  assert.deepEqual(Array.from(result.points).map(p => [p.date, p.invested]), [['2026-09-02', 6000]]);
});

test('la reconstitution s’arrête devant une vente totale au PRU inconnu', () => {
  const result = core.reconstructInvestedHistory({
    accounts: [{ id: 'a1', name: 'PEA', type: 'PEA' }],
    positions: [{ accountId: 'a1', symbol: 'Y', qty: 10, price: 50, current: 55 }],
    transactions: [
      { type: 'sell', symbol: 'GONE', accountName: 'PEA', qty: 5, price: 20, ts: Date.parse('2026-09-10T10:00:00Z') },
    ],
    history: [{ date: '2026-09-05', value: 900 }, { date: '2026-09-12', value: 550 }],
  });
  assert.equal(result.stoppedAt, '2026-09-10');
  assert.deepEqual(Array.from(result.points).map(p => p.date), ['2026-09-12']);
});
