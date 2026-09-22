// ─── CONSTANTES CENTRALES ─────────────────────────────────────────────────────
// Source de vérité unique pour tous les types et labels.
// Ne plus écrire 'Livret', 'CTO' etc. en dur dans le code — utiliser ces objets.

// Types de comptes avec solde fixe (pas des positions de marché)
const FIXED_ACCOUNT_TYPES = new Set(['Livret', 'Livret A', 'LDDS', 'Autre livret', 'Immo', 'Autre']);

const ACCOUNT_TYPE_LABELS = Object.freeze({
  Livret: 'Autre livret',
  'Livret A': 'Livret A',
  LDDS: 'LDDS',
  'Autre livret': 'Autre livret',
});

// Tag CSS par type de compte
const TAG_CLASS_MAP = {
  PEA: 'tag-pea', CTO: 'tag-cto', PEE: 'tag-pee', PER: 'tag-per',
  AV: 'tag-av', Crypto: 'tag-crypto', Immo: 'tag-immo',
  Livret: 'tag-livret', 'Livret A': 'tag-livret', LDDS: 'tag-livret',
  'Autre livret': 'tag-livret', Autre: 'tag-autre',
};

// Libellés des catégories de prélèvements
const PREL_CAT_LABELS = {
  courtage: 'Courtage', frais: 'Frais gestion', credit: 'Crédit',
  abonnement: 'Abonnement', autre: 'Autre',
};

// Coefficient mensuel par fréquence de prélèvement
const PREL_FREQ_MONTHLY = { mensuel: 1, trimestriel: 1 / 3, annuel: 1 / 12 };

// ─── GESTION D'ERREURS GLOBALE ────────────────────────────────────────────────
// Capture toutes les erreurs JS non gérées et les affiche proprement
// plutôt que de laisser l'app silencieusement cassée.

window.onerror = function(message, source, lineno, colno, error) {
  console.error('[Moobank] Erreur non gérée', { message, source, lineno, colno, error });
  // Affiche le banner offline avec le message d'erreur
  const b = document.getElementById('offlineBanner');
  if (b) {
    b.textContent = '⚠️ Une erreur est survenue — rechargez la page si l\'app ne répond plus.';
    b.classList.remove('warn');
    b.classList.remove('hidden');
    setTimeout(() => b.classList.add('hidden'), 8000);
  }
  return false; // false = le navigateur logue aussi dans sa console
};

window.addEventListener('unhandledrejection', function(event) {
  // Ignore les erreurs réseau bénignes (fetch annulé, timeout Yahoo Finance…)
  const reason = event.reason;
  const msg = reason?.message || String(reason);
  if (msg.includes('NetworkError') || msg.includes('Failed to fetch') || msg.includes('AbortError')) return;
  console.error('[Moobank] Promise non gérée', reason);
});

// ─── SUPABASE INIT ────────────────────────────────────────────────────────────
const SUPA_URL = 'https://tjmbrwazzuhbsufxbjpu.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqbWJyd2F6enVoYnN1ZnhianB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTAwNTAsImV4cCI6MjA4Nzc4NjA1MH0.d4tplwCcMvcelCqqTMA6oh4Ur2phngwamrIJOjBXxog';
// Le SDK renouvelle les sessions expirées. Ne pas supprimer leurs refresh tokens
// ni ceux d'une autre application hébergée sur la même origine GitHub Pages.
const sb = supabase.createClient(SUPA_URL, SUPA_KEY);

// ─── STATE ───────────────────────────────────────────────────────────────────
let currentUser = null;
let accounts = [];
let prelevements = [];
let positions = [];
let positionHistory = {};
let patrimoineHistory = [];
let transactions = [];
let selectedTicker = null;
let searchTimeout = null;
let suggestionsIndex = -1;
let tickerSearchSeq = 0;
let _tickerSuggestions = [];  // suggestions ticker courantes (évite les attributs HTML encodés)
let currentChartPeriod = '1S';
let _eurUsdInterval = null;
let _priceRefreshInterval = null;
let _lastRenderedTotal = null;
let _totalAnimationToken = 0;
const ALLOC_COLORS = ['#55e6b1','#65a8ff','#f1c56b','#ff7189','#b79aff','#63d6ed','#ff9a6b'];

// ─── ONGLETS ─────────────────────────────────────────────────────────────────
const TAB_ORDER = ['overview', 'details', 'simulator'];
let currentTabName = 'overview';
let tabTransitionToken = 0;

function switchTab(name, btn) {
  if (!TAB_ORDER.includes(name) || name === currentTabName) return;
  const transitionToken = ++tabTransitionToken;
  const current = document.querySelector('.tab-panel.active');

  // Toutes les vues utilisent le même fondu : aucun déplacement horizontal
  // susceptible de donner une impression de zoom ou de largeur différente.
  if (current) {
    current.style.transition = `opacity ${TIMING_TAB_TRANSITION}ms ease`;
    current.style.opacity = '0';
  }

  setTimeout(() => {
    if (transitionToken !== tabTransitionToken) return;
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.classList.remove('active', 'slide-left');
      p.style.opacity = '';
      p.style.transform = '';
      p.style.transition = '';
      p.style.animation = '';
    });
    document.querySelectorAll('#mainTabs .tab-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    const next = document.getElementById('tab-' + name);
    if (!next) return;
    next.classList.add('active');
    if (btn) {
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
    }
    currentTabName = name;
    if (name === 'overview') loadMarketNews();
    if (name === 'details') { renderAccounts(); renderPositions(); renderPrelevements(); }
    if (name === 'simulator') {
      renderGoals();
      requestAnimationFrame(() => {
        simUpdate();
      });
    }
  }, current ? TIMING_TAB_TRANSITION : 0);
}

// ─── ANIMATION TIMING CONSTANTS ─────────────────────────────────────────────────────────────────────────────────────
const TIMING_TOAST_CLOSE     = 5000; // durée affichage toast (banner offline)
const TIMING_TOAST_SUCCESS   = 2500; // durée toast succès
const TIMING_TOAST_ERROR     = 4000; // durée toast erreur
const TIMING_TOAST_FADE      = 300;  // durée fade-out toast
const TIMING_BANNER_AUTO     = 8000; // durée affichage banner erreur
const TIMING_RESIZE_DEBOUNCE = 80;   // debounce resize
const TIMING_SIM_DEBOUNCE    = 80;   // debounce simulateur
const TIMING_TICKER_SEARCH   = 300;  // debounce recherche ticker
const TIMING_TICKER_TIMEOUT  = 3000; // timeout abort recherche ticker
const TIMING_LIVRET_FOCUS    = 50;   // délai focus input livret
const TIMING_HISTORY_CLOSE   = 1800; // délai auto-fermeture modale historique après import
const TIMING_TAB_TRANSITION  = 160;  // durée animation sortie d'onglet avant affichage suivant
const TIMING_LOAD_TIMEOUT    = 8000; // timeout chargement des données Supabase
const TIMING_SUPABASE_RETRY  = 1000; // délai avant retry Supabase après timeout
const JWT_RETRY_DELAYS       = [1000, 2000, 4000]; // max. 4 lectures, jamais de nouvelle connexion automatique
const TIMING_PROXY_FETCH     = 5000; // timeout fetch via proxy CORS (Yahoo Finance & RSS)
const DATA_CACHE_PREFIX      = 'moobank:last-valid:';
const DATA_CACHE_MAX_AGE     = 1000 * 60 * 60 * 24 * 90;

// ─── AUTH ─────────────────────────────────────────────────────────────────────
let _authSubmitTask = null;
let _appInitTask = null;
let _appReadyTask = null;
let _authUser = null;          // session SDK, distincte des données réellement chargées
let _authEventVersion = 0;
let _failedLoad = null;
let _usingCachedData = false;
let _cacheWriteTimer = null;
let _cacheSyncTask = null;
let _cacheRetryTimer = null;
let _cacheRetryIndex = 0;

function canRetryDataLoad() {
  return _failedLoad && _failedLoad.kind !== 'auth_required' &&
    document.getElementById('auth-email').value.trim().toLowerCase() === _failedLoad.email.toLowerCase();
}

function syncAuthSubmitButton() {
  const busy = Boolean(_authSubmitTask || _appInitTask);
  const btn = document.getElementById('authSubmitBtn');
  btn.disabled = busy;
  btn.setAttribute('aria-busy', String(busy));
  btn.textContent = _appInitTask ? 'Chargement…' : _authSubmitTask ? 'Connexion…' :
    canRetryDataLoad() ? 'Réessayer' : 'Se connecter';
}

function setAuthLoadStatus(message) {
  document.getElementById('loadingStatus').textContent = message;
  const status = document.getElementById('auth-error');
  status.style.color = 'var(--text)';
  status.textContent = message;
}

function isTransientAuthError(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const message = String(error?.message || '');
  return [408, 425, 429].includes(status) || status >= 500 ||
    /fetch|network|timeout|temporar/i.test(message);
}

async function submitAuth() {
  if (_authSubmitTask || _appInitTask) return;
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.style.color = 'var(--loss)';
  errEl.textContent = '';
  if (!email || (!password && !canRetryDataLoad())) { errEl.textContent = 'Email et mot de passe requis'; return; }
  const task = {};
  _authSubmitTask = task;
  syncAuthSubmitButton();
  try {
    // Après un échec de lecture, réutiliser la session : recréer un JWT ne ferait
    // que recommencer l'attente si son horodatage est momentanément rejeté.
    if (canRetryDataLoad()) {
      const { data, error } = await sb.auth.getSession();
      if (_authSubmitTask !== task) return;
      if (!error && data.session?.user?.id === _failedLoad?.userId) {
        _authUser = data.session.user;
        await initApp(data.session.user);
        return;
      }
      if (!password) { errEl.textContent = 'Veuillez saisir votre mot de passe pour vous reconnecter.'; return; }
    }
    const res = await MoobankCore.retryOperation(async attempt => {
      if (attempt > 0) {
        errEl.style.color = 'var(--text)';
        errEl.textContent = `Connexion momentanément indisponible — nouvel essai (${attempt + 1}/3)…`;
      }
      const response = await sb.auth.signInWithPassword({ email, password });
      if (response.error) throw response.error;
      return response;
    }, {
      attempts: 3,
      delays: [600, 1600],
      shouldRetry: isTransientAuthError,
    });
    if (_authSubmitTask !== task) return;
    if (!res.data.session?.user) throw new Error('Session indisponible — veuillez réessayer.');
    _authUser = res.data.session.user;
    // Même point d'entrée que le démarrage et les événements SDK ; un seul
    // chargement peut tourner pour cet utilisateur.
    await initApp(res.data.session.user);
  } catch(e) {
    if (_authSubmitTask !== task) return;
    errEl.style.color = 'var(--loss)';
    const msg = e.message || 'Erreur réseau — veuillez réessayer.';
    errEl.textContent = /Invalid login/i.test(msg) ? 'Email ou mot de passe incorrect' :
      /fetch|network|load failed/i.test(msg) ? 'Erreur réseau — veuillez réessayer.' : msg;
  } finally {
    if (_authSubmitTask === task) {
      _authSubmitTask = null;
      syncAuthSubmitButton();
    }
  }
}

async function signOut() {
  try {
    const { error } = await sb.auth.signOut();
    if (error) throw error;
  } catch(e) {
    console.error('[Moobank] signOut error:', e.message);
    showToast('Déconnexion impossible pour le moment. Réessayez.', 'error');
  }
}

function updateUserUI(user) {
  const email = user.email || '';
  const initials = email.slice(0,2).toUpperCase();
  const name = email.split('@')[0];
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);
  const mobileAvatar = document.getElementById('mobileUserAvatar');
  const mobileName = document.getElementById('mobileUserName');
  const mobileEmail = document.getElementById('mobileUserEmail');
  if (mobileAvatar) mobileAvatar.textContent = initials;
  if (mobileName) mobileName.textContent = displayName;
  if (mobileEmail) mobileEmail.textContent = email;
}

// ─── MENU PRINCIPAL ─────────────────────────────────────────────────────────
let mobileActionsPreviousInert = false;

function setActionsMenuExpanded(expanded) {
  document.querySelectorAll('#mobileActionsBtn, #mobileNavActionsBtn').forEach(button => {
    button.setAttribute('aria-expanded', String(expanded));
  });
}

function openMobileActions(trigger) {
  const overlay = document.getElementById('mobileActionsModal');
  const app = document.getElementById('mainApp');
  if (!overlay || !app || !currentUser ||
      app.classList.contains('hidden') || document.querySelector('.modal-overlay.open')) return;
  updateUserUI(currentUser);
  overlay.inert = false;
  const returnTarget = trigger instanceof HTMLElement
    ? trigger
    : [...document.querySelectorAll('#mobileActionsBtn, #mobileNavActionsBtn')].find(button => button.offsetParent !== null);
  setActionsMenuExpanded(true);
  showDialog(overlay, '#mobileAddAccountBtn');
  _dialogReturnFocus = returnTarget || null;
  mobileActionsPreviousInert = app.inert;
  app.inert = true;
}

function closeMobileActions() {
  const overlay = document.getElementById('mobileActionsModal');
  if (!overlay?.classList.contains('open')) return;
  document.getElementById('mainApp').inert = mobileActionsPreviousInert;
  setActionsMenuExpanded(false);
  hideDialog(overlay);
  overlay.inert = true;
}

function runMobileAction(action) {
  if (!document.getElementById('mobileActionsModal')?.classList.contains('open')) return;
  if (!['position', 'account', 'export', 'signout'].includes(action)) return;
  closeMobileActions();
  if (action === 'position' || action === 'account') openModal(action);
  else if (action === 'export') exportDataBackup();
  else if (action === 'signout') signOut();
}

