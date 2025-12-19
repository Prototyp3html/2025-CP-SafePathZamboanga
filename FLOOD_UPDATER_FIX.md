# Critical Fix: Flood Data Updater Connection Timeout Issue

## Problem Identified

**Symptom**: Flood data updater was crashing silently when processing ~10,727 roads, resulting in NO flood data being collected despite rainfall since December 15.

**Root Cause**: The updater was trying to commit all 10,000+ road database changes in a **single transaction**. This caused:
- PostgreSQL connection timeout/reset errors: "could not receive data from client: Connection reset by peer"
- Memory exhaustion from holding changes in memory for all 10K roads
- Transaction becoming too large for the database connection to handle

## Solution Implemented

### 1. **Batch Processing with Periodic Commits** (flood_data_updater.py, Lines 1110-1306)

Changed from:
```python
# Process all 10,727 roads, collect changes, THEN commit at the end
for road in roads:
    # ... process road ...
    features.append(feature)

# Single massive commit
db_session.commit()  # ❌ CRASHES HERE with timeout
```

To:
```python
# Process roads in batches of 500, commit after each batch
BATCH_SIZE = 500
for road in roads:
    # ... process road ...
    features.append(feature)
    
    if processed_roads % BATCH_SIZE == 0:
        db_session.commit()  # ✅ Small commit every 500 roads
```

### 2. **Better Error Logging** (routes/admin.py, Lines 1330-1354)

Added detailed error propagation:
```python
except Exception as inner_e:
    error_msg = str(inner_e)
    logger.error(f"❌ Flood updater crashed: {error_msg}", exc_info=True)
    flood_update_state.fail_update(error_msg)  # Show error to user
```

Errors are now visible in:
- Console logs
- Railway production logs
- Frontend admin dashboard via `/admin/flood/update-logs` endpoint

## Changes Made

### File: `services/flood_data_updater.py`

**Line 1112-1135**: Added batch processing setup
- `BATCH_SIZE = 500` - commit every 500 roads
- Added progress logging
- Proper batch commit with error handling

**Line 1282-1306**: Implemented periodic batch commits
- Commit after every `BATCH_SIZE` roads processed
- Final commit for remaining roads after loop
- Detailed error messages if commit fails

### File: `routes/admin.py`

**Line 1335-1352**: Improved error handling
- Separate try-catch for updater crash
- Error message propagation to `flood_update_state`
- Full traceback logging with `exc_info=True`

## Why This Fix Works

1. **Smaller Transactions**: Instead of one 10K-row transaction, we now have ~20 x 500-row transactions
2. **Better Resource Management**: Database connection stays active with smaller commits
3. **Memory Efficiency**: Previous changes are flushed after each batch
4. **Error Visibility**: Updater errors now show in UI and logs
5. **Resilience**: If batch 15 fails, batches 1-14 are already saved

## Testing the Fix

### Local Test (SQLite)
```bash
python flood_data_updater.py
# or with manual rainfall override:
python flood_data_updater.py 50
```

### Deployed Test (Railway)
1. Go to admin dashboard at deployed site
2. Click "Update Flood Data Now"
3. Watch logs appear in real-time
4. Check database for new hotspot records

### Expected Behavior After Fix
- Logs show progress every 500 roads
- Database commits appear in logs (BATCH COMMIT messages)
- No timeout/connection reset errors
- New flood hotspots appear in database within 5-10 minutes
- Manual update completes successfully

## Verification Checklist

- [x] Syntax validation passed
- [ ] Test on local SQLite
- [ ] Test manual trigger on deployed site
- [ ] Check PostgreSQL logs for successful commits
- [ ] Verify flood hotspots appear in database
- [ ] Confirm automatic 60-minute scheduler works

## Next Steps if Issue Persists

If updater still fails after this fix:

1. **Check batch size**: If 500 is still too large, reduce to 250
2. **Database connection pooling**: Review Railway PostgreSQL connection limits
3. **Memory constraints**: Check if Railway dyno needs more RAM
4. **API timeouts**: May need to extend timeout for elevation fetch
5. **Network issues**: Railway PostgreSQL connection stability

## Files Modified

1. ✅ `SafePathZC/backend/services/flood_data_updater.py` - Added batch commits
2. ✅ `SafePathZC/backend/routes/admin.py` - Better error logging

## Expected Impact

- ✅ Flood updater will complete without timeout
- ✅ Flood hotspots will be recorded in database
- ✅ Real-time logs will show updater progress
- ✅ Deployment will capture flood data during rain events
