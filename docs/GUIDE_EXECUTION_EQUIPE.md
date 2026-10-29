# Guide d'exécution de l'équipe

Parcours complet, du dépôt cloné au projet présenté. Chaque étape indique **qui**, **quoi**, **comment vérifier**
et **quand passer à la suite**. Les 🛑 sont des **points d'arrêt** : toute l'équipe vérifie avant de continuer.

`<PROJET>` = `C:\projets\API_REST_Transaction` (dépôt : https://github.com/BANDE-Hamidou/API_REST_Transaction). Les commandes se lancent dans **PowerShell**.
Installation détaillée et erreurs fréquentes : `INSTALLATION_WINDOWS.md`.

---

## Étape 0 : remplir le dépôt GitHub étape par étape (toute l'équipe)
**Objectif** : le dépôt public contient tout le projet, et son historique montre qui a fait quoi.

Le dépôt n'a **pas** été rempli en une seule fois. Le projet complet sert de **dossier de référence**, à part du clone :
chaque membre y copie **ses** fichiers, étape par étape, chacune sur sa branche avec son test et son relecteur.

| | |
|---|---|
| Premier commit (Hamidou, sur `main`) | `.gitignore`, `.env.example`, `package.json` uniquement |
| Une étape | branche `prenom/tache` depuis `main` → copie de ses fichiers → test → un commit par idée → push → pull request |
| Relecture | le relecteur désigné rejoue le test, approuve, puis **fusionne** (*Create a merge commit*, jamais *Squash*) |
| Ordre | chacun travaille en parallèle ; seules les fusions suivent l'ordre des étapes, pour que `main` marche toujours |
| Tester avant que les autres aient fini | emprunter les fichiers manquants à la référence (`cp -rn $REF/. .`), ne jamais les commiter, puis `git clean -fd` |

Règles : jamais `git init` dans la référence, jamais `git add .` (on nomme ses fichiers), jamais `--force`, jamais de commit de `.env`.
Le détail des 19 étapes (fichiers, commandes, résultats attendus, relecteurs) est sur la page de suivi de l'équipe ;
la répartition est rappelée dans `PLAN_EQUIPE.md`.

## Étape 1 : préparer chaque poste (les 4 membres, en parallèle, 30 à 90 min)
**Objectif** : Node ≥ 22, Git, Docker Desktop opérationnels ; projet cloné.
```powershell
cd C:\projets
git clone https://github.com/BANDE-Hamidou/API_REST_Transaction.git
cd C:\projets\API_REST_Transaction
powershell -ExecutionPolicy Bypass -File scripts\verifier-prerequis.ps1
```
**Résultat attendu** : `Prerequis OK`.
**En cas d'échec** : suivre la ligne `[ECHEC]` affichée et `INSTALLATION_WINDOWS.md` étapes 1-2.
**Passer à la suite quand** : `Prerequis OK` sur le poste.

## Étape 2 : contrôles hors Docker (chacun, 5 min)
**Objectif** : vérifier que le code et les données du dépôt sont cohérents, sans aucun service.

📁 `<PROJET>`
```powershell
npm run check
npm run test:data
cd api; npm install; npm test; cd ..
```
**Résultat attendu** : `Tous les contrôles de cohérence sont réussis.` · `pass 9 / fail 0` · `Tests: 9 skipped, 80 passed, 89 total`.
**En cas d'échec** : `Cannot find module …jest.js` → chemin du projet avec `&`/espace/accent (déplacer dans `C:\projets`) ;
`npm install` en erreur réseau → relancer.
**Passer à la suite quand** : les trois commandes sont vertes.

## Étape 3 : démarrer la pile Docker (chacun, 5 à 15 min)
📁 `<PROJET>`
```powershell
powershell -ExecutionPolicy Bypass -File scripts\demarrer.ps1
```
**Résultat attendu** : 4 conteneurs `Up`, message *Pile demarree*.
**Vérifier** : http://localhost:3000/health/ready → `{"statut":"ok","base":"ok"}` ; http://localhost:9090/targets → **UP** ; http://localhost:3001 → tableau de bord.
**En cas d'échec** : `docker compose ps` puis `docker compose logs <service>` ; tableau des erreurs dans `INSTALLATION_WINDOWS.md` étape 5.

### 🛑 Point d'arrêt n° 1 : socle commun
Toute l'équipe confirme (message dans le groupe, avec capture) :
- [ ] `npm run check` vert
- [ ] pile démarrée et `/health/ready` OK sur **au moins 2 postes**
- [ ] Grafana affiche le tableau de bord « API Transactions - Groupe 5 » (vide, c'est normal)

## Étape 4 : construire le workflow KNIME (Roseline ; Hamidou en appui, 2 à 3 h)
**Objectif** : produire `data/processed/transactions_valides.csv` et `transactions_rejetees.csv`.
**Fichiers** : `docs/KNIME_WORKFLOW.md` (instructions), `data/raw/transactions_brutes.csv` (entrée).
**Commandes** : construction dans KNIME (§ 4 du guide KNIME), puis 📁 `<PROJET>` :
```powershell
npm run data:compare
```
**Résultat attendu** : `CONFORME : 946 valides, 64 rejetées, motifs identiques au résultat attendu.`
**En cas d'échec** : tableau « Écart affiché → cause → correction » (`KNIME_WORKFLOW.md` § 6).
Bloqué plus de 30 min sur un nœud → demander de l'aide à Hamidou ; ne pas modifier les règles pour « faire passer » la comparaison.
**Passer à la suite quand** : `CONFORME`.

**Pendant ce temps** (pour ne pas attendre KNIME), Davy et Lionel chargent les données de **secours** sur leur poste :
```powershell
powershell -ExecutionPolicy Bypass -File scripts\charger-donnees.ps1 -Source expected
```
et avancent sur leurs étapes 6 et 7. Les données de secours sont **identiques** à la sortie KNIME attendue.

## Étape 5 : charger la sortie KNIME (Hamidou, sur le poste de démonstration, 5 min)
Copier `data\processed\*.csv` produits par Roseline sur le poste de démonstration (ou les récupérer via Git si l'équipe a décidé de les versionner).

📁 `<PROJET>`
```powershell
powershell -ExecutionPolicy Bypass -File scripts\charger-donnees.ps1
powershell -ExecutionPolicy Bypass -File scripts\charger-donnees.ps1    # 2e fois : idempotence
```
**Résultat attendu** : 1er passage `inserees: 946, rejetees: 64` ; 2e passage `inserees: 0, mises_a_jour: 946`.
**Vérifier** : http://localhost:3000/api/chargements/dernier · http://localhost:3000/api/rejets/statistiques (18 motifs, total 64).
**En cas d'échec** : `Fichier manquant` → KNIME n'a pas écrit au bon endroit ; `écart(s) détecté(s)` → retour étape 4 ;
`rejets_au_chargement > 0` → une règle KNIME diffère de l'API : comparer avec `CONTRATS.md`.

## Étape 6 : vérifier l'API (Davy, 20 min)
📁 `<PROJET>\api`
```powershell
$env:TEST_DATABASE_URL = "postgres://transactions:transactions@localhost:5432/transactions"
npm run test:integration
npx newman run ..\tests\postman\API_Transactions_G5.postman_collection.json -e ..\tests\postman\local.postman_environment.json
```
**Résultat attendu** : `Tests: 9 passed` ; Newman `requests 15 / failed 0`, `assertions 15 / failed 0`.
**Vérifier à la main** (navigateur) : http://localhost:3000/api/transactions?type=VIREMENT&limite=5 ; http://localhost:3000/api/transactions?tpye=DEPOT (400).
**En cas d'échec** : `ECONNREFUSED` → pile non démarrée ; `password authentication failed` → valeurs de `.env` différentes de l'URL.

## Étape 7 : vérifier la supervision (Lionel, 20 min)
📁 `<PROJET>`
```powershell
npm run demo:traffic -- --duree 90 --rps 5
```
Pendant le trafic : Grafana (http://localhost:3001) → les panneaux *Requêtes par seconde*, *Erreurs par code HTTP*, *p50/p95/p99* bougent.
Prometheus → http://localhost:9090/alerts : 3 règles chargées (vertes, *inactive*).
**Panne contrôlée** :
```powershell
docker compose stop postgres
Invoke-WebRequest http://localhost:3000/api/transactions -UseBasicParsing   # erreur 503 attendue
docker compose start postgres
```
**Résultat attendu** : 503 `BASE_INDISPONIBLE` ; dans Grafana, apparition de la série `503 (serveur)` ; après redémarrage, l'API répond de nouveau **sans être relancée**.

## Étape 8 : test de bout en bout (Lionel, puis chaque membre sur son poste, 2 min)
📁 `<PROJET>`
```powershell
npm run test:e2e
```
**Résultat attendu** : 7 tests `✔`, `pass 7`, `fail 0`.
Le test 2 compare automatiquement `data/processed` au résultat attendu quand les données chargées viennent de KNIME.
**En cas d'échec** : le nom du test indique le maillon en défaut (1 API/base, 2 données, 3 filtres, 4 écritures, 5 métriques, 6 Prometheus, 7 Grafana).

### 🛑 Point d'arrêt n° 2 : chaîne complète
- [ ] `scripts\tester-tout.ps1` : 4 lignes `REUSSI` **sur le PC de présentation**
- [ ] sortie KNIME `CONFORME` et chargée (pas les données de secours)
- [ ] captures rangées dans `docs/captures/` (liste : `PLAN_EQUIPE.md`, rubrique « Preuves » de chacun)
- [ ] `RAPPORT_TESTS.md` complété avec les résultats du poste de l'équipe

## Étape 9 : finaliser les livrables (tous, 1 h)
| Qui | Action |
|---|---|
| Roseline | `knime/transactions_etl.knwf` exporté et poussé |
| Chacun | son chapitre du rapport (`rapport/`) et ses diapositives de l'oral (hors dépôt) |
| Lionel | `RAPPORT_TESTS.md` : colonne « Poste de l'équipe » remplie |
| Hamidou | veiller à l'ordre des fusions, `npm run check`, tag : `git tag v1.0; git push origin v1.0` |

## Étape 10 : répétition et envoi (tous)
1. Répéter `SCENARIO_DEMO.md` **chronométré** (objectif 8 min) sur le PC de présentation, **pile déjà démarrée**.
2. Test « machine neuve » (fortement conseillé) : un membre qui n'a jamais lancé le projet clone le dépôt et suit uniquement le `README.md`. Noter tout blocage et corriger la doc.
3. Envoyer le mail : à **kyfadeloumar@gmail.com**, objet **`[PROJET_DEV_COMPOSANT_2026]`**, contenu : groupe 5 SIE, thème 6, membres, lien du dépôt public ; le rapport est dans le dossier `rapport/`.

### 🛑 Point d'arrêt n° 3 : prêt à présenter
- [ ] dépôt **public** accessible en navigation privée (non connecté)
- [ ] mail envoyé
- [ ] le jour J : Docker Desktop lancé **avant** l'oral, pile démarrée, données chargées, onglets ouverts (`SCENARIO_DEMO.md` § 1)
