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

test('renfort : nouvelle quantité et PRU pondéré', () => {
  const r = core.computeReinforcement({ qty: 10, pru: 100, bought: 2, buyPrice: 110 });
  assert.equal(r.qty, 12);
  assert.equal(r.invested, 220);
  assert.ok(Math.abs(r.price - (1000 + 220) / 12) < 1e-6);
});

test('renfort : les frais augmentent le PRU et l\'apport', () => {
  const r = core.computeReinforcement({ qty: 10, pru: 100, bought: 2, buyPrice: 110, fees: 1.5 });
  assert.equal(r.invested, 221.5);
  assert.ok(Math.abs(r.price - (1000 + 221.5) / 12) < 1e-6);
});

test('renfort : refusé si PRU inconnu ou saisie invalide', () => {
  assert.equal(core.computeReinforcement({ qty: 10, pru: 0, bought: 2, buyPrice: 110 }), null);
  assert.equal(core.computeReinforcement({ qty: 10, pru: 100, bought: 0, buyPrice: 110 }), null);
  assert.equal(core.computeReinforcement({ qty: 10, pru: 100, bought: 2, buyPrice: NaN }), null);
});

test('apport d\'un mouvement : achat DCA, correction, inconnu', () => {
  const invest = core.transactionInvestment({ type: 'edit', qty: 12, price: 101.6666667, oldQty: 10, oldPrice: 100 });
  assert.equal(invest.kind, 'invest');
  assert.ok(Math.abs(invest.amount - 220) < 0.01);
  assert.equal(core.transactionInvestment({ type: 'edit', qty: 10, price: 98, oldQty: 10, oldPrice: 100 }).kind, 'correction');
  assert.equal(core.transactionInvestment({ type: 'edit', qty: 12, price: 100, oldQty: 10, oldPrice: 0 }).kind, 'unknown');
  assert.equal(core.transactionInvestment({ type: 'edit', qty: 12, price: 100 }).kind, 'unknown');
  assert.equal(core.transactionInvestment({ type: 'buy', qty: 2, price: 50 }).amount, 100);
});

test('fraîcheur : dernier mouvement par symbole + compte, ventes ignorées', () => {
  const map = core.lastSyncMap([
    { type: 'edit', symbol: 'ESE.PA', accountName: 'PEA', ts: 300 },
    { type: 'edit', symbol: 'ESE.PA', accountName: 'PEA', ts: 100 },
    { type: 'sell', symbol: 'ESE.PA', accountName: 'PEA', ts: 900 },
    { type: 'buy', symbol: 'BTC-EUR', accountName: 'Crypto', ts: 50 },
  ]);
  assert.equal(map.get('ESE.PA|PEA'), 300);
  assert.equal(map.get('BTC-EUR|Crypto'), 50);
  assert.equal(core.syncAgeDays(0, 86400000 * 36), 36);
  assert.equal(core.syncAgeDays(undefined), null);
});
