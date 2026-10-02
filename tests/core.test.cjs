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

test('les flux, frais et opérations de marché produisent une trésorerie exacte', () => {
  const transactions = [
    { type: 'deposit', accountId: 'pea', amount: 1000 },
    { type: 'buy', accountId: 'pea', qty: 4, price: 100, fees: 2 },
    { type: 'dividend', accountId: 'pea', amount: 12 },
    { type: 'sell', accountId: 'pea', qty: 1, price: 110, fees: 1 },
    { type: 'fee', accountId: 'pea', amount: 3 },
    { type: 'withdrawal', accountId: 'pea', amount: 50 },
  ];
  assert.equal(core.transactionCashImpact(transactions[1]), -402);
  assert.equal(core.transactionCashImpact(transactions[3]), 109);
  assert.deepEqual({ ...core.cashBalancesByAccount(transactions) }, { pea: 666 });
});

test('la synthèse sépare valeur de marché, liquidités et apports nets', () => {
  const result = core.wealthBreakdown(
    [{ id: 'pea', type: 'PEA' }, { id: 'livret', type: 'Livret A', solde: 2000 }],
    [{ accountId: 'pea', qty: 5, current: 120 }],
    [{ type: 'deposit', accountId: 'pea', amount: 500 }, { type: 'fee', accountId: 'pea', amount: 10 }]
  );
  assert.deepEqual({ ...result, cashByAccount: { ...result.cashByAccount } }, {
    marketValue: 600, fixedValue: 2000, cash: 490, total: 3090, netContributions: 500, cashByAccount: { pea: 490 },
  });
});

test('une ancienne modification quantité/PRU reconstitue son flux de trésorerie', () => {
  const legacyEdit = {
    type: 'edit', accountId: 'pea', qty: 15, price: 120,
    oldQty: 10, oldPrice: 100,
  };
  assert.equal(core.transactionCashImpact(legacyEdit), -800);
  assert.deepEqual({ ...core.cashBalancesByAccount([legacyEdit]) }, { pea: -800 });
});
