# Arrete les conteneurs. Les donnees (PostgreSQL, Prometheus, Grafana) sont CONSERVEES.
# Usage : powershell -ExecutionPolicy Bypass -File scripts\arreter.ps1
$racine = Split-Path -Parent $PSScriptRoot
Set-Location $racine
docker compose down
if ($LASTEXITCODE -eq 0) { Write-Host 'Pile arretee. Relance : scripts\demarrer.ps1' -ForegroundColor Green }
