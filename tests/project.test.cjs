const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('la connexion privée ne contient aucun parcours d’inscription', () => {
  const html = read('index.html');
  const app = read('assets/js/app.js');
  assert.doesNotMatch(html, /tabSignup|Inscription|switchAuthTab/);
  assert.doesNotMatch(app, /auth\.signUp|tabSignup|switchAuthTab|authTab/);
  assert.match(app, /auth\.signInWithPassword/);
});

test('le HTML ne contient plus de CSS ou JavaScript applicatif intégré', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /<style(?:\s|>)/i);
  assert.doesNotMatch(html, /<script>\s*[\s\S]*?<\/script>/i);
  for (const file of ['assets/css/app.css', 'assets/css/v2.css', 'assets/js/core.js', 'assets/js/trajectory-core.js', 'assets/js/app.js', 'assets/js/history-import.js']) {
    assert.match(html, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(fs.existsSync(path.join(root, file)), `${file} doit exister`);
  }
});

test('la V2 retire les éléments de trading et la mascotte', () => {
  const html = read('index.html');
  const app = read('assets/js/app.js');
  assert.doesNotMatch(html, /indices-ticker|dogWidget|Shiba|Jalons patrimoniaux/);
  assert.doesNotMatch(app, /loadNewsIndices|showDog|dogClick|MILESTONES/);
  assert.match(html, /USD\/EUR/);
});

test('la synthèse propose une allocation lisible sans vue Comptes redondante', () => {
  const html = read('index.html');
  const app = read('assets/js/app.js');
  for (const label of ['Synthèse', 'Portefeuille', 'Trajectoire']) {
    assert.match(html, new RegExp(label));
  }
  const allocationControls = html.match(/<div class="allocation-mode"[\s\S]*?<\/div>/)?.[0] || '';
  assert.match(allocationControls, />Poches</);
  assert.match(allocationControls, />Actifs</);
  assert.doesNotMatch(allocationControls, />Comptes</);
  assert.match(app, /allocationMode = 'type'/);
  assert.match(app, /\['type', 'asset'\]\.includes\(mode\)/);
  assert.doesNotMatch(app, /allocationMode === 'account'/);
  assert.match(app, /setTrajectoryYears/);
});

test('la nouvelle identité transparente est utilisée par le site et la PWA', () => {
  const html = read('index.html');
  const worker = read('sw.js');
  const mark = read('assets/brand/moobank-mark.svg');
  const manifest = JSON.parse(read('manifest.json'));
  assert.match(html, /assets\/brand\/moobank-mark\.svg/);
  assert.match(worker, /assets\/brand\/moobank-mark\.svg/);
  assert.match(worker, /assets\/css\/v2\.css/);
  assert.doesNotMatch(mark, /<rect\b/i);
  assert.equal(manifest.name, 'Moobank — Patrimoine');
  assert.equal(JSON.parse(read('version.json')).version, '2.5.0');
});

test('la synthèse remplace le doublon des poches par le classement des mouvements du jour', () => {
  const html = read('index.html');
  const app = read('assets/js/app.js');
  assert.match(html, /class="card market-news-card"/);
  assert.match(html, /id="marketNewsContent"/);
  assert.doesNotMatch(html, /id="byAccountContent"|id="accountCountBadge"/);
  assert.match(app, /renderDailyMovers/);
  assert.match(app, /slice\(0, 5\)/);
  assert.match(app, /Pas encore de variation à afficher aujourd’hui/);
});