function exportDataBackup() {
  simEnsureContributionPlan();
  const payload = {
    format: 'moobank-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    accounts,
    positions,
    prelevements,
    transactions,
    patrimoineHistory,
    goals,
    trajectoryPlan: { ...simContributionPlan }
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `moobank-backup-${parisDateKey()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  showToast('✅ Sauvegarde JSON téléchargée', 'success');
}

// ─── DB LOAD ──────────────────────────────────────────────────────────────────
function dataLoadError(kind, queryErrors = []) {
  const error = new Error(`load_failed: ${kind}`);
  error.kind = kind;
  error.queryErrors = queryErrors;
  return error;
}

function canceledDataLoad() {
  return new DOMException('Chargement annulé', 'AbortError');
}

async function loadAllData(uid, signal) {
  if (signal.aborted) throw canceledDataLoad();
  const controller = new AbortController();
  let timer;
  let onAbort;
  const stopped = new Promise((_, reject) => {
    onAbort = () => { reject(canceledDataLoad()); controller.abort(); };
    signal.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => { reject(dataLoadError('timeout')); controller.abort(); }, TIMING_LOAD_TIMEOUT);
  });
  const tables = ['accounts', 'positions', 'prelevements', 'transactions', 'patrimoine_history', 'goals'];
  try {
    // Seulement des lectures. Le timeout annule les requêtes encore en cours.
    const results = await Promise.race([
      Promise.all(tables.map(table => sb.from(table).select('*').eq('user_id', uid)
        .order(table === 'transactions' ? 'ts' : table === 'patrimoine_history' ? 'date' : 'created_at',
          { ascending: table !== 'transactions' })
        .abortSignal(controller.signal))),
      stopped
    ]);
    if (signal.aborted) throw canceledDataLoad();
    const errors = results.flatMap((response, i) => {
      if (!response.error && Array.isArray(response.data)) return [];
      return [{ table: tables[i], status: response.status || response.error?.status || 0,
        code: response.error?.code || '', message: response.error?.message || 'Réponse inattendue' }];
    });
    if (errors.length) {
      // PostgREST met le statut HTTP sur la réponse, pas sur response.error.
      const futureJwt = errors.every(e => (e.status === 401 || e.code === 'PGRST303') && /JWT issued at future/i.test(e.message));
      const temporary = errors.every(e => e.status === 0 || [408, 425, 429].includes(Number(e.status)) || e.status >= 500);
      const kind = futureJwt ? 'jwt_future' : temporary ? 'network' :
        errors.every(e => e.status === 401) ? 'auth_required' : 'database';
      throw dataLoadError(kind, errors);
    }
    const [accRes, posRes, prelRes, txRes, histRes, goalsRes] = results;
    // Aucune affectation globale ici : l'appelant doit encore vérifier que la
    // session n'a pas changé. Toutes les tables sont validées avant le commit.
    const loaded = {
      accounts: accRes.data.map(a => ({ id: a.id, name: a.name, type: a.type, solde: a.solde })),
      positions: posRes.data.map(p => ({
        id: p.id, symbol: p.symbol, name: p.name, exchange: p.exchange,
        currency: p.currency, accountId: p.account_id, qty: p.qty,
        price: p.price, current: p.current, change: p.change,
        changePercent: p.change_percent, lastUpdated: p.last_updated
      })),
      prelevements: prelRes.data.map(p => ({
        id: p.id, name: p.name, amount: p.amount, freq: p.freq, cat: p.cat, split: p.split || 1
      })),
      transactions: txRes.data.map(t => ({
        id: t.id, type: t.type, symbol: t.symbol, name: t.name,
        qty: t.qty, price: t.price, accountName: t.account_name, ts: t.ts,
        ...(t.old_qty !== undefined && t.old_qty !== null ? { oldQty: t.old_qty } : {}),
        ...(t.old_price !== undefined && t.old_price !== null ? { oldPrice: t.old_price } : {}),
      })),
      patrimoineHistory: histRes.data.map(h => ({ date: h.date, value: h.value })),
      goals: goalsRes.data.map(g => ({
        id: g.id, name: g.name, target: g.target, current: g.current,
        emoji: g.emoji, createdAt: new Date(g.created_at).getTime()
      }))
    };
    MoobankCore.validateCachedDataset(loaded);
    return loaded;
  } catch (error) {
    if (signal.aborted) throw canceledDataLoad();
    if (!error.kind && /fetch|network|load failed/i.test(error.message || '')) throw dataLoadError('network');
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    controller.abort();
  }
}

function waitForDataRetry(ms, signal) {
  if (signal.aborted) return Promise.reject(canceledDataLoad());
  return new Promise((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); reject(canceledDataLoad()); };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

// ─── DERNIÈRE SITUATION VALIDE ───────────────────────────────────────────────
// Ce cache ne contient ni email, ni mot de passe, ni jeton. Il est isolé par
// identifiant utilisateur et n'est utilisé qu'après validation de la session.
function dataCacheKey(userId) {
  return DATA_CACHE_PREFIX + userId;
}

function currentDataSnapshot() {
  return { accounts, positions, prelevements, transactions, patrimoineHistory, goals };
}

function assignLoadedData(loaded) {
  MoobankCore.validateCachedDataset(loaded);
  ({ accounts, positions, prelevements, transactions, patrimoineHistory, goals } = loaded);
  positionHistory = {};
}

function persistDataCache(userId, data) {
  if (!userId || _usingCachedData) return;
  try {
    const envelope = MoobankCore.createDataCacheEnvelope(userId, data);
    localStorage.setItem(dataCacheKey(userId), JSON.stringify(envelope));
  } catch (error) {
    console.warn('[Moobank] cache local non enregistré :', error.message);
  }
}

function scheduleDataCacheWrite() {
  if (!currentUser || _usingCachedData) return;
  clearTimeout(_cacheWriteTimer);
  _cacheWriteTimer = setTimeout(() => persistDataCache(currentUser.id, currentDataSnapshot()), 120);
}

function readDataCache(userId) {
  try {
    const raw = localStorage.getItem(dataCacheKey(userId));
    if (!raw) return null;
    return MoobankCore.parseDataCacheEnvelope(raw, userId, DATA_CACHE_MAX_AGE);
  } catch (error) {
    console.warn('[Moobank] cache local ignoré :', error.message);
    return null;
  }
}

function cacheDateLabel(savedAt) {
  const date = new Date(savedAt);
  if (!Number.isFinite(date.getTime())) return 'date inconnue';
  return date.toLocaleString('fr-FR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

function setCachedDataMode(active, savedAt) {
  _usingCachedData = active;
  const app = document.getElementById('mainApp');
  const notice = document.getElementById('cachedDataNotice');
  const message = document.getElementById('cachedDataMessage');
  app?.classList.toggle('cached-data-mode', active);
  notice?.classList.toggle('hidden', !active);
  if (active && message) {
    message.textContent = `Données locales du ${cacheDateLabel(savedAt)} · lecture seule`;
  }
}

function scheduleCachedDataRetry() {
  if (!_usingCachedData || !currentUser || _cacheSyncTask) return;
  clearTimeout(_cacheRetryTimer);
  const delays = [4000, 12000, 30000, 60000];
  const delay = delays[Math.min(_cacheRetryIndex, delays.length - 1)];
  _cacheRetryTimer = setTimeout(() => retryCachedDataSync(false), delay);
}

async function retryCachedDataSync(manual = true) {
  if (!_usingCachedData || !currentUser || _cacheSyncTask) return;
  const user = currentUser;
  const task = { controller: new AbortController() };
  _cacheSyncTask = task;
  let shouldScheduleRetry = false;
  const message = document.getElementById('cachedDataMessage');
  if (message) message.textContent = 'Synchronisation en cours…';
  try {
    const loaded = await MoobankCore.retryOperation(
      () => loadAllData(user.id, task.controller.signal),
      { attempts: 2, delays: [1200], shouldRetry: error => ['jwt_future', 'timeout', 'network'].includes(error.kind) }
    );
    if (_cacheSyncTask !== task || currentUser?.id !== user.id) return;
    assignLoadedData(loaded);
    setCachedDataMode(false);
    _cacheRetryIndex = 0;
    _failedLoad = null;
    renderAll();
    renderPrelevements();
    renderGoals();
    persistDataCache(user.id, loaded);
    showToast('✅ Données synchronisées', 'success');
    fetchEurUsd();
    if (positions.length > 0) refreshAllPrices();
    clearInterval(_priceRefreshInterval);
    _priceRefreshInterval = setInterval(() => {
      if (!_usingCachedData && currentUser?.id === user.id && positions.length > 0 && document.visibilityState === 'visible') {
        refreshAllPrices();
      }
    }, 5 * 60 * 1000);
  } catch (error) {
    if (_cacheSyncTask !== task || error.name === 'AbortError') return;
    _cacheRetryIndex++;
    if (message) message.textContent = `Données locales affichées · nouvel essai automatique`;
    if (manual) showToast('Synchronisation encore indisponible.', 'error');
    shouldScheduleRetry = true;
  } finally {
    if (_cacheSyncTask === task) _cacheSyncTask = null;
    if (shouldScheduleRetry) scheduleCachedDataRetry();
  }
}

// ─── DB SAVE ──────────────────────────────────────────────────────────────────
// Chaque écriture cible uniquement la ligne concernée. On ne déduit jamais une
// suppression de l'état local complet : un onglet ancien ne peut donc plus
// supprimer des données ajoutées depuis un autre appareil.
function isTransientDbError(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const message = String(error?.message || '');
  return status === 408 || status === 425 || status === 429 || status >= 500 ||
    /fetch|network|timeout|temporar|JWT issued at future/i.test(message);
}

function retryDbWrite(operation) {
  return MoobankCore.retryOperation(operation, {
    attempts: 4,
    delays: [350, 1000, 2400],
    shouldRetry: isTransientDbError,
  });
}

function assertLiveWrite() {
  if (_usingCachedData) throw new Error('Données locales en lecture seule — synchronisation requise');
  if (!currentUser?.id) throw new Error('Session absente');
}

function accountDbRow(a) {
  return { id: a.id, user_id: currentUser.id, name: a.name, type: a.type, solde: a.solde ?? null };
}

async function saveAccount(account) {
  assertLiveWrite();
  const row = accountDbRow(account);
  MoobankCore.validateAccountRecord(row);
  await retryDbWrite(async () => {
    const { error } = await sb.from('accounts').upsert(row);
    if (error) throw error;
  });
  scheduleDataCacheWrite();
}

function positionDbRow(p) {
  return {
    id: p.id, user_id: currentUser.id, symbol: p.symbol, name: p.name,
    exchange: p.exchange || '', currency: p.currency || 'EUR',
    account_id: p.accountId, qty: p.qty, price: p.price,
    current: p.current ?? 0, change: p.change ?? null,
    change_percent: p.changePercent ?? null, last_updated: p.lastUpdated ?? null
  };
}

async function savePosition(position) {
  assertLiveWrite();
  const row = positionDbRow(position);
  MoobankCore.validatePositionRecord(row);
  await retryDbWrite(async () => {
    const { error } = await sb.from('positions').upsert(row);
    if (error) throw error;
  });
  scheduleDataCacheWrite();
}

async function savePositionPrices(changedPositions, userId) {
  assertLiveWrite();
  if (!userId) throw new Error('Session absente pendant l’actualisation');
  const results = await MoobankCore.mapWithConcurrency(changedPositions, 4, async p => {
    const update = {
      id: p.id,
      current: p.current ?? 0,
      change: p.change ?? null,
      change_percent: p.changePercent ?? null,
      last_updated: p.lastUpdated ?? null
    };
    MoobankCore.validatePositionPriceUpdate(update);
    return retryDbWrite(async () => {
      const { data, error } = await sb
        .from('positions')
        .update({
          current: update.current,
          change: update.change,
          change_percent: update.change_percent,
          last_updated: update.last_updated
        })
        .eq('id', p.id)
        .eq('user_id', userId)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      return { id: p.id, data, error: null };
    });
  });

  // Une ligne absente n'est pas une panne : elle a pu être supprimée depuis
  // un autre onglet/appareil pendant la récupération des cotations. On ne la
  // recrée surtout pas ; l'appelant la retire simplement de son état local.
  const errors = results.map(result => result.error).filter(Boolean);
  if (errors.length) throw errors[0];
  const outcome = {
    updatedIds: results.filter(result => result.data).map(result => result.id),
    missingIds: results.filter(result => !result.data).map(result => result.id),
  };
  scheduleDataCacheWrite();
  return outcome;
}

async function savePrelevement(prelevement) {
  assertLiveWrite();
  const row = {
    id: prelevement.id, user_id: currentUser.id, name: prelevement.name,
    amount: prelevement.amount, freq: prelevement.freq, cat: prelevement.cat,
    split: prelevement.split || 1
  };
  MoobankCore.validatePrelevementRecord(row);
  await retryDbWrite(async () => {
    const { error } = await sb.from('prelevements').upsert(row);
    if (error) throw error;
  });
  scheduleDataCacheWrite();
}

async function saveTransaction(tx) {
  assertLiveWrite();
  const row = {
    id: tx.id, user_id: currentUser.id, type: tx.type,
    symbol: tx.symbol, name: tx.name, qty: tx.qty,
    price: tx.price, account_name: tx.accountName, ts: tx.ts
  };
  if (tx.oldQty  !== undefined) row.old_qty   = tx.oldQty;
  if (tx.oldPrice !== undefined) row.old_price = tx.oldPrice;
  MoobankCore.validateTransactionRecord(row);
  // L'identifiant est créé avant l'écriture : un nouvel essai après une coupure
  // réseau ne peut donc pas dupliquer la ligne d'historique.
  await retryDbWrite(async () => {
    const { error } = await sb.from('transactions').upsert(row, { onConflict: 'id' });
    if (error) throw error;
  });
  scheduleDataCacheWrite();
}

async function savePatrimoineHistory() {
  assertLiveWrite();
  const uid = currentUser.id;
  const last = patrimoineHistory[patrimoineHistory.length - 1];
  if (!last) return;
  const row = { user_id: uid, date: last.date, value: last.value };
  MoobankCore.validateHistoryRecord(row);
  await retryDbWrite(async () => {
    const { error } = await sb.from('patrimoine_history').upsert(row, { onConflict: 'user_id,date' });
    if (error) throw error;
  });
  scheduleDataCacheWrite();
}

// DELETE est volontairement idempotent : si la première réponse réseau se
// perd après le commit, la tentative suivante trouve zéro ligne et valide tout
// de même l'opération. Une vraie erreur Supabase continue d'être propagée.
async function deleteAccountDB(id) {
  assertLiveWrite();
  await retryDbWrite(async () => {
    const { error } = await sb.from('accounts').delete().eq('id', id).eq('user_id', currentUser.id).select('id').maybeSingle();
    if (error) throw error;
  });
  scheduleDataCacheWrite();
}
async function deletePositionDB(id) {
  assertLiveWrite();
  await retryDbWrite(async () => {
    const { error } = await sb.from('positions').delete().eq('id', id).eq('user_id', currentUser.id).select('id').maybeSingle();
    if (error) throw error;
  });
  scheduleDataCacheWrite();
}
async function deletePrelDB(id) {
  assertLiveWrite();
  await retryDbWrite(async () => {
    const { error } = await sb.from('prelevements').delete().eq('id', id).eq('user_id', currentUser.id).select('id').maybeSingle();
    if (error) throw error;
  });
  scheduleDataCacheWrite();
}
async function deleteTransactionDB(id) {
  assertLiveWrite();
  await retryDbWrite(async () => {
    const { error } = await sb.from('transactions').delete().eq('id', id).eq('user_id', currentUser.id).select('id').maybeSingle();
    if (error) throw error;
  });
  scheduleDataCacheWrite();
}

// ─── YAHOO FINANCE API (via Cloudflare Worker proxy) ─────────────────────────
const YF_WORKER = 'https://yf-proxy.viqmusic-promo.workers.dev';
const YF_BASE   = 'https://query1.finance.yahoo.com';
const YF_PRIMARY_ATTEMPTS = 3;
const YF_CACHE_TTL = 60 * 1000;
const QUOTE_CONCURRENCY = 3;
const HISTORY_CONCURRENCY = 2;
const yfResponseCache = new Map();
const yfInFlight = new Map();

const CORS_PROXIES = [
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

const waitForQuoteRetry = ms => new Promise(resolve => setTimeout(resolve, ms));

async function parseYahooResponse(response) {
  if (!response.ok) throw new Error(`Yahoo HTTP ${response.status}`);
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (_) {
    throw new Error('Réponse Yahoo non JSON');
  }
  if (typeof json?.contents === 'string') {
    try { json = JSON.parse(json.contents); }
    catch (_) { throw new Error('Réponse proxy non JSON'); }
  }
  return json;
}

async function yfFetch(path) {
  const now = Date.now();
  const cached = yfResponseCache.get(path);
  if (cached && cached.expiresAt > now) return cached.data;
  if (yfInFlight.has(path)) return yfInFlight.get(path);

  const request = (async () => {
    const target = YF_BASE + path;
    const providers = [
      { url: `${YF_WORKER}?url=${encodeURIComponent(target)}`, attempts: YF_PRIMARY_ATTEMPTS },
      ...CORS_PROXIES.map(proxy => ({ url: proxy(target), attempts: 1 })),
    ];
    let lastError;

    for (const provider of providers) {
      for (let attempt = 1; attempt <= provider.attempts; attempt++) {
        try {
          const response = await fetch(provider.url, { signal: AbortSignal.timeout(TIMING_PROXY_FETCH) });
          return await parseYahooResponse(response);
        } catch (error) {
          lastError = error;
          if (attempt < provider.attempts) await waitForQuoteRetry(450 * (2 ** (attempt - 1)) + Math.round(Math.random() * 180));
        }
      }
    }
    throw lastError || new Error('Tous les services de cotation ont échoué');
  })();

  yfInFlight.set(path, request);
  try {
    const data = await request;
    yfResponseCache.set(path, { data, expiresAt: Date.now() + YF_CACHE_TTL });
    return data;
  } finally {
    yfInFlight.delete(path);
  }
}

let eurRates = {};
const EUR_FALLBACKS = { USD: 1.08, GBP: 0.86, CHF: 0.98, JPY: 160, CAD: 1.48, AUD: 1.65 };

async function fetchEurRate(currency) {
  if (currency === 'EUR') return 1;
  if (eurRates[currency]) return eurRates[currency];
  try {
    const d = await yfFetch(`/v8/finance/chart/EUR${currency}=X?interval=1d&range=1d`);
    const rate = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (rate) { eurRates[currency] = rate; return rate; }
  } catch(e) { console.error('[Moobank] fetchEurRate error:', e); }
  return EUR_FALLBACKS[currency] || 1;
}

async function toEur(price, currency) {
  if (!currency || currency === 'EUR') return price;
  const rate = await fetchEurRate(currency);
  return price / rate;
}

async function fetchQuote(symbol) {
  try {
    const data = await yfFetch(`/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`);
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const rawPrice = Number(meta.regularMarketPrice ?? meta.previousClose);
    if (!Number.isFinite(rawPrice) || rawPrice <= 0 || !meta.currency) return null;
    const { currency, unitFactor } = MoobankCore.normalizeQuoteCurrency(meta.currency);
    const price = rawPrice * unitFactor;
    const rawPrevClose = Number(meta.chartPreviousClose ?? meta.previousClose ?? rawPrice);
    const prevClose = (Number.isFinite(rawPrevClose) ? rawPrevClose : rawPrice) * unitFactor;
    const change = price - prevClose;
    const changePercent = prevClose ? (change / prevClose) * 100 : 0;
    const priceEur = await toEur(price, currency);
    return { symbol, price, currency, priceEur, change, changePercent };
  } catch(e) { return null; }
}

async function fetchHistory(symbol) {
  const attempts = [
    `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`,
    `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
  ];
  for (const path of attempts) {
    try {
      const data = await yfFetch(path);
      const result = data?.chart?.result?.[0];
      if (!result) continue;
      const closes = result.indicators?.quote?.[0]?.close || [];
      const valid = closes.filter(v => v != null);
      if (valid.length < 2) continue;
      if (!result.meta?.currency) continue;
      const { currency, unitFactor } = MoobankCore.normalizeQuoteCurrency(result.meta.currency);
      const rate = await fetchEurRate(currency);
      return valid.map(value => {
        const normalized = value * unitFactor;
        return currency === 'EUR' ? normalized : normalized / rate;
      });
    } catch(e) { continue; }
  }
  return null;
}

async function searchTickers(query, seq) {
  try {
    const data = await yfFetch(`/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=7&newsCount=0&listsCount=0`);
    const quotes = data?.quotes || data?.finance?.result?.[0]?.quotes || [];

    // Filtrer d'abord
    const filtered = quotes.filter(q =>
      q.symbol && !['OPTION','FUTURE','INDEX'].includes(q.quoteType || '')
    ).slice(0, 5);

    if (filtered.length === 0) return null;

    // Afficher immédiatement sans attendre les prix
    const results = filtered.map(q => ({
      symbol: q.symbol,
      name: q.longname || q.shortname || q.symbol,
      price: null, currency: q.currency || 'USD',
      exchange: q.exchDisp || q.exchange || '',
      priceEur: null
    }));

    // Charger les prix en parallèle en arrière-plan
    MoobankCore.mapWithConcurrency(filtered, 2, async (q, i) => {
      try {
        const pr = await fetchQuote(q.symbol);
        if (pr) {
          results[i].price = pr.price;
          results[i].currency = pr.currency || results[i].currency;
          results[i].priceEur = pr.priceEur;
        }
      } catch(e) {}
    }).then(() => {
      // Re-render suggestions avec les prix mis à jour — uniquement si la requête est toujours la dernière
      const currentInput = document.getElementById('pos-ticker-input').value;
      if (seq === tickerSearchSeq && currentInput === query) renderSuggestions(results);
    });

    return results;
  } catch(e) { console.error('searchTickers ERROR:', e.message, e.stack); return null; }
}

// ─── ACTUALITÉS LIÉES AU PORTEFEUILLE ──────────────────────────────────────
const MARKET_NEWS_TTL = 15 * 60 * 1000;
let marketNewsLoadedAt = 0;
let marketNewsLoading = false;
let marketNewsUserId = null;

function safeNewsUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ''));
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch (_) {
    return null;
  }
}

function marketNewsDate(value) {
  let date;
  if (value == null || value === '') return '';
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    // Timestamp Unix en secondes (ancien format Yahoo)
    date = new Date(Number(value) * 1000);
  } else {
    // Chaîne ISO (nouveau format Yahoo: content.pubDate)
    date = new Date(value);
  }
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// Yahoo a changé la structure de ses articles d'actualité : les champs sont
// désormais imbriqués sous `content` (content.title, content.canonicalUrl.url,
// content.provider.displayName, content.pubDate) au lieu d'être à plat
// (title, link, publisher, providerPublishTime). On gère les deux formats.
function normalizeNewsArticle(raw) {
  const content = raw?.content && typeof raw.content === 'object' ? raw.content : null;
  const title = String((content?.title ?? raw?.title) || '').trim();
  const rawLink = content
    ? (content.clickThroughUrl?.url || content.canonicalUrl?.url || raw?.link)
    : raw?.link;
  const publisher = String((content?.provider?.displayName ?? raw?.publisher) || '').trim();
  const pubDateValue = content ? (content.pubDate ?? content.displayTime) : raw?.providerPublishTime;
  const ts = (() => {
    if (pubDateValue == null || pubDateValue === '') return 0;
    if (typeof pubDateValue === 'number' || /^\d+$/.test(String(pubDateValue))) {
      return Number(pubDateValue) * 1000;
    }
    const parsed = Date.parse(pubDateValue);
    return Number.isFinite(parsed) ? parsed : 0;
  })();
  return { title, link: rawLink, publisher, pubDateValue, ts };
}

function marketNewsQueries() {
  const ranked = [...positions]
    .sort((a, b) => (Number(b.current) || 0) * (Number(b.qty) || 0) - (Number(a.current) || 0) * (Number(a.qty) || 0))
    .map(position => String(position.symbol || '').trim())
    .filter(Boolean);
  const unique = [...new Set(ranked)].slice(0, 3);
  return unique.length ? unique : ['marchés financiers France'];
}

async function loadMarketNews(force = false) {
  const element = document.getElementById('marketNewsContent');
  if (!element || marketNewsLoading || !currentUser) return;
  const sameUser = marketNewsUserId === currentUser.id;
  if (!force && sameUser && Date.now() - marketNewsLoadedAt < MARKET_NEWS_TTL) return;

  marketNewsLoading = true;
  marketNewsUserId = currentUser.id;
  element.innerHTML = '<div class="market-news-loading">Chargement des actualités…</div>';
  try {
    const responses = await MoobankCore.mapWithConcurrency(marketNewsQueries(), 2, async query => {
      const path = `/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=0&newsCount=3&listsCount=0&lang=fr-FR&region=FR`;
      const data = await yfFetch(path);
      return data?.news || data?.finance?.result?.[0]?.news || [];
    });

    const seen = new Set();
    const articles = responses.flat().map(normalizeNewsArticle).filter(article => {
      const link = safeNewsUrl(article.link);
      if (!link || !article.title || seen.has(link)) return false;
      seen.add(link);
      article._safeLink = link;
      return true;
    }).sort((a, b) => b.ts - a.ts).slice(0, 3);

    if (!articles.length) throw new Error('Aucune actualité disponible');
    element.innerHTML = `<div class="market-news-list">${articles.map(article => {
      const publisher = article.publisher || 'Yahoo Finance';
      const date = marketNewsDate(article.pubDateValue);
      return `<a class="market-news-item" href="${_esc(article._safeLink)}" target="_blank" rel="noopener noreferrer">
        <span class="market-news-copy">
          <span class="market-news-title">${_esc(article.title)}</span>
          <span class="market-news-meta">${_esc(publisher)}${date ? ` · ${_esc(date)}` : ''}</span>
        </span>
        <span class="market-news-arrow" aria-hidden="true">↗</span>
      </a>`;
    }).join('')}</div>`;
    marketNewsLoadedAt = Date.now();
  } catch (error) {
    console.warn('[Moobank] actualités indisponibles:', error.message);
    element.innerHTML = '<div class="market-news-empty"><span>Actualités momentanément indisponibles.<button type="button" class="market-news-retry" onclick="loadMarketNews(true)">Réessayer</button></span></div>';
  } finally {
    marketNewsLoading = false;
  }
}

// ─── TICKER INPUT ─────────────────────────────────────────────────────────────
function onTickerInput(val) {
  clearTimeout(searchTimeout);
  selectedTicker = null;
  document.getElementById('selectedTickerBox').classList.add('hidden');
  document.getElementById('addPosBtn').disabled = true;
  suggestionsIndex = -1;

  if (val.length < 2) {
    hideSuggestions();
    return;
  }
  showSearchStatus('Recherche en cours…');

  // Empêche les réponses "en retard" d'écraser les résultats plus récents
  const seq = ++tickerSearchSeq;

  searchTimeout = setTimeout(async () => { // délai = TIMING_TICKER_SEARCH
    try {
      // Timeout agressif de 3s pour éviter que l'UI se fige si les proxies traînent
      const raceResult = await Promise.race([
        searchTickers(val, seq),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMING_TICKER_TIMEOUT))
      ]);
      if (seq !== tickerSearchSeq) return; // une nouvelle recherche a été lancée
      if (!raceResult || raceResult.length === 0) {
        showSearchStatus('Aucun résultat trouvé');
        return;
      }
      renderSuggestions(raceResult);
    } catch(e) {
      if (seq !== tickerSearchSeq) return;
      if (e.message === 'timeout') {
        showSearchStatus('⏱ Délai dépassé — réessayez');
      } else {
        showSearchStatus('Erreur de recherche');
      }
    }
  }, TIMING_TICKER_SEARCH);
}

function showSearchStatus(msg) {
  const el = document.getElementById('tickerSuggestions');
  el.classList.remove('hidden');
  const isLoading = msg.includes('cours') || msg.includes('Recherche');
  el.innerHTML = `<div class="search-status">${isLoading ? '<span class="spin"></span>' : '<span style="font-size:0.8rem">⚠️</span>'}${msg}</div>`;
}

function hideSuggestions() {
  document.getElementById('tickerSuggestions').classList.add('hidden');
}

function renderSuggestions(results) {
  const el = document.getElementById('tickerSuggestions');
  el.classList.remove('hidden');
  // Stocker dans une variable JS pour éviter l'encodage JSON dans les attributs HTML
  _tickerSuggestions = results;
  el.innerHTML = results.map((r, i) => {
    const priceStr = r.priceEur != null ? fmtEur(r.priceEur) : (r.price != null ? `${fmt(r.price)} ${r.currency}` : '—');
    return `<div class="ticker-suggestion" data-index="${i}" onclick="selectTickerByIndex(${i})">
      <div class="sug-left">
        <div class="sug-sym">${_esc(r.symbol)}</div>
        <div class="sug-name">${_esc(r.name)}</div>
      </div>
      <div class="sug-right">
        <div class="sug-price">${priceStr}</div>
        <div class="sug-exch">${r.exchange || ''}</div>
      </div>
    </div>`;
  }).join('');
}

