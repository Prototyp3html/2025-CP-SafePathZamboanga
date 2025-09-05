# SafePathZamboanga - Remove Unnecessary Files
# This script removes unused files to clean up the project

Write-Host "Removing unnecessary files..." -ForegroundColor Yellow

# ================================
# BACKEND - Remove empty test files
# ================================
Write-Host "Removing empty backend test files..." -ForegroundColor Green
$backendTestFiles = @(
    "backend\simple_test.py",
    "backend\test_endpoints.py", 
    "backend\test_weather.py",
    "backend\test_risk.py",
    "backend\test_safe_route_filter.py"
)

foreach ($file in $backendTestFiles) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "  Removed: $file" -ForegroundColor Gray
    }
}

# ================================
# FRONTEND - Remove unused files
# ================================
Write-Host "Removing unused frontend files..." -ForegroundColor Green

# Remove old prototype file
if (Test-Path "frontend\risk-visualization.html") {
    Remove-Item "frontend\risk-visualization.html" -Force
    Write-Host "  Removed: frontend\risk-visualization.html" -ForegroundColor Gray
}

# Remove replaced component
if (Test-Path "frontend\src\components\InteractiveMap.tsx") {
    Remove-Item "frontend\src\components\InteractiveMap.tsx" -Force
    Write-Host "  Removed: frontend\src\components\InteractiveMap.tsx" -ForegroundColor Gray
}

# Remove unused component
if (Test-Path "frontend\src\components\HeroSection.tsx") {
    Remove-Item "frontend\src\components\HeroSection.tsx" -Force  
    Write-Host "  Removed: frontend\src\components\HeroSection.tsx" -ForegroundColor Gray
}

# ================================
# UI COMPONENTS - Remove unused ones
# ================================
Write-Host "Removing unused UI components..." -ForegroundColor Green

# List of UI components that ARE used (keep these)
$usedUIComponents = @(
    "alert.tsx", "alert-dialog.tsx", "badge.tsx", "button.tsx", 
    "card.tsx", "dialog.tsx", "input.tsx", "label.tsx", 
    "select.tsx", "switch.tsx", "tabs.tsx", "textarea.tsx",
    "toast.tsx", "toaster.tsx"
)

# Get all UI components
$allUIComponents = Get-ChildItem "frontend\src\components\ui\*.tsx" | ForEach-Object { $_.Name }

# Remove unused UI components
foreach ($component in $allUIComponents) {
    if ($component -notin $usedUIComponents) {
        $filePath = "frontend\src\components\ui\$component"
        if (Test-Path $filePath) {
            Remove-Item $filePath -Force
            Write-Host "  Removed unused UI: $component" -ForegroundColor Gray
        }
    }
}

Write-Host "Cleanup complete!" -ForegroundColor Green
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  - Removed 5 empty backend test files" -ForegroundColor White
Write-Host "  - Removed 3 unused frontend components" -ForegroundColor White  
Write-Host "  - Removed unused UI components" -ForegroundColor White
Write-Host "Project is now cleaner and more maintainable!" -ForegroundColor Cyan
