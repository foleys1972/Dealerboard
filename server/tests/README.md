# Subscriber API Test Suite

This directory contains tests for the Subscriber API endpoints (`/api/subscriber/*`).

## Test Files

### `subscriberApi.test.js`
Comprehensive Node.js test suite that:
- Creates test data (subscriber, users, line configurations)
- Tests all endpoints
- Validates database operations
- Cleans up after itself

### `testSubscriberApi.sh`
Quick bash script for manual testing with curl.

## Running Tests

### Option 1: Node.js Test Suite (Recommended)

**⚠️ IMPORTANT: The server must be running before running tests!**

```bash
# 1. Start the server first (in a separate terminal)
npm start
# or
node server/index.js

# 2. Then run the tests (in another terminal)
node server/tests/subscriberApi.test.js
```

**Prerequisites:**
- ✅ **Server must be running** on `https://localhost:5000` (or set `TEST_BASE_URL` env var)
- ✅ Database must be accessible
- ✅ Database schema must be up-to-date (run `node server/scripts/migrateDatabase.js` if needed)
- ✅ Test will create and clean up its own test data

**Environment Variables:**
- `TEST_BASE_URL` - Base URL for API (default: `https://localhost:5000`)

### Option 2: Bash Script

```bash
# Make executable
chmod +x server/tests/testSubscriberApi.sh

# Set subscriber token
export SUBSCRIBER_TOKEN="your-token-here"

# Run
./server/tests/testSubscriberApi.sh
```

**Getting a Subscriber Token:**
1. Create a subscriber via admin API: `POST /api/subscribers`
2. Copy the `authToken` from the response
3. Use it as `SUBSCRIBER_TOKEN`

### Option 3: Postman Collection

Create a Postman collection with:
- Base URL: `https://localhost:5000/api/subscriber`
- Header: `x-subscriber-token: <your-token>`
- All endpoints from the spec

## Test Coverage

### Authentication Tests
- ✅ Missing token → 401
- ✅ Invalid token → 401
- ✅ Valid token → Success

### Standard Call Tests
- ✅ POST /call/initiate - Creates session
- ✅ POST /call/answer - Updates session to active

### Group Call Tests
- ✅ POST /group/initiate - FIRST_ANSWER mode
- ✅ POST /group/initiate - REMAIN_GROUP mode
- ✅ POST /group/answer - First answerer detection
- ✅ POST /group/answer - Multiple participants (REMAIN_GROUP)
- ✅ GET /group/status/:sessionId - Status retrieval
- ✅ POST /group/cancel - Cancellation

### Broadcast Tests
- ✅ POST /broadcast/activate - Activation
- ✅ POST /broadcast/join - Join broadcast
- ✅ POST /broadcast/leave - Leave broadcast
- ✅ POST /broadcast/close - Close broadcast

### Error Handling Tests
- ✅ Invalid mode → 400
- ✅ Missing fields → 400
- ✅ Non-existent session → 404

## Expected Output

```
🧪 Starting Subscriber API Tests

Base URL: https://localhost:5000/api/subscriber

📦 Setting up test data...

✓ Created test subscriber: test_subscriber_1234567890
✓ Created 3 test users
✓ Created test line configuration: test_line_1234567890

🚀 Running tests...

✅ Authentication: Missing token returns 401
✅ Authentication: Invalid token returns 401
✅ Authentication: Valid token succeeds
✅ POST /call/initiate: Creates session
✅ POST /call/answer: Updates session to active
✅ POST /group/initiate: Creates group call session (FIRST_ANSWER)
✅ POST /group/initiate: Creates group call session (REMAIN_GROUP)
✅ POST /group/answer: FIRST_ANSWER mode - First answerer wins
✅ POST /group/answer: REMAIN_GROUP mode - Multiple participants join
✅ GET /group/status/:sessionId: Returns session status
✅ POST /group/cancel: Cancels group call
✅ POST /broadcast/activate: Activates broadcast
✅ POST /broadcast/join: Joins broadcast
✅ POST /broadcast/leave: Leaves broadcast
✅ POST /broadcast/close: Closes broadcast
✅ POST /group/initiate: Invalid mode returns 400
✅ POST /call/initiate: Missing required fields returns 400
✅ GET /group/status: Non-existent session returns 404

============================================================
📊 Test Results
============================================================
✅ Passed: 18
❌ Failed: 0
📈 Total:  18

🧹 Cleaning up test data...

✓ Cleaned up test subscriber
✓ Cleaned up test users
✓ Cleaned up test line config
```

## Troubleshooting

### "Connection refused" or "ECONNREFUSED"
- Make sure the server is running
- Check `TEST_BASE_URL` matches your server URL
- For HTTPS with self-signed certs, the test script handles `rejectUnauthorized: false`

### "Invalid subscriber token"
- Create a subscriber first via admin API
- Make sure subscriber is `is_active = true`
- Check token is correct (no extra spaces)

### "Session not found"
- Tests create their own sessions, but if cleanup fails, old sessions might interfere
- Manually clean: `DELETE FROM call_sessions WHERE session_id LIKE 'session_%'`

### Database errors
- Make sure database is accessible
- Check connection settings in `.env`
- Verify tables exist (run `initializeDatabase()`)

## Manual Testing Tips

1. **Start with authentication:**
   ```bash
   curl -k -X POST https://localhost:5000/api/subscriber/call/initiate \
     -H "Content-Type: application/json" \
     -d '{"lineId":"test","lineType":"INTERCOM","initiatorUserId":"test","targetUserId":"test"}'
   # Should return 401
   ```

2. **Get a subscriber token:**
   ```bash
   # Via admin API (requires admin auth)
   curl -k -X POST https://localhost:5000/api/subscribers \
     -H "Authorization: Bearer <admin-token>" \
     -H "Content-Type: application/json" \
     -d '{"name":"Test Sub","serverUrl":"http://localhost:3002","serverId":"test-001"}'
   ```

3. **Test with valid token:**
   ```bash
   curl -k -X POST https://localhost:5000/api/subscriber/call/initiate \
     -H "Content-Type: application/json" \
     -H "x-subscriber-token: <your-token>" \
     -d '{"lineId":"test-line","lineType":"INTERCOM","initiatorUserId":"user1","targetUserId":"user2"}'
   ```

## Next Steps After Testing

Once tests pass:
1. ✅ Backend is validated
2. → Proceed with client-side implementation
3. → Build group call and broadcast managers
4. → Create UI components