function onTickerKeydown(e) {
  const el = document.getElementById('tickerSuggestions');
  const items = el.querySelectorAll('.ticker-suggestion');
  if (e.key === 'ArrowDown') { suggestionsIndex = Math.min(suggestionsIndex+1, items.length-1); highlightSuggestion(items); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { suggestionsIndex = Math.max(suggestionsIndex-1, 0); highlightSuggestion(items); e.preventDefault(); }
  else if (e.key === 'Enter' && suggestionsIndex >= 0) { selectTickerByIndex(suggestionsIndex); e.preventDefault(); }
  else if (e.key === 'Escape') { hideSuggestions(); }
}

function highlightSuggestion(items) {
  items.forEach((it,i) => it.classList.toggle('active', i === suggestionsIndex));
  if (items[suggestionsIndex]) items[suggestionsIndex].scrollIntoView({block:'nearest'});
}

function selectTickerByIndex(i) {
  const r = _tickerSuggestions[i];
  if (r) selectTicker(r);
}

function selectTicker(r) {
  selectedTicker = r;
  hideSuggestions();
  document.getElementById('pos-ticker-input').value = `${r.symbol} — ${r.name}`;
  document.getElementById('stbSym').textContent = r.symbol;
  document.getElementById('stbName').textContent = r.name;
  const priceStr = r.priceEur != null ? fmtEur(r.priceEur) : (r.price != null ? `${fmt(r.price)} ${r.currency}` : '—');
  document.getElementById('stbPrice').textContent = priceStr;
  document.getElementById('stbExch').textContent = r.exchange || '';
  document.getElementById('selectedTickerBox').classList.remove('hidden');
  checkExistingPos();
  checkAddPosReady();
  document.getElementById('pos-qty').oninput = checkAddPosReady;
  document.getElementById('pos-price').oninput = checkAddPosReady;
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
let posSide = 'buy'; // 'buy' | 'sell'

function setPosSide(side) {
  posSide = side;
  const buyBtn = document.getElementById('toggleBuy');
  const sellBtn = document.getElementById('toggleSell');
  const priceInput = document.getElementById('pos-price');
  const priceLabel = document.getElementById('pos-price-label');
  const priceHint = document.getElementById('pos-price-hint');
  if (side === 'buy') {
    buyBtn.className = 'btn btn-primary btn-buy-active'; buyBtn.style.flex = '1'; buyBtn.style.fontSize = '0.82rem';
    sellBtn.className = 'btn'; sellBtn.style.flex = '1'; sellBtn.style.fontSize = '0.82rem';
    document.getElementById('pos-price-row').classList.remove('hidden');
    document.getElementById('pos-qty-label').textContent = 'Quantité achetée';
    priceLabel.textContent = 'PRU — Prix de Revient Unitaire (€)';
    priceHint.textContent = 'Le PRU moyen sera recalculé automatiquement si la position existe déjà';
    priceInput.placeholder = 'ex: 180.50';
    if (priceInput.dataset.autofilled === 'true') priceInput.value = '';
    delete priceInput.dataset.autofilled;
  } else {
    sellBtn.className = 'btn btn-sell btn-sell-active'; sellBtn.style.flex = '1'; sellBtn.style.fontSize = '0.82rem';
    buyBtn.className = 'btn'; buyBtn.style.flex = '1'; buyBtn.style.fontSize = '0.82rem';
    document.getElementById('pos-price-row').classList.remove('hidden');
    document.getElementById('pos-qty-label').textContent = 'Quantité vendue';
    priceLabel.textContent = 'Prix de vente unitaire (€)';
    priceHint.textContent = 'Prérempli avec le dernier cours disponible — modifiez-le avec le prix réellement exécuté.';
    priceInput.placeholder = 'ex: 185.20';
  }
  checkExistingPos();
  checkAddPosReady();
}

function onPosAccountChange() {
  checkExistingPos();
  checkAddPosReady();
}

function getExistingPos() {
  if (!selectedTicker) return null;
  const accountId = document.getElementById('pos-account').value;
  if (!accountId) return null;
  return positions.find(p => p.symbol === selectedTicker.symbol && p.accountId === accountId) || null;
}

function checkExistingPos() {
  const infoEl = document.getElementById('existingPosInfo');
  const textEl = document.getElementById('existingPosText');
  const hintEl = document.getElementById('pos-qty-hint');
  const existing = getExistingPos();

  if (existing) {
    if (posSide === 'buy') {
      textEl.innerHTML = existing.price > 0
        ? `<span style="color:#5ba4ff">↑ Position existante</span> — ${existing.qty} titre${existing.qty>1?'s':''} à PRU ${fmtPrice(existing.price)}. Le PRU sera recalculé automatiquement.`
        : `<span style="color:#5ba4ff">↑ Position existante</span> — ${existing.qty} titre${existing.qty>1?'s':''}, PRU précédent inconnu. Le PRU restera inconnu après l’achat.`;
    } else {
      textEl.innerHTML = `<span style="color:#5ba4ff">Position actuelle</span> — ${existing.qty} titre${existing.qty>1?'s':''} à PRU ${fmtPrice(existing.price)} · Valeur ${fmtEur(existing.qty * existing.current)}`;
      hintEl.textContent = `Max : ${existing.qty} titre${existing.qty>1?'s':''}`;
      hintEl.classList.remove('hidden');
      const qtyInput = document.getElementById('pos-qty');
      qtyInput.max = existing.qty;
      const priceInput = document.getElementById('pos-price');
      if (!priceInput.value || priceInput.dataset.autofilled === 'true') {
        priceInput.value = existing.current > 0 ? existing.current : '';
        priceInput.dataset.autofilled = 'true';
      }
    }
    infoEl.classList.remove('hidden');
  } else {
    infoEl.classList.add('hidden');
    hintEl.classList.add('hidden');
    const qtyInput = document.getElementById('pos-qty');
    qtyInput.removeAttribute('max');
    const priceInput = document.getElementById('pos-price');
    if (posSide === 'sell' && priceInput.dataset.autofilled === 'true') {
      priceInput.value = '';
      delete priceInput.dataset.autofilled;
    }
  }
}

function checkAddPosReady() {
  const qty = parseFloat(document.getElementById('pos-qty').value);
  const pru = document.getElementById('pos-price').value;
  const accountId = document.getElementById('pos-account').value;
  const btn = document.getElementById('addPosBtn');

  if (!selectedTicker || !qty || !accountId) { btn.disabled = true; return; }

  if (posSide === 'buy') {
    btn.disabled = !pru;
  } else {
    // Vente : vérifier qu'on a bien une position et que qty <= position.qty
    const existing = getExistingPos();
    if (!existing) { btn.disabled = true; return; }
    const sellPrice = parseFloat(document.getElementById('pos-price').value);
    btn.disabled = qty <= 0 || qty > existing.qty || !sellPrice || sellPrice <= 0;
  }
}

// ─── BANNER HORS-LIGNE ────────────────────────────────────────────────────────
function showOfflineBanner(msg, type = 'error') {
  const b = document.getElementById('offlineBanner');
  if (!b) return;
  b.textContent = msg || '📡 Problème de connexion — synchronisation indisponible.';
  b.className = type === 'warn' ? 'warn' : '';
  b.classList.remove('hidden');
  if (type === 'warn') {
    setTimeout(() => b.classList.add('hidden'), TIMING_TOAST_CLOSE);
  }
}
function hideOfflineBanner() {
  const b = document.getElementById('offlineBanner');
  if (b) b.classList.add('hidden');
}

// Détection réseau navigateur
window.addEventListener('online', () => {
  hideOfflineBanner();
  showToast('✅ Connexion rétablie', 'success');
  if (_usingCachedData) retryCachedDataSync(false);
  else if (currentUser && positions.length > 0) refreshAllPrices();
});
window.addEventListener('offline', () => {
  showOfflineBanner('📡 Hors-ligne — reconnectez-vous pour synchroniser les données.');
});
if (!navigator.onLine) {
  showOfflineBanner('📡 Hors-ligne — reconnectez-vous pour synchroniser les données.');
}

// Alias global pour ouvrir la modal position depuis n'importe quel onglet
function openAddPosition() {
  openModal('position');
}

let _dialogReturnFocus = null;
function showDialog(element, focusSelector) {
  if (!element) return;
  _dialogReturnFocus = document.activeElement;
  element.classList.add('open');
  element.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => {
    const target = (focusSelector && element.querySelector(focusSelector)) ||
      element.querySelector('input:not([type="hidden"]),select,textarea,button,[tabindex]:not([tabindex="-1"])');
    target?.focus();
  });
}

function hideDialog(element) {
  if (!element) return;
  element.classList.remove('open');
  element.setAttribute('aria-hidden', 'true');
  if (!document.querySelector('.modal-overlay.open')) document.body.classList.remove('modal-open');
  const returnFocus = _dialogReturnFocus;
  _dialogReturnFocus = null;
  returnFocus?.focus?.();
}

function openModal(type) {
  if (type === 'position') {
    const marketAccounts = accounts.filter(a => !FIXED_ACCOUNT_TYPES.has(a.type));
    if (marketAccounts.length === 0) {
      showToast('Créez d’abord un compte de marché (PEA, CTO, PEE, PER, AV ou Crypto).', 'error');
      if (currentTabName !== 'details') document.getElementById('nav-details')?.click();
      openModal('account');
      return;
    }
    const sel = document.getElementById('pos-account');
    sel.innerHTML = '<option value="">— choisir —</option>';
    marketAccounts.forEach(a => {
      const o = document.createElement('option');
      o.value = a.id; o.textContent = `${a.name} · ${a.type}`; sel.appendChild(o);
    });
    // Reset complet
    setPosSide('buy'); // setPosSide() assigne déjà posSide
    selectedTicker = null;
    document.getElementById('pos-ticker-input').value = '';
    document.getElementById('selectedTickerBox').classList.add('hidden');
    document.getElementById('addPosBtn').disabled = true;
    document.getElementById('pos-qty').value = '';
    document.getElementById('pos-price').value = '';
    document.getElementById('existingPosInfo').classList.add('hidden');
    document.getElementById('pos-qty-hint').classList.add('hidden');
    hideSuggestions();
  }
  const focusSelector = type === 'account' ? '#acc-name' : '#pos-ticker-input';
  showDialog(document.getElementById(type + 'Modal'), focusSelector);
}
function closeModal(type) { hideDialog(document.getElementById(type + 'Modal')); }

// ─── ADD ACCOUNT ──────────────────────────────────────────────────────────────
function onAccTypeChange(val) {
  document.getElementById('acc-solde-row').classList.toggle('hidden', !FIXED_ACCOUNT_TYPES.has(val));
}

async function addAccount() {
  const name = document.getElementById('acc-name').value.trim();
  const type = document.getElementById('acc-type').value;
  if (!name) return alert('Veuillez saisir un nom');
  const solde = FIXED_ACCOUNT_TYPES.has(type) ? (parseFloat(document.getElementById('acc-solde').value) || 0) : null;
  if (solde !== null && solde < 0) return alert('Le solde ne peut pas être négatif');
  const btn = document.getElementById('createAccountBtn');
  btn.disabled = true;
  const _newAcc = { id: crypto.randomUUID(), name, type, solde };
  accounts.push(_newAcc);
  const _typeAdded = filteredTypes && !filteredTypes.includes(type);
  if (_typeAdded) filteredTypes.push(type);
  try {
    await saveAccount(_newAcc);
  } catch(e) {
    console.error('[Moobank] addAccount error:', e);
    accounts = accounts.filter(a => a.id !== _newAcc.id);
    if (_typeAdded) filteredTypes = filteredTypes.filter(t => t !== type);
    showToast('Erreur : impossible de sauvegarder le compte.', 'error');
    btn.disabled = false;
    return;
  }
  btn.disabled = false;
  closeModal('account');
  document.getElementById('acc-name').value = '';
  document.getElementById('acc-solde').value = '';
  document.getElementById('acc-solde-row').classList.add('hidden');
  document.getElementById('acc-type').value = 'PEA';
  renderAll();
}

// ─── CONFIRM POSITION (achat / vente) ─────────────────────────────────────────
async function confirmPosition() {
  if (!selectedTicker) return;
  const accountId = document.getElementById('pos-account').value;
  const qty = parseFloat(document.getElementById('pos-qty').value);
  if (!qty || qty <= 0) return alert('Quantité invalide');
  const acc = accounts.find(a => a.id === accountId);
  if (!acc) return alert('Veuillez choisir un compte');
  const accName = acc ? acc.name : '—';
  const btn = document.getElementById('addPosBtn');
  btn.disabled = true;
  let successMessage = '';

  try {
    if (posSide === 'buy') {
      const pru = parseFloat(document.getElementById('pos-price').value);
      if (!pru || pru <= 0) throw new Error('PRU invalide');
      const currentEur = selectedTicker.priceEur ?? selectedTicker.price ?? 0;
      const existing = positions.find(p => p.symbol === selectedTicker.symbol && p.accountId === accountId);
      const previous = existing ? { ...existing } : null;
      let target;
      if (existing) {
        const newPRU = existing.price > 0
          ? (existing.qty * existing.price + qty * pru) / (existing.qty + qty)
          : 0;
        target = {
          ...existing,
          qty: parseFloat((existing.qty + qty).toFixed(8)),
          price: parseFloat(newPRU.toFixed(10)),
          current: currentEur,
          lastUpdated: Date.now(),
        };
      } else {
        target = {
          id: crypto.randomUUID(), symbol: selectedTicker.symbol, name: selectedTicker.name,
          exchange: selectedTicker.exchange || '', currency: selectedTicker.currency || 'EUR',
          accountId, qty, price: pru, current: currentEur, lastUpdated: Date.now()
        };
      }

      const tx = { id: crypto.randomUUID(), type: 'buy', symbol: selectedTicker.symbol, name: selectedTicker.name, qty, price: pru, accountName: accName, ts: Date.now() };
      await MoobankCore.runCompensatedOperation({
        commit: () => savePosition(target),
        audit: () => saveTransaction(tx),
        rollback: () => existing ? savePosition(previous) : deletePositionDB(target.id),
      });

      if (existing) {
        Object.assign(existing, target);
      } else {
        positions.push(target);
        positionHistory[target.id] = [];
        fetchHistory(target.symbol).then(hist => {
          if (hist && hist.length > 1) { positionHistory[target.id] = hist; renderPositions(); }
        });
      }
      transactions.unshift(tx);
      if (transactions.length > 500) transactions.length = 500;
      successMessage = existing && previous.price <= 0
        ? '✅ Achat enregistré · PRU global toujours inconnu'
        : '✅ Achat enregistré';
    } else {
      const existing = positions.find(p => p.symbol === selectedTicker.symbol && p.accountId === accountId);
      if (!existing) throw new Error('Position introuvable');
      if (qty > existing.qty) throw new Error(`Vente supérieure à la quantité détenue (${existing.qty})`);
      const sellPrice = parseFloat(document.getElementById('pos-price').value);
      if (!sellPrice || sellPrice <= 0) throw new Error('Prix de vente invalide');
      const previous = { ...existing };
      const fullSell = Math.abs(qty - existing.qty) < 0.000001;
      const tx = { id: crypto.randomUUID(), type: 'sell', symbol: existing.symbol, name: existing.name, qty, price: sellPrice, accountName: accName, ts: Date.now() };
      const target = fullSell ? null : {
        ...existing,
        qty: parseFloat((existing.qty - qty).toFixed(8)),
      };

      await MoobankCore.runCompensatedOperation({
        commit: () => fullSell ? deletePositionDB(existing.id) : savePosition(target),
        audit: () => saveTransaction(tx),
        rollback: () => savePosition(previous),
      });

      if (fullSell) {
        positions = positions.filter(p => p.id !== existing.id);
        delete positionHistory[existing.id];
      } else {
        Object.assign(existing, target);
      }
      transactions.unshift(tx);
      if (transactions.length > 500) transactions.length = 500;
      successMessage = '✅ Vente enregistrée';
    }
  } catch(e) {
    console.error('[Moobank] confirmPosition error:', e);
    if (e.name === 'MoobankRollbackError') {
      console.error('[Moobank] rétablissement impossible:', e.rollbackError);
      showToast('Synchronisation incertaine : rechargez la page avant toute autre action.', 'error');
    } else {
      showToast(e.message && !/failed|network|fetch/i.test(e.message) ? e.message : 'Erreur de sauvegarde de la transaction.', 'error');
    }
    renderAll();
    return;
  } finally {
    btn.disabled = false;
  }

  closeModal('position');
  renderAll();
  showToast(successMessage, 'success');
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
async function deletePosition(id) {
  const p = positions.find(p => p.id === id);
  if (!p) return;
  if (!confirm(`Supprimer la position ${p.symbol} (${p.qty} titre${p.qty > 1 ? 's' : ''}) ?`)) return;
  try { await deletePositionDB(id); } catch(e) { console.error('[Moobank] deletePosition error:', e); showToast('Erreur : suppression impossible.', 'error'); return; }
  delete positionHistory[id];
  positions = positions.filter(p => p.id !== id);
  renderPositions(); renderAllocation(); renderSummary();
  refreshProjectionIfActive();
}
async function deleteAccount(id) {
  const a = accounts.find(a => a.id === id);
  if (!a) return;
  const posCount = positions.filter(p => p.accountId === id).length;
  const msg = posCount > 0
    ? `Supprimer le compte "${a.name}" et ses ${posCount} position${posCount > 1 ? 's' : ''} ?`
    : `Supprimer le compte "${a.name}" ?`;
  if (!confirm(msg)) return;
  // Une seule suppression côté base : la clé étrangère ON DELETE CASCADE
  // supprime les positions de manière atomique. Si le schéma ne le permet pas,
  // la requête échoue sans suppression locale.
  const orphanPositions = positions.filter(p => p.accountId === id);
  try {
    await deleteAccountDB(id);
  } catch(e) {
    console.error('[Moobank] deleteAccount error:', e);
    showToast('Erreur : suppression impossible.', 'error');
    return;
  }
  // Mutation locale seulement après succès DB
  orphanPositions.forEach(p => { delete positionHistory[p.id]; });
  positions = positions.filter(p => p.accountId !== id);
  accounts = accounts.filter(a => a.id !== id);
  renderPositions(); renderAccounts(); renderAllocation(); renderSummary(); renderFilterToggles();
  refreshProjectionIfActive();
}
function editLivretSolde(id) {
  const editDiv = document.getElementById('livret-edit-' + id);
  const input = document.getElementById('livret-input-' + id);
  editDiv.classList.remove('hidden');
  setTimeout(() => { input.focus(); input.select(); }, TIMING_LIVRET_FOCUS);
}
function cancelLivretEdit(id) {
  document.getElementById('livret-edit-' + id).classList.add('hidden');
}
async function confirmLivretSolde(id) {
  const input = document.getElementById('livret-input-' + id);
  const a = accounts.find(a => a.id === id);
  if (a) {
    const newSolde = parseFloat(input.value);
    if (newSolde < 0) { showToast('Le solde ne peut pas être négatif', 'error'); return; }
    const prevSolde = a.solde;
    a.solde = newSolde || 0;
    try {
      await saveAccount(a);
    } catch(e) {
      console.error('[Moobank] confirmLivretSolde error:', e);
      a.solde = prevSolde;
      showToast('⚠️ Erreur sauvegarde', 'error');
      return;
    }
    await snapshotPatrimoine(); // seulement si save OK
    const el = document.getElementById('livret-total-' + id);
    if (el) el.textContent = fmtEur(a.solde);
    renderSummary(); renderAllocation();
    refreshProjectionIfActive();
  }
  document.getElementById('livret-edit-' + id).classList.add('hidden');
}

// ─── REFRESH PRICES ───────────────────────────────────────────────────────────
let _isRefreshing = false;
let _lastPriceRefresh = 0; // timestamp du dernier refresh de prix
async function refreshAllPrices() {
  if (_usingCachedData) {
    retryCachedDataSync(true);
    return;
  }
  if (positions.length === 0) return;
  if (_isRefreshing) return;
  const refreshUserId = currentUser?.id;
  if (!refreshUserId) return;
  _isRefreshing = true;
  eurRates = {}; // invalider le cache des taux à chaque refresh pour ne pas utiliser des taux périmés
  const btn = document.getElementById('refreshBtn');
  const badge = document.getElementById('updateBadge');
  if (btn) {
    btn.disabled = true;
    // lance l'anim glow (et la relance même si on refresh 2 fois de suite)
    btn.classList.remove('refresh-animate');
    void btn.offsetWidth; // reset animation
    btn.classList.add('refresh-animate');
    if (badge) badge.textContent = 'Actualisation…';
  }

  try {
    const uniqueSymbols = [...new Set(positions.map(p => p.symbol))];

    // Fetch tous les prix en parallèle
    const priceResults = await MoobankCore.mapWithConcurrency(uniqueSymbols, QUOTE_CONCURRENCY, async sym => {
      try {
        const data = await fetchQuote(sym);
        return [sym, data && data.priceEur != null ? data : null];
      } catch(e) { return [sym, null]; }
    });
    const priceMap = Object.fromEntries(priceResults.filter(([,v]) => v !== null));
    const updatedSymbols = Object.keys(priceMap);

    if (updatedSymbols.length === 0) {
      if (badge) badge.textContent = 'Échec de l’actualisation';
      showToast('Aucun cours n’a pu être récupéré. Les anciennes valeurs sont conservées.', 'error');
      return;
    }

    const quoteTimestamp = Date.now();
    const changedPositions = positions.flatMap(p => {
      if (!priceMap[p.symbol]) return [];
      return [{
        ...p,
        current: priceMap[p.symbol].priceEur ?? p.current,
        change: priceMap[p.symbol].change ?? p.change,
        changePercent: priceMap[p.symbol].changePercent ?? p.changePercent,
        lastUpdated: quoteTimestamp,
      }];
    });

    // Seuls les champs de cotation sont mis à jour : un onglet ancien ne peut
    // pas écraser une quantité ou un PRU modifié ailleurs.
    const { updatedIds, missingIds } = await savePositionPrices(changedPositions, refreshUserId);

    // Si l'utilisateur s'est déconnecté ou a changé de session entre-temps,
    // on ne fusionne pas le résultat de l'ancienne actualisation.
    if (currentUser?.id !== refreshUserId) return;

    const updatedIdSet = new Set(updatedIds);
    const updatedQuotes = changedPositions.filter(p => updatedIdSet.has(p.id));

    // Fusionne uniquement les cotations dans l'état ACTUEL. Une quantité, un
    // PRU, un ajout ou une suppression effectué pendant le refresh est préservé.
    positions = MoobankCore.mergePositionPriceUpdates(positions, updatedQuotes, missingIds);
    missingIds.forEach(id => { delete positionHistory[id]; });
    const activePositionIds = new Set(positions.map(p => p.id));
    changedPositions.filter(p => updatedIdSet.has(p.id) && activePositionIds.has(p.id)).forEach(p => {
      if (!positionHistory[p.id]) positionHistory[p.id] = [];
      positionHistory[p.id].push(p.current);
      if (positionHistory[p.id].length > 20) positionHistory[p.id].shift();
    });
    _lastPriceRefresh = Date.now();
    await snapshotPatrimoine();
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const remainingSymbols = [...new Set(positions.map(p => p.symbol))];
    const refreshedSymbols = remainingSymbols.filter(symbol => priceMap[symbol]);
    const unavailableSymbols = remainingSymbols.filter(symbol => !priceMap[symbol]);
    if (badge) badge.textContent = remainingSymbols.length === 0
      ? `Portefeuille synchronisé à ${time}`
      : unavailableSymbols.length === 0
        ? `Actualisé à ${time}`
        : `${refreshedSymbols.length}/${remainingSymbols.length} actualisés à ${time}`;
    if (unavailableSymbols.length > 0) {
      showToast(`${unavailableSymbols.length} cours indisponible(s) : les anciennes valeurs sont conservées.`, 'error');
    }
    if (missingIds.length > 0) {
      showToast(`Synchronisation : ${missingIds.length} position${missingIds.length > 1 ? 's n’étaient' : ' n’était'} plus présente${missingIds.length > 1 ? 's' : ''} dans la base.`, 'success');
    }
    renderAll();

    // Historiques réels en arrière-plan
    MoobankCore.mapWithConcurrency(uniqueSymbols, HISTORY_CONCURRENCY, async sym => {
      const hist = await fetchHistory(sym);
        if (!hist || hist.length < 2) return;
        positions.filter(p => p.symbol === sym).forEach(p => { positionHistory[p.id] = hist; });
        renderPositions();
    }).catch(error => console.warn('[Moobank] historiques indisponibles :', error.message));
  } catch(e) {
    console.error('[Moobank] refreshAllPrices error:', e);
    if (badge) badge.textContent = 'Échec de l’actualisation';
    showToast('Actualisation impossible : aucune donnée enregistrée n’a été supprimée.', 'error');
  } finally {
    _isRefreshing = false;
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('refresh-animate');
    }
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
// ─── HTML ESCAPE (partagé par tous les renders) ───────────────────────────────
const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

function sparklineSVG(data, color) {
  if (!data||data.length<2) return '';
  const w=60,h=24; const min=Math.min(...data),max=Math.max(...data); const range=max-min||1;
  const pts=data.map((v,i)=>{ const x=(i/(data.length-1))*w; const y=h-((v-min)/range)*(h-2)-1; return `${x},${y}`; });
  return `<svg class="mini-chart" viewBox="0 0 ${w} ${h}"><polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}
// Formatters Intl mis en cache — évite de recréer l'objet à chaque appel
const _fmtStd    = new Intl.NumberFormat('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2});
const _fmtEur    = new Intl.NumberFormat('fr-FR', {style:'currency', currency:'EUR', maximumFractionDigits:2});
const _fmtEur0   = new Intl.NumberFormat('fr-FR', {style:'currency', currency:'EUR', maximumFractionDigits:0});
const _fmtEur4   = new Intl.NumberFormat('fr-FR', {style:'currency', currency:'EUR', minimumFractionDigits:4, maximumFractionDigits:4});
const _fmtEur6   = new Intl.NumberFormat('fr-FR', {style:'currency', currency:'EUR', minimumFractionDigits:6, maximumFractionDigits:6});
const _fmtEur8   = new Intl.NumberFormat('fr-FR', {style:'currency', currency:'EUR', minimumFractionDigits:8, maximumFractionDigits:8});
const _fmtPct    = new Intl.NumberFormat('fr-FR', {minimumFractionDigits:1, maximumFractionDigits:1});
const _fmtQty    = new Intl.NumberFormat('fr-FR', {maximumFractionDigits:0});
function fmt(n, dec=2) {
  if (dec === 2) return _fmtStd.format(n);
  return new Intl.NumberFormat('fr-FR', {minimumFractionDigits:dec, maximumFractionDigits:dec}).format(n);
}
function fmtEur(n) { return _fmtEur.format(n); }
function fmtPrice(n) {
  if (n === 0) return _fmtEur.format(0);
  const abs = Math.abs(n);
  if (abs < 0.0001) return _fmtEur8.format(n);
  if (abs < 0.01)   return _fmtEur6.format(n);
  if (abs < 1)      return _fmtEur4.format(n);
  return _fmtEur.format(n);
}
function tagClass(type) { return TAG_CLASS_MAP[type] || 'tag-autre'; }
function accountTypeLabel(type) { return ACCOUNT_TYPE_LABELS[type] || type || 'Autre'; }
function getAccountName(id) { const a=accounts.find(a=>a.id===id); return a?a.name:'—'; }
function getAccountType(id) { const a=accounts.find(a=>a.id===id); return a?a.type:''; }

// ─── RENDER ───────────────────────────────────────────────────────────────────
function renderAccounts() {
  const grid = document.getElementById('accountsGrid');
  if (accounts.length===0) { grid.innerHTML=`<div class="empty-state" style="grid-column:1/-1">Aucun compte — <button type="button" class="empty-action" onclick="openModal('account')">ajouter un compte</button></div>`; return; }
  grid.innerHTML = accounts.map((a, idx) => {
    const animStyle = `animation:popIn 0.4s cubic-bezier(0.34,1.4,0.64,1) ${idx * 0.06}s both;`;
    if (FIXED_ACCOUNT_TYPES.has(a.type)) {
      const solde = a.solde || 0;
      return `<div class="account-card" style="${animStyle}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div class="account-type">${_esc(a.name)}</div>
          <button class="del-btn" onclick="deleteAccount('${a.id}')">✕</button>
        </div>
        <span class="tag ${tagClass(a.type)}">${_esc(accountTypeLabel(a.type))}</span>
        <div style="margin-top:10px">
          <div style="display:flex;align-items:center;gap:8px">
            <div class="account-total" id="livret-total-${a.id}">${fmtEur(solde)}</div>
            <button onclick="editLivretSolde('${a.id}')" title="Modifier le solde"
              style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:0.8rem;padding:2px 4px;border-radius:4px;transition:color 0.2s;line-height:1"
              onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--muted)'">✏️</button>
          </div>
          <div id="livret-edit-${a.id}" class="hidden" style="margin-top:8px">
            <div class="flex-gap6">
              <input type="number" id="livret-input-${a.id}" value="${solde}" step="any" min="0"
                style="width:120px;padding:5px 9px;font-size:0.82rem;background:var(--bg);border:1px solid var(--accent);border-radius:6px;color:var(--text);font-family:'DM Mono',monospace;outline:none"
                onkeydown="if(event.key==='Enter')confirmLivretSolde('${a.id}');if(event.key==='Escape')cancelLivretEdit('${a.id}')">
              <button onclick="confirmLivretSolde('${a.id}')"
                style="background:var(--accent);border:none;cursor:pointer;color:#000;font-size:0.72rem;padding:5px 9px;border-radius:6px;font-family:'DM Mono',monospace;font-weight:500">✓</button>
              <button onclick="cancelLivretEdit('${a.id}')"
                style="background:none;border:1px solid var(--border);cursor:pointer;color:var(--muted);font-size:0.72rem;padding:5px 9px;border-radius:6px;font-family:'DM Mono',monospace">✕</button>
            </div>
          </div>
        </div>
      </div>`;
    }
    const myPos=positions.filter(p=>p.accountId===a.id);
    const total=myPos.reduce((s,p)=>s+p.current*p.qty,0);
    const myPosWithPRU=myPos.filter(p=>p.price>0);
    const cost=myPosWithPRU.reduce((s,p)=>s+p.price*p.qty,0);
    const posVal=myPosWithPRU.reduce((s,p)=>s+p.current*p.qty,0);
    const pnl=posVal-cost; const pct=cost>0?(pnl/cost*100):0;
    const pnlColor=pnl>=0?'var(--gain)':'var(--loss)';
    return `<div class="account-card" style="${animStyle}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="account-type">${_esc(a.name)}</div>
        <button class="del-btn" onclick="deleteAccount('${a.id}')">✕</button>
      </div>
      <span class="tag ${tagClass(a.type)}">${_esc(accountTypeLabel(a.type))}</span>
      <div style="margin-top:10px">
        <div class="account-total">${fmtEur(total)}</div>
        <div class="account-perf" style="color:${pnlColor}">${pnl>=0?'+':''}${fmtEur(pnl)} (${pnl>=0?'+':''}${fmt(pct)}%)</div>
      </div>
    </div>`;
  }).join('');
}

function renderPositions() {
  const tbody=document.getElementById('posTable');
  const mobileList = document.getElementById('posMobileList');
  const q = (document.getElementById('posSearch')?.value || '').toLowerCase().trim();
  const filtered = q
    ? getSortedPositions().filter(p => p.symbol.toLowerCase().includes(q) || (p.name||'').toLowerCase().includes(q))
    : getSortedPositions();
  if (positions.length===0) {
    const empty = `Aucune position — <button type="button" class="empty-action" onclick="openModal('position')">ajouter une position</button>`;
    tbody.innerHTML=`<tr><td colspan="11" class="empty-state">${empty}</td></tr>`;
    if (mobileList) mobileList.innerHTML = `<div class="empty-state">${empty}</div>`;
    return;
  }
  if (filtered.length === 0 && q) {
    const empty = `Aucune position pour « ${_esc(q)} »`;
    tbody.innerHTML=`<tr><td colspan="11" class="empty-state">${empty}</td></tr>`;
    if (mobileList) mobileList.innerHTML = `<div class="empty-state">${empty}</div>`;
    return;
  }

  const rendered = filtered.map((p, i) => {
    const value=p.current*p.qty;
    const pnl = p.price > 0 ? (p.current-p.price)*p.qty : null;
    const pct = p.price > 0 ? ((p.current-p.price)/p.price)*100 : null;
    const color = pnl === null ? 'var(--muted)' : pnl>=0?'var(--gain)':'var(--loss)';
    const sparkColor = pnl === null ? 'var(--muted)' : pnl>=0?'#55e6b1':'#ff7189';
    const hist=positionHistory[p.id]||[];
    const type=getAccountType(p.accountId);
    const pnlDisplay = pnl === null
      ? `<span style="color:var(--muted)">—</span>`
      : `<span style="color:${color}">${pnl>=0?'+':''}${fmtEur(pnl)}</span>`;
    const pctDisplay = pct === null
      ? `<span style="color:var(--muted)" title="PRU inconnu">—</span>`
      : `<span style="color:${color}">${pct>=0?'+':''}${fmt(pct)}%</span>`;
    const priceDisplay = p.price > 0 ? fmtPrice(p.price) : `<span style="color:var(--muted)">—</span>`;
    const qtyDisplay = p.qty >= 1000 ? _fmtQty.format(p.qty) : fmt(p.qty, p.qty%1===0?0:p.qty<0.001?8:4);
    const ago = p.lastUpdated ? timeAgo(p.lastUpdated) : '';
    const typeLabel = accountTypeLabel(type || 'Autre');
    const mobilePnl = pct === null
      ? '<span style="color:var(--muted)">PRU inconnu</span>'
      : `<span style="color:${color}">${pnl>=0?'+':''}${fmtEur(pnl)} · ${pct>=0?'+':''}${fmt(pct)}%</span>`;
    const row = `<tr style="animation:rowIn 0.3s ease ${i * 0.04}s both" data-pid="${p.id}">
      <td><div class="ticker-sym">${_esc(p.symbol)}</div><div class="ticker-name">${_esc(p.name||'')}</div></td>
      <td style="font-size:0.75rem">${_esc(getAccountName(p.accountId))}</td>
      <td><span class="tag ${tagClass(type)}">${_esc(typeLabel)}</span></td>
      <td>${qtyDisplay}</td>
      <td>${priceDisplay}</td>
      <td class="price-cell" id="price-${p.id}">${fmtPrice(p.current)}<div style="font-size:0.6rem;color:var(--muted)">${ago}</div></td>
      <td>${fmtEur(value)}</td>
      <td class="pnl">${pnlDisplay}</td>
      <td>${pctDisplay}</td>
      <td>${sparklineSVG(hist,sparkColor)}</td>
      <td style="display:flex;gap:6px;align-items:center"><button class="del-btn" style="background:rgba(0,229,160,0.08);color:var(--accent);border-color:rgba(0,229,160,0.2)" onclick="openEditPosition('${p.id}');event.stopPropagation()">✏️</button><button class="del-btn" onclick="deletePosition('${p.id}');event.stopPropagation()">✕</button></td>
    </tr>`;
    const card = `<article class="position-mobile-card" id="mobile-position-${p.id}">
      <button type="button" class="position-mobile-summary" aria-expanded="false" aria-controls="mobile-position-details-${p.id}" onclick="toggleMobilePositionCard('${p.id}')">
        <span class="position-mobile-identity">
          <span class="position-mobile-symbol">${_esc(p.symbol)}</span>
          <span class="position-mobile-name">${_esc(p.name || p.symbol)}</span>
          <span class="position-mobile-meta"><span>${_esc(getAccountName(p.accountId))}</span><span class="tag ${tagClass(type)}">${_esc(typeLabel)}</span></span>
        </span>
        <span class="position-mobile-values">
          <span class="position-mobile-value">${fmtEur(value)}</span>
          <span class="position-mobile-pnl">${mobilePnl}</span>
        </span>
        <svg class="position-mobile-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
      </button>
      <div class="position-mobile-details" id="mobile-position-details-${p.id}" hidden>
        <div><div class="position-mobile-detail-label">Quantité</div><div class="position-mobile-detail-value">${qtyDisplay}</div></div>
        <div><div class="position-mobile-detail-label">PRU</div><div class="position-mobile-detail-value">${priceDisplay}</div></div>
        <div><div class="position-mobile-detail-label">Cours</div><div class="position-mobile-detail-value">${fmtPrice(p.current)}</div></div>
        <div class="position-mobile-actions">
          <button type="button" class="btn" onclick="openEditPosition('${p.id}')">Modifier</button>
          <button type="button" class="btn btn-sell" onclick="deletePosition('${p.id}')">Supprimer</button>
        </div>
      </div>
    </article>`;
    return { row, card };
  });
  tbody.innerHTML = rendered.map(item => item.row).join('');
  if (mobileList) mobileList.innerHTML = rendered.map(item => item.card).join('');
}

function toggleMobilePositionCard(id) {
  const card = document.getElementById(`mobile-position-${id}`);
  const details = document.getElementById(`mobile-position-details-${id}`);
  const summary = card?.querySelector('.position-mobile-summary');
  if (!card || !details || !summary) return;
  const willOpen = details.hidden;
  document.querySelectorAll('.position-mobile-card.expanded').forEach(otherCard => {
    if (otherCard === card) return;
    otherCard.classList.remove('expanded');
    const otherDetails = otherCard.querySelector('.position-mobile-details');
    const otherSummary = otherCard.querySelector('.position-mobile-summary');
    if (otherDetails) otherDetails.hidden = true;
    otherSummary?.setAttribute('aria-expanded', 'false');
  });
  card.classList.toggle('expanded', willOpen);
  details.hidden = !willOpen;
  summary.setAttribute('aria-expanded', String(willOpen));
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'à l\'instant';
  if (diff < 3600000) return `il y a ${Math.floor(diff/60000)}min`;
  if (diff < 86400000) return `il y a ${Math.floor(diff/3600000)}h`;
  return `il y a ${Math.floor(diff/86400000)}j`;
}

const ALLOCATION_COLORS = Object.freeze({
  PEA: '#55e6b1',
  CTO: '#65a8ff',
  PEE: '#7bd8c8',
  PER: '#8db7ff',
  AV: '#f1c56b',
  Crypto: '#ff8b7f',
  Livret: '#63d6ed',
  'Livret A': '#63d6ed',
  LDDS: '#72cfea',
  'Autre livret': '#82bed4',
  Immo: '#b79aff',
  Autre: '#91a2a9',
});
let allocationMode = 'type';

function accountValue(account) {
  if (!account) return 0;
  if (FIXED_ACCOUNT_TYPES.has(account.type)) return Math.max(0, Number(account.solde) || 0);
  return positions
    .filter(position => position.accountId === account.id)
    .reduce((sum, position) => sum + (Number(position.current) || 0) * (Number(position.qty) || 0), 0);
}

function accountPerformance(account) {
  const accountPositions = positions.filter(position => position.accountId === account.id && Number(position.price) > 0);
  const invested = accountPositions.reduce((sum, position) => sum + Number(position.price) * Number(position.qty), 0);
  const value = accountPositions.reduce((sum, position) => sum + Number(position.current) * Number(position.qty), 0);
  return invested > 0 ? { value: value - invested, pct: (value - invested) / invested * 100 } : null;
}

function allocationColor(type, index) {
  return ALLOCATION_COLORS[type] || ALLOC_COLORS[index % ALLOC_COLORS.length];
}

window.setAllocationMode = function setAllocationMode(mode, button) {
  if (!['type', 'asset'].includes(mode)) return;
  allocationMode = mode;
  document.querySelectorAll('.allocation-mode-btn').forEach(item => {
    const active = item === button;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  renderAllocation();
};

function renderAllocation() {
  const element = document.getElementById('allocContent');
  if (!element) return;

  const activeAccounts = accounts.filter(account => isTypeActive(account.type));
  const activeIds = new Set(activeAccounts.map(account => account.id));
  const activePositions = positions.filter(position => activeIds.has(position.accountId));
  const groups = new Map();

  const add = (key, label, detail, value, type) => {
    const amount = Number(value) || 0;
    const current = groups.get(key) || { key, label, detail, value: 0, type };
    current.value += amount;
    groups.set(key, current);
  };

  if (allocationMode === 'type') {
    activeAccounts.forEach(account => add(
      account.type,
      simTypeLabel(account.type),
      '',
      FIXED_ACCOUNT_TYPES.has(account.type) ? account.solde : 0,
      account.type
    ));
    activePositions.forEach(position => {
      const account = accounts.find(item => item.id === position.accountId);
      add(account?.type || 'Autre', simTypeLabel(account?.type || 'Autre'), '', position.current * position.qty, account?.type || 'Autre');
    });
    groups.forEach(group => {
      const count = activeAccounts.filter(account => account.type === group.type).length;
      group.detail = count + ' ' + (count > 1 ? 'comptes' : 'compte');
    });
  } else {
    activePositions.forEach(position => add(
      position.symbol,
      position.symbol,
      position.name || getAccountName(position.accountId),
      position.current * position.qty,
      getAccountType(position.accountId) || 'Autre'
    ));
    activeAccounts
      .filter(account => FIXED_ACCOUNT_TYPES.has(account.type) && Number(account.solde) > 0)
      .forEach(account => add(account.id, account.name, simTypeLabel(account.type), account.solde, account.type));
  }

  let sorted = [...groups.values()].filter(group => group.value > 0.005).sort((a, b) => b.value - a.value);
  if (!sorted.length) {
    element.innerHTML = `<div class="empty-state">${accounts.length ? 'Aucune valeur dans les filtres actifs' : 'Ajoutez un compte pour commencer'}</div>`;
    return;
  }

  if (sorted.length > 6) {
    const visible = sorted.slice(0, 5);
    const rest = sorted.slice(5);
    visible.push({
      key: 'others',
      label: 'Autres',
      detail: rest.length + ' éléments',
      value: rest.reduce((sum, item) => sum + item.value, 0),
      type: 'Autre',
    });
    sorted = visible;
  }

  const total = sorted.reduce((sum, group) => sum + group.value, 0);
  let cursor = 0;
  const slices = sorted.map((group, index) => {
    const pct = total > 0 ? group.value / total * 100 : 0;
    const start = cursor;
    cursor += pct;
    return { ...group, pct, color: allocationColor(group.type, index), start, end: cursor };
  });
  const gradient = slices.map(slice => `${slice.color} ${slice.start.toFixed(2)}% ${slice.end.toFixed(2)}%`).join(', ');
  const rows = slices.map(slice => `
    <div class="allocation-row">
      <span class="allocation-dot" style="background:${slice.color}"></span>
      <div class="allocation-copy">
        <div class="allocation-name">${_esc(slice.label)}</div>
        <div class="allocation-detail">${_esc(slice.detail || '')}</div>
      </div>
      <div class="allocation-numbers">
        <div class="allocation-amount">${fmtEur(slice.value)}</div>
        <div class="allocation-pct">${fmt(slice.pct, 1)} %</div>
      </div>
    </div>`).join('');

  element.innerHTML = `
    <div class="allocation-layout">
      <div class="allocation-donut" style="background:conic-gradient(${gradient})" role="img" aria-label="Répartition du patrimoine">
        <div class="allocation-donut-center">
          <div class="allocation-donut-label">Total affiché</div>
          <div class="allocation-donut-value">${_fmtEur0.format(total)}</div>
        </div>
      </div>
      <div class="allocation-list">${rows}</div>
    </div>`;
}

function renderSummary() {
  const activeAccounts = accounts.filter(a => isTypeActive(a.type));
  const activeAccountIds = new Set(activeAccounts.map(a => a.id));
  const fixedTotal = activeAccounts.filter(a => FIXED_ACCOUNT_TYPES.has(a.type)).reduce((s,a)=>s+(a.solde||0),0);
  const activePositions = positions.filter(p => activeAccountIds.has(p.accountId));
  const total = activePositions.reduce((s,p)=>s+p.current*p.qty,0) + fixedTotal;
  // PnL calculé uniquement sur les positions avec un PRU connu (price > 0)
  // Les positions à price=0 (PRU inconnu) sont exclues comme les livrets
  const positionsWithPRU = activePositions.filter(p => p.price > 0);
  const cost = positionsWithPRU.reduce((s,p)=>s+p.price*p.qty,0);
  const positionsValue = positionsWithPRU.reduce((s,p)=>s+p.current*p.qty,0);
  const totalPnl = positionsValue - cost;
  const totalPnlPct = cost>0?(totalPnl/cost*100):0;
  // Animated counter for total
  const totalEl = document.getElementById('totalValue');
  const prevNum = Number.isFinite(_lastRenderedTotal) ? _lastRenderedTotal : 0;
  _lastRenderedTotal = total;
  const animationToken = ++_totalAnimationToken;
  if (prevNum !== total && prevNum > 0) {
    let start = null;
    const duration = 600;
    const step = (ts) => {
      if (animationToken !== _totalAnimationToken) return;
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      totalEl.textContent = fmtEur(prevNum + (total - prevNum) * ease);
      if (progress < 1) requestAnimationFrame(step);
      else {
        totalEl.textContent = fmtEur(total);
        if (total > prevNum) {
          totalEl.style.animation = 'none';
          requestAnimationFrame(() => { totalEl.style.animation = 'glowPulse 1s ease'; });
        }
      }
    };
    requestAnimationFrame(step);
  } else {
    totalEl.textContent = fmtEur(total);
  }
  // Capital investi
  const ciEl = document.getElementById('capitalInvested');
  if (ciEl) { ciEl.textContent = cost > 0 ? fmtEur(cost) : '—'; ciEl.className = 'wealth-metric-value'; }

  const tp=document.getElementById('totalPnl');
  const newPnlText = cost > 0 ? ((totalPnl>=0?'+':'')+fmtEur(totalPnl)+' ('+(totalPnl>=0?'+':'')+fmt(totalPnlPct)+'%)') : '—';
  if (tp.textContent !== newPnlText) {
    tp.style.animation = 'none'; tp.offsetHeight;
    tp.style.animation = 'countUp 0.4s ease both';
  }
  tp.textContent = newPnlText;
  tp.className='wealth-metric-value '+(totalPnl>=0?'gain-col':'loss-col');

  // Dernière mise à jour des prix
  const luEl = document.getElementById('lastUpdateStat');
  if (luEl) {
    const lastTs = positions.reduce((m, p) => Math.max(m, p.lastUpdated || 0), 0);
    luEl.textContent = lastTs > 0 ? timeAgo(lastTs) : '—';
    luEl.className = 'wealth-update-time';
    luEl.style.color = 'var(--muted)';
  }
  updateBrowserTitle();
  renderPeriodVariation();
}

function refreshProjectionIfActive() {
  if (currentTabName === 'simulator') simUpdate();
}
function renderAll() {
  renderAccounts(); renderPositions(); renderAllocation();
  renderSummary(); renderFilterToggles(); renderChart();
  refreshProjectionIfActive();
}

// ─── TITRE NAVIGATEUR ────────────────────────────────────────────────────────
function updateBrowserTitle() {
  const totalEl = document.getElementById('totalValue');
  document.title = totalEl && totalEl.textContent !== '—'
    ? totalEl.textContent + ' · Moobank'
    : 'Moobank — Patrimoine';
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'error') {
  const old = document.getElementById('saveToast');
  if (old) { clearTimeout(old._t); old.remove(); }
  const toast = document.createElement('div');
  toast.id = 'saveToast';
  const ok = type === 'success';
  toast.className = `save-toast ${ok ? 'success' : 'error'}`;
  toast.setAttribute('role', ok ? 'status' : 'alert');
  toast.setAttribute('aria-live', ok ? 'polite' : 'assertive');
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  }));
  toast._t = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(8px)';
    setTimeout(() => toast.remove(), TIMING_TOAST_FADE);
  }, ok ? TIMING_TOAST_SUCCESS : TIMING_TOAST_ERROR);
}

// ─── OBJECTIFS D'ÉPARGNE ─────────────────────────────────────────────────────
let goals = [];
let selectedGoalEmoji = '🏠';

async function persistGoals(goal, isDelete = false) {
  if (!currentUser) return;
  assertLiveWrite();
  try {
    if (isDelete) {
      await retryDbWrite(async () => {
        const { error } = await sb.from('goals').delete().eq('id', goal.id).eq('user_id', currentUser.id).select('id').maybeSingle();
        if (error) throw error;
      });
    } else {
      const row = {
        id: goal.id, user_id: currentUser.id,
        name: goal.name, target: goal.target,
        current: goal.current, emoji: goal.emoji
      };
      MoobankCore.validateGoalRecord(row);
      await retryDbWrite(async () => {
        const { error } = await sb.from('goals').upsert(row);
        if (error) throw error;
      });
    }
    scheduleDataCacheWrite();
  } catch(e) {
    console.error('[Moobank] persistGoals error:', e);
    throw e; // propager aux appelants (saveGoal, deleteGoal) pour rollback
  }
}

function openAddGoal() {
  document.getElementById('goalModalTitle').textContent = 'Nouvel objectif';
  document.getElementById('goal-edit-id').value = '';
  document.getElementById('goal-name').value = '';
  document.getElementById('goal-target').value = '';
  document.getElementById('goal-current').value = '';
  selectedGoalEmoji = '🏠';
  document.querySelectorAll('.goal-emoji-opt').forEach(e => e.classList.toggle('active', e.textContent === '🏠'));
  showDialog(document.getElementById('goalModal'), '#goal-name');
}
function closeGoalModal() { hideDialog(document.getElementById('goalModal')); }
function selectGoalEmoji(el, emoji) {
  selectedGoalEmoji = emoji;
  document.querySelectorAll('.goal-emoji-opt').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
}

async function saveGoal() {
  const name = document.getElementById('goal-name').value.trim();
  const target = parseFloat(document.getElementById('goal-target').value);
  if (!name || !target || target <= 0) { showToast('Nom et montant cible requis', 'error'); return; }
  const currentRaw = document.getElementById('goal-current').value;
  const current = currentRaw !== '' ? parseFloat(currentRaw) : computeTotalPatrimoine();
  const editId = document.getElementById('goal-edit-id').value;
  let goal;
  let previousGoal = null;
  if (editId) {
    goal = goals.find(g => g.id === editId);
    if (!goal) { closeGoalModal(); return; } // objectif supprimé entre-temps
    previousGoal = { ...goal };
    goal.name = name; goal.target = target; goal.current = current; goal.emoji = selectedGoalEmoji;
  } else {
    goal = { id: crypto.randomUUID(), name, target, current, emoji: selectedGoalEmoji, createdAt: Date.now() };
    goals.push(goal);
  }
  try { await persistGoals(goal); } catch(e) {
    console.error('[Moobank] saveGoal error:', e);
    if (editId && previousGoal) Object.assign(goal, previousGoal);
    else goals = goals.filter(g => g.id !== goal.id);
    showToast('Erreur : impossible de sauvegarder l’objectif.', 'error');
    return;
  }
  closeGoalModal();
  renderGoals();
}

function editGoal(id) {
  const g = goals.find(g => g.id === id);
  if (!g) return;
  document.getElementById('goalModalTitle').textContent = 'Modifier l\'objectif';
  document.getElementById('goal-edit-id').value = id;
  document.getElementById('goal-name').value = g.name;
  document.getElementById('goal-target').value = g.target;
  document.getElementById('goal-current').value = g.current;
  selectedGoalEmoji = g.emoji || '🎯';
  document.querySelectorAll('.goal-emoji-opt').forEach(e => e.classList.toggle('active', e.textContent === selectedGoalEmoji));
  showDialog(document.getElementById('goalModal'), '#goal-name');
}

async function deleteGoal(id) {
  const goal = goals.find(g => g.id === id);
  if (!goal) return;
  if (!confirm(`Supprimer l’objectif « ${goal.name} » ?`)) return;
  const _backup = [...goals];
  goals = goals.filter(g => g.id !== id);
  try { await persistGoals(goal, true); } catch(e) {
    console.error('[Moobank] deleteGoal error:', e);
    goals = _backup;
    showToast('Erreur : impossible de supprimer l\'objectif.', 'error');
    return;
  }
  renderGoals();
}

function renderGoals() {
  const container = document.getElementById('goalsList');
  if (!container) return;
  if (goals.length === 0) {
    container.innerHTML = '<div class="empty-state">Aucun objectif — cliquez sur "+ Objectif"</div>';
    return;
  }
  container.innerHTML = goals.map((g, idx) => {
    const pct = Math.min(100, g.target > 0 ? (g.current / g.target * 100) : 0);
    const remaining = Math.max(0, g.target - g.current);
    const done = pct >= 100;
    const barColor = done ? 'var(--gain)' : pct > 60 ? '#ffb400' : 'var(--accent2)';
    return `<div class="goal-card" style="animation:slideInRight 0.35s cubic-bezier(0.34,1.2,0.64,1) ${idx*0.07}s both">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:4px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:1.4rem">${g.emoji || '🎯'}</span>
          <div>
            <div style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:0.9rem">${_esc(g.name)}</div>
            <div style="font-size:0.65rem;color:var(--muted);margin-top:1px">Objectif : ${fmtEur(g.target)}</div>
          </div>
        </div>
        <div style="display:flex;gap:4px">
          <button class="del-btn" onclick="editGoal('${g.id}')" title="Modifier" style="color:var(--muted)">✏️</button>
          <button class="del-btn" onclick="deleteGoal('${g.id}')" title="Supprimer">✕</button>
        </div>
      </div>
      <div class="goal-progress-bar">
        <div class="goal-progress-fill" style="width:${pct}%;background:${barColor}"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:0.72rem;color:var(--muted)">
          ${done
            ? `<span style="color:var(--gain);font-weight:600">🎉 Objectif atteint !</span>`
            : `<span style="color:var(--text);font-weight:600">${fmtEur(g.current)}</span> <span style="color:var(--muted)">· encore ${fmtEur(remaining)}</span>`
          }
        </div>
        <div style="font-family:'DM Mono',monospace;font-size:0.78rem;font-weight:600;color:${done ? 'var(--gain)' : 'var(--text)'}">${pct.toFixed(1)}%</div>
      </div>
    </div>`;
  }).join('');
}

// ─── EUR/USD ──────────────────────────────────────────────────────────────────
async function fetchEurUsd() {
  try {
    const data = await yfFetch('/v8/finance/chart/EURUSD=X?interval=1d&range=5d');
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return;
    const eurUsd = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose || meta.previousClose || eurUsd;
    // On affiche USD/EUR = 1 / (EUR/USD)
    const rate = 1 / eurUsd;
    const prevRate = 1 / prev;
    const change = rate - prevRate;
    const changePct = prevRate ? (change / prevRate * 100) : 0;
    const el = document.getElementById('eurusd-rate');
    const ch = document.getElementById('eurusd-change');
    if (el) el.textContent = rate.toFixed(4);
    if (ch) {
      ch.textContent = (changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%';
      ch.style.color = changePct >= 0 ? 'var(--gain)' : 'var(--loss)';
    }
  } catch(e) {}
}

// ─── FILTRES PATRIMOINE ───────────────────────────────────────────────────────
let filteredTypes = null;

function getDefaultActiveTypes() {
  return [...new Set(accounts.map(a => a.type))];
}

function ensureFilterInit() {
  if (!filteredTypes) filteredTypes = getDefaultActiveTypes();
}

function isTypeActive(type) {
  ensureFilterInit();
  return filteredTypes.includes(type);
}

function isAllActive() {
  ensureFilterInit();
  const types = [...new Set(accounts.map(a => a.type))];
  return types.every(t => filteredTypes.includes(t));
}

function toggleAll() {
  const types = [...new Set(accounts.map(a => a.type))];
  filteredTypes = isAllActive() ? [] : [...types];
  renderFilterToggles(); renderSummary(); renderAllocation();
}

function toggleType(type) {
  ensureFilterInit();
  if (filteredTypes.includes(type)) { filteredTypes = filteredTypes.filter(t => t !== type); }
  else { filteredTypes.push(type); }
  renderFilterToggles(); renderSummary(); renderAllocation();
}

function renderFilterToggles() {
  const el = document.getElementById('filterToggles');
  if (!el) return;
  const types = [...new Set(accounts.map(a => a.type))];
  if (types.length === 0) { el.innerHTML = ''; return; }
  ensureFilterInit();
  const allActive = isAllActive();
  const allToggle = `<button type="button" class="filter-toggle ${allActive ? 'active' : ''}" aria-pressed="${allActive}" onclick="toggleAll()" style="font-weight:600"><span class="ft-dot"></span>Tout</button>`;
  const typeToggles = types.map(type => {
    const active = filteredTypes.includes(type);
    return `<button type="button" class="filter-toggle ${active ? 'active' : ''}" aria-pressed="${active}" onclick="toggleType('${type}')"><span class="ft-dot"></span>${_esc(accountTypeLabel(type))}</button>`;
  }).join('');
  el.innerHTML = allToggle + typeToggles;
}

// ─── PATRIMOINE SNAPSHOT ──────────────────────────────────────────────────────
function computeTotalPatrimoine() {
  // Patrimoine TOTAL, tous types confondus — utilisé pour les snapshots historiques
  // (indépendant des filtres actifs pour assurer la cohérence de l'historique)
  const fixed = accounts.filter(a => FIXED_ACCOUNT_TYPES.has(a.type)).reduce((s,a) => s+(a.solde||0), 0);
  return positions.reduce((s,p) => s + p.current * p.qty, 0) + fixed;
}
function computeCurrentPatrimoine() {
  const activeAccounts = accounts.filter(a => isTypeActive(a.type));
  const fixed = activeAccounts.filter(a => FIXED_ACCOUNT_TYPES.has(a.type)).reduce((s,a) => s+(a.solde||0), 0);
  const activeIds = new Set(activeAccounts.map(a => a.id));
  return positions.filter(p => activeIds.has(p.accountId)).reduce((s,p) => s + p.current * p.qty, 0) + fixed;
}

function parisDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function snapshotPatrimoine() {
  const val = computeTotalPatrimoine(); // toujours le total, pas filtré
  if (val <= 0) return;
  const today = parisDateKey();
  const last = patrimoineHistory[patrimoineHistory.length - 1];
  const _snapHistory = [...patrimoineHistory];
  if (last && last.date === today) {
    patrimoineHistory[patrimoineHistory.length - 1].value = val;
  } else {
    patrimoineHistory.push({ date: today, value: val });
  }
  if (patrimoineHistory.length > 730) patrimoineHistory = patrimoineHistory.slice(-730);
  try { await savePatrimoineHistory(); } catch(e) {
    console.error('[Moobank] snapshotPatrimoine error:', e);
    patrimoineHistory = _snapHistory;
    showToast('Cours actualisés, mais le point d’historique du jour n’a pas pu être sauvegardé.', 'error');
    return;
  }
  renderChart();
}

// ─── CHART ────────────────────────────────────────────────────────────────────
window.setChartPeriod = function(period, btn) {
  currentChartPeriod = period;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderChart();
  renderPeriodVariation();
};

function renderPeriodVariation() {
  const labelEl = document.getElementById('periodVarLabel');
  const valEl = document.getElementById('periodVarStat');
  if (!labelEl || !valEl) return;

  const periodLabels = { '1S': '1 sem.', '1M': '1 mois', '3M': '3 mois', '1A': '1 an', 'Tout': 'Tout' };
  labelEl.textContent = 'Variation globale · ' + (periodLabels[currentChartPeriod] || currentChartPeriod);

  const filtered = filterChartData([...patrimoineHistory].sort((a,b) => a.date < b.date ? -1 : 1), currentChartPeriod);
  if (filtered.length < 2) { valEl.textContent = '—'; valEl.className = 'wealth-metric-value'; return; }

  const first = parseFloat(filtered[0].value) || 0;
  const last = parseFloat(filtered[filtered.length - 1].value) || 0;
  const delta = last - first;
  const deltaPct = first > 0 ? (delta / first * 100) : 0;

  valEl.textContent = (delta >= 0 ? '+' : '') + fmtEur(delta) + ' (' + (deltaPct >= 0 ? '+' : '') + fmt(deltaPct) + '%)';
  valEl.className = 'wealth-metric-value ' + (delta >= 0 ? 'gain-col' : 'loss-col');
}

function filterChartData(data, period) {
  if (period === 'Tout') return data;
  const now = new Date();
  const cutoff = new Date(now);
  if (period === '1S') cutoff.setDate(now.getDate() - 7);
  else if (period === '1M') cutoff.setMonth(now.getMonth() - 1);
  else if (period === '3M') cutoff.setMonth(now.getMonth() - 3);
  else if (period === '1A') cutoff.setFullYear(now.getFullYear() - 1);
  const cutStr = parisDateKey(cutoff);
  return data.filter(d => d.date >= cutStr);
}

// Interpolate between sparse real snapshots to get a daily series
function buildInterpolatedSeries(data, startDate, endDate) {
  if (!data || data.length === 0) return [];
  // Add current patrimoine as "today" if not already present
  const today = parisDateKey();
  const currentVal = computeTotalPatrimoine(); // cohérent avec snapshotPatrimoine qui utilise aussi le total
  let augmented = [...data];
  if (currentVal > 0 && (!augmented.length || augmented[augmented.length-1].date !== today)) {
    augmented = [...augmented, { date: today, value: currentVal, real: true }];
  }
  augmented = augmented.map(d => ({ ...d, real: true }));
  if (augmented.length === 0) return [];

  // Build full daily series by interpolating between real points
  // Use integer timestamps at noon UTC to avoid DST/timezone boundary issues
  const result = [];
  const startMs = new Date((startDate || augmented[0].date) + 'T12:00:00Z').getTime();
  const endMs   = new Date((endDate   || today)             + 'T12:00:00Z').getTime();
  const DAY_MS  = 86400000;

  for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
    const ds = new Date(ms).toISOString().slice(0, 10);
    const real = augmented.find(p => p.date === ds);
    if (real) { result.push({ date: ds, value: real.value, estimated: false }); continue; }
    // Find surrounding real points
    const before = augmented.findLast(p => p.date < ds); // évite la copie inutile de reverse()
    const after = augmented.find(p => p.date > ds);
    if (before && after) {
      const t0 = new Date(before.date + 'T12:00:00Z').getTime();
      const t1 = new Date(after.date  + 'T12:00:00Z').getTime();
      const ratio = (ms - t0) / (t1 - t0);
      result.push({ date: ds, value: before.value + (after.value - before.value) * ratio, estimated: true });
    } else if (before) {
      result.push({ date: ds, value: before.value, estimated: true });
    }
  }
  return result;
}

function renderChart() {
  const wrap = document.getElementById('chartWrap');
  const emptyEl = document.getElementById('chartEmpty');
  const rawData = filterChartData(patrimoineHistory, currentChartPeriod);

  // Remove old SVG and single-point state
  // (interp note cleanup is handled below via wrap.parentElement.querySelectorAll)
  const oldSvg = wrap.querySelector('svg.chart-svg');
  if (oldSvg) oldSvg.remove();
  const oldSingle = wrap.querySelector('.chart-single-point');
  if (oldSingle) oldSingle.remove();

  if (rawData.length < 1 && computeTotalPatrimoine() <= 0) {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  // Build interpolated series
  const today = parisDateKey();
  const startDate = rawData.length > 0 ? rawData[0].date : today;
  const data = buildInterpolatedSeries(rawData, startDate, today);
  if (data.length < 2) {
    // Si un seul point (premier lancement aujourd'hui), afficher un état "début"
    if (data.length === 1) {
      emptyEl.classList.add('hidden');
      const singleWrap = document.createElement('div');
      singleWrap.className = 'chart-single-point';
      singleWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:160px;gap:8px';
      singleWrap.innerHTML = `
        <div style="font-size:1.6rem">📍</div>
        <div style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:1.1rem">${fmtEur(data[0].value)}</div>
        <div style="font-size:0.72rem;color:var(--muted)">Point de départ enregistré — le graphique s'enrichira à chaque visite</div>`;
      wrap.insertBefore(singleWrap, wrap.querySelector('.chart-cursor'));
    } else {
      emptyEl.classList.remove('hidden');
    }
    return;
  }

  const hasEstimated = data.some(d => d.estimated);
  const todayAlreadyInRaw = rawData.some(d => d.date === today); // today déjà défini plus haut
  const realCount = rawData.length + (todayAlreadyInRaw ? 0 : 1); // +1 for today if not already present

  const W = wrap.clientWidth || 800;
  const H = 200;
  const pad = { top: 16, right: 20, bottom: 32, left: W < 400 ? 48 : 60 };
  const iW = W - pad.left - pad.right;
  const iH = H - pad.top - pad.bottom;

  const values = data.map(d => d.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  const xScale = (i) => pad.left + (i / (data.length - 1)) * iW;
  const yScale = (v) => pad.top + iH - ((v - minV) / range) * iH;

  const isGain = data[data.length-1].value >= data[0].value;
  const lineColor = isGain ? '#55e6b1' : '#ff7189';
  const gradId = 'chartGrad_' + Date.now();

  // Build path: solid for real segments, dashed for interpolated
  // We split the polyline into segments
  let solidSegments = [];
  let currentSeg = [];
  let estimatedSegs = [];
  let currentEstSeg = [];

  data.forEach((d, i) => {
    const pt = `${xScale(i)},${yScale(d.value)}`;
    if (!d.estimated) {
      currentSeg.push(pt);
      if (currentEstSeg.length > 0) { estimatedSegs.push([...currentEstSeg]); currentEstSeg = []; }
    } else {
      currentEstSeg.push(pt);
      if (currentSeg.length > 0) { solidSegments.push([...currentSeg]); currentSeg = []; }
    }
  });
  if (currentSeg.length > 0) solidSegments.push(currentSeg);
  if (currentEstSeg.length > 0) estimatedSegs.push(currentEstSeg);

  // Build a combined area for gradient background
  const baseY = pad.top + iH;
  const areaPath = `M ${xScale(0)},${baseY} ` + data.map((d,i) => `L ${xScale(i)},${yScale(d.value)}`).join(' ') + ` L ${xScale(data.length-1)},${baseY} Z`;

  // Real snapshots dots — use index directly, no indexOf
  const realDots = data.map((d, i) => {
    if (d.estimated) return '';
    const x = xScale(i); const y = yScale(d.value);
    return `<circle cx="${x}" cy="${y}" r="3.5" fill="${lineColor}" opacity="0.9"/>`;
  }).join('');

  // Y axis labels — format compact si petit écran
  const yTicks = 4;
  const useCompact = W < 400;
  function fmtYAxis(v) {
    if (!useCompact) return fmtEur(v).replace(/\s/g,'\u202F');
    if (Math.abs(v) >= 1000000) return (v/1000000).toFixed(1) + 'M€';
    if (Math.abs(v) >= 1000)    return (v/1000).toFixed(0) + 'k€';
    return Math.round(v) + '€';
  }
  let yAxisHTML = '';
  for (let i = 0; i <= yTicks; i++) {
    const v = minV + (range * i / yTicks);
    const y = yScale(v);
    yAxisHTML += `<text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#5a6478" font-family="DM Mono,monospace">${fmtYAxis(v)}</text>`;
    yAxisHTML += `<line x1="${pad.left}" y1="${y}" x2="${pad.left + iW}" y2="${y}" stroke="#1e2530" stroke-width="1" stroke-dasharray="4,4"/>`;
  }

  // X axis labels
  let xAxisHTML = '';
  const maxXLabels = Math.min(data.length, 6);
  for (let i = 0; i < maxXLabels; i++) {
    const idx = Math.round((i / (maxXLabels - 1)) * (data.length - 1));
    const x = xScale(idx);
    const d = new Date(data[idx].date + 'T12:00:00');
    const label = d.toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
    xAxisHTML += `<text x="${x}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#5a6478" font-family="DM Mono,monospace">${label}</text>`;
  }

  const solidLines = solidSegments.map(seg =>
    `<polyline points="${seg.join(' ')}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
  ).join('');
  const estLines = estimatedSegs.map(seg =>
    `<polyline points="${seg.join(' ')}" fill="none" stroke="${lineColor}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="5,4" opacity="0.45"/>`
  ).join('');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'chart-svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('height', H);
  svg.innerHTML = `
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${yAxisHTML}${xAxisHTML}
    <path d="${areaPath}" fill="url(#${gradId})"/>
    ${estLines}
    ${solidLines}
    ${realDots}
  `;

  // Interaction: tooltip + cursor
  svg.addEventListener('mousemove', (e) => {
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const idx = Math.max(0, Math.min(data.length - 1, Math.round(((mx - pad.left) / iW) * (data.length - 1))));
    const pt = data[idx];
    const x = xScale(idx);
    const delta = pt.value - data[0].value;
    const deltaPct = data[0].value > 0 ? (delta / data[0].value * 100) : 0;

    const cursor = document.getElementById('chartCursor');
    cursor.style.left = x + 'px';
    cursor.style.top = (pad.top) + 'px';
    cursor.style.height = iH + 'px';
    cursor.style.opacity = '1';

    const tt = document.getElementById('chartTooltip');
    const dObj = new Date(pt.date + 'T12:00:00');
    document.getElementById('ttDate').textContent = dObj.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'long', year:'numeric' }) + (pt.estimated ? ' ~' : '');
    document.getElementById('ttVal').textContent = fmtEur(pt.value) + (pt.estimated ? ' (estimé)' : '');
    const ttDelta = document.getElementById('ttDelta');
    ttDelta.textContent = (delta >= 0 ? '+' : '') + fmtEur(delta) + ' (' + (deltaPct >= 0 ? '+' : '') + fmt(deltaPct) + '%)';
    ttDelta.style.color = delta >= 0 ? '#55e6b1' : '#ff7189';
    tt.style.opacity = '1';
    const ttX = Math.min(Math.max(x, 80), W - 80);
    tt.style.left = ttX + 'px';
    tt.style.top = (pad.top + 8) + 'px';
  });
  svg.addEventListener('mouseleave', () => {
    document.getElementById('chartTooltip').style.opacity = '0';
    document.getElementById('chartCursor').style.opacity = '0';
  });

  wrap.insertBefore(svg, wrap.querySelector('.chart-cursor'));

  // Note interpolation — remove any previous note first to avoid duplicates
  wrap.parentElement.querySelectorAll('.chart-interp-note').forEach(el => el.remove());
  if (hasEstimated && realCount < data.length) {
    const note = document.createElement('div');
    note.className = 'chart-interp-note';
    note.style.cssText = 'font-size:0.62rem;color:var(--muted);text-align:right;margin-top:4px;padding:0 4px';
    note.innerHTML = `<span style="opacity:0.6">— — interpolé</span> &nbsp; <span style="border-bottom:1.5px solid currentColor">——</span> mesure réelle · ${realCount} point${realCount>1?'s':''}`;
    wrap.after(note);
  }
}

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────

