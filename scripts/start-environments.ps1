# Starts both Development and Testing environments side-by-side
Write-Host "Starting Arc-8 Multi-Environment Stack..." -ForegroundColor Cyan

docker start arc8-postgres arc8-redis arc8-backend
docker start arc8-frontend arc8-frontend-testing

Write-Host "Both environments are running!" -ForegroundColor Green
Write-Host "  -> Development (Enhanced): http://localhost:7777" -ForegroundColor Yellow
Write-Host "  -> Testing (Baseline):     http://localhost:7778" -ForegroundColor Yellow
