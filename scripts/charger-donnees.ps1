# Charge les sorties du workflow KNIME dans PostgreSQL (via le conteneur api).
# Usage (racine du projet) :
#   powershell -ExecutionPolicy Bypass -File scripts\charger-donnees.ps1              # sortie KNIME (data\processed)
#   powershell -ExecutionPolicy Bypass -File scripts\charger-donnees.ps1 -Source expected
#       -> SECOURS UNIQUEMENT : resultat de l'ETL de reference, si KNIME n'a pas encore ete execute
param([ValidateSet('processed', 'expected')][string]$Source = 'processed')
$ErrorActionPreference = 'Stop'
$racine = Split-Path -Parent $PSScriptRoot
Set-Location $racine

foreach ($f in 'transactions_valides.csv', 'transactions_rejetees.csv') {
    if (-not (Test-Path "data\$Source\$f")) {
        Write-Host "Fichier manquant : data\$Source\$f" -ForegroundColor Red
        if ($Source -eq 'processed') { Write-Host 'Executez d abord le workflow KNIME (docs\KNIME_WORKFLOW.md).' }
        exit 1
    }
}

if ($Source -eq 'processed') {
    Write-Host 'Controle de la sortie KNIME par rapport au resultat attendu...'
    node data/scripts/compare-outputs.js
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'La sortie KNIME differe du resultat attendu : corrigez le workflow avant de charger.' -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host 'ATTENTION : chargement des donnees de REFERENCE (data\expected), pas de la sortie KNIME.' -ForegroundColor Yellow
}

docker compose exec -T api npm run load -- "/data/$Source"
if ($LASTEXITCODE -ne 0) { Write-Host 'ECHEC du chargement (le conteneur api est-il demarre ? docker compose ps)' -ForegroundColor Red; exit 1 }
Write-Host 'Chargement termine. Verification : http://localhost:3000/api/chargements/dernier' -ForegroundColor Green
