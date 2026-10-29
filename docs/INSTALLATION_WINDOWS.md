# Installation pas à pas sous Windows 10 / 11

Public : membres de l'équipe, débutants avec Docker. Comptez **45 à 90 minutes** la première fois
(téléchargements). Suivez les étapes **dans l'ordre** et vérifiez le résultat attendu avant de passer à la suivante.

Conventions :
- **PowerShell** = menu Démarrer → taper `PowerShell` → *Windows PowerShell*. « (admin) » = clic droit → *Exécuter en tant qu'administrateur*.
- `📁 <dossier>` indique **le dossier depuis lequel lancer la commande** (`cd <dossier>` d'abord).
- Le projet sera dans **`C:\projets\API_REST_Transaction`** (appelé `<PROJET>`).

> ⚠ **Règle n° 1 : chemin sans espace, sans accent, sans `&`.**
> Un chemin comme `G:\Formation\Développement&Services\…` **casse npm** (`Cannot find module …\jest\bin\jest.js`)
> et peut gêner Docker. Ce problème a été constaté pendant la préparation du projet. Utilisez `C:\projets\…`.

---

## Étape 1 : vérifier Node.js et Git

📁 n'importe où
```powershell
node -v
npm -v
git --version
```
Résultat attendu : `v22.x` ou plus (ex. `v24.16.0`), `10.x` ou plus, `git version 2.x`.

| Problème | Correction |
|---|---|
| `node` n'est pas reconnu | installer Node.js **LTS** depuis https://nodejs.org (cocher *Add to PATH*), puis **fermer et rouvrir** PowerShell |
| `v18.x` ou `v20.x` | installer la LTS 22 ou plus (les tests utilisent des options de Node 22) |
| `git` n'est pas reconnu | installer https://git-scm.com/download/win (options par défaut) |

## Étape 2 : installer Docker Desktop (une seule fois par poste)

1. **WSL 2** : PowerShell **(admin)** :
   ```powershell
   wsl --install
   ```
   Résultat attendu : installation d'Ubuntu/WSL ou message *« déjà installé »*. **Redémarrer le PC** si demandé.
   Si WSL est déjà présent : `wsl --update`.
2. Télécharger **Docker Desktop for Windows** : https://www.docker.com/products/docker-desktop/ → lancer l'installateur →
   laisser cochée l'option **Use WSL 2 instead of Hyper-V** → *Close and restart* si demandé.
3. Lancer **Docker Desktop** (menu Démarrer), accepter les conditions, ignorer la connexion (*Skip*).
   Attendre l'indicateur **Engine running** (en bas à gauche, vert).
4. Vérifier (PowerShell normal) :
   ```powershell
   docker --version
   docker compose version
   docker run --rm hello-world
   ```
   Résultat attendu : `Docker version 2x.x`, `Docker Compose version v2.x`, puis le texte *Hello from Docker!*

| Message d'erreur | Cause | Correction |
|---|---|---|
| `Virtualization support not detected` / `WSL 2 requires virtualization` | virtualisation désactivée dans le BIOS | redémarrer → BIOS/UEFI (F2, F10 ou Suppr) → activer *Intel VT-x* / *AMD-V (SVM)* |
| `WSL update required` / `WSL kernel` | WSL ancien | PowerShell (admin) : `wsl --update`, puis relancer Docker Desktop |
| `error during connect … dockerDesktopLinuxEngine` / `The system cannot find the file specified` | Docker Desktop n'est pas démarré | lancer Docker Desktop, attendre *Engine running* |
| `docker` n'est pas reconnu | PowerShell ouvert avant l'installation | fermer et rouvrir PowerShell |
| `TLS handshake timeout` / téléchargement très lent | réseau, proxy | réessayer ; éviter un réseau public filtrant ; partage de connexion 4G |

## Étape 3 : récupérer le projet

**Cas A : le dépôt GitHub contient déjà le projet** (cas normal après l'étape 0 du `GUIDE_EXECUTION_EQUIPE.md`)
📁 n'importe où
```powershell
mkdir C:\projets -Force
cd C:\projets
git clone https://github.com/BANDE-Hamidou/API_REST_Transaction.git
cd C:\projets\API_REST_Transaction
```
Résultat attendu : `dir` affiche `README.md`, `docker-compose.yml`, `api`, `data`, `docs`…

## Étape 4 : vérifier les prérequis automatiquement

📁 `<PROJET>`
```powershell
powershell -ExecutionPolicy Bypass -File scripts\verifier-prerequis.ps1
```
Résultat attendu : lignes `[OK]` puis *Prerequis OK*. Les lignes `[ATTENTION]` sur KNIME ne concernent que le poste ETL.

| Problème | Correction |
|---|---|
| `l'exécution de scripts est désactivée sur ce système` | toujours lancer les `.ps1` avec `powershell -ExecutionPolicy Bypass -File …` (comme ci-dessus) |
| `Port 5432 deja utilise par 'postgres'` | un PostgreSQL est installé sur le PC : dans `.env`, mettre `POSTGRES_HOST_PORT=5433` |
| `Port 3000 deja utilise par 'node'` | une autre application Node tourne : l'arrêter, ou `API_HOST_PORT=3002` dans `.env` |

## Étape 5 : démarrer la pile Docker

📁 `<PROJET>`
```powershell
powershell -ExecutionPolicy Bypass -File scripts\demarrer.ps1
```
(équivalent manuel : `Copy-Item .env.example .env` puis `docker compose up -d --build`)

Résultat attendu (le premier lancement télécharge ~1,5 Go d'images : 5 à 15 min) :
```
NAME            ... STATUS
g5-api          ... Up (healthy)
g5-grafana      ... Up
g5-postgres     ... Up (healthy)
g5-prometheus   ... Up
Pile demarree :
  API          http://localhost:3000 ...
```

| Problème | Diagnostic | Correction |
|---|---|---|
| `Bind for 0.0.0.0:5432 failed: port is already allocated` | port occupé | changer le port dans `.env`, relancer |
| `g5-api` redémarre en boucle | `docker compose logs api` | lire l'erreur ; souvent une erreur de connexion base → attendre `g5-postgres (healthy)` |
| `npm ci` échoue pendant `build` | réseau | relancer `docker compose up -d --build` |
| Les tables n'existent pas | le volume existait avant le schéma | `scripts\reinitialiser.ps1` puis redémarrer |

## Étape 6 : vérifier chaque service

| Service | Ouvrir | Résultat attendu |
|---|---|---|
| API | http://localhost:3000 | JSON avec la liste des liens |
| Santé | http://localhost:3000/health/ready | `{"statut":"ok","base":"ok"}` |
| Métriques | http://localhost:3000/metrics | texte commençant par `# HELP` |
| Prometheus | http://localhost:9090/targets | cible **api-transactions** à l'état **UP** (vert) |
| Grafana | http://localhost:3001 | connexion `admin` / `admin` (« Skip » pour le changement de mot de passe) → *Dashboards › Groupe 5 › API Transactions - Groupe 5* |
| PostgreSQL | `docker compose exec postgres psql -U transactions -c "\dt"` | 3 tables : `chargements`, `transactions`, `transactions_rejetees` |

À ce stade, `http://localhost:3000/api/transactions` renvoie `total: 0` : c'est normal, les données ne sont pas encore chargées.

## Étape 7 : installer et utiliser KNIME (poste ETL : Roseline, + un second poste de secours)

KNIME n'est **pas** dans Docker : c'est une application de bureau Java.
1. https://www.knime.com/downloads → **KNIME Analytics Platform for Windows (installer)** → installer avec les options par défaut.
2. Premier lancement : choisir un *workspace* **hors du dépôt**, par exemple `C:\knime-workspace`.
3. Mémoire (si KNIME est lent) : fichier `knime.ini` du dossier d'installation → ligne `-Xmx` → `-Xmx4g`.
4. Construire le workflow en suivant **`docs/KNIME_WORKFLOW.md`**, l'exécuter, puis vérifier :

📁 `<PROJET>`
```powershell
npm run data:compare
```
Résultat attendu : `[comparaison] CONFORME : 946 valides, 64 rejetées, motifs identiques au résultat attendu.`

| Problème KNIME | Correction |
|---|---|
| Nœud rouge / jaune avec ⚠ | survoler l'icône pour lire le message ; ouvrir la configuration (double-clic) |
| `Unable to read file` | chemin du fichier incorrect : vérifier `C:\projets\API_REST_Transaction\data\raw\transactions_brutes.csv` |
| Montants vides ou `?` | colonnes non forcées en String dans le CSV Reader (onglet *Transformation*) |
| Accents illisibles | encodage UTF-8 dans le CSV Reader et le CSV Writer |

## Étape 8 : charger les données

📁 `<PROJET>`
```powershell
powershell -ExecutionPolicy Bypass -File scripts\charger-donnees.ps1
```
Résultat attendu : `CONFORME…` puis
```
[chargement] terminé : { "valides_lues": 946, "inserees": 946, "mises_a_jour": 0, "rejetees": 64, "rejets_au_chargement": 0, ... }
```
Relancer la commande donne `inserees: 0, mises_a_jour: 946` : c'est la preuve de l'**idempotence**.

> Secours uniquement, si KNIME n'est pas encore prêt : `scripts\charger-donnees.ps1 -Source expected`
> charge le résultat de l'ETL de référence. **À ne pas présenter comme la sortie de KNIME.**

## Étape 9 : lancer les tests

📁 `<PROJET>` (pile démarrée et données chargées)
```powershell
powershell -ExecutionPolicy Bypass -File scripts\tester-tout.ps1
```
Résultat attendu : bilan `REUSSI` pour les 4 lignes. Le détail de chaque commande est dans `docs/RAPPORT_TESTS.md`.

Tests d'intégration PostgreSQL (facultatif) :
📁 `<PROJET>\api`
```powershell
$env:TEST_DATABASE_URL = "postgres://transactions:transactions@localhost:5432/transactions"
npm run test:integration
```
Résultat attendu : `Tests: 9 passed`. (Les tables de test sont créées dans un schéma temporaire, supprimé ensuite.)

## Étape 10 : arrêter, relancer, réinitialiser

📁 `<PROJET>`

| Besoin | Commande | Données |
|---|---|---|
| Arrêter proprement | `powershell -ExecutionPolicy Bypass -File scripts\arreter.ps1` (= `docker compose down`) | conservées |
| Relancer | `powershell -ExecutionPolicy Bypass -File scripts\demarrer.ps1` | conservées, pas besoin de recharger |
| Redémarrer seulement l'API | `docker compose restart api` | conservées |
| Voir les journaux | `docker compose logs -f api` (Ctrl+C pour quitter) | — |
| Tout remettre à zéro | `powershell -ExecutionPolicy Bypass -File scripts\reinitialiser.ps1` (= `docker compose down -v`) | **supprimées** : recharger ensuite |

Avant d'éteindre le PC : `scripts\arreter.ps1`, puis quitter Docker Desktop (icône près de l'horloge → *Quit*).

## Étape 11 (facultatif) : lancer l'API sans Docker, pour développer

📁 `<PROJET>\api` (PostgreSQL du Docker démarré)
```powershell
npm install
npm run dev
```
`npm run dev` lit `..\.env` (avec `PGHOST=localhost`) et redémarre l'API à chaque modification.
Arrêter d'abord le conteneur pour libérer le port 3000 : `docker compose stop api`.
