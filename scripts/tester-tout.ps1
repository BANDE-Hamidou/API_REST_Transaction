# Lance toutes les verifications automatiques, dans l'ordre.
# Usage (racine du projet) : powershell -ExecutionPolicy Bypass -File scripts\tester-tout.ps1 [-SansE2E]
param([switch]$SansE2E)
$racine = Split-Path -Parent $PSScriptRoot
Set-Location $racine
$bilan = [ordered]@{}

function Etape($nom, [scriptblock]$action) {
    Write-Host "`n=== $nom ===" -ForegroundColor Cyan
    & $action
    $script:bilan[$nom] = if ($LASTEXITCODE -eq 0) { 'REUSSI' } else { 'ECHEC' }
}

Etape 'Coherence du projet (npm run check)' { npm run check }
Etape 'Tests donnees / regles KNIME (npm run test:data)' { npm run test:data }
if (-not (Test-Path 'api\node_modules')) { Push-Location api; npm install; Pop-Location }
Etape 'Tests unitaires + API (cd api; npm test)' { Push-Location api; npm test; Pop-Location }
if (-not $SansE2E) {
    Etape 'Test de bout en bout (npm run test:e2e, pile demarree)' { npm run test:e2e }
}

Write-Host "`n=== BILAN ===" -ForegroundColor Cyan
$bilan.GetEnumerator() | ForEach-Object {
    $c = if ($_.Value -eq 'REUSSI') { 'Green' } else { 'Red' }
    Write-Host ("{0,-8} {1}" -f $_.Value, $_.Key) -ForegroundColor $c
}
if ($bilan.Values -contains 'ECHEC') { exit 1 }
