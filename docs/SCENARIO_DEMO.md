# Scénario de démonstration et plan de présentation

Durée cible : **15 min** au total = **6 min de présentation** (diapositives) + **8 min de démonstration** + 1 min de conclusion,
puis questions. Adapter si l'enseignant impose une autre durée (la démo seule tient en 5 min en sautant les étapes ★).

## 1. Préparation (avant d'entrer dans la salle)
📁 `<PROJET>`, PC de présentation, **30 min avant** :
```powershell
powershell -ExecutionPolicy Bypass -File scripts\demarrer.ps1
powershell -ExecutionPolicy Bypass -File scripts\charger-donnees.ps1
npm run test:e2e                                  # doit afficher pass 7
```
Onglets ouverts dans le navigateur, dans cet ordre :
1. http://localhost:3000
2. http://localhost:3000/api/transactions?type=VIREMENT&statut=EFFECTUEE&limite=3
3. http://localhost:3000/api/rejets/statistiques
4. http://localhost:9090/targets
5. http://localhost:3001/d/g5-api-transactions (connecté, intervalle *Last 15 minutes*, rafraîchissement 5 s)

Applications ouvertes : KNIME (workflow exécuté, nœud 23 affiché), Postman (collection importée), deux fenêtres PowerShell dans `<PROJET>`.
Plan B si le réseau ou Docker pose problème : captures dans `docs/captures/` + diapositives de secours.

## 2. Plan de présentation (une partie par membre)

| Ordre | Qui | Durée | Contenu | Diapositives |
|---|---|---|---|---|
| 1 | **BANDE Hamidou** | 2 min | contexte, objectifs, architecture, données générées et anomalies | titre, sommaire, architecture, données |
| 2 | **SOMBIE Roseline** | 2 min 30 | workflow KNIME : normalisation, 18 contrôles, doublons, enrichissement ; résultat 946 / 64 | KNIME (2) |
| 3 | **KOUMTOUBRE Davy** | 2 min 30 | API : routes, filtres, pagination, validation, erreurs, sécurité SQL | API (2) |
| 4 | **BADO Lionel** | 2 min 30 | métriques, Prometheus, Grafana, tests (unitaires → bout en bout) | supervision, tests |
| 5 | Hamidou | 1 min | installation reproductible, limites, conclusion | conclusion |

La démonstration (§ 3) est menée **par le membre responsable de chaque partie**.

## 3. Démonstration (8 min)

| # | Qui | Écran | Action / commande | Ce qu'on dit | Résultat attendu |
|---|---|---|---|---|---|
| 1 | Hamidou | PowerShell | `docker compose ps` | « 4 composants conteneurisés ; KNIME tourne sur le poste. » | 4 services `Up` |
| 2 | Hamidou ★ | PowerShell | `Get-Content data\raw\transactions_brutes.csv -TotalCount 5` puis ouvrir `data\raw\anomalies_injectees.json` | « 1010 lignes, 64 anomalies bloquantes et 26 corrigeables injectées volontairement. » | aperçu CSV |
| 3 | Roseline | KNIME | montrer le workflow, ouvrir le nœud 9 (règles), puis la sortie du nœud 23 | « Première règle vraie = motif. Les doublons sont détectés après les contrôles. » | 18 motifs |
| 4 | Roseline | PowerShell | `npm run data:compare` | « La sortie KNIME est vérifiée automatiquement contre le résultat attendu. » | `CONFORME` |
| 5 | Hamidou ★ | PowerShell | `scripts\charger-donnees.ps1` (2e exécution) | « Rechargement idempotent : 0 insertion, aucun doublon. » | `inserees: 0` |
| 6 | Davy | Navigateur, onglet 2 | filtres type + statut | « Filtres combinables, pagination, tri. » | JSON + `pagination` |
| 7 | Davy | Postman | *Run collection* | « 15 requêtes, dont les erreurs 400, 404 et 409 attendues. » | 15/15 vert |
| 8 | Davy | Postman | POST invalide (dossier 4) | « Toutes les erreurs de validation en une réponse, par champ. » | 400 + `details` |
| 9 | Lionel | Navigateur, onglet 4 | Prometheus *Targets* | « Prometheus vient lire /metrics toutes les 5 secondes. » | `UP` |
| 10 | Lionel | PowerShell 2 | `npm run demo:traffic -- --duree 120 --rps 5` | « On simule des utilisateurs. » | compteurs de réponses |
| 11 | Lionel | Grafana | commenter débit, taux d'erreurs, p95, codes HTTP | « Requêtes, erreurs, temps de réponse : les trois métriques demandées. » | courbes en mouvement |
| 12 | Lionel | PowerShell 1 | `docker compose stop postgres` → recharger l'onglet 2 → Grafana → `docker compose start postgres` | « Panne de base : l'API reste vivante, renvoie 503, Grafana le montre ; retour automatique. » | 503 puis 200 |
| 13 | Lionel | PowerShell 1 | `npm run test:e2e` | « Test de bout en bout de toute la chaîne, exigence des consignes. » | `pass 7` |