window.switchPosTab = function(tab) {
  const posPanel = document.getElementById('pos-panel');
  const txPanel = document.getElementById('pos-tx-panel');
  const posBtn = document.getElementById('tab-pos-btn');
  const txBtn = document.getElementById('tab-pos-tx-btn');
  const refreshBtn = document.getElementById('refreshBtn');
  if (tab === 'pos') {
    posPanel.style.display = '';
    txPanel.style.display = 'none';
    posBtn.style.borderBottomColor = 'var(--accent)';
    posBtn.style.color = 'var(--accent)';
    txBtn.style.borderBottomColor = 'transparent';
    txBtn.style.color = 'var(--muted)';
    refreshBtn.style.display = '';
  } else {
    renderTransactions();
    posPanel.style.display = 'none';
    txPanel.style.display = '';
    // Déclenche l'animation du panel
    txPanel.classList.remove('tx-panel-anim');
    void txPanel.offsetWidth; // reflow pour relancer l'animation
    txPanel.classList.add('tx-panel-anim');
    posBtn.style.borderBottomColor = 'transparent';
    posBtn.style.color = 'var(--muted)';
    txBtn.style.borderBottomColor = 'var(--accent)';
    txBtn.style.color = 'var(--accent)';
    refreshBtn.style.display = 'none';
  }
};

