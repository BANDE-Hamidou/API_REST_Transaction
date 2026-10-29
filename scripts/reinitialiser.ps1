# Arrete les conteneurs ET SUPPRIME les volumes (base, historique Prometheus, Grafana).
# Au prochain demarrage, le schema SQL est recree et il faut recharger les donnees.
# Usage : powershell -ExecutionPolicy Bypass -File scripts\reinitialiser.ps1 [-Confirmer]
param([switch]$Confirmer)
$racine = Split-Path -Parent $PSScriptRoot
Set-Location $racine
if (-not $Confirmer) {
    $rep = Read-Host 'Toutes les donnees Docker du projet seront supprimees. Taper OUI pour confirmer'
    if ($rep -ne 'OUI') { Write-Host 'Annule.'; exit 0 }
}
docker compose down -v
Write-Host 'Volumes supprimes. Relancer : scripts\demarrer.ps1 puis scripts\charger-donnees.ps1' -ForegroundColor Yellow
