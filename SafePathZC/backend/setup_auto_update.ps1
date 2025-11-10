# ============================================================================
# SafePathZC - Windows Task Scheduler Setup
# ============================================================================
# This script creates a Windows Scheduled Task to run flood data updates
# every 6 hours (12am, 6am, 12pm, 6pm)
# ============================================================================

Write-Host "╔════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  SafePathZC - Auto-Update Setup (Windows Task Scheduler)          ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Get the current directory
$BackendPath = Get-Location
$ScriptPath = Join-Path $BackendPath "update_flood_data.py"
$PythonExe = (Get-Command python).Source

Write-Host "📁 Backend Path: $BackendPath" -ForegroundColor Yellow
Write-Host "🐍 Python: $PythonExe" -ForegroundColor Yellow
Write-Host "📜 Script: $ScriptPath" -ForegroundColor Yellow
Write-Host ""

# Check if script exists
if (-not (Test-Path $ScriptPath)) {
    Write-Host "❌ Error: update_flood_data.py not found!" -ForegroundColor Red
    Write-Host "   Make sure you're running this from SafePathZC\backend\" -ForegroundColor Red
    exit 1
}

# Task details
$TaskName = "SafePathZC-FloodDataUpdate"
$TaskDescription = "Automatically updates flood data every 6 hours for SafePathZC navigation system"

# Check if task already exists
$ExistingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if ($ExistingTask) {
    Write-Host "⚠️  Task '$TaskName' already exists!" -ForegroundColor Yellow
    $Overwrite = Read-Host "Do you want to overwrite it? (Y/N)"
    
    if ($Overwrite -ne "Y" -and $Overwrite -ne "y") {
        Write-Host "❌ Setup cancelled." -ForegroundColor Red
        exit 0
    }
    
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "🗑️  Removed existing task" -ForegroundColor Green
}

# Create action (what to run)
$Action = New-ScheduledTaskAction `
    -Execute $PythonExe `
    -Argument "`"$ScriptPath`"" `
    -WorkingDirectory $BackendPath

# Create triggers (when to run: 12am, 6am, 12pm, 6pm)
$Trigger1 = New-ScheduledTaskTrigger -Daily -At "12:00 AM"
$Trigger2 = New-ScheduledTaskTrigger -Daily -At "06:00 AM"
$Trigger3 = New-ScheduledTaskTrigger -Daily -At "12:00 PM"
$Trigger4 = New-ScheduledTaskTrigger -Daily -At "06:00 PM"

# Create settings
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -MultipleInstances IgnoreNew

# Get current user principal
$Principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Limited

# Register the task
try {
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Description $TaskDescription `
        -Action $Action `
        -Trigger $Trigger1,$Trigger2,$Trigger3,$Trigger4 `
        -Settings $Settings `
        -Principal $Principal `
        -Force | Out-Null
    
    Write-Host ""
    Write-Host "✅ SUCCESS! Auto-update scheduled task created!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📅 Update Schedule:" -ForegroundColor Cyan
    Write-Host "   • 12:00 AM (midnight)" -ForegroundColor White
    Write-Host "   • 06:00 AM (morning)" -ForegroundColor White
    Write-Host "   • 12:00 PM (noon)" -ForegroundColor White
    Write-Host "   • 06:00 PM (evening)" -ForegroundColor White
    Write-Host ""
    Write-Host "📋 Task Name: $TaskName" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "🔧 Management Commands:" -ForegroundColor Cyan
    Write-Host "   View task:    Get-ScheduledTask -TaskName '$TaskName' | Format-List" -ForegroundColor White
    Write-Host "   Run now:      Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor White
    Write-Host "   Disable:      Disable-ScheduledTask -TaskName '$TaskName'" -ForegroundColor White
    Write-Host "   Enable:       Enable-ScheduledTask -TaskName '$TaskName'" -ForegroundColor White
    Write-Host "   Remove:       Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false" -ForegroundColor White
    Write-Host ""
    Write-Host "📊 Check logs:" -ForegroundColor Cyan
    Write-Host "   Get-Content logs\flood_updates.log -Tail 20" -ForegroundColor White
    Write-Host ""
    
    # Test run
    $TestRun = Read-Host "Do you want to test the task now? (Y/N)"
    if ($TestRun -eq "Y" -or $TestRun -eq "y") {
        Write-Host ""
        Write-Host "🚀 Starting test run..." -ForegroundColor Cyan
        Start-ScheduledTask -TaskName $TaskName
        Start-Sleep -Seconds 2
        Write-Host "✅ Task started! Check the console output above." -ForegroundColor Green
        Write-Host "   (It will take 15-20 minutes to complete)" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host ""
    Write-Host "❌ ERROR: Failed to create scheduled task!" -ForegroundColor Red
    Write-Host "   $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Try running PowerShell as Administrator" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
