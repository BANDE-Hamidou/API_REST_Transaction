# Verifie les prerequis du poste Windows avant de lancer le projet.
# Usage (depuis la racine du projet) :  powershell -ExecutionPolicy Bypass -File scripts\verifier-prerequis.ps1
$ErrorActionPreference = 'Continue'
$ok = $true
function Resultat($etat, $msg) {
    $couleur = @{ 'OK' = 'Green'; 'ATTENTION' = 'Yellow'; 'ECHEC' = 'Red' }[$etat]
    Write-Host ("[{0,-9}] {1}" -f $etat, $msg) -ForegroundColor $couleur
    if ($etat -eq 'ECHEC') { $script:ok = $false }
}

$racine = Split-Path -Parent $PSScriptRoot
Write-Host "Dossier du projet : $racine"
if ($racine -match '[&\s]' -or $racine -match '[^\x00-\x7F]') {
    Resultat 'ECHEC' "Le chemin contient un espace, un '&' ou un accent : npm et Docker peuvent echouer. Clonez le projet dans C:\projets\groupe5-api-transactions"
} else { Resultat 'OK' 'Chemin du projet sans espace, & ni accent' }

# Node.js >= 22
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    $v = (node -v).TrimStart('v'); $majeur = [int]($v.Split('.')[0])
    if ($majeur -ge 22) { Resultat 'OK' "Node.js $v" } else { Resultat 'ECHEC' "Node.js $v : version 22 ou plus requise (https://nodejs.org)" }
} else { Resultat 'ECHEC' 'Node.js absent (https://nodejs.org, version LTS 22 ou plus)' }

# Git
if (Get-Command git -ErrorAction SilentlyContinue) { Resultat 'OK' (git --version) } else { Resultat 'ECHEC' 'Git absent (https://git-scm.com)' }

# Docker
if (Get-Command docker -ErrorAction SilentlyContinue) {
    Resultat 'OK' (docker --version)
    $compose = docker compose version 2>$null
    if ($LASTEXITCODE -eq 0) { Resultat 'OK' $compose } else { Resultat 'ECHEC' 'docker compose indisponible : mettre a jour Docker Desktop' }
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { Resultat 'OK' 'Moteur Docker demarre' } else { Resultat 'ECHEC' 'Docker Desktop n est pas demarre (lancez-le et attendez "Engine running")' }
} else { Resultat 'ECHEC' 'Docker Desktop absent (https://www.docker.com/products/docker-desktop)' }

# KNIME (facultatif sur les postes qui ne font pas l'ETL)
$knime = @("$env:ProgramFiles\KNIME\knime.exe", "$env:LOCALAPPDATA\Programs\KNIME\knime.exe", "$env:USERPROFILE\knime\knime.exe") | Where-Object { Test-Path $_ }
if ($knime) { Resultat 'OK' "KNIME trouve : $($knime[0])" } else { Resultat 'ATTENTION' 'KNIME non trouve aux emplacements habituels (obligatoire seulement pour Roseline / poste ETL)' }

# Ports libres
foreach ($port in 3000, 3001, 5432, 9090) {
    $occupe = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($occupe) {
        $proc = (Get-Process -Id $occupe[0].OwningProcess -ErrorAction SilentlyContinue).ProcessName
        if ($proc -match 'docker|com.docker|wslrelay|vpnkit') { Resultat 'OK' "Port $port utilise par Docker (projet deja demarre ?)" }
        else { Resultat 'ATTENTION' "Port $port deja utilise par '$proc' : changez le port correspondant dans .env" }
    } else { Resultat 'OK' "Port $port libre" }
}

# Fichier .env
if (Test-Path (Join-Path $racine '.env')) { Resultat 'OK' '.env present' } else { Resultat 'ATTENTION' '.env absent : Copy-Item .env.example .env (fait automatiquement par scripts\demarrer.ps1)' }

Write-Host ''
if ($ok) { Write-Host 'Prerequis OK : vous pouvez lancer scripts\demarrer.ps1' -ForegroundColor Green; exit 0 }
else { Write-Host 'Corrigez les points en ECHEC avant de continuer (voir docs\INSTALLATION_WINDOWS.md)' -ForegroundColor Red; exit 1 }
