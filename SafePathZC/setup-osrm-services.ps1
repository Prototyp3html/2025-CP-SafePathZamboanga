# Setup OSRM Services for Railway Deployment

Write-Host "Setting up OSRM services..." -ForegroundColor Cyan

$baseDir = "osrm-services"
$services = @(
    @{name="driving"; file="zamboanga-driving.osrm"},
    @{name="walking"; file="zamboanga-foot.osrm"},
    @{name="bicycle"; file="zamboanga-bicycle.osrm"},
    @{name="truck"; file="zamboanga-truck.osrm"},
    @{name="jeepney"; file="zamboanga-jeepney.osrm"}
)

if (-not (Test-Path $baseDir)) {
    New-Item -ItemType Directory -Path $baseDir | Out-Null
}

foreach ($service in $services) {
    $serviceName = $service.name
    $osrmFile = $service.file
    
    Write-Host "Setting up $serviceName..." -ForegroundColor Yellow
    
    $serviceDir = Join-Path $baseDir $serviceName
    $dataDir = Join-Path $serviceDir "data"
    
    New-Item -ItemType Directory -Path $serviceDir -Force | Out-Null
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    
    $sourcePattern = "backend\osrm-data\$osrmFile*"
    $copiedFiles = Copy-Item $sourcePattern -Destination $dataDir -PassThru -Force
    $fileCount = ($copiedFiles | Measure-Object).Count
    
    Write-Host "  Copied $fileCount files" -ForegroundColor Green
    
    # Create Dockerfile
    $dockerfilePath = Join-Path $serviceDir "Dockerfile"
    $dockerfileContent = "FROM osrm/osrm-backend
COPY data/ /data/
EXPOSE 5000
CMD [""osrm-routed"", ""--algorithm"", ""mld"", ""/data/$osrmFile"", ""--ip"", ""0.0.0.0"", ""--port"", ""5000""]"
    
    Set-Content -Path $dockerfilePath -Value $dockerfileContent
    Write-Host "  Created Dockerfile" -ForegroundColor Green
}

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host "Next: Commit files and deploy to Railway"
