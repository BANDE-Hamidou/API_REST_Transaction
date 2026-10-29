# Rapport de tests

Légende : ✅ **testé et réussi** · ❌ **testé et échoué** · ⬜ **non exécuté** · 🖐 **test manuel restant à réaliser**

## 1. Environnement de la préparation (28 octobre 2026)

Poste Windows 11 Pro, Node.js 24.16.0, npm 11.13.0. **Docker et KNIME n'étaient pas installés.**
Pour tester malgré tout la chaîne réelle, les mêmes versions de serveurs ont été lancées **hors Docker** :

| Service | Utilisé pour les tests | Prévu dans `docker-compose.yml` |
|---|---|---|
| PostgreSQL | 16.14 (paquet `embedded-postgres`, port 54329) | image `postgres:16-alpine` |
| API | `node src/server.js` (Node 24) | image `node:22-alpine` |
| Prometheus | binaire Windows officiel 2.55.1 | image `prom/prometheus:v2.55.1` |
| Grafana | binaire Windows officiel 11.4.0 | image `grafana/grafana:11.4.0` |

Seules différences de configuration pendant ces tests : adresses `localhost` au lieu des noms de services Docker
(`api:3000` → `localhost:3000`, `http://prometheus:9090` → `http://127.0.0.1:9090`) et chemins des dossiers montés.
Les fichiers `prometheus.yml`, `alert_rules.yml`, la source de données et le tableau de bord Grafana du dépôt ont été utilisés tels quels par ailleurs.

## 2. Résultats

| # | Test | Commande | Résultat obtenu | Poste de préparation | Poste de l'équipe (à remplir) |
|---|---|---|---|---|---|
| T1 | Tests des données et des règles KNIME (miroir JS) | `npm run test:data` | `pass 9, fail 0` | ✅ | ⬜ |
| T2 | Génération déterministe | `npm run data:generate` | 1010 lignes ; 64 rejets attendus ; 26 corrigeables | ✅ | ⬜ |
| T3 | ETL de référence | `npm run data:reference` | 946 valides, 64 rejetées, 18 motifs | ✅ | ⬜ |
| T4 | Tests unitaires + API (Jest, Supertest, dépôt en mémoire) | `cd api; npm test` | `Tests: 9 skipped, 80 passed, 89 total` | ✅ | ⬜ |
| T5 | Tests d'intégration PostgreSQL 16 réel | `npm run test:integration` (`TEST_DATABASE_URL` défini) | `Tests: 9 passed` | ✅ | ⬜ |
| T6 | Couverture de code API | `npm run test:coverage` (avec base) | 93,05 % instructions · 86,25 % branches · 91,86 % fonctions | ✅ | ⬜ |
| T7 | Chargement + idempotence | `node src/scripts/load-csv.js ../data/expected` × 2 | 946 insérées / 64 rejets, puis 0 insérée / 946 mises à jour | ✅ | ⬜ |
| T8 | Syntaxe de la configuration Prometheus | `promtool check config` / `check rules` | `SUCCESS` ; 3 règles | ✅ | ⬜ |
| T9 | Les 15 requêtes PromQL du tableau de bord | requêtes envoyées à Prometheus 2.55.1 après trafic | 15/15 acceptées, toutes renvoient des séries | ✅ | ⬜ |
| T10 | Provisioning Grafana | Grafana 11.4.0 avec les fichiers du dépôt | source `prometheus` + tableau de bord `g5-api-transactions` créés automatiquement | ✅ | ⬜ |
| T11 | **Test de bout en bout** (7 étapes) | `npm run test:e2e` | `pass 7, fail 0, skipped 0` | ✅ | ⬜ |
| T12 | Collection Postman | `newman run …` | 15 requêtes, 15 assertions, 0 échec | ✅ | ⬜ |
| T13 | Panne réelle de PostgreSQL | arrêt de PostgreSQL pendant que l'API tourne | `/health` 200, `/health/ready` 503, `/api/transactions` 503 `BASE_INDISPONIBLE` ; retour à 200 **sans redémarrer l'API** ; 503 comptés `error_type="serveur"` | ✅ | 🖐 (`docker compose stop postgres`) |
| T14 | Cohérence entre composants | `npm run check` | tous les contrôles réussis, sauf `.knwf` signalé « A FAIRE » | ✅ | ⬜ |
| T15 | Validation du fichier PowerPoint | validateur OOXML + rendu LibreOffice | « All validations PASSED », 12 diapositives inspectées | ✅ | 🖐 ouvrir dans PowerPoint |
| T16 | Règles KNIME documentées (simulation JS de la sémantique Rule Engine) | script de simulation | 956/54 puis 946/10 ; 0 écart de champ ; motifs identiques | ✅ (simulation, **pas** KNIME) | — |
| T17 | **Workflow KNIME réel** | exécution dans KNIME + `npm run data:compare` | — | ⬜ **KNIME absent** | 🖐 Roseline |
| T18 | **`docker compose up -d --build`** | `scripts\demarrer.ps1` | — | ⬜ **Docker absent** | 🖐 tous |
| T19 | Build de l'image API (`Dockerfile`, `npm ci`) | inclus dans T18 | — | ⬜ | 🖐 |
| T20 | Healthchecks Docker (`pg_isready`, `wget /health`) | `docker compose ps` → `(healthy)` | — | ⬜ | 🖐 |
| T21 | Scripts PowerShell (`demarrer`, `charger-donnees`, `arreter`, `reinitialiser`, `tester-tout`) | exécution réelle | analyse syntaxique PowerShell 5.1 sans erreur ; **non exécutés** (ils pilotent Docker) | ⬜ | 🖐 |
| T22 | Chargement **via le conteneur** (`docker compose exec api npm run load -- /data/processed`) | `scripts\charger-donnees.ps1` | — | ⬜ | 🖐 |
| T23 | Installation sur machine neuve en suivant le README | — | — | ⬜ | 🖐 un membre qui n'a pas participé |
| T24 | Affichage visuel du tableau de bord Grafana | navigateur | requêtes vérifiées (T9) mais rendu des panneaux **non regardé** | ⬜ | 🖐 Lionel |

