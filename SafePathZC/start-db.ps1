# SafePath ZC Database Setup (for existing pgAdmin 4)
# Starts PostgreSQL database for use with your installed pgAdmin 4

Write-Host "Setting up SafePath ZC Database..." -ForegroundColor Green

Write-Host "Starting PostgreSQL database..." -ForegroundColor Yellow

# Start only the database
docker-compose -f docker-compose-db-only.yml up postgres -d

Write-Host "Waiting for database to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host "Database Ready!" -ForegroundColor Green
Write-Host ""
Write-Host "Connect with your pgAdmin 4:" -ForegroundColor White
Write-Host "Host: localhost" -ForegroundColor Cyan
Write-Host "Port: 5432" -ForegroundColor Cyan
Write-Host "Database: safepathzc" -ForegroundColor Cyan
Write-Host "Username: safepathzc_user" -ForegroundColor Cyan
Write-Host "Password: safepath123" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Open your pgAdmin 4" -ForegroundColor Gray
Write-Host "2. Right-click Servers -> Create -> Server" -ForegroundColor Gray
Write-Host "3. Name: SafePath ZC" -ForegroundColor Gray
Write-Host "4. Connection tab: Use the details above" -ForegroundColor Gray
Write-Host "5. Click Save to connect!" -ForegroundColor Gray
Write-Host ""
Write-Host "Database is ready for your pgAdmin 4!" -ForegroundColor Green