★ = étape à sauter si le temps manque.

## 4. Questions techniques probables et éléments de réponse

### Données et KNIME (Hamidou, Roseline)
- **Pourquoi des anomalies volontaires ?** Sans anomalie, un contrôle ne prouve rien. Le manifeste `anomalies_injectees.json` permet de vérifier chaque ligne.
- **Anomalie corrigeable ou rejet ?** Si l'intention est certaine (casse, espaces, virgule décimale, date française), on corrige. Si la donnée est absente, fausse ou ambiguë (montant négatif, devise `FCFA`), on rejette avec un motif.
- **Pourquoi l'ordre des règles compte ?** Le Rule Engine retient la première règle vraie : une ligne a un seul motif, le plus fondamental (référence avant montant…).
- **Comment sont gérés les doublons ?** Dans le fichier : 1re occurrence conservée (`DOUBLON_REFERENCE` pour les suivantes). Au rechargement : `ON CONFLICT (reference)`. Via l'API : 409.
- **Pourquoi pas de DB Writer dans KNIME ?** Sortie vérifiable avant chargement, pas de pilote JDBC par poste, chargement transactionnel et idempotent. Variante documentée.
- **Comment prouver que KNIME est correct ?** Un oracle JavaScript applique les mêmes règles ; `npm run data:compare` compare ligne à ligne.

### Base et API (Hamidou, Davy)
- **Pourquoi PostgreSQL ?** Contraintes `CHECK`, transactions, `ON CONFLICT`, index ; non imposé par le sujet.
- **Injection SQL ?** Toutes les valeurs passent en paramètres `$1…` ; le tri utilise une liste blanche de colonnes. Test unitaire dédié.
- **Pourquoi la référence dans l'URL et pas l'id ?** Clé métier stable entre rechargements ; l'id technique ne sort pas de la base.
- **PATCH vs PUT ?** PATCH = modification partielle ; on fusionne puis on revalide l'ensemble (ex. un virement ne peut pas perdre son compte destination).
- **400, 404, 409, 503 ?** Requête invalide, ressource absente, conflit de clé, dépendance indisponible. 500 seulement pour l'inattendu.
- **Pagination stable ?** Tri secondaire par référence : pas de doublon ni de trou entre pages (testé).
- **Sécurité / authentification ?** Hors périmètre de l'énoncé. Piste : clé d'API ou JWT via un middleware Express, limitation de débit.

### Supervision et tests (Lionel)
- **Pull ou push ?** Prometheus *tire* les métriques (`/metrics`) : l'API ne dépend pas de Prometheus.
- **Counter, Gauge, Histogram ?** Counter : ne fait que monter (requêtes). Gauge : monte et descend (requêtes en cours). Histogram : répartition par seaux (temps de réponse) → quantiles.
- **Pourquoi `rate()` ?** Un compteur brut ne fait que croître ; `rate()` donne le débit par seconde sur une fenêtre.
- **Pourquoi `route="/api/transactions/:reference"` et pas l'URL ?** Une série par URL = explosion de la cardinalité (1000 références → 1000 séries).
- **p95 ?** 95 % des requêtes sont plus rapides que cette valeur ; plus représentatif que la moyenne.
- **`/health` vs `/health/ready` ?** Vivacité du processus vs disponibilité réelle (base comprise).
- **Pourquoi pas Cypress ?** L'énoncé le réserve au cas d'une interface web fournie ; il n'y en a pas → Jest/Supertest, Newman et test E2E.
- **Pyramide de tests ?** 89 tests unitaires/API rapides (sans base), 9 tests d'intégration PostgreSQL, 1 test de bout en bout en 7 étapes, collection Postman.

### Installation
- **Reproductible ?** `docker compose up` + scripts d'initialisation + données versionnées + provisioning Grafana ; KNIME : procédure distincte (consigne).
- **Limites ?** Workflow KNIME exécuté manuellement ; pas d'authentification ; alertes sans notification (pas d'Alertmanager).