test('la navigation et les actions suivent la nouvelle hiérarchie responsive', () => {
  const html = read('index.html');
  const css = read('assets/css/v2.css');
  const app = read('assets/js/app.js');
  assert.match(html, /header-primary[\s\S]*brand-mark[\s\S]*navigation-bar/);
  assert.match(html, /app-menu-toggle/);
  assert.match(html, /id="mobileNavActionsBtn"[\s\S]*moobank-mark\.svg[\s\S]*>Menu</);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.navigation-bar \{[\s\S]*position: fixed/);
  assert.match(css, /\.nav-menu-btn \{ display: inline-flex; \}/);
  assert.match(css, /padding-bottom: max\(92px, calc\(76px \+ var\(--safe-bottom\)\)\)/);
  assert.match(app, /setActionsMenuExpanded/);
  assert.match(app, /#mobileActionsBtn, #mobileNavActionsBtn/);
  assert.doesNotMatch(app, /mobileActionsMedia\.matches/);
  assert.doesNotMatch(html, /id="openAccountBtn"|id="openPositionBtn"|id="userMenu"/);
});

test('la trajectoire explicite inflation, versements et rendement', () => {
  const html = read('index.html');
  const app = read('assets/js/app.js');
  const trajectory = read('assets/js/trajectory-core.js');
  assert.match(html, /id="sim-inflation"/);
  assert.match(html, /id="sim-res-real-today"/);
  assert.match(html, /id="sim-formula-summary"/);
  assert.match(app, /MoobankTrajectory\.presentValue/);
  assert.match(trajectory, /Math\.pow\(1 \+ inflation, duration\)/);
  assert.match(app, /futurs versements/);
});

test('la composition du résultat est fusionnée dans la carte de trajectoire', () => {
  const html = read('index.html');
  const css = read('assets/css/v2.css');
  const cardIndex = html.indexOf('trajectory-main-card');
  const compositionIndex = html.indexOf('trajectory-composition-inline');
  const chartIndex = html.indexOf('trajectory-chart');
  assert.ok(cardIndex >= 0 && compositionIndex > cardIndex && chartIndex > compositionIndex);
  assert.doesNotMatch(html, /class="card trajectory-composition(?:"|\s)/);
  assert.match(css, /\.trajectory-results \{ display: grid; align-self: start; gap: 16px; \}/);
  assert.ok(html.indexOf('trajectory-results') < chartIndex && chartIndex < html.indexOf('<!-- OBJECTIFS'));
  assert.doesNotMatch(html, /votre-taux-badge" style=/);
});

test('le plan mensuel est modifiable par compte et isolé localement par utilisateur', () => {
  const html = read('index.html');
  const app = read('assets/js/app.js');
  assert.match(html, /id="sim-contribution-plan"/);
  assert.match(html, /id="sim-plan-total"/);
  assert.doesNotMatch(html, /id="sim-monthly"|id="sim-contribution-target"/);
  assert.match(app, /SIM_PLAN_STORAGE_PREFIX \+ userId/);
  assert.match(app, /SIM_PLAN_LEGACY_STORAGE_PREFIX \+ userId/);
  assert.match(app, /localStorage\.setItem\(currentKey, stored\)/);
  assert.match(app, /MoobankCore\.groupMonthlyContributions/);
  assert.match(app, /trajectoryPlan: \{ \.\.\.simContributionPlan \}/);
});

test('l’ancien plan privé est absent du runtime et son nettoyage reste optionnel', () => {
  const html = read('index.html');
  const app = read('assets/js/app.js');
  const schema = read('supabase_shema.sql');
  const cleanup = read('scripts/optional/remove-private-projection-plan.sql');
  assert.doesNotMatch(html + app + schema, /private_projection_plan/);
  assert.match(cleanup, /DROP TABLE IF EXISTS public\.private_projection_plan/);
  for (const protectedTable of ['accounts', 'positions', 'transactions', 'prelevements', 'goals', 'patrimoine_history']) {
    assert.doesNotMatch(cleanup, new RegExp(`DROP TABLE[^;]*${protectedTable}`, 'i'));
  }
});

test('le nom public de l’application est Moobank', () => {
  const html = read('index.html');
  const manifest = JSON.parse(read('manifest.json'));
  assert.match(html, /<title>Moobank/);
  assert.equal(manifest.short_name, 'Moobank');
  assert.doesNotMatch(html, /Moumix/i);
});

test('les identifiants HTML sont uniques', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), []);
});