function renderTransactions() {
  const el = document.getElementById('txListPos');
  if (!el) return;
  if (transactions.length === 0) {
    el.innerHTML = '<div class="tx-empty">Aucune transaction enregistrée</div>';
    return;
  }
  el.innerHTML = transactions.map((tx, i) => {
    const isEdit = tx.type === 'edit';
    const isBuy = tx.type === 'buy';
    const icon = isEdit ? '✏️' : (isBuy ? '↑' : '↓');
    const iconClass = isEdit ? 'edit' : (isBuy ? 'buy' : 'sell');
    const iconColor = isEdit ? 'var(--accent2)' : (isBuy ? 'var(--gain)' : 'var(--loss)');
    const val = tx.qty * tx.price;
    const d = new Date(tx.ts);
    const dateStr = d.toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' });
    const timeStr = d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
    const delay = Math.min(i * 45, 400);
    const detail = isEdit
      ? `${tx.qty} titres · PRU ${fmtPrice(tx.price)}${tx.oldQty !== tx.qty ? ` (était ${tx.oldQty})` : ''}${tx.oldPrice !== tx.price ? ` / ${fmtPrice(tx.oldPrice)}` : ''} · ${_esc(tx.accountName)}`
      : `${tx.qty} × ${fmtPrice(tx.price)} · ${_esc(tx.accountName)}`;
    const valHtml = isEdit
      ? `<div class="tx-val" style="color:var(--accent2)">${fmtEur(val)}</div>`
      : `<div class="tx-val" style="color:${iconColor}">${isBuy ? '+' : '-'}${fmtEur(val)}</div>`;
    return `<div class="tx-item" style="animation-delay:${delay}ms">
      <div class="tx-icon ${iconClass}" style="color:${iconColor};${isEdit ? 'background:rgba(0,112,243,0.1);font-size:0.8rem' : ''}">${icon}</div>
      <div class="tx-info">
        <div class="tx-sym">${_esc(tx.symbol)}${isEdit ? ' <span style="font-size:0.62rem;color:var(--accent2);background:rgba(0,112,243,0.12);padding:1px 5px;border-radius:3px;font-weight:500">MODIF</span>' : ''}</div>
        <div class="tx-detail">${detail}</div>
      </div>
      <div class="tx-right">
        ${valHtml}
        <div class="tx-date">${dateStr} ${timeStr}</div>
      </div>
    </div>`;
  }).join('');
}

