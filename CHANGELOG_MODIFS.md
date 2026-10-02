# Moobank 2.5.0 — portefeuille mobile et filet de sécurité

- taux USD/EUR réintroduit discrètement sur mobile, sans rétablir l’ancien en-tête encombrant ;
- textes d’accompagnement raccourcis dans les trois vues ;
- cartes de comptes compactées sur deux colonnes sur téléphone ;
- tableau des positions remplacé sur mobile par des cartes dépliables affichant valeur, performance, quantité, PRU et cours ;
- largeur des vues verrouillée et zoom/déplacement horizontal désactivés sur mobile ;
- types `Livret A`, `LDDS` et `Autre livret` ajoutés, avec conservation du type historique `Livret` ;
- script Supabase optionnel et non destructif ajouté pour autoriser ces trois nouvelles valeurs ;
- lectures et écritures Supabase retentées jusqu’à quatre fois lors des erreurs temporaires ;
- import d’historique validé et retenté avec clé idempotente utilisateur/date ;
- dernière situation complète conservée localement par utilisateur et affichée en lecture seule lors d’une panne ;
- indicateur daté, bouton de nouvel essai et resynchronisation automatique ajoutés au mode cache ;
- validations centralisées avant les sauvegardes de comptes, positions, cotations, mouvements, prélèvements, objectifs et historique ;
- snapshots renforcés par des essais Supabase, une validation du total et une confirmation de l’upsert idempotent ;
- nettoyage du service worker limité aux caches Moobank ;
- écran de mise à jour PWA explicite avec boutons **Plus tard** et **Mettre à jour** ;
- tests automatisés des parcours connexion, ajout, modification, suppression, actualisation et cache.

---

# Moobank 2.4.1 — trajectoire responsive

- hauteur du `viewBox` de la trajectoire alignée sur la hauteur réellement affichée du graphique ;
- marges internes adaptées aux écrans étroits afin que la courbe exploite toute la largeur utile ;
- recalcul conservé lors d’un changement de taille, d’orientation ou d’ouverture de l’onglet ;
- ressources versionnées en 2.4.1 pour renouveler la PWA ;
- aucune modification de Supabase ni des données enregistrées.

---

# Moobank 2.4.0 — navigation mobile et mouvement uniformes

- suppression de la bande d’en-tête sur mobile : le contenu commence directement après la safe area haute ;
- logo et hamburger supérieurs masqués uniquement sur mobile ;
- ajout d’un quatrième bouton **Menu** dans la navigation basse, avec le symbole Moobank ;
- quatre zones tactiles de même largeur et safe area basse conservée ;
- transitions entre Synthèse, Portefeuille et Trajectoire unifiées en un fondu court, sans glissement horizontal ni effet d’échelle ;
- largeur des trois vues stabilisée et inflation automatique du texte désactivée sur iOS ;
- champs mobiles maintenus à 16 px afin d’éviter le zoom Safari au focus, sans désactiver le pincement volontaire ;
- protection contre les changements d’onglet très rapides afin d’éviter les animations concurrentes ;
- ressources versionnées en 2.4.0 pour renouveler la PWA ;
- aucune modification de Supabase ni des données enregistrées.

---

# Moobank 2.3.2 — navigation mobile réellement ancrée

- retrait du `backdrop-filter` sur l’en-tête mobile, qui créait sur WebKit le repère de positionnement de la navigation fixe ;
- conservation du fond opaque et de la safe area haute sans flou sur cet ancêtre ;
- navigation désormais positionnée par rapport au viewport et ancrée au bas de l’iPhone ;
- ressources versionnées en 2.3.2 pour invalider l’ancienne feuille de style dans la PWA ;
- aucune modification de Supabase ni des données enregistrées.

---

# Moobank 2.3.1 — navigation mobile et trajectoire

- suppression de l’ancienne règle qui pouvait encore replacer la navigation principale en haut sur mobile ;
- position basse définie explicitement dans les deux feuilles de style, avec respect de la safe area iPhone ;
- courbe « La trajectoire dans le temps » intégrée dans la colonne de résultats sur ordinateur pour occuper l’espace disponible ;
- ordre mobile préservé : plan, résultats, puis courbe ;
- badge « Central » replacé dans le flux et espacé du libellé « Rythme attendu » ;
- ressources versionnées en 2.3.1 pour forcer leur rechargement dans la PWA ;
- aucune modification de Supabase ni des données enregistrées.

