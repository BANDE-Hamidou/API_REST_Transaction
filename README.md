# API REST de transactions : Express.js, KNIME, Prometheus/Grafana

Projet *Développement à base de composants et services Web*, IBAM Master 1 SIE, 2026
**Groupe 5, Thème 6 (exercice 6)**

| Membre | Rôle |
|---|---|
| BANDE Hamidou | Données, base PostgreSQL, Docker Compose, intégration |
| SOMBIE Roseline | Workflow ETL KNIME |
| KOUMTOUBRE Davy | API REST Express.js et tests |
| BADO Lionel | Supervision Prometheus/Grafana et test de bout en bout |

## Ce que fait le projet

1. **Génère** 1010 transactions bancaires fictives, dont 64 anomalies bloquantes, 26 anomalies corrigeables et 10 doublons (`data/`).
2. **Contrôle et transforme** ces données avec un **workflow KNIME** : 946 valides, 64 rejetées avec leur motif.
3. **Charge** le résultat dans **PostgreSQL** (chargement idempotent et transactionnel).
4. Expose une **API REST Express.js** : 13 filtres, pagination, tri, création, modification, suppression, rejets, statistiques.
5. Expose les **métriques** de requêtes, d'erreurs et de temps de réponse (`/metrics`), collectées par **Prometheus** et affichées dans **Grafana**.
6. **Teste** la chaîne : tests unitaires et HTTP (Jest + Supertest), intégration PostgreSQL, collection Postman (Newman) et **test de bout en bout**. Aucune interface web n'est fournie, d'où le choix d'outils de test d'API plutôt que de Cypress.

## Architecture

```
générateur ──▶ transactions_brutes.csv ──▶ KNIME (poste local) ──▶ valides.csv + rejetees.csv
                                                                        │ chargeur (npm run load)
 ┌──────────────────────── Docker Compose ─────────────────────────────▼─────────┐
 │  PostgreSQL 16  ◀── SQL paramétré ──  API Express 5 (Node 22) :3000           │
 │                                          ▲ /metrics (toutes les 5 s)          │
 │                            Prometheus 2.55 :9090  ──▶  Grafana 11.4 :3001     │
 └────────────────────────────────────────────────────────────────────────────────┘
```
Détails : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · contrats entre composants : [`docs/CONTRATS.md`](docs/CONTRATS.md) · contrat d'API : [`api/openapi.yaml`](api/openapi.yaml).

## Prérequis

| Logiciel | Version | Pour qui |
|---|---|---|
| Windows 10/11 (ou Linux/macOS) | 64 bits, virtualisation activée | tous |
| Docker Desktop (WSL 2) | récent, avec `docker compose` v2 | tous |
| Node.js | **22 LTS ou plus** | tous (scripts de données, tests) |
| Git | 2.x | tous |
| KNIME Analytics Platform | 5.x | poste ETL (procédure distincte : [`docs/KNIME_WORKFLOW.md`](docs/KNIME_WORKFLOW.md)) |
| Postman | facultatif | démonstration |

> ⚠ Placez le projet dans un chemin **sans espace, sans accent et sans `&`**, par exemple `C:\projets\API_REST_Transaction`.
> Un `&` dans le chemin casse les commandes npm sous Windows.

## Installation et exécution (PowerShell, depuis la racine du projet)

```powershell
git clone https://github.com/BANDE-Hamidou/API_REST_Transaction.git
cd API_REST_Transaction
```

Le guide pas à pas pour débutants, avec les résultats attendus et les erreurs fréquentes, se trouve dans [`docs/INSTALLATION_WINDOWS.md`](docs/INSTALLATION_WINDOWS.md).

```powershell
# 1. Vérifier le poste
powershell -ExecutionPolicy Bypass -File scripts\verifier-prerequis.ps1

# 2. Démarrer PostgreSQL, l'API, Prometheus et Grafana (crée .env à partir de .env.example)
powershell -ExecutionPolicy Bypass -File scripts\demarrer.ps1

# 3. Exécuter le workflow KNIME (docs/KNIME_WORKFLOW.md), puis vérifier et charger sa sortie
npm run data:compare
powershell -ExecutionPolicy Bypass -File scripts\charger-donnees.ps1

# 4. Lancer tous les tests
powershell -ExecutionPolicy Bypass -File scripts\tester-tout.ps1
```

Sans PowerShell (Linux/macOS) : `cp .env.example .env && docker compose up -d --build`, puis
`docker compose exec api npm run load -- /data/processed`, puis `npm run test:e2e`.