// ─── PRÉLÈVEMENTS ─────────────────────────────────────────────────────────────
// PREL_FREQ_MONTHLY et PREL_CAT_LABELS définis dans les constantes centrales

function openAddPrel() {
  document.getElementById('prelAddRow').classList.remove('hidden');
  document.getElementById('prel-new-name').focus();
}
function cancelAddPrel() {
  document.getElementById('prelAddRow').classList.add('hidden');
  document.getElementById('prel-new-name').value = '';
  document.getElementById('prel-new-amount').value = '';
  document.getElementById('prel-new-split').value = '';
}
async function confirmAddPrel() {
  const name = document.getElementById('prel-new-name').value.trim();
  const amount = parseFloat(document.getElementById('prel-new-amount').value);
  const freq = document.getElementById('prel-new-freq').value;
  const cat = document.getElementById('prel-new-cat').value;
  const splitRaw = parseInt(document.getElementById('prel-new-split').value);
  const split = splitRaw >= 2 ? splitRaw : 1;
  if (!name || !amount || amount <= 0) return alert('Nom et montant positif requis');
  const _newPrel = { id: crypto.randomUUID(), name, amount, freq, cat, split };
  prelevements.push(_newPrel);
  try { await savePrelevement(_newPrel); } catch(e) {
    console.error('[Moobank] confirmAddPrel error:', e);
    prelevements = prelevements.filter(p => p.id !== _newPrel.id);
    showToast('Erreur : impossible d\'ajouter.', 'error');
    return;
  }
  cancelAddPrel(); renderPrelevements();
}
async function deletePrel(id) {
  const prelevement = prelevements.find(p => p.id === id);
  if (!prelevement) return;
  if (!confirm(`Supprimer le prélèvement « ${prelevement.name} » ?`)) return;
  try { await deletePrelDB(id); } catch(e) { console.error('[Moobank] deletePrel error:', e); showToast('Erreur : suppression impossible.', 'error'); return; }
  prelevements = prelevements.filter(p => p.id !== id);
  renderPrelevements();
}
function editPrel(id) {
  const p = prelevements.find(p => p.id === id);
  if (!p) return;
  const row = document.getElementById('prel-row-' + id);
  const safeName = _esc(p.name);
  row.innerHTML = `<td colspan="5" style="padding:8px 10px">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <input class="prel-input prel-input-name" type="text" id="prel-edit-name-${id}" value="${safeName}" placeholder="Nom">
      <input class="prel-input prel-input-amount" type="number" id="prel-edit-amount-${id}" value="${p.amount}" step="any" min="0" placeholder="Montant">
      <select class="prel-input prel-input-freq" id="prel-edit-freq-${id}">
        <option value="mensuel" ${p.freq==='mensuel'?'selected':''}>Mensuel</option>
        <option value="trimestriel" ${p.freq==='trimestriel'?'selected':''}>Trimestriel</option>
        <option value="annuel" ${p.freq==='annuel'?'selected':''}>Annuel</option>
      </select>
      <select class="prel-input" style="width:130px" id="prel-edit-cat-${id}">
        <option value="courtage" ${p.cat==='courtage'?'selected':''}>Courtage</option>
        <option value="frais" ${p.cat==='frais'?'selected':''}>Frais gestion</option>
        <option value="credit" ${p.cat==='credit'?'selected':''}>Crédit</option>
        <option value="abonnement" ${p.cat==='abonnement'?'selected':''}>Abonnement</option>
        <option value="autre" ${p.cat==='autre'?'selected':''}>Autre</option>
      </select>
      <input class="prel-input prel-split-input" type="number" id="prel-edit-split-${id}" value="${p.split > 1 ? p.split : ''}" placeholder="÷" min="1" max="99" step="1" title="Partagé entre X personnes au total">
      <button class="btn btn-sm btn-primary" onclick="confirmEditPrel('${id}')">✓</button>
      <button class="btn btn-sm" onclick="renderPrelevements()">✕</button>
    </div>
  </td>`;
}
async function confirmEditPrel(id) {
  const p = prelevements.find(p => p.id === id);
  if (!p) return;
  const previous = { ...p };
  const nextName = document.getElementById('prel-edit-name-' + id).value.trim();
  const nextAmount = parseFloat(document.getElementById('prel-edit-amount-' + id).value);
  if (!nextName || !nextAmount || nextAmount <= 0) {
    showToast('Nom et montant positif requis.', 'error');
    return;
  }
  p.name = nextName;
  p.amount = nextAmount;
  p.freq = document.getElementById('prel-edit-freq-' + id).value;
  p.cat = document.getElementById('prel-edit-cat-' + id).value;
  const splitRaw = parseInt(document.getElementById('prel-edit-split-' + id).value);
  p.split = splitRaw >= 2 ? splitRaw : 1;
  try {
    await savePrelevement(p);
  } catch(e) {
    console.error('[Moobank] confirmEditPrel error:', e);
    Object.assign(p, previous);
    showToast('Erreur modification : les anciennes valeurs sont conservées.', 'error');
  }
  renderPrelevements();
}
function renderPrelevements() {
  const el = document.getElementById('prelList');
  const summary = document.getElementById('prelSummary');
  if (prelevements.length === 0) {
    el.innerHTML = '<div class="empty-state">Aucun prélèvement — cliquez sur "+ Ajouter"</div>';
    summary.classList.add('hidden'); return;
  }
  let totalMonthly = 0;
  prelevements.forEach(p => {
    const split = p.split > 1 ? p.split : 1;
    totalMonthly += (p.amount / split) * (PREL_FREQ_MONTHLY[p.freq] || 1);
  });

  const rows = prelevements.map(p => {
    const split = p.split > 1 ? p.split : 1;
    const myShare = p.amount / split;
    const monthly = myShare * (PREL_FREQ_MONTHLY[p.freq] || 1);
    const catLabel = PREL_CAT_LABELS[p.cat] || p.cat;
    const shareHtml = split > 1
      ? `<span class="prel-share-badge" style="font-size:0.55rem;padding:1px 5px;margin-left:4px">÷${split}</span>`
      : '';
    const myPartHtml = split > 1
      ? `<div style="font-size:0.65rem;color:#ff9a3c;margin-top:1px">Ma part : ${fmtEur(myShare)}</div>`
      : '';
    return `<tr id="prel-row-${p.id}" style="transition:background 0.15s" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background=''">
      <td style="padding:8px 10px">
        <div style="display:flex;align-items:center">
          <span style="font-weight:600;font-size:0.8rem">${_esc(p.name)}</span>${shareHtml}
        </div>
        <div style="font-size:0.62rem;color:var(--muted);margin-top:1px">${catLabel}</div>
      </td>
      <td style="padding:8px 10px;color:var(--muted);font-size:0.68rem;white-space:nowrap">
        <span style="background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:3px">${p.freq}</span>
      </td>
      <td style="padding:8px 10px;text-align:right;white-space:nowrap">
        <div style="font-family:'DM Mono',monospace;font-size:0.75rem;color:var(--muted)">≈ ${fmtEur(monthly)}/m</div>
      </td>
      <td style="padding:8px 10px;text-align:right;white-space:nowrap">
        <div style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:600;font-size:0.85rem;color:var(--loss)">-${fmtEur(p.amount)}</div>
        ${myPartHtml}
      </td>
      <td style="padding:8px 10px;text-align:right;white-space:nowrap">
        <button class="del-btn" onclick="editPrel('${p.id}')" style="color:var(--muted);margin-right:4px" title="Modifier">✏️</button>
        <button class="del-btn" onclick="deletePrel('${p.id}')" title="Supprimer">✕</button>
      </td>
    </tr>`;
  }).join('');

  el.innerHTML = `<table class="prel-table" style="width:100%;border-collapse:collapse;font-size:0.78rem">
    <thead>
      <tr>
        <th style="color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;font-size:0.62rem;padding:6px 10px;text-align:left;border-bottom:1px solid var(--border);font-weight:400">Nom</th>
        <th style="color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;font-size:0.62rem;padding:6px 10px;text-align:left;border-bottom:1px solid var(--border);font-weight:400">Fréquence</th>
        <th style="color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;font-size:0.62rem;padding:6px 10px;text-align:right;border-bottom:1px solid var(--border);font-weight:400">/ Mois</th>
        <th style="color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;font-size:0.62rem;padding:6px 10px;text-align:right;border-bottom:1px solid var(--border);font-weight:400">Montant</th>
        <th style="border-bottom:1px solid var(--border)"></th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;

  summary.classList.remove('hidden');
  document.getElementById('prelMonthly').textContent = '-' + fmtEur(totalMonthly);
  document.getElementById('prelYearly').textContent = '-' + fmtEur(totalMonthly * 12);
}

// ─── VISIBILITY REFRESH ──────────────────────────────────────────────────────
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && _usingCachedData) {
    retryCachedDataSync(false);
  } else if (document.visibilityState === 'visible' && positions.length > 0) {
    // Si plus de 2 min depuis le dernier refresh, on relance
    const now = Date.now();
    if (now - _lastPriceRefresh > 2 * 60 * 1000) {
      refreshAllPrices();
    }
  }
});


// ─── RACCOURCIS CLAVIER ──────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // Escape : fermer le modal ouvert
  if (e.key === 'Escape') {
    const openOverlay = document.querySelector('.modal-overlay.open');
    if (openOverlay) {
      const id = openOverlay.id.replace('Modal','').replace('modal','');
      if (openOverlay.id === 'goalModal') closeGoalModal();
      else if (openOverlay.id === 'editPositionModal') closeEditPosition();
      else if (openOverlay.id === 'mobileActionsModal') closeMobileActions();
      else closeModal(id);
      e.preventDefault();
      return;
    }

  }

  // Maintenir le focus dans la boîte de dialogue ouverte.
  if (e.key === 'Tab') {
    const openOverlay = document.querySelector('.modal-overlay.open');
    if (openOverlay) {
      const focusable = [...openOverlay.querySelectorAll('button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')]
        .filter(el => el.offsetParent !== null);
      if (focusable.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
        else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
      }
      return;
    }
  }

  // Les raccourcis des onglets ne doivent pas agir derrière le menu mobile.
  if (document.getElementById('mobileActionsModal')?.classList.contains('open')) return;

  // Ignorer les autres raccourcis si focus dans un champ de saisie.
  if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;

  // N : nouvelle position
  if (e.key === 'n' || e.key === 'N') {
    if (!document.querySelector('.modal-overlay.open')) {
      openAddPosition(); e.preventDefault();
    }
    return;
  }

  // R : rafraîchir les prix
  if (e.key === 'r' || e.key === 'R') {
    if (!document.querySelector('.modal-overlay.open')) {
      refreshAllPrices(); e.preventDefault();
    }
    return;
  }

  // 1-4 : changer d'onglet
  if (e.key === '1') switchTabByIndex(0);
  else if (e.key === '2') switchTabByIndex(1);
  else if (e.key === '3') switchTabByIndex(2);

  // / ou F : focus barre de recherche positions
  if ((e.key === '/' || e.key === 'f' || e.key === 'F') && !document.querySelector('.modal-overlay.open')) {
    const searchInput = document.getElementById('posSearch');
    if (searchInput) {
      searchInput.focus();
      e.preventDefault();
    }
  }
});

function switchTabByIndex(i) {
  const btns = document.querySelectorAll('#mainTabs .tab-btn');
  if (btns[i]) btns[i].click();
}

// ─── RIPPLE EFFECT ───────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const btn = e.target.closest('.btn');
  if (!btn || btn.disabled) return;
  const r = document.createElement('span');
  r.className = 'btn-ripple';
  const rect = btn.getBoundingClientRect();
  r.style.left = (e.clientX - rect.left) + 'px';
  r.style.top  = (e.clientY - rect.top)  + 'px';
  btn.appendChild(r);
  setTimeout(() => r.remove(), TIMING_TOAST_FADE + 200); // ~500ms ripple
});
// ─── INIT ─────────────────────────────────────────────────────────────────────
function clearLoadedSession() {
  // État en mémoire uniquement ; aucune suppression en base ou de jeton SDK.
  closeMobileActions();
  _cacheSyncTask?.controller?.abort();
  _cacheSyncTask = null;
  clearTimeout(_cacheRetryTimer); _cacheRetryTimer = null;
  clearTimeout(_cacheWriteTimer); _cacheWriteTimer = null;
  _cacheRetryIndex = 0;
  setCachedDataMode(false);
  currentUser = null;
  _appReadyTask = null;
  accounts = []; positions = []; prelevements = []; transactions = []; patrimoineHistory = []; goals = [];
  simContributionPlan = {};
  simContributionPlanUserId = null;
  _simControlsSignature = null;
  marketNewsLoadedAt = 0;
  marketNewsUserId = null;
  positionHistory = {};
  clearInterval(_priceRefreshInterval); _priceRefreshInterval = null;
  clearInterval(_eurUsdInterval); _eurUsdInterval = null;
  eurRates = {};
  document.getElementById('mainApp').classList.add('hidden');
}

function initApp(user) {
  if (!user?.id) return Promise.resolve(false);
  if (_appReadyTask?.userId === user.id) {
    currentUser = user;
    updateUserUI(user);
    return Promise.resolve(true);
  }
  if (_appInitTask?.userId === user.id) return _appInitTask.promise;
  _appInitTask?.controller.abort();
  clearLoadedSession();
  const task = { userId: user.id, controller: new AbortController(), promise: null };
  _appInitTask = task;
  _failedLoad = null;
  filteredTypes = null;
  _lastRenderedTotal = null;
  _totalAnimationToken++;
  updateUserUI(user);
  hideOfflineBanner();
  setAuthLoadStatus('Connexion établie — chargement des données…');
  if (document.getElementById('loginScreen').classList.contains('hidden')) {
    document.getElementById('loadingOverlay').classList.remove('hidden');
  }
  syncAuthSubmitButton();
  task.promise = (async () => {
    try {
      let loaded;
      // Maximum quatre tentatives au total, même si les erreurs alternent.
      for (let attempt = 0; attempt <= JWT_RETRY_DELAYS.length; attempt++) {
        try {
          loaded = await loadAllData(user.id, task.controller.signal);
          break;
        } catch (error) {
          if (task.controller.signal.aborted || error.name === 'AbortError') throw error;
          const futureJwt = error.kind === 'jwt_future';
          const temporary = error.kind === 'timeout' || error.kind === 'network';
          if (attempt === JWT_RETRY_DELAYS.length || (!futureJwt && !temporary)) throw error;
          setAuthLoadStatus(futureJwt ?
            `Vérification temporaire de la session — nouvelle tentative (${attempt + 2}/4)…` :
            'Connexion momentanément indisponible — nouvelle tentative…');
          await waitForDataRetry(JWT_RETRY_DELAYS[attempt] || TIMING_SUPABASE_RETRY, task.controller.signal);
        }
      }
      if (_appInitTask !== task || task.controller.signal.aborted) return false;
      // Commit unique, seulement une fois les six lectures réussies.
      assignLoadedData(loaded);
      currentUser = _authUser?.id === user.id ? _authUser : user;
      _appReadyTask = task;
      _failedLoad = null;
      _cacheRetryIndex = 0;
      setCachedDataMode(false);
      hideOfflineBanner();
      document.getElementById('auth-error').textContent = '';
      document.getElementById('loadingOverlay').classList.add('hidden');
      document.getElementById('loginScreen').classList.add('hidden');
      document.getElementById('mainApp').classList.remove('hidden');
      renderAll();
      renderPrelevements();
      renderGoals();
      persistDataCache(currentUser.id, loaded);
      fetchEurUsd();
      loadMarketNews();
      _eurUsdInterval = setInterval(() => { if (_appReadyTask === task) fetchEurUsd(); }, 5 * 60 * 1000);
      if (positions.length > 0) {
        refreshAllPrices();
      }
      _priceRefreshInterval = setInterval(() => {
        if (_appReadyTask === task && positions.length > 0 && document.visibilityState === 'visible') refreshAllPrices();
      }, 5 * 60 * 1000);
      return true;
    } catch (error) {
      if (_appInitTask !== task || task.controller.signal.aborted || error.name === 'AbortError') return false;
      // Pas de jeton, mot de passe ou contenu des comptes dans les diagnostics.
      console.error('[Moobank] loadAllData error:', error.kind || 'unexpected', error.queryErrors?.length ? error.queryErrors : error.message);
      const cached = error.kind !== 'auth_required' ? readDataCache(user.id) : null;
      if (cached) {
        assignLoadedData(cached.data);
        currentUser = _authUser?.id === user.id ? _authUser : user;
        _appReadyTask = task;
        _failedLoad = { userId: user.id, email: user.email || '', kind: error.kind || 'unexpected' };
        document.getElementById('loadingOverlay').classList.add('hidden');
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        setCachedDataMode(true, cached.savedAt);
        renderAll();
        renderPrelevements();
        renderGoals();
        fetchEurUsd();
        clearInterval(_eurUsdInterval);
        _eurUsdInterval = setInterval(() => { if (_appReadyTask === task) fetchEurUsd(); }, 5 * 60 * 1000);
        scheduleCachedDataRetry();
        return true;
      }
      clearLoadedSession();
      _failedLoad = { userId: user.id, email: user.email || '', kind: error.kind || 'unexpected' };
      if (!document.getElementById('auth-email').value) document.getElementById('auth-email').value = user.email || '';
      showLogin();
      const errEl = document.getElementById('auth-error');
      errEl.style.color = 'var(--loss)';
      errEl.textContent = error.kind === 'jwt_future' ?
        'La session est encore refusée temporairement (JWT issued at future). Patientez quelques secondes puis réessayez. Aucune donnée n’a été supprimée.' :
        error.kind === 'auth_required' ? 'Session refusée ou expirée — veuillez vous reconnecter.' :
        error.kind === 'timeout' || error.kind === 'network' ?
        'Le chargement ne répond pas. Vérifiez votre connexion puis réessayez. Vos données sont conservées.' :
        `Impossible de charger les données (${error.queryErrors?.find(e => e.status !== 401)?.code || error.queryErrors?.[0]?.code || 'chargement'}). Aucune donnée n’a été supprimée.`;
      return false;
    } finally {
      if (_appInitTask === task) {
        _appInitTask = null;
        syncAuthSubmitButton();
      }
    }
  })();
  return task.promise;
}

function showLogin() {
  closeMobileActions();
  document.getElementById('loadingOverlay').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('mainApp').classList.add('hidden');
  syncAuthSubmitButton();
}

// Auth state listener — ne jamais attendre une opération SDK dans ce callback :
// Supabase peut encore détenir son verrou de session. Le travail est différé.
document.getElementById('loadingOverlay').classList.remove('hidden');

function handleAuthStateChange(event, session) {
  const version = ++_authEventVersion;
  if (event === 'SIGNED_OUT') {
    _authUser = null;
    _authSubmitTask = null;
    _appInitTask?.controller.abort();
    _appInitTask = null;
    _failedLoad = null;
    clearLoadedSession();
    document.getElementById('auth-error').textContent = '';
    showLogin();
    return;
  }
  if (!session?.user) return;
  _authUser = session.user;
  if ((_appInitTask && _appInitTask.userId !== session.user.id) ||
      (_appReadyTask && _appReadyTask.userId !== session.user.id)) {
    _appInitTask?.controller.abort();
    _appInitTask = null;
    _failedLoad = null;
    clearLoadedSession();
  }
  if (_appReadyTask?.userId === session.user.id) {
    currentUser = session.user;
    updateUserUI(session.user);
    return;
  }
  // Un SIGNED_IN peut être émis au simple retour sur l'onglet : après épuisement
  // des essais, attendre un vrai renouvellement ou le bouton Réessayer.
  if (_failedLoad?.userId === session.user.id && event !== 'TOKEN_REFRESHED') return;
  if (!['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) return;
  setTimeout(() => {
    if (_authEventVersion !== version || _authSubmitTask || document.readyState === 'loading') return;
    initApp(session.user);
  }, 0);
}
sb.auth.onAuthStateChange(handleAuthStateChange);

// getSession attend lui-même l'initialisation du SDK ; aucun délai arbitraire.
window.addEventListener('load', async () => {
  simUpdate(); // initialise le simulateur dès le chargement
  const version = _authEventVersion;
  try {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    // Une réponse tardive ne doit pas annuler une déconnexion ou une connexion
    // à un autre compte survenue entre-temps.
    const user = version === _authEventVersion ? data.session?.user : _authUser;
    if (_authSubmitTask) return;
    if (user) {
      _authUser = user;
      if (_failedLoad?.userId !== user.id) await initApp(user);
    } else if (!_appInitTask && !_appReadyTask) {
      showLogin();
    }
  } catch(e) {
    if (!_appInitTask && !_appReadyTask && !_authSubmitTask) {
      showLogin();
      const errEl = document.getElementById('auth-error');
      errEl.style.color = 'var(--loss)';
      errEl.textContent = 'Session indisponible — veuillez vous reconnecter.';
    }
  }
});
// ─── RESIZE & RESPONSIVE ─────────────────────────────────────────────────────
function _debouncedRedraw(fn) {
  let t; return () => { clearTimeout(t); t = setTimeout(fn, TIMING_RESIZE_DEBOUNCE); };
}
// ResizeObserver pour les charts — réagit aussi quand un tab devient visible
if (window.ResizeObserver) {
  const chartWrap = document.getElementById('chartWrap');
  if (chartWrap) new ResizeObserver(_debouncedRedraw(renderChart)).observe(chartWrap);
  const simWrap = document.getElementById('sim-graph-wrap');
  if (simWrap) new ResizeObserver(_debouncedRedraw(() => { if (simData.length) simDrawChart(); })).observe(simWrap);
} else {
  // Fallback navigateurs anciens
  let _resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      renderChart();
      if (document.getElementById('tab-simulator')?.classList.contains('active')) simDrawChart();
    }, 150);
  });
}

let simData = [];
let simDataPess = [];
let simDataOpti = [];

// Les hypothèses et les formules vivent dans trajectory-core.js. L'interface
// ne conserve ici que les réglages de l'utilisateur et leur rendu.
const SIM_TYPE_LABELS = MoobankTrajectory.TYPE_LABELS;
const SIM_TYPE_ORDER = MoobankTrajectory.TYPE_ORDER;
const SIM_PLAN_STORAGE_PREFIX = 'moobank:trajectory-plan:';
const SIM_PLAN_LEGACY_STORAGE_PREFIX = 'moumix-finance:trajectory-plan:';
let simRateOverrides = {};
let simContributionPlan = {};
let simContributionPlanUserId = null;
let _simControlsSignature = null;

function simFmt(n) { return _fmtEur0.format(n); }
function simPct(n) { return _fmtPct.format(n) + ' %'; }
function simSignedFmt(n) { return (n > 0 ? '+' : '') + simFmt(n); }
function simTypeLabel(type) { return SIM_TYPE_LABELS[type] || type || 'Autre'; }
function simDomKey(value) {
  return Array.from(String(value || 'Autre')).map(char => char.codePointAt(0).toString(36)).join('-');
}
function simAssumption(type) {
  return MoobankTrajectory.assumptionFor(type, simRateOverrides);
}

function simEnsureContributionPlan() {
  const userId = currentUser?.id || null;
  if (simContributionPlanUserId === userId) return;
  simContributionPlanUserId = userId;
  simContributionPlan = {};
  if (!userId) return;
  try {
    const currentKey = SIM_PLAN_STORAGE_PREFIX + userId;
    const legacyKey = SIM_PLAN_LEGACY_STORAGE_PREFIX + userId;
    let stored = localStorage.getItem(currentKey);
    if (stored === null) {
      stored = localStorage.getItem(legacyKey);
      // Copie non destructive : l'ancien réglage reste disponible si une
      // ancienne version de l'app est encore ouverte pendant le renommage.
      if (stored !== null) localStorage.setItem(currentKey, stored);
    }
    const parsed = JSON.parse(stored || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    Object.entries(parsed).forEach(([accountId, rawAmount]) => {
      const amount = Number(rawAmount);
      if (Number.isFinite(amount) && amount > 0) simContributionPlan[accountId] = Math.min(100000, amount);
    });
  } catch (error) {
    console.warn('[Moobank] plan mensuel local illisible, valeurs ignorées');
  }
}

function simPersistContributionPlan() {
  if (!simContributionPlanUserId) return;
  try {
    localStorage.setItem(SIM_PLAN_STORAGE_PREFIX + simContributionPlanUserId, JSON.stringify(simContributionPlan));
  } catch (error) {
    console.warn('[Moobank] plan mensuel non mémorisé sur cet appareil');
  }
}

function simContributionAmount(accountId) {
  simEnsureContributionPlan();
  const amount = Number(simContributionPlan[accountId]);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function simSetContribution(accountId, rawValue) {
  if (!accounts.some(account => account.id === accountId)) return;
  simEnsureContributionPlan();
  const parsed = Number.parseFloat(String(rawValue ?? '').replace(',', '.'));
  const amount = Number.isFinite(parsed) ? Math.max(0, Math.min(100000, parsed)) : 0;
  if (amount > 0) simContributionPlan[accountId] = amount;
  else delete simContributionPlan[accountId];
  simPersistContributionPlan();
  simUpdateDebounced();
}

function simNormalizeContribution(input) {
  const accountId = input?.dataset?.accountId;
  if (!accountId) return;
  const amount = simContributionAmount(accountId);
  input.value = amount > 0 ? String(amount) : '';
  simUpdate();
}

function simResetContributions() {
  simEnsureContributionPlan();
  simContributionPlan = {};
  simPersistContributionPlan();
  document.querySelectorAll('.sim-contribution-input').forEach(input => { input.value = ''; });
  simUpdate();
  showToast('Plan mensuel remis à zéro', 'success');
}

function simPruneContributionPlan() {
  simEnsureContributionPlan();
  const accountIds = new Set(accounts.map(account => account.id));
  let changed = false;
  Object.keys(simContributionPlan).forEach(accountId => {
    if (accountIds.has(accountId)) return;
    delete simContributionPlan[accountId];
    changed = true;
  });
  if (changed) simPersistContributionPlan();
}

window.addEventListener('storage', event => {
  if (!currentUser?.id) return;
  const currentKey = SIM_PLAN_STORAGE_PREFIX + currentUser.id;
  const legacyKey = SIM_PLAN_LEGACY_STORAGE_PREFIX + currentUser.id;
  if (![currentKey, legacyKey].includes(event.key)) return;
  simContributionPlanUserId = null;
  _simControlsSignature = null;
  if (currentTabName === 'simulator') simUpdate();
});

function simGetPortfolioBuckets() {
  const grouped = new Map();
  const ensure = rawType => {
    const type = rawType || 'Autre';
    if (!grouped.has(type)) grouped.set(type, { type, label: simTypeLabel(type), value: 0, accountCount: 0, assetCount: 0 });
    return grouped.get(type);
  };

  accounts.forEach(account => {
    const bucket = ensure(account.type);
    bucket.accountCount += 1;
    if (FIXED_ACCOUNT_TYPES.has(account.type)) {
      const balance = Number(account.solde);
      if (Number.isFinite(balance)) bucket.value += balance;
      if (balance > 0) bucket.assetCount += 1;
    }
  });

  const accountsById = new Map(accounts.map(account => [account.id, account]));
  positions.forEach(position => {
    const account = accountsById.get(position.accountId);
    const bucket = ensure(account?.type || 'Autre');
    const value = Number(position.current) * Number(position.qty);
    if (Number.isFinite(value)) bucket.value += value;
    if (value > 0) bucket.assetCount += 1;
  });

  return [...grouped.values()]
    .map(bucket => ({ ...bucket, value: Math.max(0, bucket.value) }))
    .sort((a, b) => {
      const ai = SIM_TYPE_ORDER.indexOf(a.type), bi = SIM_TYPE_ORDER.indexOf(b.type);
      if (ai !== bi) return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
      return b.value - a.value;
    });
}

function simRenderPortfolioControls(buckets) {
  simEnsureContributionPlan();
  simPruneContributionPlan();
  const total = buckets.reduce((sum, bucket) => sum + bucket.value, 0);
  const totalEl = document.getElementById('sim-source-total');
  const metaEl = document.getElementById('sim-source-meta');
  const typesEl = document.getElementById('sim-source-types');
  const emptyEl = document.getElementById('sim-source-empty');
  if (totalEl) totalEl.textContent = simFmt(total);
  if (metaEl) {
    const accountLabel = accounts.length === 1 ? 'compte' : 'comptes';
    const positionLabel = positions.length === 1 ? 'position' : 'positions';
    metaEl.textContent = `${accounts.length} ${accountLabel} · ${positions.length} ${positionLabel} · valeurs actuelles`;
  }
  if (typesEl) {
    const valued = buckets.filter(bucket => bucket.value > 0.005);
    typesEl.innerHTML = valued.length
      ? valued.map(bucket => `<span class="sim-source-chip"><span>${_esc(bucket.label)}</span><strong>${simFmt(bucket.value)}</strong></span>`).join('')
      : '<span class="sim-source-chip">Aucun encours valorisé</span>';
  }
  if (emptyEl) {
    emptyEl.classList.toggle('hidden', total > 0);
    emptyEl.textContent = buckets.length
      ? 'Aucun encours valorisé. Les futurs versements restent simulables.'
      : 'Ajoutez un compte pour commencer.';
  }

  const signature = [currentUser?.id || '', ...buckets.map(bucket => bucket.type),
    ...accounts.map(account => `${account.id}:${account.type}:${account.name}`)].join('\u001f');
  const plan = document.getElementById('sim-contribution-plan');
  const settings = document.getElementById('sim-category-settings');
  if (signature !== _simControlsSignature) {
    if (plan) {
      plan.innerHTML = accounts.length ? accounts.map(account => {
        const amount = simContributionAmount(account.id);
        return `<label class="sim-contribution-row">
          <span class="sim-contribution-account">
            <strong>${_esc(account.name)}</strong>
            <small>${_esc(simTypeLabel(account.type))}</small>
          </span>
          <span class="sim-contribution-control">
            <input class="sim-contribution-input" type="number" inputmode="decimal" min="0" max="100000" step="10"
              value="${amount || ''}" data-account-id="${_esc(account.id)}" aria-label="Versement mensuel sur ${_esc(account.name)}"
              placeholder="0" oninput="simSetContribution(this.dataset.accountId,this.value)" onchange="simNormalizeContribution(this)">
            <span>€</span>
          </span>
        </label>`;
      }).join('') : `<div class="sim-plan-empty">
        <span>Créez d’abord un compte pour lui affecter un versement.</span>
        <button type="button" onclick="openModal('account')">Ajouter un compte</button>
      </div>`;
    }
    if (settings) {
      settings.innerHTML = buckets.length ? buckets.map(bucket => {
        const assumption = simAssumption(bucket.type);
        const key = simDomKey(bucket.type);
        return `<div class="sim-category-row">
          <div class="sim-category-name">${_esc(bucket.label)}</div>
          <div class="sim-category-value" id="sim-category-value-${key}">${simFmt(bucket.value)}</div>
          <div class="sim-rate-wrap">
            <input class="sim-category-rate" id="sim-category-rate-${key}" type="number" min="-50" max="100" step="0.5"
              value="${assumption.rate}" data-sim-type="${_esc(bucket.type)}" aria-label="Rendement annuel ${_esc(bucket.label)}"
              oninput="simSetRate(this.dataset.simType,this.value)" onchange="simNormalizeRate(this)">
          </div>
        </div>`;
      }).join('') : '<div class="sim-help" style="padding-top:10px">Les hypothèses apparaîtront dès qu’un compte sera disponible.</div>';
    }
    _simControlsSignature = signature;
  } else {
    buckets.forEach(bucket => {
      const valueEl = document.getElementById('sim-category-value-' + simDomKey(bucket.type));
      if (valueEl) valueEl.textContent = simFmt(bucket.value);
    });
  }
  return total;
}

function simSetRate(type, rawValue) {
  const rate = Number.parseFloat(rawValue);
  if (!Number.isFinite(rate)) return;
  simRateOverrides[type] = Math.max(-50, Math.min(100, rate));
  simUpdate();
}

function simNormalizeRate(input) {
  const type = input?.dataset?.simType || 'Autre';
  const parsed = Number.parseFloat(input?.value);
  if (!Number.isFinite(parsed)) delete simRateOverrides[type];
  else simRateOverrides[type] = Math.max(-50, Math.min(100, parsed));
  if (input) input.value = simAssumption(type).rate;
  simUpdate();
}

function simResetRates() {
  simRateOverrides = {};
  simGetPortfolioBuckets().forEach(bucket => {
    const input = document.getElementById('sim-category-rate-' + simDomKey(bucket.type));
    if (input) input.value = simAssumption(bucket.type).rate;
  });
  const inflationInput = document.getElementById('sim-inflation');
  if (inflationInput) inflationInput.value = '2';
  simUpdate();
}

function simMonthlyContributionsByType(buckets) {
  simEnsureContributionPlan();
  const grouped = MoobankCore.groupMonthlyContributions(accounts, simContributionPlan);
  const amounts = new Map(buckets.map(bucket => [bucket.type, grouped[bucket.type] || 0]));
  return amounts;
}

function simWeightedRatePct(buckets, monthlyByType, years, scenario) {
  return MoobankTrajectory.weightedRatePct(buckets, monthlyByType, years, scenario, simRateOverrides);
}

function simComputePortfolio(buckets, monthlyByType, years, scenario) {
  return MoobankTrajectory.computePortfolio(buckets, monthlyByType, years, scenario, simRateOverrides);
}

let _simUpdateTimer = null;
function simUpdateDebounced() {
  clearTimeout(_simUpdateTimer);
  _simUpdateTimer = setTimeout(simUpdate, TIMING_SIM_DEBOUNCE);
}

window.setTrajectoryYears = function setTrajectoryYears(years, button) {
  const input = document.getElementById('sim-years');
  if (!input) return;
  input.value = String(years);
  document.querySelectorAll('.trajectory-year-btn').forEach(item => item.classList.toggle('active', item === button));
  simUpdate();
};

function syncTrajectoryYearButtons(years) {
  document.querySelectorAll('.trajectory-year-btn').forEach(button => {
    button.classList.toggle('active', Number.parseInt(button.textContent, 10) === years);
  });
}

function simRenderScenario(prefix, result, weightedRate) {
  const totalEl = document.getElementById('sim-res-total-' + prefix);
  const interestEl = document.getElementById('sim-res-interest-' + prefix);
  const passiveEl = document.getElementById('sim-res-passive-' + prefix);
  const multEl = document.getElementById('sim-res-mult-' + prefix);
  const investedEl = document.getElementById('sim-res-invested-' + prefix);
  const rateEl = document.getElementById('sim-rate-' + prefix);
  if (rateEl) rateEl.textContent = '≈ ' + simPct(weightedRate);
  if (totalEl) totalEl.textContent = simFmt(result.final);
  if (interestEl) interestEl.textContent = simSignedFmt(result.totalInterest) + ' de rendement';
  if (passiveEl) passiveEl.textContent = simSignedFmt(result.monthlyGrowth) + '/mois';
  const multiplier = result.totalInvested > 0 ? result.final / result.totalInvested : 0;
  if (multEl) multEl.textContent = result.totalInvested > 0 ? '×' + multiplier.toFixed(2) + ' le capital investi' : '—';
  if (investedEl) investedEl.textContent = result.totalInvested > 0 ? simFmt(result.totalInvested) : '—';
}

function simRenderBreakdown(result) {
  const container = document.getElementById('sim-projected-breakdown');
  if (!container) return;
  if (!result.finalBreakdown.length) {
    container.innerHTML = '<div class="sim-help">La projection par catégorie apparaîtra ici.</div>';
    return;
  }
  container.innerHTML = result.finalBreakdown.map(item => {
    const delta = item.final - item.invested;
    return `<div class="sim-breakdown-item">
      <div class="sim-breakdown-head"><span>${_esc(item.label)}</span><span>${simPct(item.annualRate * 100)}</span></div>
      <div class="sim-breakdown-value">${simFmt(item.final)}</div>
      <div class="sim-breakdown-delta" style="color:${delta >= 0 ? 'var(--gain)' : 'var(--loss)'}">${simSignedFmt(delta)} de rendement</div>
    </div>`;
  }).join('');
}

function simUpdate() {
  const yearsInput = document.getElementById('sim-years');
  const inflationInput = document.getElementById('sim-inflation');
  const years = Math.max(1, Math.min(60, Number.parseInt(yearsInput?.value, 10) || 1));
  const inflation = Math.max(0, Math.min(20, Number.parseFloat(inflationInput?.value) || 0));
  syncTrajectoryYearButtons(years);
  const buckets = simGetPortfolioBuckets();
  const initial = simRenderPortfolioControls(buckets);
  const monthlyByType = simMonthlyContributionsByType(buckets);
  const monthly = [...monthlyByType.values()].reduce((sum, amount) => sum + amount, 0);
  const planTotal = document.getElementById('sim-plan-total');
  if (planTotal) planTotal.textContent = `${simFmt(monthly)} / mois`;

  const ratePess = simWeightedRatePct(buckets, monthlyByType, years, 'pess');
  const rateReal = simWeightedRatePct(buckets, monthlyByType, years, 'real');
  const rateOpti = simWeightedRatePct(buckets, monthlyByType, years, 'opti');
  const resPess = simComputePortfolio(buckets, monthlyByType, years, 'pess');
  const resReal = simComputePortfolio(buckets, monthlyByType, years, 'real');
  const resOpti = simComputePortfolio(buckets, monthlyByType, years, 'opti');

  simData     = resReal.data;
  simDataPess = resPess.data;
  simDataOpti = resOpti.data;

  simRenderScenario('pess', resPess, ratePess);
  simRenderScenario('real', resReal, rateReal);
  simRenderScenario('opti', resOpti, rateOpti);
  const weightedEl = document.getElementById('sim-weighted-rate');
  if (weightedEl) weightedEl.textContent = '≈ ' + simPct(rateReal);

  // Jauge composition (réaliste)
  const { final, totalInvested, totalInterest } = resReal;
  const totalMonthly = totalInvested - initial;
  const realToday = MoobankTrajectory.presentValue(final, inflation, years);
  const realTodayEl = document.getElementById('sim-res-real-today');
  if (realTodayEl) realTodayEl.textContent = `≈ ${simFmt(realToday)} en euros d’aujourd’hui`;
  const formulaSummary = document.getElementById('sim-formula-summary');
  if (formulaSummary) {
    formulaSummary.textContent = `Scénario central : ${simFmt(initial)} déjà détenus + ${simFmt(totalMonthly)} de futurs versements + ${simSignedFmt(totalInterest)} de rendements estimés. Inflation retenue : ${inflation.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % par an.`;
  }
  const positiveInterest = Math.max(0, totalInterest);
  const compositionBase = initial + totalMonthly + positiveInterest;
  const pInit = compositionBase > 0 ? initial / compositionBase * 100 : 0;
  const pMonthly = compositionBase > 0 ? totalMonthly / compositionBase * 100 : 0;
  const pInterest = compositionBase > 0 ? positiveInterest / compositionBase * 100 : 0;
  const barInitial = document.getElementById('sim-bar-initial');
  const barMonthly = document.getElementById('sim-bar-monthly');
  const barInterest = document.getElementById('sim-bar-interest');
  if (barInitial) { barInitial.style.flex = '0 0 auto'; barInitial.style.width = pInit + '%'; }
  if (barMonthly) { barMonthly.style.flex = '0 0 auto'; barMonthly.style.width = pMonthly + '%'; }
  if (barInterest) { barInterest.style.flex = '0 0 auto'; barInterest.style.width = pInterest + '%'; }
  document.getElementById('sim-legend-initial').textContent = simFmt(initial) + ' (' + pInit.toFixed(0) + '%)';
  document.getElementById('sim-legend-monthly').textContent = simFmt(totalMonthly) + ' (' + pMonthly.toFixed(0) + '%)';
  const interestLegend = document.getElementById('sim-legend-interest');
  if (interestLegend) {
    interestLegend.textContent = simSignedFmt(totalInterest) + ' (' + (totalInvested > 0 ? (totalInterest / totalInvested * 100).toFixed(0) : 0) + '%)';
    interestLegend.style.color = totalInterest >= 0 ? 'var(--gain)' : 'var(--loss)';
  }
  simRenderBreakdown(resReal);

  simDrawChart();
}


function simDrawChart() {
  const svg = document.getElementById('sim-svg');
  if (!svg || !simData.length) return;
  const wrap = document.getElementById('sim-graph-wrap');
  let W = (wrap && wrap.offsetWidth > 0) ? wrap.offsetWidth
        : (svg.parentElement && svg.parentElement.offsetWidth > 0) ? svg.parentElement.offsetWidth
        : 640;
  if (W <= 0) { requestAnimationFrame(() => simDrawChart()); return; }
  // Le viewBox doit utiliser exactement les dimensions affichées. Sur mobile,
  // le cadre mesure 240 px de haut : conserver ici 300 px forçait Safari à
  // centrer le dessin en préservant son ratio, avec de larges marges latérales.
  const measuredHeight = wrap?.offsetHeight || parseFloat(getComputedStyle(svg).height);
  const H = Number.isFinite(measuredHeight) && measuredHeight > 0 ? Math.round(measuredHeight) : 300;
  const simCompact = W < 520;
  const pad = simCompact
    ? { top: 20, right: 14, bottom: 32, left: 52 }
    : { top: 28, right: 24, bottom: 36, left: 72 };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('height', H);
  svg.setAttribute('width', W);

  const allVals = [...simData, ...simDataPess, ...simDataOpti].map(d => d.capital);
  const maxVal = Math.max(...allVals);
  const minVal = 0;
  const range = maxVal - minVal || 1;
  const n = simData.length;

  const xScale = i => pad.left + (i / (n - 1)) * (W - pad.left - pad.right);
  const yScale = v => pad.top + (1 - (v - minVal) / range) * (H - pad.top - pad.bottom);

  const pathD = arr => {
    return arr.map((d, i) => {
      const x = xScale(i), y = yScale(d.capital);
      if (i === 0) return `M${x},${y}`;
      const px = xScale(i - 1), py = yScale(arr[i-1].capital);
      const cx = (px + x) / 2;
      return `C${cx},${py} ${cx},${y} ${x},${y}`;
    }).join(' ');
  };

  const areaD = (arr) => {
    const baseY = yScale(0);
    const firstX = xScale(0), lastX = xScale(n - 1);
    const line = pathD(arr);
    return `${line} L${lastX},${baseY} L${firstX},${baseY} Z`;
  };

  const investedPts = simData.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yScale(d.invested)}`).join(' ');

  const uid = 'sg' + (Date.now() % 99999);

  // Y grid + labels
  const yTicks = 5;
  function fmtY(v) {
    if (simCompact) {
      if (v >= 1e6) return (v/1e6).toFixed(1) + 'M';
      if (v >= 1e3) return (v/1e3).toFixed(0) + 'k';
      return Math.round(v) + '';
    }
    if (v >= 1e6) return (v/1e6).toFixed(2) + 'M';
    if (v >= 1e3) return Math.round(v/1e3) + '\u202fk';
    return Math.round(v) + '';
  }

  const yGrid = Array.from({length: yTicks}, (_, i) => {
    const v = minVal + (range * i / (yTicks - 1));
    const y = yScale(v);
    return `
      <line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}"
        stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
      <text x="${pad.left - 10}" y="${y + 4}" font-size="10"
        fill="rgba(90,100,130,0.85)" text-anchor="end"
        font-family="DM Mono,monospace" font-weight="400">${fmtY(v)}</text>`;
  }).join('');

  // X labels
  const xStep = n <= 11 ? 1 : n <= 21 ? 5 : 10;
  const xLabels = simData
    .filter((d, i) => i % xStep === 0 || i === n - 1)
    .map(d => {
      const x = xScale(d.year);
      return `<text x="${x}" y="${H - 8}" font-size="10" fill="rgba(90,100,130,0.8)"
        text-anchor="middle" font-family="DM Mono,monospace">${d.year}a</text>`;
    }).join('');

  // Hover zones (invisible rects per year)
  const colW = (W - pad.left - pad.right) / (n - 1);
  const hoverRects = simData.map((d, i) => {
    const x = xScale(i);
    const pv = (simDataPess[i]?.capital || 0).toFixed(0);
    const rv = d.capital.toFixed(0);
    const ov = (simDataOpti[i]?.capital || 0).toFixed(0);
    const inv = d.invested.toFixed(0);
    return `<rect x="${x - colW/2}" y="${pad.top}" width="${colW}" height="${H - pad.top - pad.bottom}"
      fill="transparent" style="cursor:crosshair"
      data-year="${d.year}" data-pess="${pv}" data-real="${rv}" data-opti="${ov}" data-inv="${inv}"
      onmouseover="simTooltip3(event,${d.year},${pv},${rv},${ov},${inv})"
      onmouseout="simHideTooltip()"/>`;
  }).join('');

  svg.innerHTML = `
    <defs>
      <!-- Favorable gradient -->
      <linearGradient id="gOpti${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#65a8ff" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#65a8ff" stop-opacity="0"/>
      </linearGradient>
      <!-- Central gradient -->
      <linearGradient id="gReal${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#55e6b1" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#55e6b1" stop-opacity="0"/>
      </linearGradient>
      <!-- Prudent gradient -->
      <linearGradient id="gPess${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ff7189" stop-opacity="0.10"/>
        <stop offset="100%" stop-color="#ff7189" stop-opacity="0"/>
      </linearGradient>
      <!-- Glow filters -->
      <filter id="glowGreen${uid}" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="glowPurple${uid}" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2.5" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>

    ${yGrid}${xLabels}

    <!-- Areas -->
    <path d="${areaD(simDataOpti)}" fill="url(#gOpti${uid})" stroke="none"/>
    <path d="${areaD(simData)}"     fill="url(#gReal${uid})" stroke="none"/>
    <path d="${areaD(simDataPess)}" fill="url(#gPess${uid})" stroke="none"/>

    <!-- Investi dashed line -->
    <path d="${investedPts}" fill="none" stroke="#3a7bd5" stroke-width="1.5"
      stroke-dasharray="4,4" opacity="0.45"/>

    <!-- Scenario lines -->
    <path d="${pathD(simDataPess)}" fill="none" stroke="#ff7189" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>
    <path d="${pathD(simDataOpti)}" fill="none" stroke="#65a8ff" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round" opacity="0.85"
      filter="url(#glowPurple${uid})"/>
    <path d="${pathD(simData)}" fill="none" stroke="#55e6b1" stroke-width="2.5"
      stroke-linecap="round" stroke-linejoin="round"
      filter="url(#glowGreen${uid})"/>

    <!-- Crosshair group -->
    <g id="sim-crosshair" style="pointer-events:none;opacity:0;transition:opacity 0.1s">
      <!-- vertical line -->
      <line id="sim-ch-line" x1="0" y1="${pad.top}" x2="0" y2="${H - pad.bottom}"
        stroke="rgba(255,255,255,0.12)" stroke-width="1" stroke-dasharray="2,3"/>
      <!-- horizontal band (subtle) -->
      <!-- dots -->
      <circle id="sim-ch-pess" cx="0" cy="0" r="4" fill="#ff7189"
        stroke="rgba(13,17,25,0.9)" stroke-width="2.5"/>
      <circle id="sim-ch-real" cx="0" cy="0" r="5.5" fill="#55e6b1"
        stroke="rgba(13,17,25,0.9)" stroke-width="2.5"/>
      <circle id="sim-ch-opti" cx="0" cy="0" r="4" fill="#65a8ff"
        stroke="rgba(13,17,25,0.9)" stroke-width="2.5"/>
      <!-- outer glow rings -->
      <circle id="sim-ch-real-glow" cx="0" cy="0" r="9" fill="none"
        stroke="#55e6b1" stroke-width="1" opacity="0.3"/>
    </g>

    <!-- Hover rects (on top) -->
    ${hoverRects}
  `;

  svg._simMeta = { xScale, yScale, pad, H }; // simData* sont des globaux, inutile de les dupliquer
}