---

# Moobank 2.3.0 — identité et synthèse allégée

- nom public harmonisé en **Moobank** dans le site, le manifeste, le service worker, les exports, les tests et le workflow GitHub Actions ;
- nouveau logo vectoriel sans tuile ni fond visible dans l’interface, la connexion et le README ;
- suppression du mode « Comptes » dans l’allocation, désormais limitée à « Poches » et « Actifs » ;
- remplacement de la carte de comptes redondante sur la Synthèse par trois actualités maximum liées aux principaux actifs ;
- fil d’actualités non bloquant : une panne du fournisseur ne gêne ni la connexion ni le chargement des données ;
- fusion de la valeur projetée et de sa composition dans une seule carte compacte sur ordinateur ;
- navigation principale maintenue en bas sur mobile, avec zones sûres iPhone haute et basse ;
- migration locale non destructive du plan mensuel vers la clé Moobank ;
- nom du workflow et groupe de concurrence renommés sans modifier ses secrets ni son fonctionnement ;
- aucune table, colonne ou ligne Supabase ajoutée, supprimée ou renommée.

---

# Moobank 2.2.0 — safe area et robustesse

- safe area iPhone portée par l’en-tête lui-même, avec un fond opaque derrière la barre d’état ;
- suppression du double décalage entre le padding général et l’en-tête sticky ;
- navigation Synthèse, Portefeuille et Trajectoire maintenue en bas jusqu’à 820 px ;
- scripts et feuilles de style versionnés pour éviter qu’un ancien cache reste affiché ;
- ressources essentielles revalidées sur le réseau avec repli hors ligne ;
- vérification des mises à jour au démarrage, au retour dans la PWA et toutes les quinze minutes ;
- moteur de trajectoire extrait dans `assets/js/trajectory-core.js`, sans DOM ni stockage ;
- tests dédiés pour les scénarios, l’inflation et les hypothèses personnalisées ;
- achats, ventes et modifications unifiés autour d’un mécanisme de compensation vérifié ;
- écriture de l’historique rendue idempotente pour éviter les doublons en cas de nouvel essai réseau ;
- nouvelles tentatives bornées sur les écritures idempotentes lors d’une erreur temporaire ;
- aucune migration SQL et aucune modification automatique des données existantes.

---

# Moobank 2.1.0 — plan mensuel personnalisé

- nom public harmonisé en **Moobank** dans l’interface et la PWA ;
- versement mensuel configurable séparément pour chaque compte ;
- total mensuel calculé automatiquement ;
- regroupement fiable des versements par poche pour appliquer le bon rendement ;
- plan mémorisé localement avec une clé distincte pour chaque utilisateur ;
- synchronisation du plan entre les onglets ouverts sur le même appareil ;
- plan inclus dans l’export JSON ;
- script optionnel et ciblé pour retirer l’ancien `private_projection_plan` abandonné ;
- aucun nouveau stockage Supabase et aucune migration SQL.

---

# Moobank 2.0.1 — navigation et trajectoire

- logo et navigation réunis dans l’en-tête sur ordinateur ;
- navigation Synthèse, Portefeuille et Trajectoire ancrée en bas sur mobile ;
- ajout de compte, ajout de position, export et déconnexion regroupés dans un hamburger commun ;
- taux USD/EUR conservé sous une forme textuelle discrète ;
- scénario central expliqué par capital actuel, futurs versements et rendements estimés ;
- affichage optionnel du résultat en euros d’aujourd’hui selon une inflation modifiable ;
- aucune modification du schéma Supabase ou des données enregistrées.

---

# Moobank 2.0.0 — refonte patrimoniale

Cette version change l’expérience et l’identité, mais conserve le modèle Supabase existant. Aucun script SQL ni recalcul rétroactif n’est nécessaire.

## Interface et identité

- nouveau logo vectoriel et nouvelles icônes PWA ;
- palette bleu-encre, vert doux et bleu, avec une hiérarchie uniforme ;
- navigation recentrée sur Synthèse, Portefeuille et Trajectoire ;
- en-tête mobile allégé, avec USD/EUR et actions regroupées derrière les trois points ;
- Shiba, messages contextuels et bandeau d’indices supprimés ;
- zones sûres iPhone et protections contre les zooms accidentels conservées.

