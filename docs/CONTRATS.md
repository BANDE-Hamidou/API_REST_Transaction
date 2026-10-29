# Contrats communs entre composants

Ces contrats évitent que les quatre composants soient incompatibles. **Toute modification d'un contrat
doit être annoncée à l'équipe et reportée partout** ; `npm run check` détecte la plupart des écarts.

## 1. Contrat de données : une transaction

| Champ | Type / format | Obligatoire | Règle | Exemple |
|---|---|---|---|---|
| `reference` | `TXN-` + 6 chiffres | oui | unique (clé métier) | `TXN-000123` |
| `compte_source` | `CPT` + 8 chiffres | oui | | `CPT10000042` |
| `compte_destination` | `CPT` + 8 chiffres | VIREMENT : oui ; sinon facultatif | ≠ `compte_source` | `CPT90000003` |
| `type` | énumération | oui | `DEPOT`, `RETRAIT`, `VIREMENT`, `PAIEMENT` | `VIREMENT` |
| `montant` | nombre > 0, 2 décimales max | oui | `NUMERIC(15,2)` | `125000.00` |
| `devise` | énumération | oui (défaut API : `XOF`) | `XOF`, `EUR`, `USD` | `XOF` |
| `date_transaction` | `AAAA-MM-JJThh:mm:ss` (sans fuseau) | oui | date réelle | `2026-03-14T10:22:05` |
| `statut` | énumération | oui (défaut API : `EN_ATTENTE`) | `EFFECTUEE`, `EN_ATTENTE`, `ANNULEE` | `EFFECTUEE` |
| `canal` | énumération | oui | `GUICHET`, `GAB`, `MOBILE`, `INTERNET` | `MOBILE` |
| `description` | texte ≤ 255 | non | | `Virement loyer` |
| `categorie_montant` | **calculé** | (sortie) | `FAIBLE` < 100 000 ≤ `MOYEN` < 1 000 000 ≤ `ELEVE` | `MOYEN` |
| `source` | **calculé** | (sortie) | `KNIME` (chargement) ou `API` (POST) | `KNIME` |

Normalisation appliquée par KNIME **et** par l'API : espaces retirés, codes en majuscules.
KNIME corrige en plus la virgule décimale, les séparateurs de milliers et les dates `JJ/MM/AAAA hh:mm:ss`.

Où ce contrat est implémenté :

| Composant | Fichier | Responsable |
|---|---|---|
| Générateur + règles de référence | `data/scripts/generate-transactions.js`, `data/scripts/rules.js` | Hamidou |
| Workflow KNIME | `docs/KNIME_WORKFLOW.md` → `knime/transactions_etl.knwf` | Roseline |
| Base de données (contraintes CHECK) | `db/init/01_schema.sql` | Hamidou |
| API (validation) | `api/src/domain/rules.js`, `api/src/validation/transaction.js` | Davy |
| Contrat d'API | `api/openapi.yaml` | Davy |

## 2. Contrat de fichiers (KNIME ↔ chargement)

| Fichier | Produit par | Lu par | Colonnes (dans cet ordre) |
|---|---|---|---|
| `data/raw/transactions_brutes.csv` | générateur | KNIME | reference, compte_source, compte_destination, type, montant, devise, date_transaction, statut, canal, description |
| `data/processed/transactions_valides.csv` | KNIME | chargeur | les 10 colonnes + `categorie_montant` |
| `data/processed/transactions_rejetees.csv` | KNIME | chargeur | les 10 colonnes + `motif_rejet` |

Format : CSV, séparateur `,`, guillemets `"` si nécessaire, en-tête sur la première ligne, UTF-8, valeur manquante = champ vide.

Motifs de rejet (codes stables, utilisés dans l'API `/api/rejets?motif=`) :
`REFERENCE_MANQUANTE, REFERENCE_INVALIDE, COMPTE_SOURCE_MANQUANT, COMPTE_SOURCE_INVALIDE, TYPE_MANQUANT, TYPE_INVALIDE,
MONTANT_MANQUANT, MONTANT_NEGATIF, MONTANT_NON_NUMERIQUE, MONTANT_NUL, DEVISE_INVALIDE, DATE_MANQUANTE, DATE_INVALIDE,
STATUT_INVALIDE, CANAL_INVALIDE, DESTINATION_MANQUANTE, DESTINATION_INVALIDE, COMPTES_IDENTIQUES, DOUBLON_REFERENCE`
+ `REJET_CHARGEMENT:<champ>` (ligne déclarée valide par KNIME mais refusée par l'API au chargement : ne doit pas arriver).

## 3. Contrat d'API (résumé ; détail complet : `api/openapi.yaml`)

| Méthode | Route | Succès | Erreurs |
|---|---|---|---|
| GET | `/api/transactions` | 200 `{donnees, pagination, filtres, tri}` | 400, 503 |
| GET | `/api/transactions/statistiques` | 200 | 400 |
| GET | `/api/transactions/{reference}` | 200 | 400, 404 |
| POST | `/api/transactions` | 201 + `Location` | 400, 409 |
| PATCH | `/api/transactions/{reference}` | 200 | 400, 404 |
| DELETE | `/api/transactions/{reference}` | 204 | 400, 404 |
| GET | `/api/rejets`, `/api/rejets/statistiques` | 200 | 400 |
| GET | `/api/chargements/dernier` | 200 | 404 |
| GET | `/health`, `/health/ready` | 200 | 503 |
| GET | `/metrics` | 200 (text/plain Prometheus) | |

Filtres de `GET /api/transactions` : `type, statut, canal, devise, categorie, source` (valeurs multiples séparées par des virgules),
`compte` (source **ou** destination), `compte_source, compte_destination, date_debut, date_fin, montant_min, montant_max`,
pagination `page` (≥ 1) et `limite` (1 à 100, défaut 20), tri `tri` (`date_transaction | montant | reference`) et `ordre` (`asc | desc`).
Un paramètre inconnu donne **400** (protection contre les fautes de frappe).

Format d'erreur unique :
```json
{ "erreur": { "code": "VALIDATION_ECHOUEE", "message": "Données invalides",
              "details": [ { "champ": "montant", "message": "doit être strictement positif" } ] } }
```
Codes : `VALIDATION_ECHOUEE`, `JSON_INVALIDE`, `RESSOURCE_INTROUVABLE`, `ROUTE_INTROUVABLE`, `CONFLIT`, `CONTRAINTE_VIOLEE`, `BASE_INDISPONIBLE`, `ERREUR_INTERNE`.

## 4. Contrat de supervision (API ↔ Prometheus ↔ Grafana)

| Métrique | Type | Labels | Exigence couverte |
|---|---|---|---|
| `http_requests_total` | Counter | method, route, status_code | requêtes |
| `http_request_errors_total` | Counter | method, route, status_code, error_type (`client`/`serveur`) | erreurs |
| `http_request_duration_seconds` | Histogram (buckets 5 ms à 5 s) | method, route, status_code | temps de réponse |
| `http_requests_in_flight` | Gauge | | charge instantanée |
| `transactions_operations_total` | Counter | operation (`creation`/`modification`/`suppression`) | métrique métier (bonus) |
| `process_*`, `nodejs_*` | divers | | santé du processus |

- `route` = **modèle** de route (`/api/transactions/:reference`), jamais l'URL réelle : nombre de séries borné.
- Toutes les séries portent `service="api-transactions"` ; Prometheus ajoute `job="api-transactions"` (nom utilisé partout dans Grafana et les alertes).
- Source de données Grafana : uid `prometheus` ; tableau de bord : uid `g5-api-transactions`.