function simHideTooltip() {
  const tt = document.getElementById('sim-tooltip');
  const ch = document.getElementById('sim-crosshair');
  tt.classList.remove('visible');
  if (ch) ch.style.opacity = '0';
}

function simTooltip3(e, year, pess, real, opti, invested) {
  const tt = document.getElementById('sim-tooltip');
  const svgEl = document.getElementById('sim-svg');
  const svgRect = svgEl.getBoundingClientRect();
  const relX = e.clientX - svgRect.left;
  const relY = e.clientY - svgRect.top;

  document.getElementById('sim-tt-year').textContent =
    year === 0 ? 'Aujourd\'hui' : year === 1 ? 'Année 1' : 'Année ' + year;

  // Update crosshair
  const meta = svgEl._simMeta;
  if (meta) {
    const idx = year;
    const xPos = meta.xScale(idx);
    const yPess = meta.yScale(simDataPess[idx]?.capital || 0);
    const yReal = meta.yScale(simData[idx]?.capital || 0);
    const yOpti = meta.yScale(simDataOpti[idx]?.capital || 0);
    const ch = document.getElementById('sim-crosshair');
    if (ch) {
      ch.style.opacity = '1';
      const chLine = document.getElementById('sim-ch-line');
      chLine.setAttribute('x1', xPos); chLine.setAttribute('x2', xPos);
      const chPess = document.getElementById('sim-ch-pess');
      chPess.setAttribute('cx', xPos); chPess.setAttribute('cy', yPess);
      const chReal = document.getElementById('sim-ch-real');
      chReal.setAttribute('cx', xPos); chReal.setAttribute('cy', yReal);
      const chOpti = document.getElementById('sim-ch-opti');
      chOpti.setAttribute('cx', xPos); chOpti.setAttribute('cy', yOpti);
      const glowR = document.getElementById('sim-ch-real-glow');
      if (glowR) { glowR.setAttribute('cx', xPos); glowR.setAttribute('cy', yReal); }
    }
  }

  // Render tooltip body
  const gain = real - invested;
  const gainPct = invested > 0 ? (gain / invested * 100).toFixed(0) : 0;
  document.getElementById('sim-tt-body').innerHTML = `
    <div class="sim-tt-row">
      <span class="sim-tt-label"><span class="sim-tt-dot" style="background:#65a8ff;box-shadow:0 0 6px #65a8ff"></span>Favorable</span>
      <span class="sim-tt-val" style="color:#65a8ff">${simFmt(opti)}</span>
    </div>
    <div class="sim-tt-row">
      <span class="sim-tt-label"><span class="sim-tt-dot" style="background:#55e6b1;box-shadow:0 0 6px #55e6b1"></span>Central</span>
      <span class="sim-tt-val" style="color:#55e6b1">${simFmt(real)}</span>
    </div>
    <div class="sim-tt-row">
      <span class="sim-tt-label"><span class="sim-tt-dot" style="background:#ff7189"></span>Prudent</span>
      <span class="sim-tt-val" style="color:#ff7189">${simFmt(pess)}</span>
    </div>
    <div class="sim-tt-divider"></div>
    <div class="sim-tt-row">
      <span class="sim-tt-label"><span class="sim-tt-dot" style="background:#3a7bd5;border-radius:2px"></span>Investi</span>
      <span class="sim-tt-val" style="color:#7baee8">${simFmt(invested)}</span>
    </div>
    ${year > 0 ? `<div class="sim-tt-row" style="margin-top:1px">
      <span class="sim-tt-label" style="font-size:0.62rem;opacity:0.6">Plus-value</span>
      <span style="font-size:0.7rem;font-weight:600;color:${gain>=0?'#55e6b1':'#ff7189'}">${gain>=0?'+':''}${simFmt(gain)} (${gain>=0?'+':''}${gainPct}%)</span>
    </div>` : ''}
  `;

  tt.classList.add('visible');

  // Smart positioning
  requestAnimationFrame(() => {
    const ttW = tt.offsetWidth || 172;
    const ttH = tt.offsetHeight || 120;
    const margin = 12;
    let left = relX + margin;
    let top = relY - ttH - margin;
    if (left + ttW > svgRect.width - 4) left = relX - ttW - margin;
    if (top < 4) top = relY + margin;
    tt.style.left = Math.max(4, left) + 'px';
    tt.style.top  = Math.max(4, top)  + 'px';
  });
}



