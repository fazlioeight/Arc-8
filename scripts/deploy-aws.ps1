<#
.SYNOPSIS
  One-click deployment script from local Arc-8 workspace to AWS EC2 servers:
  - 16.59.20.139 (dev.arc8-mvp.site & arc8-mvp.site)
  - 3.130.110.51 (test.arc8-mvp.site)

.DESCRIPTION
  1. Builds the production frontend bundle (via local npm or Docker node:20-alpine).
  2. Packages backend source and frontend/build into compressed tarballs.
  3. Uploads both bundles to all target AWS EC2 servers via SCP.
  4. Extracts updates, restarts arc8-backend, arc8-frontend (7777), arc8-frontend-testing (7778), and arc8-frontend-prod (7779).
  5. Runs database migrations, UHS SFTP batch import, and demo seeds, and verifies HTTP 200 health checks.
  6. Optionally commits & pushes to GitHub (-GitPush -CommitMessage "...").

.EXAMPLE
  .\deploy-aws.ps1
  .\deploy-aws.ps1 -SkipBuild
  .\deploy-aws.ps1 -GitPush -CommitMessage "fix: update clinical workflow"
#>

param(
  [string[]]$ServerHosts = @("16.59.20.139", "3.130.110.51"),
  [string]$ServerUser = "ubuntu",
  [string]$SshKeyPath = "D:\OnStak-Projects\VPS\arc8-key.pem",
  [string]$RemoteDir  = "/home/ubuntu/arc8",
  [switch]$SkipBuild  = $false,
  [switch]$SkipSeed   = $false,
  [switch]$GitPush    = $false,
  [string]$CommitMessage = "chore(deploy): sync local updates to AWS and GitHub"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ($ProjectRoot -like "*\scripts") {
  $ProjectRoot = Split-Path -Parent $ProjectRoot
}

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "  Arc-8 Local -> AWS EC2 Deployment ($($ServerHosts -join ', '))" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

if (!(Test-Path $SshKeyPath)) {
  throw "SSH key not found at: $SshKeyPath"
}

# 1. Optional Git Commit & Push
if ($GitPush) {
  Write-Host "`n[1/5] Committing and pushing to GitHub remotes..." -ForegroundColor Yellow
  $gitCmd = Get-Command git -ErrorAction SilentlyContinue
  $gitExe = if ($gitCmd) { $gitCmd.Source } else { "C:\Users\DELL\AppData\Local\Programs\MinGit\cmd\git.exe" }
  if (Test-Path $gitExe) {
    Push-Location $ProjectRoot
    try {
      & $gitExe add -A
      $status = & $gitExe status --porcelain
      if ($status) {
        & $gitExe commit -m $CommitMessage
      }
      & $gitExe branch -f main HEAD
      & $gitExe branch -f testing HEAD
      & $gitExe push dev-repo development:development main:main testing:testing
      & $gitExe push origin development:development main:main testing:testing
      try { & $gitExe push oeight development:development main:main testing:testing } catch { Write-Warning "oeight push skipped: $($_.Exception.Message)" }
      Write-Host "  -> GitHub remotes updated." -ForegroundColor Green
    } finally {
      Pop-Location
    }
  } else {
    Write-Warning "Git executable not found; skipping Git push."
  }
} else {
  Write-Host "`n[1/5] Skipping Git push (pass -GitPush to enable)." -ForegroundColor DarkGray
}

# 2. Build Frontend Production Bundle
$FrontendDir = Join-Path $ProjectRoot "frontend"
$BuildDir    = Join-Path $FrontendDir "build"

if (-not $SkipBuild) {
  Write-Host "`n[2/5] Building production frontend bundle..." -ForegroundColor Yellow
  if (Get-Command npm -ErrorAction SilentlyContinue) {
    Push-Location $FrontendDir
    $prevApiBase = $env:REACT_APP_API_BASE
    try {
      $env:REACT_APP_API_BASE = ""
      $env:REACT_APP_DEFAULT_TENANT = "prominencehealth"
      npm run build
    } finally {
      $env:REACT_APP_API_BASE = $prevApiBase
      Pop-Location
    }
  } else {
    Write-Host "  -> Local npm not found in PATH; building via Docker (node:20-alpine)..." -ForegroundColor DarkCyan
    $dockerPath = $FrontendDir.Replace('\', '/')
    docker run --rm -v "${dockerPath}:/app" -w /app -e CI=false -e REACT_APP_API_BASE="" -e REACT_APP_DEFAULT_TENANT="prominencehealth" node:20-alpine npm run build
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Frontend build failed with exit code $LASTEXITCODE"
  }
  Write-Host "  -> Frontend build completed." -ForegroundColor Green
} else {
  Write-Host "`n[2/5] Skipping frontend build (-SkipBuild)." -ForegroundColor DarkGray
}

if (!(Test-Path (Join-Path $BuildDir "index.html"))) {
  throw "Frontend build output not found at $BuildDir. Run without -SkipBuild first."
}

# 3. Package Backend & Frontend Build
Write-Host "`n[3/5] Packaging backend and frontend_build archives..." -ForegroundColor Yellow
$BackendTar  = Join-Path $env:TEMP "arc8_deploy_backend.tar.gz"
$FrontendTar = Join-Path $env:TEMP "arc8_deploy_frontend.tar.gz"

if (Test-Path $BackendTar)  { Remove-Item $BackendTar -Force }
if (Test-Path $FrontendTar) { Remove-Item $FrontendTar -Force }

tar -czf $BackendTar `
  --exclude="__pycache__" `
  --exclude=".pytest_cache" `
  --exclude=".venv" `
  --exclude="venv" `
  --exclude="data" `
  --exclude="logs" `
  --exclude="*.db" `
  --exclude="*.db-journal" `
  -C (Join-Path $ProjectRoot "backend") .

tar -czf $FrontendTar -C $BuildDir .

Write-Host "  -> Packaged backend ($([math]::Round((Get-Item $BackendTar).Length / 1KB, 1)) KB) & frontend ($([math]::Round((Get-Item $FrontendTar).Length / 1KB, 1)) KB)." -ForegroundColor Green

# 4 & 5. Upload, Extract, Restart Containers, Seed Database & Verify Health on each AWS Server
$seedCmd = if ($SkipSeed) {
  "echo 'Skipping seed scripts (-SkipSeed)'"
} else {
  "docker exec arc8-backend python -m scripts.seed_prominence && docker exec arc8-backend python seed_demo_users.py && docker exec arc8-backend python -m scripts.import_uhs_sftp_dir && docker exec arc8-backend python -m scripts.seed_prominence_demo"
}

$remoteScript = @"
set -e
cd $RemoteDir
tar -xzf deploy_backend.tar.gz -C ./backend
rm -rf ./frontend_build/*
tar -xzf deploy_frontend.tar.gz -C ./frontend_build
docker restart arc8-backend arc8-frontend arc8-frontend-testing arc8-frontend-prod 2>/dev/null || docker restart arc8-backend arc8-frontend arc8-frontend-testing
sleep 4
$seedCmd
./status.sh
"@ -replace "`r`n", "`n"

foreach ($ServerHost in $ServerHosts) {
  Write-Host "`n[4/5] Uploading archives to AWS ($ServerUser@$ServerHost`:$RemoteDir)..." -ForegroundColor Yellow
  scp -o StrictHostKeyChecking=no -i $SshKeyPath $BackendTar "${ServerUser}@${ServerHost}:${RemoteDir}/deploy_backend.tar.gz"
  scp -o StrictHostKeyChecking=no -i $SshKeyPath $FrontendTar "${ServerUser}@${ServerHost}:${RemoteDir}/deploy_frontend.tar.gz"
  Write-Host "  -> Upload complete for $ServerHost." -ForegroundColor Green

  Write-Host "`n[5/5] Applying updates, restarting Docker services, and seeding DB on $ServerHost..." -ForegroundColor Yellow
  ssh -o StrictHostKeyChecking=no -i $SshKeyPath "${ServerUser}@${ServerHost}" $remoteScript
}

# Also sync local running Docker containers if Docker is running locally
$localRunning = docker ps --format "{{.Names}}" 2>$null
if ($localRunning -match "arc8-frontend") {
  Write-Host "`nSyncing local Docker containers (arc8-backend, arc8-frontend, arc8-frontend-testing)..." -ForegroundColor DarkCyan
  docker restart arc8-backend arc8-frontend arc8-frontend-testing 2>$null | Out-Null
  if (-not $SkipSeed) {
    docker exec arc8-backend python -m scripts.seed_prominence_demo | Out-Null
  }
}

Write-Host "`n=========================================================" -ForegroundColor Green
Write-Host "  AWS Multi-Server Deployment Complete!" -ForegroundColor Green
Write-Host "  Servers Updated: $($ServerHosts -join ', ')" -ForegroundColor Cyan
Write-Host "  Domains Synced:  https://dev.arc8-mvp.site | https://test.arc8-mvp.site | https://arc8-mvp.site" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Green