| URL | Contenu |
|---|---|
| http://localhost:3000 | API (liste des routes) |
| http://localhost:3000/api/transactions?type=VIREMENT&limite=5 | exemple de filtre |
| http://localhost:3000/metrics | métriques Prometheus |
| http://localhost:9090/targets | Prometheus (cible `api-transactions` UP) |
| http://localhost:3001 | Grafana (`admin` / `admin`) → *Groupe 5 › API Transactions - Groupe 5* |

Arrêter : `scripts\arreter.ps1` (données conservées) · tout réinitialiser : `scripts\reinitialiser.ps1` (supprime les volumes).

## Tests et résultats attendus

| Commande | Résultat attendu |
|---|---|
| `npm run check` | cohérence entre SQL, KNIME, API, OpenAPI, Prometheus et Grafana : tous les contrôles réussis |
| `npm run test:data` | `pass 9` |
| `cd api; npm install; npm test` | `80 passed` (+ 9 tests d'intégration ignorés sans base) |
| `cd api; $env:TEST_DATABASE_URL="postgres://transactions:transactions@localhost:5432/transactions"; npm run test:integration` | `9 passed` |
| `npm run data:compare` | `CONFORME : 946 valides, 64 rejetées` |
| `npm run test:e2e` (pile démarrée, données chargées) | `pass 7` |
| `npx newman run tests/postman/API_Transactions_G5.postman_collection.json -e tests/postman/local.postman_environment.json` | 15 requêtes, 0 échec |

Les résultats réellement obtenus et ce qui reste à vérifier sont dans [`docs/RAPPORT_TESTS.md`](docs/RAPPORT_TESTS.md).

## Organisation du dépôt

```
api/                 API Express : src/, tests/, Dockerfile, openapi.yaml
data/scripts/        générateur, règles (miroir de KNIME), ETL de référence, comparateur
data/raw/            données brutes générées + manifeste des anomalies
data/expected/       résultat attendu de l'ETL (oracle)
data/processed/      sortie du workflow KNIME (non versionnée)
db/init/             schéma SQL (exécuté automatiquement par PostgreSQL)
knime/               workflow KNIME exporté (.knwf)
monitoring/          configurations Prometheus et Grafana (provisioning + tableau de bord)
tests/e2e/           test de bout en bout de la chaîne
tests/postman/       collection et environnement Postman
scripts/             scripts PowerShell (démarrer, charger, tester…) et générateur de trafic
docs/                exigences, architecture, installation, KNIME, plan d'équipe, démonstration, tests
docs/captures/       captures d'écran (preuves)
rapport/             rapport du projet (LaTeX : `tectonic main.tex` ou Overleaf)
```

## Documentation

| Document | Pour |
|---|---|
| [`docs/EXIGENCES.md`](docs/EXIGENCES.md) | exigences du sujet, couverture, hypothèses |
| [`docs/INSTALLATION_WINDOWS.md`](docs/INSTALLATION_WINDOWS.md) | installation pas à pas, erreurs fréquentes |
| [`docs/KNIME_WORKFLOW.md`](docs/KNIME_WORKFLOW.md) | construction du workflow KNIME, nœud par nœud |
| [`docs/PLAN_EQUIPE.md`](docs/PLAN_EQUIPE.md) | répartition, procédure Git, revue croisée |
| [`docs/GUIDE_EXECUTION_EQUIPE.md`](docs/GUIDE_EXECUTION_EQUIPE.md) | parcours d'exécution avec points d'arrêt |
| [`docs/SCENARIO_DEMO.md`](docs/SCENARIO_DEMO.md) | démonstration, plan de présentation, questions probables |
| [`docs/RAPPORT_TESTS.md`](docs/RAPPORT_TESTS.md) | tests exécutés et résultats |
| [`rapport/`](rapport/) | rapport du projet (LaTeX) |

## État du livrable

- **Fait et testé** : générateur et règles, workflow KNIME (`knime/transactions_etl.knwf`, sortie `CONFORME : 946 valides, 64 rejetées`), schéma PostgreSQL, chargeur idempotent, API Express, métriques, Prometheus et Grafana, tests, documentation, rapport, présentation.
- **Résultats obtenus sous Docker** (poste de BANDE, 28-29/10/2026) : `npm run test:data` pass 9 ; `npx jest` 80 passed ; `npm run test:integration` 9 passed ; Newman 15/15 ; `npm run test:e2e` pass 7. Détail : [`docs/RAPPORT_TESTS.md`](docs/RAPPORT_TESTS.md).
- **Reste à vérifier** : les scripts PowerShell (`scripts/*.ps1`) sur un poste Windows avec Docker.

Données entièrement fictives. Aucun secret réel : `.env.example` ne contient que des valeurs de développement.
