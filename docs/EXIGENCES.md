# Analyse du cahier des charges

Sources officielles : `PROJET_DEV_COMPOSANT_2026_IBAM.pdf` (consignes générales + exercice 6) et
`REPARTITION_THEMES_PROJET_2026.pdf` (SIE, Groupe 5, thème 6, 19 au 29 octobre 2026, présentation entre le 29 et le 30 octobre).

## 1. Exigences OBLIGATOIRES et leur couverture

### 1.1 Consignes communes à tous les groupes

| # | Exigence (texte officiel) | Où c'est couvert | État |
|---|---|---|---|
| G1 | Dépôt Git **public** | dépôt GitHub du groupe | ⚠ à vérifier : visibilité *Public* |
| G2 | Code source et fichiers de dépendances | `api/src`, `api/package.json` + `package-lock.json`, `data/scripts`, `package.json` | ✅ |
| G3 | Scripts de création et d'initialisation des bases | `db/init/01_schema.sql` (auto), `api/src/scripts/load-csv.js`, `data/` | ✅ |
| G4 | Configurations, workflows et contrats d'API | `docker-compose.yml`, `monitoring/`, `knime/` (workflow), `api/openapi.yaml`, `docs/CONTRATS.md` | ⚠ `knime/transactions_etl.knwf` à exporter depuis KNIME |
| G5 | README.md : architecture, prérequis, procédure d'installation | `README.md` + `docs/ARCHITECTURE.md`, `docs/INSTALLATION_WINDOWS.md` | ✅ |
| G6 | Tests et résultats attendus | `api/tests`, `data/tests`, `tests/e2e`, `tests/postman`, `data/expected/`, `docs/RAPPORT_TESTS.md` | ✅ |
| G7 | Présentation PowerPoint | `presentation/` | ✅ (à personnaliser) |
| G8 | Installation reproductible sur machine neuve ; Docker Compose avec configs, volumes, données de test | `docker-compose.yml` (4 services, 3 volumes), `data/raw` versionné | ✅ ⚠ jamais exécuté sous Docker pendant la préparation (Docker absent) |
| G9 | Procédure distincte pour les outils à installation particulière | `docs/KNIME_WORKFLOW.md`, `docs/INSTALLATION_WINDOWS.md` § KNIME | ✅ |
| G10 | Au moins un scénario fonctionnel réussi + un test de bout en bout de la chaîne principale | `tests/e2e/chaine-complete.test.js`, `docs/SCENARIO_DEMO.md` | ✅ |
| G11 | Envoi à kyfadeloumar@gmail.com, objet `[PROJET_DEV_COMPOSANT_2026]` | action de l'équipe | ⬜ à faire |

### 1.2 Exercice 6 : API REST de transactions avec Express.js, KNIME et Prometheus/Grafana

| # | Travail demandé | Réalisation | État |
|---|---|---|---|
| E1 | Générer des transactions bancaires fictives | `data/scripts/generate-transactions.js` : 1000 transactions + 10 doublons, 64 anomalies bloquantes, 26 corrigeables | ✅ testé |
| E2 | Workflow KNIME pour contrôler et transformer | spécification nœud par nœud (`docs/KNIME_WORKFLOW.md`) + oracle + comparateur | ⚠ **à construire dans KNIME** |
| E3 | API REST et ses filtres | 13 filtres, pagination, tri, CRUD, statistiques, rejets | ✅ testé |
| E4 | Exposer les métriques de requêtes, d'erreurs et de temps de réponse | `http_requests_total`, `http_request_errors_total`, `http_request_duration_seconds` | ✅ testé |
| E5 | Configurer Prometheus et Grafana | `monitoring/` provisionné automatiquement | ✅ testé hors Docker |
| E6 | Cypress si interface web fournie ; sinon outil adapté aux tests API | pas d'interface web → Jest + Supertest, Newman (Postman), test E2E `node:test` | ✅ testé |

## 2. Hypothèses retenues (points non précisés par l'énoncé)

| Point ambigu | Hypothèse retenue | Risque | Parade |
|---|---|---|---|
| Base de données non imposée | PostgreSQL 16 | l'enseignant attendait une autre base | justification dans `ARCHITECTURE.md` ; le dépôt est isolé (changement localisé) |
| « API REST et ses filtres » : quelles opérations ? | consultation filtrée + CRUD complet (POST/PATCH/DELETE) | travail en plus, sans risque | opérations d'écriture testées |
| Où KNIME écrit-il ? | CSV dans `data/processed/`, puis chargeur idempotent | « KNIME doit écrire dans la base » | variante DB Writer documentée (`KNIME_WORKFLOW.md` § 7) |
| Volume de données | 1010 lignes | trop peu pour une démo de charge | `--nombre 50000` possible au générateur |
| Interface web | aucune (non demandée) | — | Cypress explicitement non requis (énoncé) |
| Authentification | aucune | question de sécurité à l'oral | expliquer : hors périmètre ; piste JWT/API key (voir `SCENARIO_DEMO.md`) |
| Devise | XOF majoritaire + EUR/USD | — | — |
| Date limite | dépôt avant la présentation (29-30 octobre) | décalage entre consigne (30) et document (29) | **viser le 29 octobre** |
| Nombre de membres | 4 (document officiel : 5) | répartition | signaler à l'enseignant ; `docs/PLAN_EQUIPE.md` |

## 3. Améliorations facultatives (réalisées, non exigées)
- Oracle ETL et comparateur automatique de la sortie KNIME.
- Manifeste des anomalies injectées (vérification ligne par ligne).
- Revalidation au chargement, idempotence, journal `chargements`, endpoint `/api/chargements/dernier`.
- Rejets consultables via l'API (`/api/rejets`, `/api/rejets/statistiques`).
- Statistiques par type et devise.
- Contrat OpenAPI 3.0.
- Règles d'alerte Prometheus, métrique métier `transactions_operations_total`.
- Tests d'intégration PostgreSQL réels, collection Postman/Newman, générateur de trafic de démonstration.
- `npm run check` : contrôle automatique de cohérence entre composants.

## 4. Améliorations possibles (non réalisées)
- Exécution du workflow KNIME en ligne de commande (mode *batch*) planifiée.
- Authentification (clé d'API ou JWT) et limitation de débit.
- Alertmanager pour notifier les alertes ; journaux centralisés (Loki).
- Migration de `prom-client` vers `@prometheus-io/client` (paquet successeur publié en août 2026, encore en version 0.x).
