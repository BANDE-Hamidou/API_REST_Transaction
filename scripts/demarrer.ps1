# Demarre PostgreSQL, l'API, Prometheus et Grafana, puis attend que l'API soit prete.
# Usage (racine du projet) :  powershell -ExecutionPolicy Bypass -File scripts\demarrer.ps1
$ErrorActionPreference = 'Stop'
$racine = Split-Path -Parent $PSScriptRoot
Set-Location $racine

if (-not (Test-Path '.env')) {
    Copy-Item '.env.example' '.env'
    Write-Host '.env cree a partir de .env.example'
}
$envVars = @{}
Get-Content '.env' | Where-Object { $_ -match '^\s*([A-Z_]+)\s*=\s*(.*)$' } | ForEach-Object { $envVars[$Matches[1]] = $Matches[2].Trim() }
$apiPort = if ($envVars['API_HOST_PORT']) { $envVars['API_HOST_PORT'] } else { '3000' }
$grafanaPort = if ($envVars['GRAFANA_HOST_PORT']) { $envVars['GRAFANA_HOST_PORT'] } else { '3001' }
$promPort = if ($envVars['PROMETHEUS_HOST_PORT']) { $envVars['PROMETHEUS_HOST_PORT'] } else { '9090' }

Write-Host 'Construction et demarrage des conteneurs (le premier lancement telecharge les images : plusieurs minutes)...'
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { Write-Host 'ECHEC de docker compose up : voir docs\INSTALLATION_WINDOWS.md (erreurs frequentes)' -ForegroundColor Red; exit 1 }

Write-Host "Attente de l'API sur http://localhost:$apiPort/health/ready ..."
$pret = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        $r = Invoke-RestMethod -Uri "http://localhost:$apiPort/health/ready" -TimeoutSec 3
        if ($r.statut -eq 'ok') { $pret = $true; break }
    } catch { Start-Sleep -Seconds 2 }
}
docker compose ps
if (-not $pret) { Write-Host "L'API ne repond pas. Consultez : docker compose logs api" -ForegroundColor Red; exit 1 }

Write-Host ''
Write-Host 'Pile demarree :' -ForegroundColor Green
Write-Host "  API          http://localhost:$apiPort            (liste des routes)"
Write-Host "  Transactions http://localhost:$apiPort/api/transactions"
Write-Host "  Metriques    http://localhost:$apiPort/metrics"
Write-Host "  Prometheus   http://localhost:$promPort/targets"
Write-Host "  Grafana      http://localhost:$grafanaPort        (admin / admin)"
Write-Host ''
Write-Host 'Etape suivante : charger les donnees -> scripts\charger-donnees.ps1'