// ─── TRI POSITIONS ────────────────────────────────────────────────────────────
let posSort = { key: null, asc: false };
function sortPositions(key) {
  posSort.asc = posSort.key === key ? !posSort.asc : false;
  posSort.key = key;
  document.querySelectorAll('.sort-icon').forEach(el => el.textContent = '');
  document.querySelectorAll('th.sortable').forEach(el => el.classList.remove('sorted'));
  const iconEl = document.getElementById('sort-' + key);
  if (iconEl) { iconEl.textContent = posSort.asc ? '↑' : '↓'; iconEl.closest('th').classList.add('sorted'); }
  renderPositions();
}
function getSortedPositions() {
  if (!posSort.key) return positions;
  return [...positions].sort((a, b) => {
    let va, vb;
    if (posSort.key === 'qty')     { va = a.qty; vb = b.qty; }
    else if (posSort.key === 'current') { va = a.current; vb = b.current; }
    else if (posSort.key === 'value')   { va = a.current*a.qty; vb = b.current*b.qty; }
    else if (posSort.key === 'pnl')     { va = a.price>0?(a.current-a.price)*a.qty:-Infinity; vb = b.price>0?(b.current-b.price)*b.qty:-Infinity; }
    else if (posSort.key === 'pct')     { va = a.price>0?(a.current-a.price)/a.price:-Infinity; vb = b.price>0?(b.current-b.price)/b.price:-Infinity; }
    return posSort.asc ? va-vb : vb-va;
  });
}
// ─── EDIT POSITION ────────────────────────────────────────────────────────────
let editingPositionId = null;

function openEditPosition(id) {
  const p = positions.find(p => p.id === id);
  if (!p) return;
  editingPositionId = id;
  document.getElementById('editPosTitle').textContent = p.symbol + (p.name ? ' — ' + p.name : '');
  document.getElementById('editPosSubtitle').textContent = getAccountName(p.accountId);
  document.getElementById('edit-pos-qty').value = p.qty;
  document.getElementById('edit-pos-price').value = p.price > 0 ? p.price : '';
  showDialog(document.getElementById('editPositionModal'), '#edit-pos-qty');
}

function closeEditPosition() {
  editingPositionId = null;
  hideDialog(document.getElementById('editPositionModal'));
}

async function confirmEditPosition() {
  const p = positions.find(p => p.id === editingPositionId);
  if (!p) return;
  const qty = parseFloat(document.getElementById('edit-pos-qty').value);
  const price = parseFloat(document.getElementById('edit-pos-price').value) || 0;
  if (!qty || qty <= 0) return alert('Quantité invalide');
  const btn = document.getElementById('editPositionSaveBtn');
  btn.disabled = true;
  const oldQty = p.qty, oldPrice = p.price;
  const previous = { ...p };
  const target = {
    ...p,
    qty: parseFloat(qty.toFixed(8)),
    price: parseFloat(price.toFixed(10)),
  };
  const accName = getAccountName(p.accountId);
  const tx = { id: crypto.randomUUID(), type: 'edit', symbol: p.symbol, name: p.name, qty: target.qty, price: target.price, oldQty, oldPrice, accountName: accName, ts: Date.now() };
  try {
    await MoobankCore.runCompensatedOperation({
      commit: () => savePosition(target),
      audit: () => saveTransaction(tx),
      rollback: () => savePosition(previous),
    });
  } catch(e) {
    console.error('[Moobank] confirmEditPosition error:', e);
    if (e.name === 'MoobankRollbackError') {
      console.error('[Moobank] rétablissement modification impossible:', e.rollbackError);
      showToast('Synchronisation incertaine : rechargez la page avant toute autre action.', 'error');
    } else {
      showToast('Erreur sauvegarde modification.', 'error');
    }
    btn.disabled = false;
    return;
  }
  Object.assign(p, target);
  transactions.unshift(tx); if (transactions.length > 500) transactions.length = 500;
  btn.disabled = false;
  closeEditPosition();
  renderPositions(); renderAllocation(); renderSummary();
  refreshProjectionIfActive();
  showToast('✅ Position mise à jour', 'success');
}

// ─── PWA ────────────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    const appVersion = document.querySelector('meta[name="moobank-version"]')?.content || 'current';
    let reloadingForUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      location.reload();
    });

    navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(appVersion)}`, { updateViaCache: 'none' }).then(registration => {
      const offerUpdate = worker => {
        if (!navigator.serviceWorker.controller || !worker) return;
        showAppUpdatePrompt(() => worker.postMessage({ type: 'SKIP_WAITING' }));
      };

      if (registration.waiting) offerUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') offerUpdate(worker);
        });
      });

      // Vérifie au démarrage, au retour dans l'app et périodiquement. iOS peut
      // conserver une PWA en mémoire plusieurs jours sans recharger sa page.
      let lastUpdateCheck = 0;
      const checkForUpdate = () => {
        const now = Date.now();
        if (now - lastUpdateCheck < 60 * 1000) return;
        lastUpdateCheck = now;
        registration.update().catch(() => {});
      };
      setTimeout(checkForUpdate, 1500);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
      window.addEventListener('pageshow', checkForUpdate);
      setInterval(checkForUpdate, 15 * 60 * 1000);
    }).catch(error => console.warn('[Moobank] Service worker indisponible:', error));
  });
}

function showAppUpdatePrompt(onUpdate) {
  if (document.getElementById('appUpdatePrompt')) return;
  const overlay = document.createElement('div');
  overlay.id = 'appUpdatePrompt';
  overlay.className = 'app-update-overlay';
  overlay.innerHTML = `<section class="app-update-card" role="dialog" aria-modal="true" aria-labelledby="appUpdateTitle" aria-describedby="appUpdateDescription">
    <img src="./assets/brand/moobank-mark.svg" width="38" height="38" alt="">
    <div class="app-update-copy">
      <strong id="appUpdateTitle">Mise à jour disponible</strong>
      <span id="appUpdateDescription">La nouvelle version de Moobank est prête.</span>
    </div>
    <div class="app-update-actions">
      <button type="button" class="btn app-update-later">Plus tard</button>
      <button type="button" class="btn btn-primary app-update-now">Mettre à jour</button>
    </div>
  </section>`;
  overlay.querySelector('.app-update-later').addEventListener('click', () => overlay.remove());
  overlay.querySelector('.app-update-now').addEventListener('click', event => {
    event.currentTarget.disabled = true;
    event.currentTarget.textContent = 'Mise à jour…';
    onUpdate();
  });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));
  overlay.querySelector('.app-update-now')?.focus();
}

// ─── App namespace (optional) ───────────────────────────────────────────────
window.App = window.App || {};
window.App.authRecoveryVersion = '2026-08-28.1';
for (const k of ['openMobileActions', 'closeMobileActions', 'runMobileAction']) {
  window.App[k] = window[k];
}
for (const k of ['addAccount', 'cancelAddPrel', 'cancelLivretEdit', 'closeEditPosition', 'closeGoalModal', 'closeModal', 'confirmAddPrel', 'confirmEditPosition', 'confirmEditPrel', 'confirmLivretSolde', 'confirmPosition', 'deleteAccount', 'deleteGoal', 'deletePosition', 'deletePrel', 'editGoal', 'editLivretSolde', 'editPrel', 'exportDataBackup', 'openAddGoal', 'openAddPrel', 'openEditPosition', 'openModal', 'refreshAllPrices', 'renderPrelevements', 'retryCachedDataSync', 'saveGoal', 'selectGoalEmoji', 'selectTickerByIndex', 'setAllocationMode', 'setChartPeriod', 'setPosSide', 'setTrajectoryYears', 'signOut', 'simNormalizeContribution', 'simNormalizeRate', 'simResetContributions', 'simResetRates', 'simSetContribution', 'simSetRate', 'sortPositions', 'switchPosTab', 'switchTab', 'toggleAll', 'toggleMobilePositionCard', 'toggleType']) {
  if (typeof window[k] === 'function') window.App[k] = window[k];
}
