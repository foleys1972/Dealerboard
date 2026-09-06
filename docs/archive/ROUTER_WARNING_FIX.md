# Router Warning Fix

## Problem
The logs were showing repeated warnings:
```
warn: Router already exists for group tenant-demo:subtenant-demo:instant-1766853720120-9zgkjcfqc
```

These warnings appeared multiple times per second, creating log noise. The warnings are harmless (the code correctly returns the existing router), but they indicate that `createGroupRouter` is being called when a router already exists.

## Root Cause
Multiple routes in `webrtcRoutes.js` were calling `createGroupRouter` directly instead of using `getOrCreateRouter`. The `getOrCreateRouter` function is designed for this use case - it checks if a router exists and only creates one if needed, without logging warnings.

## Solution

### 1. Updated webrtcRoutes.js
- Added `getOrCreateRouter` to imports
- Replaced all calls to `createGroupRouter` with `getOrCreateRouter` in:
  - `/groups/:groupId/rtp-capabilities` endpoint
  - `/plain-produce` endpoint
  - `/plain-consume` endpoint
  - `/plain-transport` endpoint
  - `/transport` endpoint
  - `/consume` endpoint
  - `/groups/:groupId/producers` endpoint

### 2. Updated mediaSoupService.js
- Removed the warning log from `createGroupRouter` when router already exists
- Added comment explaining that `getOrCreateRouter` should be used for this case

## Result
✅ No more warning spam in logs
✅ Router creation logic unchanged (still works correctly)
✅ Better code organization (using the right function for the right purpose)

## Files Modified
- `server/routes/webrtcRoutes.js` - Replaced `createGroupRouter` with `getOrCreateRouter`
- `server/services/mediaSoupService.js` - Removed warning log