test('toutes les ressources locales déclarées par le HTML existent', () => {
  const html = read('index.html');
  const refs = [...html.matchAll(/\s(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  for (const ref of refs) {
    if (/^(?:https?:|data:|#)/i.test(ref)) continue;
    const localPath = ref.split(/[?#]/, 1)[0].replace(/^\.\//, '');
    assert.ok(fs.existsSync(path.join(root, localPath)), `${ref} doit pointer vers un fichier existant`);
  }
});

test('les cotations frontend sont limitées, dédupliquées et mises en cache', () => {
  const app = read('assets/js/app.js');
  assert.match(app, /QUOTE_CONCURRENCY = 3/);
  assert.match(app, /yfResponseCache/);
  assert.match(app, /yfInFlight/);
  assert.match(app, /MoobankCore\.mapWithConcurrency\(uniqueSymbols, QUOTE_CONCURRENCY/);
});

test('le snapshot limite les requêtes et mutualise les cours entre utilisateurs', () => {
  const snapshot = read('scripts/daily-snapshot.js');
  assert.match(snapshot, /FETCH_ATTEMPTS = 4/);
  assert.match(snapshot, /QUOTE_CONCURRENCY = 3/);
  assert.match(snapshot, /rawQuoteCache/);
  assert.match(snapshot, /eurQuoteCache/);
  assert.match(snapshot, /providers\[\(attempt - 1\) % providers\.length\]/);
  assert.match(snapshot, /response\.text\(\)/);
});

test('le service worker couvre les fichiers séparés et attend la validation utilisateur', () => {
  const worker = read('sw.js');
  assert.match(worker, /SKIP_WAITING/);
  assert.doesNotMatch(worker, /cache\.addAll\(APP_SHELL\)[\s\S]{0,80}self\.skipWaiting/);
  for (const file of ['assets/css/app.css', 'assets/css/v2.css', 'assets/js/core.js', 'assets/js/trajectory-core.js', 'assets/js/app.js', 'assets/js/history-import.js']) {
    assert.match(worker, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(worker, /cache: 'no-store'/);
  assert.match(worker, /mustStayFresh/);
});

test('le contenu respecte les safe areas, avec navigation basse et change discret en haut', () => {
  const css = read('assets/css/v2.css');
  const legacyCss = read('assets/css/app.css');
  const mobileCss = css.slice(css.indexOf('@media (max-width: 820px)'));
  const mobileHeaderRule = mobileCss.match(/\.app > header \{[\s\S]*?\}/)?.[0] || '';
  assert.match(css, /--safe-top: env\(safe-area-inset-top, 0px\)/);
  assert.match(css, /--safe-bottom: env\(safe-area-inset-bottom, 0px\)/);
  assert.match(mobileCss, /\.app \{[\s\S]*?padding-top: max\(12px, calc\(var\(--safe-top\) \+ 8px\)\)/);
  assert.match(mobileHeaderRule, /position: static;/);
  assert.match(mobileHeaderRule, /min-height: 24px;/);
  assert.match(mobileHeaderRule, /height: auto;/);
  assert.match(mobileHeaderRule, /padding: 0;/);
  assert.match(mobileHeaderRule, /-webkit-backdrop-filter: none;/);
  assert.match(mobileHeaderRule, /backdrop-filter: none;/);
  assert.doesNotMatch(mobileHeaderRule, /blur\(/);
  assert.match(mobileCss, /\.app > header \.brand-mark \{ display: none !important; \}/);
  assert.match(mobileCss, /\.app > header > \.header-tools \{[\s\S]*?display: flex !important;/);
  assert.match(mobileCss, /\.app > header #eurusd-widget \{[\s\S]*?display: flex !important;/);
  assert.match(mobileCss, /\.app > header \.app-menu-toggle \{ display: none !important; \}/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.navigation-bar \{[\s\S]*?position: fixed !important;[\s\S]*?top: auto !important;[\s\S]*?bottom: 0 !important;[\s\S]*?var\(--safe-bottom\)/);
  assert.match(legacyCss, /@media\(max-width:768px\)[\s\S]*?\.navigation-bar\{[\s\S]*?position:fixed;[\s\S]*?top:auto;[\s\S]*?bottom:0;[\s\S]*?safe-area-inset-bottom/);
  assert.doesNotMatch(legacyCss, /\.navigation-bar\{[\s\S]{0,220}position:sticky;[\s\S]{0,120}top:env\(safe-area-inset-top\)/);
});

test('les trois vues gardent la même échelle, restent fixes et partagent la même animation', () => {
  const html = read('index.html');
  const css = read('assets/css/v2.css');
  const app = read('assets/js/app.js');
  assert.match(html, /width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover/);
  assert.match(css, /-webkit-text-size-adjust: 100%/);
  assert.match(css, /html \{[\s\S]*?overflow-x: clip;[\s\S]*?overscroll-behavior-x: none;/);
  assert.match(css, /body \{[\s\S]*?overflow-x: clip;[\s\S]*?overscroll-behavior-x: none;/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?html, body \{[\s\S]*?overflow-x: hidden;[\s\S]*?touch-action: pan-y;/);
  assert.match(css, /\.tab-panel \{ width: 100%; min-width: 0; max-width: 100%; overflow-x: clip; \}/);
  assert.match(css, /@keyframes moobankTabFadeIn/);
  assert.match(css, /\.tab-panel\.active,[\s\S]*?\.tab-panel\.active\.slide-left \{ animation: moobankTabFadeIn/);
  assert.match(css, /input, select, textarea \{ font-size: 16px !important; \}/);
  assert.doesNotMatch(app, /current\.style\.transform|goingRight|translateX\(-?14px\)/);
});

test('le portefeuille mobile utilise des poches compactes et des positions dépliables', () => {
  const html = read('index.html');
  const css = read('assets/css/v2.css');
  const app = read('assets/js/app.js');
  assert.match(html, /id="posMobileList"/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.accounts-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.positions-table \{ display: none; \}/);
  assert.match(css, /\.position-mobile-list \{ display: grid;/);
  assert.match(app, /function toggleMobilePositionCard/);
  assert.match(app, /class="position-mobile-details"/);
});

test('les nouveaux livrets sont cohérents entre interface, moteur, schéma et migration', () => {
  const html = read('index.html');
  const core = read('assets/js/core.js');
  const app = read('assets/js/app.js');
  const trajectory = read('assets/js/trajectory-core.js');
  const schema = read('supabase_shema.sql');
  const migration = read('scripts/optional/enable-savings-account-types.sql');
  for (const type of ['Livret A', 'LDDS', 'Autre livret']) {
    for (const source of [html, core, app, trajectory, schema, migration]) assert.match(source, new RegExp(type));
  }
  assert.doesNotMatch(html, /<option value="Livret">/);
  assert.match(core, /'Livret'/);
  assert.match(migration, /BEGIN;[\s\S]*DROP CONSTRAINT IF EXISTS accounts_type_check;[\s\S]*ADD CONSTRAINT accounts_type_check[\s\S]*COMMIT;/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/i);
});

test('le cache local est isolé, signalé et utilisé en lecture seule après un échec', () => {
  const html = read('index.html');
  const app = read('assets/js/app.js');
  const core = read('assets/js/core.js');
  assert.match(html, /id="cachedDataNotice"[\s\S]*?Réessayer/);
  assert.match(app, /DATA_CACHE_PREFIX\s*=\s*'moobank:last-valid:'/);
  assert.match(app, /MoobankCore\.createDataCacheEnvelope/);
  assert.match(app, /MoobankCore\.parseDataCacheEnvelope/);
  assert.match(app, /setCachedDataMode\(true, cached\.savedAt\)/);
  assert.match(app, /Données locales du .*lecture seule/);
  assert.match(app, /function assertLiveWrite/);
  assert.match(core, /parsed\.userId !== userId/);
});

test('toutes les écritures sont validées, retentées et les snapshots restent idempotents', () => {
  const app = read('assets/js/app.js');
  const historyImport = read('assets/js/history-import.js');
  const snapshot = read('scripts/daily-snapshot.js');
  const schema = read('supabase_shema.sql');
  for (const validator of ['validateAccountRecord', 'validatePositionRecord', 'validatePositionPriceUpdate', 'validatePrelevementRecord', 'validateTransactionRecord', 'validateHistoryRecord', 'validateGoalRecord']) {
    assert.match(app + historyImport, new RegExp(`MoobankCore\\.${validator}`));
  }
  assert.match(app, /signInWithPassword[\s\S]*?attempts: 3[\s\S]*?shouldRetry: isTransientAuthError/);
  assert.match(app, /function retryDbWrite[\s\S]*?attempts: 4/);
  assert.match(historyImport, /retryDbWrite[\s\S]*?onConflict: 'user_id,date'/);
  assert.match(snapshot, /SUPABASE_ATTEMPTS = 4/);
  assert.match(snapshot, /runSupabase\('patrimoine_history'/);
  assert.match(snapshot, /onConflict: 'user_id,date'/);
  assert.match(schema, /UNIQUE\(user_id, date\)/);
});

test('la mise à jour PWA propose une décision claire et ne nettoie que les caches Moobank', () => {
  const app = read('assets/js/app.js');
  const css = read('assets/css/v2.css');
  const worker = read('sw.js');
  assert.match(app, /Mise à jour disponible/);
  assert.match(app, />Mettre à jour</);
  assert.match(app, />Plus tard</);
  assert.match(css, /\.app-update-overlay/);
  assert.match(css, /\.app-update-card/);
  assert.match(worker, /CACHE_PREFIX = 'moobank-shell-'/);
  assert.match(worker, /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE_NAME/);
});

test('la courbe de trajectoire utilise ses dimensions mobiles réelles', () => {
  const app = read('assets/js/app.js');
  const css = read('assets/css/v2.css');
  assert.match(css, /\.trajectory-graph-wrap, \.trajectory-graph-wrap svg \{ height: 240px !important; \}/);
  assert.match(app, /wrap\?\.offsetHeight \|\| parseFloat\(getComputedStyle\(svg\)\.height\)/);
  assert.match(app, /const H = Number\.isFinite\(measuredHeight\)/);
  assert.match(app, /const simCompact = W < 520/);
  assert.match(app, /top: 20, right: 14, bottom: 32, left: 52/);
  assert.match(app, /preserveAspectRatio', 'xMidYMid meet'/);
  assert.doesNotMatch(app, /const H = 300;[\s\S]{0,100}const pad/);
});

test('les versions publiques et les ressources versionnées sont cohérentes', () => {
  const html = read('index.html');
  const worker = read('sw.js');
  const version = JSON.parse(read('version.json')).version;
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(version, '2.5.0');
  assert.equal(pkg.version, version);
  assert.equal(lock.version, version);
  assert.equal(lock.packages[''].version, version);
  assert.match(html, new RegExp(`moobank-version" content="${version.replaceAll('.', '\\.')}`));
  assert.match(html, new RegExp(`assets/css/v2\\.css\\?v=${version.replaceAll('.', '\\.')}`));
  assert.match(worker, new RegExp(`APP_VERSION = '${version.replaceAll('.', '\\.')}'`));
});

test('le workflow de snapshot porte le nom Moobank', () => {
  const workflow = read('.github/workflows/daily-snapshot.yml');
  assert.match(workflow, /^name: Moobank — snapshot quotidien/m);
  assert.match(workflow, /group: moobank-daily-patrimoine-snapshot/);
});

test('achat, vente et modification partagent la même compensation technique', () => {
  const app = read('assets/js/app.js');
  assert.ok((app.match(/MoobankCore\.runCompensatedOperation/g) || []).length >= 3);
  assert.match(app, /from\('transactions'\)\.upsert\(row, \{ onConflict: 'id' \}\)/);
  assert.doesNotMatch(app, /from\('transactions'\)\.insert\(row\)/);
});
