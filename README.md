<div align="center">

<img src="./assets/brand/moobank-mark.svg" width="88" height="88" alt="Logo Moobank">

# Moobank
### Le patrimoine, au même endroit

<p><em>Comprendre ce que j’ai. Voir où il se trouve. Suivre le chemin parcouru.</em></p>

Un tableau de bord privé et calme pour suivre ses comptes, ses actifs et ses projets dans le temps.

![HTML5](https://img.shields.io/badge/HTML5-static-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-native-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-F7DF1E?style=flat-square&logo=javascript&logoColor=111)
![Supabase](https://img.shields.io/badge/Supabase-backend-3ECF8E?style=flat-square&logo=supabase&logoColor=111)
![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?style=flat-square&logo=pwa&logoColor=white)
![GitHub Pages](https://img.shields.io/badge/deploy-GitHub%20Pages-222?style=flat-square&logo=githubpages&logoColor=white)

</div>

Moobank rassemble ce qui est souvent éparpillé entre plusieurs banques, courtiers et applications. L’idée n’est pas de transformer l’épargne en salle de marché : l’application aide simplement à lire son patrimoine, à comprendre sa répartition et à observer son évolution.

---

## Le concept

Moobank relie trois questions très concrètes :

- **Combien ai-je aujourd’hui ?**
- **Dans quelles poches se trouve mon argent ?**
- **Que pourrait-il devenir si je garde un certain rythme ?**

Les cours de marché ne sont qu’un moyen de valoriser les positions. Ils ne prennent jamais le dessus sur l’essentiel : les comptes, les actifs, les plus-values, les mouvements et la progression globale.

## Les grands principes

- **Une lecture patrimoniale** — aucune cotation défilante ni indicateur de trader ; seulement trois actualités maximum, liées aux principaux actifs.
- **Une information à la fois** — les vues évitent d’empiler plusieurs représentations concurrentes.
- **Des données personnelles séparées** — chaque compte Supabase ne voit que ses propres lignes grâce à l’authentification et aux règles RLS.
- **Une trajectoire explicite** — toute estimation part du portefeuille renseigné et affiche clairement ses hypothèses.
- **Une base fiable** — écritures ciblées, cotations limitées et snapshots refusés lorsqu’ils seraient incomplets.

## Les trois espaces

### Synthèse

La page d’accueil répond immédiatement à l’essentiel :

- patrimoine actuellement suivi ;
- capital investi et plus-value latente ;
- variation sur la période choisie ;
- courbe de progression ;
- allocation par poche ou actif ;
- aperçu éditorial très court des sujets liés aux principaux actifs.

L’ancien bloc de jalons automatiques et la seconde vue des comptes ont été retirés. Les filtres permettent toujours d’isoler un ou plusieurs types de comptes sans modifier les données enregistrées. Le bloc « À suivre » reste secondaire : il est limité à trois liens et une indisponibilité de Yahoo Finance ne bloque jamais le chargement du patrimoine.

### Portefeuille

Le portefeuille conserve toute la gestion opérationnelle :

- création de comptes par établissement et type d’enveloppe ;
- comptes de marché et soldes fixes ;
- recherche d’un titre par nom ou ticker ;
- achat, vente et modification d’une position ;
- quantité, PRU, cours actuel, valeur et plus-value ;
- historique des mouvements ;
- prélèvements récurrents et équivalents mensuel/annuel.

L’actualisation conserve la dernière cotation connue lorsqu’une nouvelle valeur manque. Une position supprimée depuis un autre appareil n’est jamais recréée pendant une synchronisation.

### Trajectoire

La trajectoire remplace l’ancien simulateur dense. Elle utilise automatiquement le patrimoine déjà présent, puis permet de définir :

- le versement mensuel de chaque compte ;
- l’horizon de la projection ;
- les hypothèses de rendement par poche et l’inflation.

Le plan peut donc représenter simultanément un apport immobilier, un PEA, un CTO et du Bitcoin. Son total est calculé automatiquement. Les montants sont mémorisés localement avec une clé différente pour chaque utilisateur, afin que deux comptes utilisant le même appareil ne partagent pas leurs réglages.

Trois résultats restent visibles : prudent, central et favorable. La composition du scénario central est intégrée dans la même carte pour éviter les grands espaces vides sur ordinateur. Les hypothèses annuelles par poche sont disponibles dans un volet replié pour ceux qui souhaitent les ajuster. Les objectifs personnels restent séparés des estimations.

Cette partie n’écrit aucune hypothèse dans Supabase. Elle constitue une simulation indicative, jamais une promesse de rendement ni un conseil financier.

## Identité et expérience

La version 2 introduit une identité complète autour d’un symbole en forme de **M** et de poches imbriquées. L’interface utilise des surfaces bleu-encre, un vert plus doux et quelques accents bleus afin de rester lisible sans ressembler à un terminal boursier.

Sur ordinateur, le logo, la navigation et le taux USD/EUR partagent un en-tête compact. Sur mobile :

- la navigation principale est ancrée en bas sur mobile et respecte les zones sûres de l’iPhone ;
- les actions d’ajout et le compte personnel sont regroupés derrière un hamburger discret ;
- le taux USD/EUR reste visible sous une forme très discrète au-dessus du contenu ;
- la page reste fixe horizontalement et le zoom mobile est désactivé ;
- les champs restent à 16 px afin d’éviter tout changement d’échelle au focus.

## Ce qui a volontairement disparu

- le Shiba et ses messages ;
- le bandeau défilant d’indices, crypto et métaux ;
- les jalons patrimoniaux automatiques ;
- la présentation très dense de l’ancien simulateur ;
- tout parcours d’inscription publique.

Le taux **USD/EUR** reste présent car il est utile à la compréhension des positions étrangères.

## Version en cours

**2.5.0 — septembre 2026**

Cette version resserre l’expérience mobile et ajoute un filet de sécurité lorsque Supabase ou Yahoo Finance répond momentanément mal :

- taux USD/EUR conservé discrètement sur mobile ;
- textes secondaires raccourcis ;
- poches présentées sur deux colonnes sur téléphone ;
- tableau des positions remplacé sur mobile par des cartes compactes et dépliables ;
- largeur verrouillée, défilement horizontal et zoom mobile désactivés ;
- ajout des types `Livret A`, `LDDS` et `Autre livret`, avec maintien du type historique `Livret` pour ne casser aucune ligne existante ;
- quatre tentatives bornées sur les lectures et écritures Supabase temporaires ;
- nouvelles tentatives et limitation de concurrence conservées pour les cotations ;
- dernière situation valide mise en cache localement, isolée par utilisateur et affichée en lecture seule avec un indicateur explicite ;
- validations des montants, identifiants, dates et types avant les sauvegardes ;
- snapshots confirmés et idempotents sur la paire utilisateur/date ;
- écran PWA dédié avec les choix « Plus tard » et « Mettre à jour » ;
- tests automatisés des parcours connexion, ajout, modification, suppression et actualisation.

Les comptes, positions, transactions, prélèvements, objectifs et snapshots existants ne sont ni renommés ni recalculés.

## Architecture

| Élément | Rôle |
| --- | --- |
| `index.html` | Structure et contenu de l’interface |
| `assets/css/app.css` | Composants fonctionnels historiques |
| `assets/css/v2.css` | Identité et hiérarchie de la version 2 |
| `assets/brand/moobank-mark.svg` | Logo vectoriel |
| `assets/js/core.js` | Fonctions techniques pures et testables |
| `assets/js/trajectory-core.js` | Formules et hypothèses de trajectoire, sans dépendance à l’interface |
| `assets/js/app.js` | Authentification, données et interface |
| `assets/js/history-import.js` | Import de l’historique patrimonial |
| `tests/flows.test.cjs` | Parcours critiques simulés avec une base en mémoire |
| Supabase | Authentification, PostgreSQL et règles RLS |
| Yahoo Finance | Cotations nécessaires aux positions et au taux USD/EUR |
| Cloudflare Worker | Proxy CORS et solution de repli pour les cotations |
| GitHub Actions | Snapshot quotidien du patrimoine |
| Service worker | Cache du shell et mise à jour contrôlée de la PWA |

Le frontend reste en JavaScript vanilla, sans compilation. Il peut être déposé directement sur GitHub Pages.

## Déploiement d’une mise à jour existante

Pour une base Moobank déjà utilisée :

1. remplacer les fichiers du projet sur GitHub ;
2. attendre la fin du déploiement GitHub Pages ;
3. fermer puis rouvrir la web app ;
4. accepter la proposition de mise à jour si elle apparaît.

À partir de la 2.2, les feuilles de style et scripts portent aussi leur numéro de version. Même si l’ancien service worker est encore actif, il ne peut plus resservir silencieusement le CSS d’une version précédente.

Ne relancez jamais `supabase_shema.sql` sur une base déjà en service. Les données existantes sont relues telles quelles.

Pour créer des comptes portant les trois nouveaux libellés, exécutez une seule fois le script ciblé `scripts/optional/enable-savings-account-types.sql` dans l’éditeur SQL Supabase. Il remplace uniquement la contrainte de validation du type de compte : aucune table ni ligne n’est supprimée. Sans ce script, le reste de la version fonctionne normalement, mais Supabase refusera la création d’un `Livret A`, d’un `LDDS` ou d’un `Autre livret`.

### Passage du dépôt à Moobank

Le nom du dépôt GitHub se modifie manuellement après l’envoi des fichiers :

1. ouvrir **Settings → General → Repository name** ;
2. remplacer le nom actuel par `Moobank`, puis valider **Rename** ;
3. vérifier **Settings → Pages** et attendre le nouveau déploiement ;
4. vérifier que les trois secrets du snapshot sont toujours présents et que l’action « Moobank — snapshot quotidien » est verte ;
5. ouvrir la nouvelle adresse `https://<utilisateur>.github.io/Moobank/` sur l’iPhone, installer **Moobank**, puis retirer l’ancienne web app seulement après contrôle.

GitHub redirige le dépôt et les opérations Git après un renommage, mais exclut explicitement les adresses des sites de projet GitHub Pages. L’adresse publique change donc avec le nom du dépôt. Voir la [documentation officielle sur le renommage](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository) et les [adresses des sites de projet](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

Si un clone local existe, sa destination peut être actualisée avec `git remote set-url origin NOUVELLE_URL`. Si l’ancienne adresse apparaît dans **Supabase → Authentication → URL Configuration**, il faut également la remplacer ou ajouter la nouvelle adresse aux redirections autorisées. La base, les utilisateurs et les données Supabase ne changent pas.

Le plan mensuel de trajectoire reste stocké par utilisateur sur l’appareil. La version 2.3 reprend automatiquement la clé locale de l’ancien nom, sans la supprimer, tant que l’adresse reste sur le même domaine GitHub Pages.

## Nouvelle installation

1. créer un projet Supabase ;
2. exécuter `supabase_shema.sql` une seule fois ;
3. activer l’authentification par email et mot de passe ;
4. créer manuellement les utilisateurs autorisés ;
5. laisser l’inscription publique désactivée ;
6. renseigner dans `assets/js/app.js` l’URL Supabase, la clé publique `anon` et le proxy Yahoo Finance.

La clé `service_role` ne doit jamais être placée dans le frontend.

## Snapshot automatique

Le workflow GitHub Actions récupère les positions des utilisateurs autorisés, mutualise les symboles communs et limite le nombre de requêtes simultanées. Les réponses non JSON, les limitations temporaires et les délais d’attente sont retentés avec temporisation.

Les lectures et l’écriture Supabase sont également retentées lorsqu’une erreur est temporaire. Un snapshot n’est enregistré que si toutes les cotations et conversions requises sont disponibles. L’écriture utilise la paire unique utilisateur/date : relancer le workflow met à jour le point du jour sans créer de doublon.

Secrets GitHub nécessaires :

| Secret | Contenu |
| --- | --- |
| `SUPA_URL` | URL du projet Supabase |
| `SUPA_SERVICE_KEY` | Service Role Key réservée à GitHub Actions |
| `SNAPSHOT_USER_IDS` | Identifiants utilisateurs séparés par des virgules |

## Données et confidentialité

L’inscription est absente de l’interface. Les deux comptes autorisés restent indépendants : l’identifiant de l’utilisateur accompagne chaque ligne et les politiques RLS empêchent la lecture des données d’un autre compte.

L’export JSON permet de conserver une copie locale des comptes, positions, transactions, prélèvements, historique, objectifs et plan mensuel.

Après chaque chargement complet, Moobank mémorise aussi la dernière situation valide sur l’appareil, sous une clé propre à l’utilisateur. En cas d’indisponibilité temporaire de Supabase, cette copie peut être consultée en lecture seule ; un bandeau daté l’indique et la synchronisation reprend automatiquement. Aucun email, mot de passe ou jeton n’est placé dans ce cache.

### Ancien plan patrimonial privé

Depuis la version 2.1, l’application n’utilise plus la table expérimentale `private_projection_plan`. Si son ancien script d’activation a été exécuté, cette table peut rester sans perturber l’application, mais elle conserve inutilement le texte personnel qui y avait été enregistré.

Le script optionnel `scripts/optional/remove-private-projection-plan.sql` supprime uniquement cette table abandonnée et sa fonction de mise à jour. Il ne doit être exécuté que si ces anciennes informations ne sont plus utiles. Il ne touche pas à `goals` ni à `patrimoine_history`.

## Limites

- Moobank valorise les actifs mais ne tient pas automatiquement un solde espèces après chaque achat ou vente.
- Les cotations peuvent être différées selon les marchés et le fournisseur.
- La trajectoire est une estimation sensible aux hypothèses choisies.
- L’application n’agrège pas automatiquement les comptes bancaires : les données restent saisies et contrôlées par l’utilisateur.

## La direction

Moobank reste un projet personnel. Chaque évolution doit rendre le patrimoine plus facile à comprendre avant d’ajouter une nouvelle fonction : moins de bruit, une hiérarchie plus juste et des données auxquelles on peut faire confiance.
