# Workflow KNIME : contrôle et transformation des transactions

**Responsable : SOMBIE Roseline** · Étape 2 de l'exercice 6 : *« Construire un workflow KNIME pour contrôler et transformer les données »*

> **État honnête du livrable.** Le fichier `knime/transactions_etl.knwf` **n'est pas fourni** : un workflow KNIME
> ne peut être produit et vérifié que dans KNIME Analytics Platform, qui n'était pas installé sur le poste
> de préparation. Ce document décrit **nœud par nœud** le workflow à construire. Le résultat attendu est
> connu à la ligne près (`data/expected/`) et la commande `npm run data:compare` vérifie automatiquement
> que la sortie de KNIME est correcte.

---

## 1. Rôle du workflow dans la chaîne

```
data/raw/transactions_brutes.csv  (1010 lignes, anomalies volontaires)
        │
        ▼  KNIME : lire → normaliser → contrôler → dédoublonner → enrichir → écrire
        │
        ├── data/processed/transactions_valides.csv   (946 lignes attendues)
        └── data/processed/transactions_rejetees.csv  (64 lignes attendues, avec motif_rejet)
        │
        ▼  scripts\charger-donnees.ps1  (contrôle + chargement PostgreSQL)
```

Pourquoi KNIME écrit des CSV plutôt que d'écrire directement dans PostgreSQL :
- pas de pilote JDBC à configurer sur chaque poste : moins de risques le jour de la démonstration ;
- la sortie KNIME est **vérifiable** (comparée automatiquement au résultat attendu) **avant** chargement ;
- le chargement est idempotent et transactionnel (voir `api/src/scripts/load-csv.js`).

Variante facultative (amélioration) : ajouter à la fin un nœud **PostgreSQL Connector** + **DB Writer**. Voir § 7.

## 2. Prérequis

| Élément | Valeur |
|---|---|
| Logiciel | KNIME Analytics Platform **5.x** (testé pour la rédaction : nœuds standards de 5.2 à 5.4), Windows 64 bits |
| Téléchargement | https://www.knime.com/downloads (gratuit ; formulaire facultatif) |
| Extensions | Aucune : tous les nœuds utilisés sont dans l'installation de base |
| Fichier d'entrée | `data/raw/transactions_brutes.csv` (versionné dans le dépôt) |
| Dossier de sortie | `data/processed/` (créé dans le dépôt, vide au départ) |

Dans la suite, `<PROJET>` désigne le dossier du dépôt cloné, par exemple `C:\projets\groupe5-api-transactions`.

## 3. Vue d'ensemble des nœuds

```
[1 CSV Reader]
   → [2 String Manipulation (Multi Column)]  codes en MAJUSCULES sans espaces
   → [3 String Manipulation]  montant : espaces retirés, virgule → point
   → [4 String Manipulation]  date : espaces retirés
   → [5 String Manipulation]  colonne temporaire date_fr_vers_iso
   → [6 Rule Engine]          date JJ/MM/AAAA hh:mm:ss → AAAA-MM-JJThh:mm:ss
   → [7 String Manipulation]  description : espaces retirés
   → [8 Column Filter]        supprime date_fr_vers_iso
   → [9 Rule Engine]          motif_rejet (CONTRÔLES)
   → [10 Rule-based Row Splitter]  motif_rejet = "OK" ?
        ├─ haut (OK) → [11 Duplicate Row Filter] → [12 Rule Engine] DOUBLON_REFERENCE
        │                → [13 Rule-based Row Splitter] OK ?
        │                     ├─ haut → [14 Column Filter] → [15 String To Number]
        │                     │          → [16 Rule Engine] categorie_montant
        │                     │          → [17 Column Resorter] → [18 CSV Writer] transactions_valides.csv
        │                     └─ bas (doublons) ─┐
        └─ bas (rejets) ─────────────────────────┴→ [19 Concatenate] → [20 Column Filter]
                                                     → [21 Column Resorter] → [22 CSV Writer] transactions_rejetees.csv
                                                     → [23 GroupBy] nombre de rejets par motif (vue de contrôle)
```

