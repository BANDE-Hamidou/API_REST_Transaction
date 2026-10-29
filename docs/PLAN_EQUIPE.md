# Plan d'équipe : Groupe 5 (4 membres)

## 0. Situation de départ (28 octobre 2026)

Le projet complet (code, configurations, tests, documentation) a été préparé puis **vérifié** (voir `RAPPORT_TESTS.md`).
Il sert de **dossier de référence**. Le dépôt GitHub (https://github.com/BANDE-Hamidou/API_REST_Transaction) a été rempli à partir de ce dossier,
**étape par étape**, chaque membre ajoutant ses propres fichiers sur sa branche, avec un test et un relecteur
(procédure : § 4 et `GUIDE_EXECUTION_EQUIPE.md` étape 0). Le seul composant construit pendant le projet est le workflow KNIME.

Chaque membre doit pouvoir expliquer **son** composant **et** faire tourner **toute** la chaîne.

## 1. Répartition

| Membre | Rôle | Fichiers dont il/elle est responsable |
|---|---|---|
| **BANDE Hamidou** | Données, base, intégration, dépôt Git | `data/scripts/*`, `data/raw/*`, `data/expected/*`, `db/init/01_schema.sql`, `docker-compose.yml`, `.env.example`, `api/src/scripts/load-csv.js`, `scripts/*.ps1`, `README.md` |
| **SOMBIE Roseline** | Workflow KNIME | `knime/transactions_etl.knwf` (à créer), `knime/README.md`, `docs/KNIME_WORKFLOW.md`, `data/processed/*` (sortie), captures `docs/captures/knime_*` |
| **KOUMTOUBRE Davy** | API REST Express.js | `api/src/**` (sauf `metrics/` et `scripts/`), `api/openapi.yaml`, `api/tests/unit/*`, `api/tests/api/*`, `api/tests/integration/*`, `tests/postman/*` |
| **BADO Lionel** | Supervision et test de bout en bout | `api/src/metrics/metrics.js`, `monitoring/**`, `tests/e2e/*`, `scripts/generer-trafic.js`, `docs/RAPPORT_TESTS.md`, `docs/SCENARIO_DEMO.md` |

Documents communs : `docs/EXIGENCES.md`, `docs/ARCHITECTURE.md`, `docs/CONTRATS.md`, `presentation/`.

## 2. Fiches individuelles

### 2.1 BANDE Hamidou : données, base de données, intégration
**Prérequis** : Node ≥ 22, Git, Docker Desktop ; droits *Admin* sur le dépôt GitHub.

| # | Tâche | Commandes (📁 `<PROJET>`) | Résultat attendu |
|---|---|---|---|
| H1 | Créer le dépôt public et faire le premier commit (`.gitignore`, `.env.example`, `package.json`) | voir `GUIDE_EXECUTION_EQUIPE.md` étape 0 | dépôt public, 3 membres invités |
| H2 | Régénérer et vérifier les données | `npm run data:generate` · `npm run data:reference` · `npm run test:data` | `1010 lignes`, `946 valides, 64 rejetées`, `pass 9` |
| H3 | Démarrer la base et vérifier le schéma | `scripts\demarrer.ps1` · `docker compose exec postgres psql -U transactions -c "\d transactions"` | contraintes `CHECK` affichées |
| H4 | Charger (après KNIME) et prouver l'idempotence | `scripts\charger-donnees.ps1` deux fois | 946 insérées, puis 0 insérée / 946 mises à jour |
| H5 | Vérifier la cohérence globale | `npm run check` | *Tous les contrôles de cohérence sont réussis* |
| H6 | Veiller à l'ordre des fusions (faites par les relecteurs), tenir le README à jour | voir § 4 | `main` toujours fonctionnelle |

**Tests à effectuer** : H2 ; `SELECT motif_rejet, COUNT(*) FROM transactions_rejetees GROUP BY 1;` (18 motifs) ;
tentative d'INSERT invalide refusée (`docker compose exec postgres psql -U transactions -c "INSERT INTO transactions (reference, compte_source, type, montant, date_transaction, statut, canal, categorie_montant) VALUES ('TXN-999999','CPT10000001','DEPOT',-5,'2026-01-01','EFFECTUEE','GAB','FAIBLE');"` → `violates check constraint`).

**Preuves à capturer** : sortie du générateur ; `\dt` + `\d transactions` ; double chargement (idempotence) ; INSERT refusé ; `npm run check`.

**Point de contrôle avant intégration** : `npm run test:data` et `npm run check` verts ; le CSV brut n'a pas changé (sinon prévenir Roseline : le résultat attendu change).

**À savoir défendre** : pourquoi un générateur déterministe ; anomalies bloquantes vs corrigeables ; contraintes `CHECK` ; `ON CONFLICT` ; transaction SQL du chargement.

### 2.2 SOMBIE Roseline : workflow KNIME
**Prérequis** : KNIME Analytics Platform 5.x, Node ≥ 22 (pour `npm run data:compare`), le dépôt cloné dans `C:\projets\…`.

| # | Tâche | Commandes / actions | Résultat attendu |
|---|---|---|---|
| R1 | Installer KNIME | `INSTALLATION_WINDOWS.md` étape 7 | KNIME s'ouvre |
| R2 | Construire les nœuds 1 à 9 (normalisation + contrôles) | `KNIME_WORKFLOW.md` § 4 | nœud 9 : 1010 lignes avec `motif_rejet` |
| R3 | Nœuds 10 à 13 (séparation, doublons) | idem | 956/54 puis 946/10 |
| R4 | Nœuds 14 à 23 (enrichissement, écriture, synthèse) | idem | 2 CSV dans `data\processed` |
| R5 | Vérifier la sortie | 📁 `<PROJET>` : `npm run data:compare` | `CONFORME : 946 valides, 64 rejetées` |
| R6 | Exporter et versionner | `KNIME_WORKFLOW.md` § 9 | `knime/transactions_etl.knwf` dans le dépôt |

**Tests à effectuer** : R5 ; contrôle visuel du nœud 23 (18 motifs) ; ouvrir `data/raw/anomalies_injectees.json` et vérifier 2 ou 3 lignes « corrigeables » (ex. date française) dans la sortie valide.

**Preuves à capturer** : workflow complet (nœuds verts) ; configuration du nœud 9 ; table du nœud 23 ; `npm run data:compare` → CONFORME.

**Point de contrôle avant intégration** : `CONFORME` ; le `.knwf` s'ouvre sur un autre poste (le tester chez Hamidou : *File › Import KNIME Workflow*).

**À savoir défendre** : ordre des règles (première règle vraie) ; différence normalisation / rejet ; détection des doublons (1re occurrence gardée) ; pourquoi des CSV + chargeur plutôt qu'un DB Writer.

### 2.3 KOUMTOUBRE Davy : API REST Express.js
**Prérequis** : Node ≥ 22, Docker Desktop, Postman (facultatif).

| # | Tâche | Commandes (📁 `<PROJET>\api`) | Résultat attendu |
|---|---|---|---|
| D1 | Installer les dépendances | `npm install` | `added … packages` sans erreur |
| D2 | Tests unitaires + API | `npm test` | `Tests: 80 passed` (+ 9 *skipped* d'intégration) |
| D3 | Tests d'intégration sur PostgreSQL (pile démarrée) | `$env:TEST_DATABASE_URL="postgres://transactions:transactions@localhost:5432/transactions"; npm run test:integration` | `Tests: 9 passed` |
| D4 | Jouer la collection Postman | Postman › *Import* › `tests/postman/*.json` (collection + environnement) › *Run collection* — ou `npx newman run ..\tests\postman\API_Transactions_G5.postman_collection.json -e ..\tests\postman\local.postman_environment.json` | 15 requêtes, 15 assertions OK |
| D5 | Vérifier le contrat | coller `api/openapi.yaml` dans https://editor.swagger.io | aucune erreur de syntaxe |

**Tests manuels** (navigateur ou Postman) : `GET /api/transactions?type=VIREMENT&statut=EFFECTUEE`, `?date_debut=2026-03-01&date_fin=2026-03-31`, `?montant_min=1000000&tri=montant&ordre=desc`, `?tpye=DEPOT` (400), `GET /api/transactions/TXN-000000` (404), POST en double (409).

**Preuves à capturer** : `npm test` ; `npm run test:integration` ; Postman *Runner* (15/15) ; une réponse filtrée ; une réponse 400 avec `details`.

**Point de contrôle avant intégration** : `npm test` vert ; toute modification de route reportée dans `openapi.yaml` **et** `CONTRATS.md`.

**À savoir défendre** : architecture en couches (route → validation → dépôt) ; requêtes paramétrées (injection SQL) ; liste blanche du tri ; pagination stable ; codes HTTP 400/404/409/503 ; PATCH avec revalidation complète ; pourquoi Express 5.

### 2.4 BADO Lionel : supervision et test de bout en bout
**Prérequis** : Docker Desktop, Node ≥ 22.

| # | Tâche | Commandes (📁 `<PROJET>`) | Résultat attendu |
|---|---|---|---|
| L1 | Vérifier la cible Prometheus | http://localhost:9090/targets | `api-transactions` **UP** |
| L2 | Tester les requêtes PromQL | http://localhost:9090/graph : `sum(rate(http_requests_total[1m]))` | une courbe |
| L3 | Générer du trafic | `npm run demo:traffic -- --duree 120 --rps 5` | réponses 200/201/400/404/409 |
| L4 | Vérifier le tableau de bord | http://localhost:3001 → *Groupe 5 › API Transactions* | 13 panneaux alimentés |
| L5 | Test de bout en bout | `npm run test:e2e` | `pass 7`, `fail 0` |
| L6 | Démontrer une panne | `docker compose stop postgres` → recharger `/api/transactions` (503) → observer Grafana → `docker compose start postgres` | 503 visibles dans *Erreurs par code HTTP*, retour à la normale |
| L7 | Mettre à jour `RAPPORT_TESTS.md` | colonne « Poste de l'équipe » | résultats réels datés |

**Preuves à capturer** : Prometheus *Targets* UP ; Prometheus *Alerts* (3 règles) ; tableau de bord Grafana sous trafic ; Grafana pendant la panne ; sortie de `npm run test:e2e`.

**Point de contrôle avant intégration** : `npm run test:e2e` vert ; `npm run check` vert (les métriques utilisées dans Grafana existent).

**À savoir défendre** : *pull* vs *push* ; Counter / Gauge / Histogram ; `rate()` ; `histogram_quantile` ; pourquoi le label `route` est un modèle ; différence `/health` et `/health/ready` ; provisioning Grafana.

## 3. Contrats communs
Voir **`docs/CONTRATS.md`** (données, fichiers CSV, API, métriques). Règle : *celui qui modifie un contrat prévient les consommateurs
avant de pousser* (données → Roseline et Davy ; API → Lionel ; métriques → Lionel).

## 4. Procédure Git à quatre

Branche principale : `main`, **toujours fonctionnelle**. Seul le premier commit a été fait directement sur `main`.

Une branche **par étape**, nommée `prenom/tache` (exemples : `hamidou/donnees`, `davy/api-validation`, `roseline/knime-workflow`).

Cycle de travail d'une étape (Git Bash, `REF` = dossier de référence) :
```bash
git switch main && git pull
git switch -c roseline/knime-workflow
cp $REF/... ...                              # copier SES fichiers depuis la référence
# ... lancer le test de l'étape ...
git status                                   # seuls mes fichiers apparaissent
git add knime/transactions_etl.knwf          # jamais git add .
git commit -m "feat(knime): workflow de controle et de transformation"
git push -u origin roseline/knime-workflow
```
Puis sur GitHub : **Compare & pull request** → base `main` → relecteur désigné (§ 5), sortie du test collée dans la description.

**Fusion** : c'est le **relecteur** qui fusionne, après avoir rejoué le test et approuvé (*Create a merge commit*, jamais
*Squash*, qui effacerait l'auteur des commits). L'auteur ne fusionne pas sa propre pull request, sauf exception motivée
par écrit dans la pull request. Les fusions suivent l'ordre des étapes ; Hamidou veille à cet ordre.

**Travail en parallèle** : chaque fichier appartient à une seule étape, donc deux branches n'entrent jamais en conflit.
Pour tester avant que l'étape dont on dépend soit fusionnée, on emprunte les fichiers manquants à la référence
(`cp -rn $REF/. .`), sans jamais les commiter, puis on les retire (`git clean -fd`).

Messages de commit : `type(partie): description` avec `type` ∈ `feat` (ajout), `fix` (correction), `docs`, `test`, `chore` (configuration).

Ne jamais commiter : `.env`, `node_modules/`, l'espace de travail KNIME, les sorties `data/processed/*.csv` (déjà exclus par `.gitignore`).

## 5. Revue croisée (chacun relit le composant qu'il consomme)

| Auteur | Relecteur | Ce que le relecteur vérifie (et exécute) |
|---|---|---|
| Hamidou (données, schéma) | **Roseline** | colonnes et formats conformes au contrat ; `npm run test:data` |
| Roseline (KNIME) | **Hamidou** | ouvre le `.knwf`, l'exécute sur son poste, `npm run data:compare` → CONFORME, chargement |
| Davy (API) | **Lionel** | `npm test` ; Postman 15/15 ; les routes apparaissent bien dans les métriques |
| Lionel (supervision, E2E) | **Davy** | Prometheus UP ; tableau de bord ; `npm run test:e2e` sur son poste |

Le relecteur laisse un commentaire *Approve* sur la pull request avec la sortie des commandes (copier-coller).

## 6. Déroulement réel

| Quand | Ce qui a été fait |
|---|---|
| 28/10 soir | dépôt créé ; données (Hamidou) ; chargeur, base et Docker (Hamidou) ; documentation KNIME (Roseline) |
| 29/10 | API (Davy) ; métriques, Prometheus, Grafana et test de bout en bout (Lionel) ; workflow KNIME (Roseline) ; tests d'intégration, Postman et test de bout en bout sous Docker (pass 7) ; scripts PowerShell ; rapport LaTeX |
| Avant l'oral | test des scripts PowerShell sous Windows ; répétition de `SCENARIO_DEMO.md` sur le PC de présentation ; tag `v1.0` ; mail |