Aucun résultat de cette page n'est estimé : chaque ✅ correspond à une commande réellement exécutée le 28/10/2026.

## 3. Détail des suites automatisées

| Suite | Fichier | Tests | Ce qui est vérifié |
|---|---|---:|---|
| Données | `data/tests/data.test.js` | 9 | déterminisme ; **chaque anomalie injectée produit le motif attendu** ; 17 règles une par une ; normalisation ; doublons ; CSV ; comparateur |
| Validation | `api/tests/unit/validation.test.js` | 42 | corps POST/PATCH (16 cas refusés), paramètres de requête (12 cas refusés), dates réelles, catégories |
| SQL | `api/tests/unit/queryBuilder.test.js` | 5 | paramètres `$n`, tentative d'injection, liste blanche du tri, pagination |
| Chargeur | `api/tests/unit/loader.test.js` | 5 | conversion des types KNIME, revalidation, doublons, catégorie recalculée, BOM |
| API HTTP | `api/tests/api/transactions.test.js` | 28 | codes 200/201/204/400/404/409/503, filtres, pagination, `Location`, JSON invalide, métriques exposées |
| Intégration | `api/tests/integration/postgres.test.js` | 9 | schéma réel, chargement, idempotence, contraintes CHECK, filtres SQL = calcul direct sur le fichier, pagination stable, CRUD, non-écrasement des données API |
| Bout en bout | `tests/e2e/chaine-complete.test.js` | 7 | API+base → données KNIME chargées et conformes → filtres → écritures et erreurs → `/metrics` → Prometheus → Grafana |
| Postman | `tests/postman/…collection.json` | 15 | scénario de démonstration |

## 4. Scénario de bout en bout démontré
```
transactions_brutes.csv (1010) ─ règles KNIME ─▶ 946 valides + 64 rejetées
   ─ chargement ─▶ PostgreSQL (946 + 64, journal chargements)
   ─ API ─▶ filtres corrects, CRUD, erreurs 400/404/409
   ─ /metrics ─▶ Prometheus (cible UP, créations et erreurs comptées, p95 calculable, 3 alertes chargées)
   ─ Grafana ─▶ source Prometheus opérationnelle, tableau de bord de 13 panneaux
```
Sur le poste de préparation, les données chargées étaient celles de l'ETL de référence (`data/expected`), **pas** une sortie KNIME.
Lorsque le chargement provient de `data/processed`, le test E2E n°2 compare en plus automatiquement la sortie KNIME au résultat attendu.

## 5. Constats faits pendant les tests (et corrigés)
- Un chemin contenant `&` (`…DeveloppementComposants&ServiceWeb…`) **casse les commandes npm** sous Windows → consigne de cloner dans `C:\projets\` (`INSTALLATION_WINDOWS.md`) et contrôle dans `verifier-prerequis.ps1`.
- `node --test <dossier>` n'est plus accepté par Node 24 → motifs `"…/*.test.js"` (Node ≥ 22 requis).
- `/health/ready` renvoyait un `detail` vide lors d'un refus de connexion IPv4+IPv6 → le code d'erreur est désormais renvoyé.
- `regexReplace(…, "$3-$2-$1")` est risqué dans le nœud *String Manipulation* de KNIME (`$…$` = colonne) → conversion des dates par `substr` + *Rule Engine*.
- npm signale `prom-client` comme remplacé par `@prometheus-io/client` (publié en août 2026, version 0.x) : `prom-client` 15.1.3 est conservé, fonctionnel et testé.

## 6. Modèle pour le poste de l'équipe
Remplir la colonne « Poste de l'équipe » du § 2 avec ✅/❌, la date, le nom et, en cas d'échec, l'extrait d'erreur, par exemple :
`T18 ✅ 29/10 Lionel : 4 conteneurs Up (healthy) en 6 min`.
