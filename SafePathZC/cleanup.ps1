# SafePathZamboanga Cleanup Script
# Run this script to remove auto-generated files

Write-Host "🧹 Cleaning up auto-generated files..." -ForegroundColor Yellow

# Remove Python cache files
Write-Host "Removing Python cache files..." -ForegroundColor Green
Remove-Item -Path "backend\__pycache__" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "backend\*.pyc" -Force -ErrorAction SilentlyContinue

# Remove TypeScript build cache
Write-Host "Removing TypeScript build cache..." -ForegroundColor Green
Remove-Item -Path "frontend\*.tsbuildinfo" -Force -ErrorAction SilentlyContinue

# Remove VS Code settings (optional - uncomment if needed)
# Remove-Item -Path ".vscode" -Recurse -Force -ErrorAction SilentlyContinue

# Remove node_modules if exists (will be regenerated with npm install)
# Remove-Item -Path "frontend\node_modules" -Recurse -Force -ErrorAction SilentlyContinue

# Remove dist folder if exists
Remove-Item -Path "frontend\dist" -Recurse -Force -ErrorAction SilentlyContinue

# Remove environment files (keep .env.example)
Remove-Item -Path "backend\.env" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "frontend\.env" -Force -ErrorAction SilentlyContinue

Write-Host "✅ Cleanup complete!" -ForegroundColor Green
Write-Host "💡 Tip: These files will be auto-generated when you run the development servers." -ForegroundColor Cyan