## Synthèse

- patrimoine total remis au premier plan ;
- capital investi, plus-value et variation présentés comme trois mesures secondaires ;
- courbe patrimoniale conservée ;
- nouvelle allocation en anneau, regroupable par poche, compte ou actif ;
- septième élément et suivants regroupés sous « Autres » pour éviter le fouillis ;
- aperçu des comptes, de leur poids et de leur performance à la place des jalons automatiques.

## Portefeuille et trajectoire

- comptes, positions, recherche de ticker, achats, ventes, modifications, mouvements et prélèvements intégralement conservés ;
- trajectoire automatiquement fondée sur les comptes et positions existants ;
- réglages réduits à l’effort mensuel, l’horizon et la destination ;
- horizons rapides de 5, 10, 20 et 30 ans ;
- trois lectures : prudent, central et favorable ;
- hypothèses par poche disponibles dans un volet repliable ;
- objectifs personnels conservés, séparés des anciens jalons patrimoniaux.

## Données

- aucune table ajoutée, supprimée ou renommée ;
- aucune donnée existante modifiée par le déploiement ;
- robustesse des cotations, snapshots, authentification et mises à jour PWA de la version 1.1.0 conservée.

---

# Moobank 1.1.0 — mise à jour technique ciblée

Cette mise à jour ne lance aucune migration et ne modifie pas les lignes Supabase existantes lors du déploiement.

## Mise à jour de septembre 2026

- Interface et navigation conservées à l’identique
- Inscription retirée de l’écran de connexion et du JavaScript
- CSS extrait dans `assets/css/app.css`
- JavaScript séparé entre cœur technique, application et import d’historique
- Dépendance Supabase figée et installation GitHub reproductible avec `package-lock.json`
- Requêtes Yahoo mises en cache, dédupliquées, retentées et limitées en parallèle
- Snapshot alternant le proxy Cloudflare et Yahoo en direct en cas d'indisponibilité
- Conversion des cotations britanniques en pence corrigée dans l’application
- Snapshots partageant les cotations communes aux deux utilisateurs
- Activation des mises à jour PWA uniquement après validation de l’utilisateur
- Vérification automatique de la syntaxe et tests avant le snapshot quotidien

## Données et fiabilité

- Écritures ciblées ligne par ligne pour les comptes, positions et prélèvements
- Suppression de la synchronisation globale qui pouvait effacer des données depuis un onglet ancien
- Vérification systématique des erreurs renvoyées par Supabase
- Rétablissement compensatoire d'une position si l'historique de transaction échoue
- Blocage des doubles clics pendant les opérations critiques
- Suppressions locales uniquement après confirmation de la base
- Export JSON complet accessible depuis le menu utilisateur
- Prix de vente réellement exécuté, modifiable avant validation
- Actualisation déclarée réussie seulement si au moins un cours a été récupéré

## Interface

- Onglets renommés en « Comptes » et « Projections »
- Navigation principale fixe sur mobile
- Tableau mobile compact avec détails au toucher
- Allocation alignée sur les filtres actifs
- Historique, variation et jalons clairement signalés comme globaux
- Parcours guidé vers la création d'un compte avant la première position
- Compteur patrimonial corrigé pour le format numérique français
- Import CSV compatible avec espaces, virgules décimales et séparateurs usuels
- Bannière hors-ligne et encart de position existante réparés
- Zones sûres iOS, zoom autorisé, focus clavier et réduction des animations

## Snapshot et PWA

- Date calculée dans le fuseau Europe/Paris
- Conversion des cotations étrangères en EUR, y compris les pence britanniques
- Aucun snapshot partiel si un cours ou un taux manque
- Timeout et nouvelles tentatives sur Yahoo Finance
- Planification été/hiver corrigée
- Couleurs du manifest corrigées, icônes 192/512 ajoutées et service worker inclus

## Non inclus volontairement

La gestion automatique d'un solde espèces après achat ou vente nécessiterait une évolution du modèle de données. Elle n'est pas incluse dans ce lot sans migration.
