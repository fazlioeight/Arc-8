<#
.SYNOPSIS
  One-click deployment script from local Arc-8 workspace to AWS EC2 (16.59.20.139).

.DESCRIPTION
  1. Builds the production frontend bundle (via local npm or Docker node:20-alpine).
  2. Packages backend source and frontend/build into compressed tarballs.
  3. Uploads both bundles to ubuntu@16.59.20.139:/home/ubuntu/arc8 via SCP.
  4. Extracts updates, restarts arc8-backend, arc8-frontend (7777), and arc8-frontend-testing (7778).
  5. Runs database migrations/seeds and verifies HTTP 200 health checks.
  6. Optionally commits & pushes to GitHub (-GitPush -CommitMessage "...").

.EXAMPLE
  .\deploy-aws.ps1
  .\deploy-aws.ps1 -SkipBuild
  .\deploy-aws.ps1 -GitPush -CommitMessage "fix: update clinical workflow"
#>

param(
  [string]$ServerHost = "16.59.20.139",
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
Write-Host "  Arc-8 Local -> AWS EC2 Deployment ($ServerUser@$ServerHost)" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

if (!(Test-Path $SshKeyPath)) {
  throw "SSH key not found at: $SshKeyPath"
}

# 1. Optional Git Commit & Push
if ($GitPush) {
  Write-Host "`n[1/5] Committing and pushing to GitHub remotes..." -ForegroundColor Yellow
  $gitExe = if (Get-Command git -ErrorAction SilentlyContinue) { "git" } else { "C:\Users\DELL\AppData\Local\Programs\MinGit\cmd\git.exe" }
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
      & $gitExe push dev-repo development:main development:development
      & $gitExe push origin development:development main:main testing:testing
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
    try {
      npm run build
    } finally {
      Pop-Location
    }
  } else {
    Write-Host "  -> Local npm not found in PATH; building via Docker (node:20-alpine)..." -ForegroundColor DarkCyan
    $dockerPath = $FrontendDir.Replace('\', '/')
    docker run --rm -v "${dockerPath}:/app" -w /app node:20-alpine npm run build
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

# 4. Upload to AWS EC2 Server via SCP
Write-Host "`n[4/5] Uploading archives to AWS ($ServerUser@$ServerHost`:$RemoteDir)..." -ForegroundColor Yellow
scp -o StrictHostKeyChecking=no -i $SshKeyPath $BackendTar "${ServerUser}@${ServerHost}:${RemoteDir}/deploy_backend.tar.gz"
scp -o StrictHostKeyChecking=no -i $SshKeyPath $FrontendTar "${ServerUser}@${ServerHost}:${RemoteDir}/deploy_frontend.tar.gz"
Write-Host "  -> Upload complete." -ForegroundColor Green

# 5. Extract, Restart Containers, Seed Database & Verify Health on AWS
Write-Host "`n[5/5] Applying updates and restarting Docker services on AWS..." -ForegroundColor Yellow
$seedCmd = if ($SkipSeed) {
  "echo 'Skipping seed scripts (-SkipSeed)'"
} else {
  "docker exec arc8-backend python -m scripts.seed_prominence && docker exec arc8-backend python seed_demo_users.py && docker exec arc8-backend python -m scripts.seed_prominence_demo --topup"
}

$remoteScript = @"
set -e
cd $RemoteDir
tar -xzf deploy_backend.tar.gz -C ./backend
rm -rf ./frontend_build/*
tar -xzf deploy_frontend.tar.gz -C ./frontend_build
docker restart arc8-backend arc8-frontend arc8-frontend-testing
sleep 4
$seedCmd
./status.sh
"@ -replace "`r`n", "`n"

ssh -o StrictHostKeyChecking=no -i $SshKeyPath "${ServerUser}@${ServerHost}" $remoteScript

# Also sync local running Docker containers if Docker is running locally
$localRunning = docker ps --format "{{.Names}}" 2>$null
if ($localRunning -match "arc8-frontend") {
  Write-Host "`nSyncing local Docker containers (arc8-backend, arc8-frontend, arc8-frontend-testing)..." -ForegroundColor DarkCyan
  docker restart arc8-backend arc8-frontend arc8-frontend-testing 2>$null | Out-Null
}

Write-Host "`n=========================================================" -ForegroundColor Green
Write-Host "  AWS Deployment Complete!" -ForegroundColor Green
Write-Host "  To open SSH tunnel for browser access:" -ForegroundColor White
Write-Host "  ssh -i `"$SshKeyPath`" -L 7778:localhost:7778 -L 7777:localhost:7777 -L 8989:localhost:8989 $ServerUser@$ServerHost" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Green
