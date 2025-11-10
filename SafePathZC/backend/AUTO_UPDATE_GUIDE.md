# 🔄 Auto-Update System Guide

## Overview

SafePathZC has **TWO** auto-update options. Choose based on your deployment:

| Deployment | Method | Setup Time |
|------------|--------|------------|
| **Local Development** (XAMPP) | Windows Task Scheduler | 2 minutes |
| **Production** (Railway/Cloud) | Built-in Background Scheduler | Already configured! |

---

## ✅ Option 1: Built-In Background Scheduler (RECOMMENDED for Railway)

### How It Works:

- **Automatic** - Runs in FastAPI app background
- **No setup needed** - Already configured in `main.py`
- **Schedule**: 12:00 AM, 6:00 AM, 12:00 PM, 6:00 PM
- **Self-healing** - Restarts automatically if server restarts

### Status:

When you start your FastAPI server, you'll see:

```
✅ Background flood data updater started
⏰ Next flood data update in 6 hours (21600 seconds)
```

### Benefits:

✅ Works on Railway (no cron needed)  
✅ Works on Heroku, Render, any cloud platform  
✅ No external dependencies  
✅ Logs all updates to `logs/flood_updates.log`

### How to Monitor:

```powershell
# Check if it's running
Get-Process python

# View update logs
Get-Content logs\flood_updates.log -Tail 20 -Wait
```

---

## 🪟 Option 2: Windows Task Scheduler (For Local Development)

### When to Use:

- You're running on **local Windows** (XAMPP)
- You want updates **even when server is off**
- You want **system-level scheduling**

### Quick Setup:

```powershell
# 1. Navigate to backend folder
cd SafePathZC\backend

# 2. Run the setup script
.\setup_auto_update.ps1

# 3. Test it (optional)
Start-ScheduledTask -TaskName "SafePathZC-FloodDataUpdate"
```

### Management Commands:

```powershell
# View task details
Get-ScheduledTask -TaskName "SafePathZC-FloodDataUpdate" | Format-List

# Check task history
Get-ScheduledTask -TaskName "SafePathZC-FloodDataUpdate" | Get-ScheduledTaskInfo

# Run update manually
Start-ScheduledTask -TaskName "SafePathZC-FloodDataUpdate"

# Disable auto-updates
Disable-ScheduledTask -TaskName "SafePathZC-FloodDataUpdate"

# Enable auto-updates
Enable-ScheduledTask -TaskName "SafePathZC-FloodDataUpdate"

# Remove task completely
Unregister-ScheduledTask -TaskName "SafePathZC-FloodDataUpdate" -Confirm:$false
```

### View Logs:

```powershell
# Last 20 updates
Get-Content logs\flood_updates.log -Tail 20

# Live monitoring
Get-Content logs\flood_updates.log -Tail 20 -Wait
```

---

## 📊 How to Verify It's Working

### Check 1: Log File

```powershell
Get-Content logs\flood_updates.log -Tail 10
```

**Expected output:**
```
INFO:__main__:SCHEDULED FLOOD DATA UPDATE - 2025-11-08 14:15:43
INFO:services.flood_data_updater:Fetched 10461 road segments from OSM
INFO:services.flood_data_updater:Flooded roads: 1169
INFO:__main__:✅ Flood data update completed successfully
```

### Check 2: File Timestamp

```powershell
Get-Item data\terrain_roads.geojson | Select Name, LastWriteTime, @{N='SizeMB';E={[math]::Round($_.Length/1MB,2)}}
```

**Expected:** LastWriteTime should be within the last 6 hours

### Check 3: API Endpoint

```powershell
# Check flood data status
Invoke-RestMethod http://localhost:8000/api/flood/status
```

**Expected response:**
```json
{
  "last_updated": "2025-11-08T14:15:43",
  "total_roads": 10461,
  "flooded_roads": 1169,
  "next_update": "2025-11-08T18:00:00"
}
```

---

## ⚙️ Configuration

### Change Update Frequency:

**Option 1 (Built-in Scheduler):**

Edit `main.py`, line 2889:
```python
update_hours = [0, 6, 12, 18]  # Change these hours
```

**Option 2 (Task Scheduler):**

Edit `setup_auto_update.ps1`, lines 47-50:
```powershell
$Trigger1 = New-ScheduledTaskTrigger -Daily -At "12:00 AM"
$Trigger2 = New-ScheduledTaskTrigger -Daily -At "06:00 AM"
$Trigger3 = New-ScheduledTaskTrigger -Daily -At "12:00 PM"
$Trigger4 = New-ScheduledTaskTrigger -Daily -At "06:00 PM"
```

---

## 🐛 Troubleshooting

### Problem: Updates not running

**Solution 1: Check if background task is running**
```powershell
# View server logs
# Look for: "✅ Background flood data updater started"
```

**Solution 2: Check Task Scheduler (if using Option 2)**
```powershell
Get-ScheduledTask -TaskName "SafePathZC-FloodDataUpdate" | Select State, LastRunTime, LastTaskResult
```

### Problem: Updates taking too long (>20 minutes)

**Cause:** Elevation API rate limiting (87,682 coordinates = 877 requests × 1 second)

**Solution:** This is normal! First update takes 15-20 minutes. Consider:
- Running during off-peak hours
- Implementing elevation caching (future enhancement)

### Problem: KeyboardInterrupt / CancelledError

**Cause:** You pressed `Ctrl+C` during manual update

**Solution:** Let the update complete (15-20 minutes) or run in background:
```powershell
Start-Process powershell -ArgumentList "-Command cd SafePathZC\backend; python update_flood_data.py" -NoNewWindow
```

---

## 📈 Expected Performance

| Metric | Value |
|--------|-------|
| **Total API Calls** | 879 requests |
| **OSM Roads** | 10 seconds |
| **Elevation Data** | 15 minutes |
| **Weather Data** | 3 seconds |
| **Processing** | 30 seconds |
| **Total Time** | ~16 minutes |

---

## 🎯 Recommendations

### For Local Development (XAMPP):
✅ Use **Windows Task Scheduler** (Option 2)  
✅ Runs even when server is off  
✅ System-level reliability

### For Production (Railway/Cloud):
✅ Use **Built-in Scheduler** (Option 1)  
✅ No configuration needed  
✅ Works on any platform  
✅ Already configured in your code!

---

## 📝 Summary

**YOU DON'T NEED TO RUN IT MANUALLY!** 🎉

- If you're deploying to **Railway**: Auto-updates are **already configured** in `main.py`
- If you're running **locally**: Run `.\setup_auto_update.ps1` once

That's it! The system will update flood data every 6 hours automatically.

---

## 🔗 Related Files

- `main.py` (lines 2884-2960) - Built-in background scheduler
- `setup_auto_update.ps1` - Windows Task Scheduler setup script
- `update_flood_data.py` - Manual update script
- `services/flood_data_updater.py` - Core update logic
- `logs/flood_updates.log` - Update history

---

**Need help?** Check the logs first:
```powershell
Get-Content logs\flood_updates.log -Tail 50
```
