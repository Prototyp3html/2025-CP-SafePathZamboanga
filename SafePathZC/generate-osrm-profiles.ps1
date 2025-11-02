# Script to generate OSRM data files for truck and jeepney profiles
# Run this script from the SafePathZC directory

Write-Host "=== OSRM Data Generation for Truck and Jeepney Profiles ===" -ForegroundColor Cyan
Write-Host ""

# Get the script directory and set it as working directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$OSM_FILE = "backend/osrm-data/zamboanga_roads.osm"
$PROFILES_DIR = "backend/osrm-profiles"
$OUTPUT_DIR = "backend/osrm-data"

# Check if OSM file exists
if (!(Test-Path $OSM_FILE)) {
    Write-Host "ERROR: OSM file not found: $OSM_FILE" -ForegroundColor Red
    Write-Host "Please ensure zamboanga_roads.osm exists in the osrm-data directory." -ForegroundColor Yellow
    exit 1
}

Write-Host "Found OSM file: $OSM_FILE" -ForegroundColor Green
Write-Host ""

# Function to process a profile
function Process-Profile {
    param(
        [string]$ProfileName,
        [string]$ProfileFile,
        [string]$OutputName
    )
    
    Write-Host "Processing $ProfileName profile..." -ForegroundColor Yellow
    Write-Host "  Profile: $ProfileFile" -ForegroundColor Gray
    Write-Host "  Output: $OutputName" -ForegroundColor Gray
    
    # Extract
    Write-Host "  [1/3] Extracting..." -ForegroundColor Cyan
    docker run --rm `
        -v "${PWD}/backend/osrm-data:/data" `
        -v "${PWD}/backend/osrm-profiles:/profiles" `
        osrm/osrm-backend `
        osrm-extract `
        -p /profiles/$ProfileFile `
        /data/zamboanga_roads.osm
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: Extract failed for $ProfileName" -ForegroundColor Red
        return $false
    }
    
    # Rename the output files
    Write-Host "  Renaming output files..." -ForegroundColor Gray
    Get-ChildItem "backend/osrm-data/zamboanga_roads.osrm*" | ForEach-Object {
        $newName = $_.Name -replace "zamboanga_roads", $OutputName
        Move-Item -Path $_.FullName -Destination "backend/osrm-data/$newName" -Force
    }
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: Extract failed for $ProfileName" -ForegroundColor Red
        return $false
    }
    
    # Partition (MLD algorithm)
    Write-Host "  [2/3] Partitioning (MLD)..." -ForegroundColor Cyan
    docker run --rm `
        -v "${PWD}/backend/osrm-data:/data" `
        osrm/osrm-backend `
        osrm-partition /data/$OutputName.osrm
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: Partition failed for $ProfileName" -ForegroundColor Red
        return $false
    }
    
    # Customize
    Write-Host "  [3/3] Customizing..." -ForegroundColor Cyan
    docker run --rm `
        -v "${PWD}/backend/osrm-data:/data" `
        osrm/osrm-backend `
        osrm-customize /data/$OutputName.osrm
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: Customize failed for $ProfileName" -ForegroundColor Red
        return $false
    }
    
    Write-Host "  SUCCESS: $ProfileName profile processed!" -ForegroundColor Green
    Write-Host ""
    return $true
}

# Process Truck profile
$truckSuccess = Process-Profile -ProfileName "Truck" -ProfileFile "truck.lua" -OutputName "zamboanga-truck"

# Process Jeepney (Public Transport) profile
$jeepneySuccess = Process-Profile -ProfileName "Jeepney" -ProfileFile "jeepney.lua" -OutputName "zamboanga-jeepney"

# Summary
Write-Host "=== Processing Complete ===" -ForegroundColor Cyan
Write-Host ""
if ($truckSuccess) {
    Write-Host "Truck profile: READY" -ForegroundColor Green
} else {
    Write-Host "Truck profile: FAILED" -ForegroundColor Red
}

if ($jeepneySuccess) {
    Write-Host "Jeepney profile: READY" -ForegroundColor Green
} else {
    Write-Host "Jeepney profile: FAILED" -ForegroundColor Red
}

Write-Host ""
if ($truckSuccess -and $jeepneySuccess) {
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Update docker-compose.yml to add osrm-truck and osrm-jeepney services" -ForegroundColor Gray
    Write-Host "2. Run docker-compose up -d to start the new OSRM containers" -ForegroundColor Gray
    Write-Host "3. Update transportation_modes.py to use the new endpoints" -ForegroundColor Gray
} else {
    Write-Host "Please fix the errors above and run this script again." -ForegroundColor Red
}
