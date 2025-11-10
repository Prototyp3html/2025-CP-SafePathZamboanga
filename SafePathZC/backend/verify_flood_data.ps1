# ============================================================================
# Verify Flood Data Source - Quick Check
# ============================================================================
# This script verifies that your backend is using the updated terrain_roads.geojson
# ============================================================================

Write-Host "╔════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  SafePathZC - Flood Data Verification                             ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
$CurrentPath = Get-Location
if (-not (Test-Path "data\terrain_roads.geojson")) {
    Write-Host "❌ Error: terrain_roads.geojson not found!" -ForegroundColor Red
    Write-Host "   Make sure you're in SafePathZC\backend\" -ForegroundColor Yellow
    Write-Host "   Current path: $CurrentPath" -ForegroundColor Yellow
    exit 1
}

Write-Host "📂 Checking terrain_roads.geojson..." -ForegroundColor Cyan
Write-Host ""

# Get file information
$GeoJSONFile = Get-Item "data\terrain_roads.geojson"
$FileSizeMB = [math]::Round($GeoJSONFile.Length / 1MB, 2)
$LastModified = $GeoJSONFile.LastWriteTime
$AgeHours = [math]::Round(((Get-Date) - $LastModified).TotalHours, 1)

Write-Host "📄 File Information:" -ForegroundColor Yellow
Write-Host "   Path:          $($GeoJSONFile.FullName)" -ForegroundColor White
Write-Host "   Size:          $FileSizeMB MB" -ForegroundColor White
Write-Host "   Last Modified: $($LastModified.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor White
Write-Host "   Age:           $AgeHours hours old" -ForegroundColor White

# Check if data is fresh (less than 6 hours old)
if ($AgeHours -lt 6) {
    Write-Host "   Status:        ✅ FRESH (updated within 6 hours)" -ForegroundColor Green
} elseif ($AgeHours -lt 24) {
    Write-Host "   Status:        ⚠️  STALE (should update every 6 hours)" -ForegroundColor Yellow
} else {
    Write-Host "   Status:        ❌ OUTDATED (last update was $AgeHours hours ago)" -ForegroundColor Red
}

Write-Host ""
Write-Host "🌊 Flood Data Statistics:" -ForegroundColor Yellow

# Count flooded roads
$FloodedCount = (Select-String '"flooded": "1"' "data\terrain_roads.geojson").Count
$TotalCount = (Select-String '"type": "Feature"' "data\terrain_roads.geojson").Count
$FloodPercentage = [math]::Round(($FloodedCount / $TotalCount) * 100, 1)

Write-Host "   Total Roads:   $TotalCount" -ForegroundColor White
Write-Host "   Flooded Roads: $FloodedCount ($FloodPercentage%)" -ForegroundColor White
Write-Host "   Safe Roads:    $($TotalCount - $FloodedCount) ($([math]::Round(100 - $FloodPercentage, 1))%)" -ForegroundColor White

Write-Host ""
Write-Host "🔍 Backend Service Check:" -ForegroundColor Yellow

# Check if backend is running
$PythonProcess = Get-Process python -ErrorAction SilentlyContinue | Where-Object {$_.Path -like "*Python*"}

if ($PythonProcess) {
    Write-Host "   Backend Status: ✅ RUNNING (PID: $($PythonProcess.Id))" -ForegroundColor Green
    Write-Host "   Memory Usage:   $([math]::Round($PythonProcess.WorkingSet64 / 1MB, 0)) MB" -ForegroundColor White
    
    # Try to check API endpoint
    Write-Host ""
    Write-Host "   Testing API endpoints..." -ForegroundColor Cyan
    
    try {
        # Check health endpoint
        $Health = Invoke-RestMethod -Uri "http://localhost:8000/health" -TimeoutSec 2 -ErrorAction Stop
        Write-Host "   ✅ API is responding" -ForegroundColor Green
        
        # Try to get flood data timestamp from logs
        if (Test-Path "logs\flood_updates.log") {
            $LastUpdate = Get-Content "logs\flood_updates.log" -Tail 1
            Write-Host "   📝 Last log entry: $LastUpdate" -ForegroundColor White
        }
        
    } catch {
        Write-Host "   ⚠️  API not responding (is uvicorn running?)" -ForegroundColor Yellow
    }
    
} else {
    Write-Host "   Backend Status: ❌ NOT RUNNING" -ForegroundColor Red
    Write-Host ""
    Write-Host "   To start backend:" -ForegroundColor Yellow
    Write-Host "   uvicorn main:app --reload" -ForegroundColor White
}

Write-Host ""
Write-Host "📊 Service Loading Check:" -ForegroundColor Yellow

# Check if services are logging properly
if (Test-Path "logs\flood_updates.log") {
    Write-Host "   ✅ Update log exists" -ForegroundColor Green
    
    # Get last few log lines
    $LogLines = Get-Content "logs\flood_updates.log" -Tail 5
    
    # Check for recent updates
    $LastLogTime = $null
    foreach ($line in $LogLines) {
        if ($line -match "(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})") {
            $LastLogTime = [DateTime]::Parse($matches[1])
            break
        }
    }
    
    if ($LastLogTime) {
        $LogAge = ((Get-Date) - $LastLogTime).TotalHours
        Write-Host "   Last update log: $($LastLogTime.ToString('yyyy-MM-dd HH:mm:ss')) ($([math]::Round($LogAge, 1)) hours ago)" -ForegroundColor White
        
        if ($LogAge -lt 6) {
            Write-Host "   ✅ Recent update detected" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  No recent updates in log" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "   ⚠️  No update log found (logs\flood_updates.log)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Summary
Write-Host "🎯 Summary:" -ForegroundColor Cyan
Write-Host ""

if ($AgeHours -lt 6 -and $FloodedCount -gt 0) {
    Write-Host "✅ Your flood data is FRESH and loaded!" -ForegroundColor Green
    Write-Host "   The backend is using the updated terrain_roads.geojson" -ForegroundColor Green
} elseif ($FloodedCount -eq 0) {
    Write-Host "⚠️  Warning: No flooded roads detected" -ForegroundColor Yellow
    Write-Host "   This might mean:" -ForegroundColor Yellow
    Write-Host "   • Current weather is clear (no rainfall)" -ForegroundColor White
    Write-Host "   • Update hasn't run yet" -ForegroundColor White
    Write-Host "   • Issue with flood calculation" -ForegroundColor White
} elseif ($AgeHours -gt 6) {
    Write-Host "⚠️  Your flood data is outdated ($AgeHours hours old)" -ForegroundColor Yellow
    Write-Host "   Consider running an update:" -ForegroundColor Yellow
    Write-Host "   python update_flood_data.py" -ForegroundColor White
}

Write-Host ""
Write-Host "🔧 Quick Actions:" -ForegroundColor Cyan
Write-Host "   Run update now:         python update_flood_data.py" -ForegroundColor White
Write-Host "   View update logs:       Get-Content logs\flood_updates.log -Tail 20" -ForegroundColor White
Write-Host "   Start backend:          uvicorn main:app --reload" -ForegroundColor White
Write-Host "   Check file details:     Get-Item data\terrain_roads.geojson | Format-List" -ForegroundColor White
Write-Host ""