Astuce : clic droit sur un nœud → **Execute** ; clic droit → la dernière entrée (table de sortie) permet de voir le résultat. Renommez chaque nœud (double-clic sur l'étiquette sous le nœud) avec le texte entre crochets : les captures seront lisibles.

## 4. Configuration détaillée

### Nœud 1, CSV Reader : lecture du fichier brut
- **Settings › Input location** : `Local File System`, fichier `<PROJET>\data\raw\transactions_brutes.csv`.
- **Settings › Reader options** : Column delimiter `,` · Quote char `"` · Row delimiter : *Line break* · ☑ *Has column header* · ☐ *Has row ID*.
- **Encoding** (onglet *Encoding*) : `UTF-8`.
- **Transformation** (onglet) : passer **toutes** les colonnes en type **String**.
  *Pourquoi :* sinon KNIME devine `montant` en nombre et transforme `"mille"` ou `"12500,00"` en valeurs manquantes
  ou en erreurs : on perdrait la possibilité de **contrôler** et de **motiver** le rejet.
- Résultat attendu : **1010 lignes, 10 colonnes** (reference, compte_source, compte_destination, type, montant, devise, date_transaction, statut, canal, description).

### Nœud 2, String Manipulation (Multi Column) : normaliser les codes
- Colonnes incluses : `reference, compte_source, compte_destination, type, devise, statut, canal`.
- Expression : `upperCase(strip($$CURRENTCOLUMN$$))`
- ☑ *Replace selected input columns*.
- Effet : `" virement "` → `VIREMENT`, `" cpt10000001"` → `CPT10000001`, `effectuee` → `EFFECTUEE`.

### Nœud 3, String Manipulation : normaliser le montant
- Expression : `replace(removeChars(strip($montant$), " "), ",", ".")`
- ☑ *Replace column* : `montant`.
- Effet : `"125 000.00"` → `125000.00`, `"125000,00"` → `125000.00`.

### Nœud 4, String Manipulation : nettoyer la date
- Expression : `strip($date_transaction$)` · *Replace column* : `date_transaction`.

### Nœud 5, String Manipulation : préparer la conversion des dates françaises
- Expression (sur une seule ligne) :
  ```
  join(substr($date_transaction$, 6, 4), "-", substr($date_transaction$, 3, 2), "-", substr($date_transaction$, 0, 2), "T", substr($date_transaction$, 11, 8))
  ```
- ☑ *Append new column* : `date_fr_vers_iso`.
- Cette colonne n'a de sens que pour les dates `JJ/MM/AAAA hh:mm:ss` ; le nœud suivant ne l'utilise que dans ce cas.
  (On n'utilise pas `regexReplace(…, "$3-$2-$1…")` car `$…$` est la syntaxe des colonnes dans ce nœud.)

### Nœud 6, Rule Engine : convertir les dates françaises
- ☑ *Replace column* : `date_transaction`. Règles :
  ```
  $date_transaction$ MATCHES "[0-9]{2}/[0-9]{2}/[0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2}" => $date_fr_vers_iso$
  TRUE => $date_transaction$
  ```
- Effet : `14/03/2026 10:22:05` → `2026-03-14T10:22:05` ; les autres valeurs sont inchangées.

### Nœud 7, String Manipulation : description
- Expression : `strip($description$)` · *Replace column* : `description`.

### Nœud 8, Column Filter
- Exclure `date_fr_vers_iso`.

### Nœud 9, Rule Engine : CONTRÔLES (cœur du workflow)
- ☑ *Append column* : `motif_rejet`.
- Les règles sont évaluées **dans l'ordre** ; la **première** vraie donne le motif. Copier-coller **tel quel** :

```
MISSING $reference$ => "REFERENCE_MANQUANTE"
$reference$ = "" => "REFERENCE_MANQUANTE"
NOT $reference$ MATCHES "TXN-[0-9]{6}" => "REFERENCE_INVALIDE"
MISSING $compte_source$ => "COMPTE_SOURCE_MANQUANT"
$compte_source$ = "" => "COMPTE_SOURCE_MANQUANT"
NOT $compte_source$ MATCHES "CPT[0-9]{8}" => "COMPTE_SOURCE_INVALIDE"
MISSING $type$ => "TYPE_MANQUANT"
$type$ = "" => "TYPE_MANQUANT"
NOT $type$ IN ("DEPOT", "RETRAIT", "VIREMENT", "PAIEMENT") => "TYPE_INVALIDE"
MISSING $montant$ => "MONTANT_MANQUANT"
$montant$ = "" => "MONTANT_MANQUANT"
$montant$ LIKE "-*" => "MONTANT_NEGATIF"
NOT $montant$ MATCHES "[0-9]+([.][0-9]{1,2})?" => "MONTANT_NON_NUMERIQUE"
$montant$ MATCHES "0+([.]0+)?" => "MONTANT_NUL"
MISSING $devise$ => "DEVISE_INVALIDE"
NOT $devise$ IN ("XOF", "EUR", "USD") => "DEVISE_INVALIDE"
MISSING $date_transaction$ => "DATE_MANQUANTE"
$date_transaction$ = "" => "DATE_MANQUANTE"
NOT $date_transaction$ MATCHES "20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]" => "DATE_INVALIDE"
MISSING $statut$ => "STATUT_INVALIDE"
NOT $statut$ IN ("EFFECTUEE", "EN_ATTENTE", "ANNULEE") => "STATUT_INVALIDE"
MISSING $canal$ => "CANAL_INVALIDE"
NOT $canal$ IN ("GUICHET", "GAB", "MOBILE", "INTERNET") => "CANAL_INVALIDE"
$type$ = "VIREMENT" AND MISSING $compte_destination$ => "DESTINATION_MANQUANTE"
$type$ = "VIREMENT" AND $compte_destination$ = "" => "DESTINATION_MANQUANTE"
MISSING $compte_destination$ => "OK"
$compte_destination$ = "" => "OK"
NOT $compte_destination$ MATCHES "CPT[0-9]{8}" => "DESTINATION_INVALIDE"
$compte_destination$ = $compte_source$ => "COMPTES_IDENTIQUES"
TRUE => "OK"
```

Notes :
- `MATCHES` vérifie que **toute** la valeur respecte l'expression régulière (pas besoin de `^…$`).
- `[.]` remplace `\.` pour éviter les problèmes d'échappement.
- Ces règles sont la traduction exacte de `data/scripts/rules.js` (fonction `motifRejet`).

### Nœud 10, Rule-based Row Splitter
- Règle : `$motif_rejet$ = "OK" => TRUE` · ☑ *Include TRUE matches* (sortie du haut = lignes valides).
- Attendu : haut **956** lignes, bas **54** lignes.

### Nœud 11, Duplicate Row Filter (sur la sortie du haut)
- *Choose columns for duplicates detection* : **uniquement `reference`**.
- *Duplicate rows* : **Keep duplicate rows** + ☑ *Add column showing the row status (‘unique’, ‘chosen’, ‘duplicate’)*.
- *Row selection* : **First** (la première occurrence dans l'ordre du fichier est conservée).
- La colonne ajoutée s'appelle normalement `duplicate-type-classifier` ; si le nom affiché diffère, l'utiliser au nœud 12.

### Nœud 12, Rule Engine : marquer les doublons
- ☑ *Replace column* : `motif_rejet`. Règles :
  ```
  $duplicate-type-classifier$ = "duplicate" => "DOUBLON_REFERENCE"
  TRUE => $motif_rejet$
  ```

### Nœud 13, Rule-based Row Splitter
- Règle : `$motif_rejet$ = "OK" => TRUE`. Attendu : haut **946**, bas **10** (doublons).

### Nœuds 14 à 18 : branche VALIDES
- **14 Column Filter** : exclure `motif_rejet` et `duplicate-type-classifier`.
- **15 String To Number** : colonne `montant`, type *Number (double)*, séparateur décimal `.`.
- **16 Rule Engine** (*Append column* `categorie_montant`) :
  ```
  $montant$ < 100000 => "FAIBLE"
  $montant$ < 1000000 => "MOYEN"
  TRUE => "ELEVE"
  ```
- **17 Column Resorter** : ordre `reference, compte_source, compte_destination, type, montant, devise, date_transaction, statut, canal, description, categorie_montant`.
- **18 CSV Writer** : fichier `<PROJET>\data\processed\transactions_valides.csv` · *If exists* : **overwrite** · ☑ *Write column header* · ☐ *Write row ID* · séparateur `,` · encodage `UTF-8` · valeurs manquantes écrites vides.
  Dans *Advanced Settings*, désactiver la notation scientifique si l'option est proposée (sinon ce n'est pas bloquant : le chargeur lit aussi `1.25E7`).

### Nœuds 19 à 23 : branche REJETÉES
- **19 Concatenate** : entrée 1 = sortie du bas du nœud 10 ; entrée 2 = sortie du bas du nœud 13 · *Union* des colonnes.
- **20 Column Filter** : exclure `duplicate-type-classifier`.
- **21 Column Resorter** : `reference, compte_source, compte_destination, type, montant, devise, date_transaction, statut, canal, description, motif_rejet`.
- **22 CSV Writer** : `<PROJET>\data\processed\transactions_rejetees.csv`, mêmes options qu'au nœud 18.
- **23 GroupBy** (facultatif, pour la démonstration) : *Group* = `motif_rejet`, *Aggregation* = `reference` / **Count**. La table montre les 18 motifs.

## 5. Résultat attendu (référence : `data/expected/resume.json`)

| Motif | Lignes | | Motif | Lignes |
|---|---:|---|---|---:|
| DOUBLON_REFERENCE | 10 | | DATE_INVALIDE | 4 |
| MONTANT_NEGATIF | 5 | | REFERENCE_MANQUANTE | 4 |
| COMPTE_SOURCE_MANQUANT | 4 | | TYPE_INVALIDE | 4 |
| COMPTE_SOURCE_INVALIDE | 3 | | DATE_MANQUANTE | 3 |
| DESTINATION_MANQUANTE | 3 | | DEVISE_INVALIDE | 3 |
| MONTANT_MANQUANT | 3 | | MONTANT_NON_NUMERIQUE | 3 |
| MONTANT_NUL | 3 | | REFERENCE_INVALIDE | 3 |
| STATUT_INVALIDE | 3 | | CANAL_INVALIDE | 2 |
| COMPTES_IDENTIQUES | 2 | | DESTINATION_INVALIDE | 2 |
| **Total valides** | **946** | | **Total rejetées** | **64** |

En plus, **26 anomalies corrigeables** (casse, espaces, virgule décimale, séparateur de milliers, date au format français)
doivent être **corrigées puis acceptées** : leur détail figure dans `data/raw/anomalies_injectees.json` (`motif_attendu: "OK"`).

## 6. Vérification automatique (obligatoire avant le chargement)

Depuis la racine du projet (PowerShell) :

```powershell
npm run data:compare
```

- `CONFORME : 946 valides, 64 rejetées, motifs identiques au résultat attendu.` → passer au chargement.
- Sinon, la commande liste les écarts, par exemple `TXN-000123.type : "virement" (KNIME) au lieu de "VIREMENT"`.

| Écart affiché | Cause probable | Correction |
|---|---|---|
| `Fichier absent dans la sortie KNIME` | chemin du CSV Writer incorrect | vérifier `<PROJET>\data\processed\…` |
| `Valides : 1010 au lieu de 946` | nœud 9 non exécuté ou splitter inversé | vérifier les nœuds 9, 10 et 13 |
| `Motif MONTANT_NON_NUMERIQUE : 8 au lieu de 3` | nœud 3 (virgule → point) absent ou mal configuré | revoir l'expression du nœud 3 |
| `Motif DATE_INVALIDE : 9 au lieu de 4` | nœuds 5-6 (dates françaises) absents | revoir les nœuds 5 et 6 |
| `Motif DOUBLON_REFERENCE : 0 au lieu de 10` | nœud 11 configuré sur toutes les colonnes | ne garder que `reference` |
| `colonnes manquantes categorie_montant` | nœud 16 absent | ajouter le nœud 16 |
| `…montant : "" (KNIME)` | colonnes lues en nombre au nœud 1 | tout passer en String (onglet Transformation) |

## 7. Variante facultative : chargement direct PostgreSQL depuis KNIME
À ne faire qu'**après** la version CSV validée.
1. Nœud **PostgreSQL Connector** : hôte `localhost`, port `5432`, base `transactions`, utilisateur / mot de passe `transactions` (valeurs de `.env`). Docker doit être démarré.
2. Nœud **DB Writer** sur la sortie du nœud 17 : table `transactions_knime_brut` (table de travail créée par KNIME).
3. Le chargement officiel reste `scripts\charger-donnees.ps1`, qui garantit l'idempotence et la journalisation dans `chargements`.

## 8. Captures à produire (preuves pour le rapport et la présentation)
1. Vue complète du workflow (tous les nœuds verts).
2. Configuration du nœud 9 (règles visibles).
3. Table de sortie du nœud 23 (rejets par motif).
4. Fenêtre PowerShell montrant `npm run data:compare` → `CONFORME`.

Enregistrer les captures dans `docs/captures/` (ex. `knime_01_workflow.png`).

## 9. Exporter le workflow dans le dépôt
1. Dans KNIME, clic droit sur le workflow (*KNIME Explorer*) → **Export KNIME Workflow…**
2. Destination : `<PROJET>\knime\transactions_etl.knwf` · ☐ *Exclude data* (laisser coché pour un fichier léger).
3. Commit : `git add knime/transactions_etl.knwf docs/captures/knime_*.png` puis `git commit -m "feat(knime): workflow de controle et transformation"`.
4. `npm run check` doit alors afficher `OK knime/*.knwf`.
