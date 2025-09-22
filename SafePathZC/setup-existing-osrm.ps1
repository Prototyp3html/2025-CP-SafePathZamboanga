# SafePathZC Multi-Profile OSRM Setup Script (Windows PowerShell)
# This script sets up multi-profile OSRM routing using your existing data

Write-Host "SafePathZC Multi-Profile OSRM Setup" -ForegroundColor Green
Write-Host "======================================="

$existingDataPath = "C:\Users\Lenovo\osrm-data"

# Check if existing OSRM data exists
if (Test-Path $existingDataPath) {
    Write-Host "Found existing OSRM data at: $existingDataPath" -ForegroundColor Green
    
    # Use the existing data directory directly
    Set-Location $existingDataPath
    
    Write-Host "Working in existing data directory: $existingDataPath" -ForegroundColor Yellow
    
    # Create DRIVING profile (Cars/Motorcycles) 
    Write-Host "Creating fresh DRIVING profile..." -ForegroundColor Cyan
    
    # Use existing zamboanga.osm.pbf if available
    if (Test-Path "zamboanga.osm.pbf") {
        $sourceFile = "zamboanga.osm.pbf"
    }
    elseif (Test-Path "philippines-latest.osm.pbf") {
        $sourceFile = "philippines-latest.osm.pbf"
    }
    else {
        Write-Host "No source OSM file found!" -ForegroundColor Red
        Write-Host "Please ensure you have zamboanga.osm.pbf or philippines-latest.osm.pbf in the data directory." -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "Using source file: $sourceFile for driving profile" -ForegroundColor Cyan
    
    # Remove old driving files if they exist
    Remove-Item "zamboanga-driving.osrm*" -Force -ErrorAction SilentlyContinue
    
    # Extract for driving (default car profile)
    docker run --rm -t -v "${PWD}:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/$sourceFile
    
    # Rename to driving profile
    Get-ChildItem "zamboanga.osrm*" | ForEach-Object {
        $newName = $_.Name -replace "zamboanga\.osrm", "zamboanga-driving.osrm"
        Move-Item $_.FullName $newName -Force
    }
    
    # Partition and customize for driving
    docker run --rm -t -v "${PWD}:/data" osrm/osrm-backend osrm-partition /data/zamboanga-driving.osrm
    docker run --rm -t -v "${PWD}:/data" osrm/osrm-backend osrm-customize /data/zamboanga-driving.osrm
    
    Write-Host "Driving profile created!" -ForegroundColor Green
    
    # Create WALKING profile (Pedestrians)
    Write-Host "Creating fresh WALKING profile..." -ForegroundColor Cyan
    
    Write-Host "Using source file: $sourceFile for walking profile" -ForegroundColor Cyan
    
    # Remove old walking files if they exist
    Remove-Item "zamboanga-foot.osrm*" -Force -ErrorAction SilentlyContinue
    
    # Extract for walking
    docker run --rm -t -v "${PWD}:/data" osrm/osrm-backend osrm-extract -p /opt/foot.lua /data/$sourceFile
    
    # Rename to foot profile
    Get-ChildItem "zamboanga.osrm*" | ForEach-Object {
        $newName = $_.Name -replace "zamboanga\.osrm", "zamboanga-foot.osrm"
        Move-Item $_.FullName $newName -Force
    }
    
    # Partition and customize
    docker run --rm -t -v "${PWD}:/data" osrm/osrm-backend osrm-partition /data/zamboanga-foot.osrm
    docker run --rm -t -v "${PWD}:/data" osrm/osrm-backend osrm-customize /data/zamboanga-foot.osrm
    
    Write-Host "Walking profile created!" -ForegroundColor Green
    
}
else {
    Write-Host "Existing OSRM data not found at: $existingDataPath" -ForegroundColor Red
    Write-Host "Please make sure your OSRM data is at the correct location." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Multi-profile OSRM setup complete!" -ForegroundColor Green
Write-Host "Data location: $existingDataPath" -ForegroundColor Blue
Write-Host ""
Write-Host "To start both OSRM services, run these commands in separate terminals:" -ForegroundColor Yellow
Write-Host ""
Write-Host "Terminal 1 (Driving):" -ForegroundColor Cyan
Write-Host "docker run -t -i -p 5000:5000 -v `"$existingDataPath`":/data osrm/osrm-backend osrm-routed --algorithm mld /data/zamboanga-driving.osrm" -ForegroundColor White
Write-Host ""
Write-Host "Terminal 2 (Walking):" -ForegroundColor Cyan  
Write-Host "docker run -t -i -p 5001:5000 -v `"$existingDataPath`":/data osrm/osrm-backend osrm-routed --algorithm mld /data/zamboanga-foot.osrm" -ForegroundColor White
Write-Host ""
Write-Host "OSRM services will be available at:" -ForegroundColor Blue
Write-Host "   Driving (cars/motorcycles): http://localhost:5000" -ForegroundColor Blue
Write-Host "   Walking (pedestrians): http://localhost:5001" -ForegroundColor Blue
Write-Host ""
Write-Host "Test routes:" -ForegroundColor Blue
$drivingUrl = "http://localhost:5000/route/v1/driving/122.079,6.9214;122.08,6.92"
$walkingUrl = "http://localhost:5001/route/v1/foot/122.079,6.9214;122.08,6.92"
Write-Host "   Car: $drivingUrl" -ForegroundColor Blue
Write-Host "   Walk: $walkingUrl" -ForegroundColor Blue
Write-Host ""
Write-Host "Your SafePathZC app will now show DIFFERENT routes for each transport mode!" -ForegroundColor Green