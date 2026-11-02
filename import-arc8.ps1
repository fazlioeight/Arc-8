# Import/Restore script for Arc-8 System on Target Computer
# Run this script on the destination PC inside the Arc8_Transfer_Bundle directory.

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "       Arc-8 System Docker Transfer Restorer      " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Load Docker Images
if (Test-Path "arc8_docker_images.tar") {
    Write-Host "[1/3] Loading pre-built Docker Images (this may take a few minutes)..." -ForegroundColor Green
    docker load -i "arc8_docker_images.tar"
} else {
    Write-Host "[1/3] arc8_docker_images.tar not found. Docker will build images during compose up." -ForegroundColor Yellow
}

# 2. Start Docker Containers
Write-Host "[2/3] Starting Docker containers with Docker Compose..." -ForegroundColor Green
docker compose up -d

Write-Host "Waiting 10 seconds for PostgreSQL to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 10

# 3. Restore Database Dump
if (Test-Path "arc8_db_backup.sql") {
    Write-Host "[3/3] Restoring PostgreSQL Database from dump..." -ForegroundColor Green
    Get-Content "arc8_db_backup.sql" | docker exec -i arc8-postgres psql -U postgres
    if ($LASTEXITCODE -eq 0) {
        Write-Host "      Database restored successfully!" -ForegroundColor Gray
    } else {
        Write-Host "      WARNING: Database restore encountered errors." -ForegroundColor Red
    }
} else {
    Write-Host "[3/3] No database dump found (arc8_db_backup.sql)." -ForegroundColor Yellow
}

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "SUCCESS! Arc-8 System Restored & Running!" -ForegroundColor Green
Write-Host "Frontend: http://localhost:7777" -ForegroundColor Yellow
Write-Host "Backend API: http://localhost:8989" -ForegroundColor Yellow
Write-Host "PostgreSQL: localhost:5432" -ForegroundColor Yellow
Write-Host "Redis: localhost:6379" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Cyan
