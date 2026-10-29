# Dossier KNIME

| Fichier | État |
|---|---|
| `transactions_etl.knwf` | **À CRÉER** par Roseline dans KNIME Analytics Platform 5.x, puis à exporter ici |

Instructions complètes, nœud par nœud : [`docs/KNIME_WORKFLOW.md`](../docs/KNIME_WORKFLOW.md).

- Entrée : `data/raw/transactions_brutes.csv`
- Sorties : `data/processed/transactions_valides.csv`, `data/processed/transactions_rejetees.csv`
- Vérification : `npm run data:compare` (racine du projet) doit afficher `CONFORME : 946 valides, 64 rejetées`.

Importer le workflow sur un autre poste : KNIME → *File* → *Import KNIME Workflow…* → choisir `transactions_etl.knwf`,
puis adapter les chemins des nœuds *CSV Reader* et *CSV Writer* au dossier local du projet.
