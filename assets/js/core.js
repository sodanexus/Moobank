/* Primitives techniques sans dépendance au DOM, partagées avec les tests. */
(function exposeMoobankCore(root) {
  'use strict';

  const ACCOUNT_TYPES = Object.freeze([
    'PEA', 'CTO', 'PEE', 'PER', 'AV', 'Crypto',
    'Livret', 'Livret A', 'LDDS', 'Autre livret', 'Immo', 'Autre'
  ]);
  const ACCOUNT_TYPE_SET = new Set(ACCOUNT_TYPES);

  function requiredString(value, field, maxLength = 240) {
    const normalized = String(value ?? '').trim();
    if (!normalized || normalized.length > maxLength) throw new TypeError(`Champ invalide : ${field}`);
    return normalized;
  }

  function finiteNumber(value, field, options = {}) {
    if (options.nullable && (value === null || value === undefined || value === '')) return null;
    if (!options.nullable && (value === null || value === undefined || value === '' ||
        (typeof value === 'string' && !value.trim()))) {
      throw new TypeError(`Nombre invalide : ${field}`);
    }
    const normalized = Number(value);
    const min = options.min ?? -Number.MAX_VALUE;
    const max = options.max ?? Number.MAX_VALUE;
    if (!Number.isFinite(normalized) || normalized < min || normalized > max) {
      throw new TypeError(`Nombre invalide : ${field}`);
    }
    return normalized;
  }

  function dateKey(value, field) {
    const normalized = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new TypeError(`${field} invalide`);
    const parsed = new Date(`${normalized}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
      throw new TypeError(`${field} invalide`);
    }
    return normalized;
  }

  function validateAccountRecord(row) {
    requiredString(row?.id, 'accounts.id', 100);
    requiredString(row?.user_id, 'accounts.user_id', 100);
    requiredString(row?.name, 'accounts.name', 160);
    if (!ACCOUNT_TYPE_SET.has(String(row?.type || ''))) throw new TypeError('Type de compte invalide');
    finiteNumber(row?.solde, 'accounts.solde', { min: 0, max: 1e12, nullable: true });
    return row;
  }

  function validatePositionRecord(row) {
    requiredString(row?.id, 'positions.id', 100);
    requiredString(row?.user_id, 'positions.user_id', 100);
    requiredString(row?.account_id, 'positions.account_id', 100);
    requiredString(row?.symbol, 'positions.symbol', 80);
    if (String(row?.name ?? '').length > 300) throw new TypeError('Nom de position invalide');
    finiteNumber(row?.qty, 'positions.qty', { min: Number.EPSILON, max: 1e15 });
    finiteNumber(row?.price, 'positions.price', { min: 0, max: 1e15 });
    finiteNumber(row?.current, 'positions.current', { min: 0, max: 1e15 });
    finiteNumber(row?.change, 'positions.change', { min: -1e15, max: 1e15, nullable: true });
    finiteNumber(row?.change_percent, 'positions.change_percent', { min: -1e9, max: 1e9, nullable: true });
    finiteNumber(row?.last_updated, 'positions.last_updated', { min: 0, max: 1e16, nullable: true });
    return row;
  }

  function validatePositionPriceUpdate(row) {
    requiredString(row?.id, 'positions.id', 100);
    finiteNumber(row?.current, 'positions.current', { min: 0, max: 1e15 });
    finiteNumber(row?.change, 'positions.change', { min: -1e15, max: 1e15, nullable: true });
    finiteNumber(row?.change_percent ?? row?.changePercent, 'positions.change_percent', { min: -1e9, max: 1e9, nullable: true });
    finiteNumber(row?.last_updated ?? row?.lastUpdated, 'positions.last_updated', { min: 0, max: 1e16, nullable: true });
    return row;
  }

  function validatePrelevementRecord(row) {
    requiredString(row?.id, 'prelevements.id', 100);
    requiredString(row?.user_id, 'prelevements.user_id', 100);
    requiredString(row?.name, 'prelevements.name', 180);
    finiteNumber(row?.amount, 'prelevements.amount', { min: Number.EPSILON, max: 1e9 });
    if (!['mensuel', 'trimestriel', 'annuel'].includes(row?.freq)) throw new TypeError('Fréquence invalide');
    if (!['courtage', 'frais', 'credit', 'abonnement', 'autre'].includes(row?.cat)) throw new TypeError('Catégorie invalide');
    finiteNumber(row?.split, 'prelevements.split', { min: 1, max: 99 });
    return row;
  }

  function validateTransactionRecord(row) {
    requiredString(row?.id, 'transactions.id', 100);
    requiredString(row?.user_id, 'transactions.user_id', 100);
    if (!['buy', 'sell', 'edit'].includes(row?.type)) throw new TypeError('Type de mouvement invalide');
    requiredString(row?.symbol, 'transactions.symbol', 80);
    finiteNumber(row?.qty, 'transactions.qty', { min: Number.EPSILON, max: 1e15 });
    finiteNumber(row?.price, 'transactions.price', { min: 0, max: 1e15 });
    finiteNumber(row?.ts, 'transactions.ts', { min: 0, max: 1e16 });
    finiteNumber(row?.old_qty, 'transactions.old_qty', { min: 0, max: 1e15, nullable: true });
    finiteNumber(row?.old_price, 'transactions.old_price', { min: 0, max: 1e15, nullable: true });
    return row;
  }

  function validateHistoryRecord(row) {
    requiredString(row?.user_id, 'patrimoine_history.user_id', 100);
    dateKey(row?.date, 'Date de snapshot');
    finiteNumber(row?.value, 'patrimoine_history.value', { min: 0, max: 1e15 });
    return row;
  }

  function validateGoalRecord(row) {
    requiredString(row?.id, 'goals.id', 100);
    requiredString(row?.user_id, 'goals.user_id', 100);
    requiredString(row?.name, 'goals.name', 180);
    finiteNumber(row?.target, 'goals.target', { min: Number.EPSILON, max: 1e15 });
    finiteNumber(row?.current, 'goals.current', { min: 0, max: 1e15 });
    return row;
  }

  function validateCachedDataset(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('Cache invalide');
    const collections = ['accounts', 'positions', 'prelevements', 'transactions', 'patrimoineHistory', 'goals'];
    for (const name of collections) {
      if (!Array.isArray(data[name])) throw new TypeError(`Cache incomplet : ${name}`);
    }
    for (const account of data.accounts) {
      requiredString(account?.id, 'cache.accounts.id', 100);
      requiredString(account?.name, 'cache.accounts.name', 160);
      if (!ACCOUNT_TYPE_SET.has(String(account?.type || ''))) throw new TypeError('Cache compte invalide');
      finiteNumber(account?.solde, 'cache.accounts.solde', { min: 0, max: 1e12, nullable: true });
    }
    for (const position of data.positions) {
      requiredString(position?.id, 'cache.positions.id', 100);
      requiredString(position?.accountId, 'cache.positions.accountId', 100);
      requiredString(position?.symbol, 'cache.positions.symbol', 80);
      finiteNumber(position?.qty, 'cache.positions.qty', { min: Number.EPSILON, max: 1e15 });
      finiteNumber(position?.price, 'cache.positions.price', { min: 0, max: 1e15 });
      finiteNumber(position?.current, 'cache.positions.current', { min: 0, max: 1e15 });
    }
    for (const prelevement of data.prelevements) {
      requiredString(prelevement?.id, 'cache.prelevements.id', 100);
      requiredString(prelevement?.name, 'cache.prelevements.name', 180);
      finiteNumber(prelevement?.amount, 'cache.prelevements.amount', { min: Number.EPSILON, max: 1e9 });
      if (!['mensuel', 'trimestriel', 'annuel'].includes(prelevement?.freq)) throw new TypeError('Cache prélèvement invalide');
      if (!['courtage', 'frais', 'credit', 'abonnement', 'autre'].includes(prelevement?.cat)) throw new TypeError('Cache prélèvement invalide');
      finiteNumber(prelevement?.split, 'cache.prelevements.split', { min: 1, max: 99 });
    }
    for (const transaction of data.transactions) {
      requiredString(transaction?.id, 'cache.transactions.id', 100);
      if (!['buy', 'sell', 'edit'].includes(transaction?.type)) throw new TypeError('Cache mouvement invalide');
      requiredString(transaction?.symbol, 'cache.transactions.symbol', 80);
      finiteNumber(transaction?.qty, 'cache.transactions.qty', { min: Number.EPSILON, max: 1e15 });
      finiteNumber(transaction?.price, 'cache.transactions.price', { min: 0, max: 1e15 });
      finiteNumber(transaction?.ts, 'cache.transactions.ts', { min: 0, max: 1e16 });
    }
    for (const point of data.patrimoineHistory) {
      dateKey(point?.date, 'Cache historique');
      finiteNumber(point?.value, 'cache.patrimoineHistory.value', { min: 0, max: 1e15 });
    }
    for (const goal of data.goals) {
      requiredString(goal?.id, 'cache.goals.id', 100);
      requiredString(goal?.name, 'cache.goals.name', 180);
      finiteNumber(goal?.target, 'cache.goals.target', { min: Number.EPSILON, max: 1e15 });
      finiteNumber(goal?.current, 'cache.goals.current', { min: 0, max: 1e15 });
    }
    return data;
  }

  function createDataCacheEnvelope(userId, data, savedAt = Date.now()) {
    const normalizedUserId = requiredString(userId, 'cache.userId', 100);
    validateCachedDataset(data);
    const normalizedSavedAt = finiteNumber(savedAt, 'cache.savedAt', { min: 1, max: 1e16 });
    return { version: 1, userId: normalizedUserId, savedAt: normalizedSavedAt, data };
  }

  function parseDataCacheEnvelope(raw, userId, maxAgeMs = 1000 * 60 * 60 * 24 * 90, now = Date.now()) {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || parsed.version !== 1 || parsed.userId !== userId) throw new TypeError('Cache utilisateur invalide');
    finiteNumber(parsed.savedAt, 'cache.savedAt', { min: 1, max: now });
    if (now - parsed.savedAt > maxAgeMs) throw new TypeError('Cache expiré');
    validateCachedDataset(parsed.data);
    return parsed;
  }

  function mergePositionPriceUpdates(currentPositions, updates, missingIds = []) {
    const missing = new Set(Array.from(missingIds || []));
    const byId = new Map(Array.from(updates || []).map(update => [update.id, update]));
    return Array.from(currentPositions || []).flatMap(position => {
      if (missing.has(position.id)) return [];
      const update = byId.get(position.id);
      if (!update) return [position];
      validatePositionPriceUpdate(update);
      return [{
        ...position,
        current: update.current,
        change: update.change ?? null,
        changePercent: update.changePercent ?? null,
        lastUpdated: update.lastUpdated ?? null,
      }];
    });
  }

  async function mapWithConcurrency(items, limit, mapper) {
    const list = Array.from(items || []);
    const concurrency = Math.max(1, Math.min(list.length || 1, Number(limit) || 1));
    const results = new Array(list.length);
    let cursor = 0;

    async function worker() {
      while (cursor < list.length) {
        const index = cursor++;
        results[index] = await mapper(list[index], index, list);
      }
    }

    await Promise.all(Array.from({ length: concurrency }, worker));
    return results;
  }

  function normalizeQuoteCurrency(rawCurrency) {
    const raw = String(rawCurrency || 'EUR');
    const upper = raw.toUpperCase();
    if (raw === 'GBp' || upper === 'GBX') {
      return { currency: 'GBP', unitFactor: 0.01 };
    }
    return { currency: upper, unitFactor: 1 };
  }

  function groupMonthlyContributions(accounts, plan) {
    const totals = {};
    for (const account of Array.from(accounts || [])) {
      const accountId = String(account?.id || '');
      const type = String(account?.type || 'Autre');
      if (!accountId) continue;
      const rawAmount = Number(plan?.[accountId]);
      const amount = Number.isFinite(rawAmount) ? Math.max(0, Math.min(100000, rawAmount)) : 0;
      totals[type] = (totals[type] || 0) + amount;
    }
    return totals;
  }

  async function runCompensatedOperation({ commit, audit, rollback }) {
    if (typeof commit !== 'function' || typeof audit !== 'function' || typeof rollback !== 'function') {
      throw new TypeError('Opération compensée incomplète');
    }

    const committed = await commit();
    try {
      const audited = await audit(committed);
      return { committed, audited };
    } catch (operationError) {
      try {
        await rollback(committed, operationError);
      } catch (rollbackError) {
        const error = new Error('operation_rollback_failed');
        error.name = 'MoobankRollbackError';
        error.operationError = operationError;
        error.rollbackError = rollbackError;
        throw error;
      }
      throw operationError;
    }
  }

  async function retryOperation(task, options = {}) {
    if (typeof task !== 'function') throw new TypeError('Opération à retenter absente');
    const attempts = Math.max(1, Math.min(5, Number(options.attempts) || 1));
    const delays = Array.isArray(options.delays) ? options.delays : [];
    const shouldRetry = typeof options.shouldRetry === 'function' ? options.shouldRetry : () => true;

    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await task(attempt);
      } catch (error) {
        if (attempt >= attempts - 1 || !shouldRetry(error, attempt)) throw error;
        const delay = Math.max(0, Number(delays[Math.min(attempt, delays.length - 1)]) || 0);
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // ── DCA : renfort d'une ligne et lecture de l'historique ─────────────────────
  const STALE_SYNC_DAYS = 35;

  // Calcule la nouvelle quantité et le nouveau PRU après un achat de `bought`
  // titres à `buyPrice`, frais éventuels inclus. Retourne null si impossible
  // (PRU actuel inconnu ou saisie invalide).
  function computeReinforcement({ qty, pru, bought, buyPrice, fees = 0 }) {
    const q = Number(qty), c = Number(pru), b = Number(bought), px = Number(buyPrice), f = Number(fees) || 0;
    if (![q, c, b, px].every(Number.isFinite) || q <= 0 || c <= 0 || b <= 0 || px < 0 || f < 0) return null;
    const newQty = q + b;
    const invested = b * px + f;
    const newPru = (q * c + invested) / newQty;
    return {
      qty: Number(newQty.toFixed(8)),
      price: Number(newPru.toFixed(10)),
      invested: Number(invested.toFixed(2)),
    };
  }

  // Montant réellement investi par un mouvement.
  // { kind: 'invest'|'sell'|'correction'|'unknown', amount }
  function transactionInvestment(tx) {
    if (!tx) return { kind: 'unknown', amount: null };
    if (tx.type === 'buy') return { kind: 'invest', amount: tx.qty * tx.price };
    if (tx.type === 'sell') return { kind: 'sell', amount: tx.qty * tx.price };
    if (tx.type !== 'edit') return { kind: 'unknown', amount: null };
    const oldQty = tx.oldQty, oldPrice = tx.oldPrice;
    if (!Number.isFinite(oldQty) || !Number.isFinite(oldPrice) || oldQty <= 0 || oldPrice <= 0 || !(tx.price > 0)) {
      return { kind: 'unknown', amount: null };
    }
    const amount = tx.qty * tx.price - oldQty * oldPrice;
    if (tx.qty > oldQty && amount > 0) return { kind: 'invest', amount: Number(amount.toFixed(2)) };
    return { kind: 'correction', amount: Number(amount.toFixed(2)) };
  }

  // Dernier mouvement (achat/modif) par couple symbole + compte.
  function lastSyncMap(transactions) {
    const map = new Map();
    for (const tx of transactions || []) {
      if (tx.type === 'sell' || !Number.isFinite(tx.ts)) continue;
      const key = `${tx.symbol}|${tx.accountName}`;
      if (!map.has(key) || tx.ts > map.get(key)) map.set(key, tx.ts);
    }
    return map;
  }

  function syncAgeDays(ts, now = Date.now()) {
    if (!Number.isFinite(ts)) return null;
    return Math.max(0, Math.floor((now - ts) / 86400000));
  }

  const api = Object.freeze({
    ACCOUNT_TYPES,
    mapWithConcurrency,
    normalizeQuoteCurrency,
    groupMonthlyContributions,
    runCompensatedOperation,
    retryOperation,
    validateAccountRecord,
    validatePositionRecord,
    validatePositionPriceUpdate,
    validatePrelevementRecord,
    validateTransactionRecord,
    validateHistoryRecord,
    validateGoalRecord,
    validateCachedDataset,
    createDataCacheEnvelope,
    parseDataCacheEnvelope,
    mergePositionPriceUpdates,
    STALE_SYNC_DAYS,
    computeReinforcement,
    transactionInvestment,
    lastSyncMap,
    syncAgeDays,
  });
  root.MoobankCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
