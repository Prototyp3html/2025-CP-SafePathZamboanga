# Rebuild OSRM with high-quality road data
# Run this when routes look weird or after updating road data

Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   OSRM Rebuild Script - SafePath Zamboanga" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Navigate to backend directory
Set-Location backend

Write-Host "Step 1: Running Python rebuild script..." -ForegroundColor Yellow
python rebuild_osrm.py

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ OSRM rebuild failed!" -ForegroundColor Red
    Write-Host "   Make sure Docker is running and backend/data/zcroadmap.geojson exists" -ForegroundColor Red
    Set-Location ..
    exit 1
}

Write-Host ""
Write-Host "Step 2: Restarting OSRM container..." -ForegroundColor Yellow
Set-Location ..
docker-compose restart osrm-driving

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ OSRM successfully rebuilt and restarted!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Wait 30 seconds for OSRM to fully start, then test routing." -ForegroundColor Green
    Write-Host "Routes should now:" -ForegroundColor Green
    Write-Host "  • Prefer major roads (highways, primary roads)" -ForegroundColor Green
    Write-Host "  • Avoid dead-end streets" -ForegroundColor Green
    Write-Host "  • Have better route quality" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "⚠️  OSRM data rebuilt but container restart failed" -ForegroundColor Yellow
    Write-Host "   Run manually: docker-compose restart osrm-driving" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
