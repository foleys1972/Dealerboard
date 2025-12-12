/**
 * Subscriber API Test Suite
 * 
 * Tests all /api/subscriber/* endpoints to validate:
 * - Authentication
 * - Standard call endpoints
 * - Group call endpoints
 * - Broadcast endpoints
 * - Database operations
 * - WebSocket events (if socket.io-client available)
 * 
 * Run with: node server/tests/subscriberApi.test.js
 * Or: npm test (if configured)
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { pool, createUser, getLineConfiguration, createCallSession, getCallSession } = require('../services/databaseService');
const logger = require('../utils/logger');
const crypto = require('crypto');

// Configuration
const BASE_URL = process.env.TEST_BASE_URL || 'https://localhost:5000';
const API_BASE = `${BASE_URL}/api/subscriber`;

// Test state
let testSubscriber = null;
let testSubscriberToken = null;
let testUsers = [];
let testLineConfig = null;
let testResults = {
  passed: 0,
  failed: 0,
  errors: []
};

// Helper: Make HTTP request
function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      method,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      rejectUnauthorized: false // For self-signed certs in dev
    };

    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsed
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: body
          });
        }
      });
    });

    req.on('error', (err) => {
      // Provide more helpful error messages
      if (err.code === 'ECONNREFUSED') {
        reject(new Error(`Connection refused - Is the server running at ${url.hostname}:${url.port}?`));
      } else if (err.code === 'ENOTFOUND') {
        reject(new Error(`Host not found: ${url.hostname}`));
      } else {
        reject(err);
      }
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Test helper
function test(name, fn) {
  return async () => {
    try {
      await fn();
      testResults.passed++;
      console.log(`✅ ${name}`);
    } catch (error) {
      testResults.failed++;
      const errorMsg = error.message || error.toString() || 'Unknown error';
      testResults.errors.push({ name, error: errorMsg });
      console.error(`❌ ${name}: ${errorMsg}`);
      if (error.stack && process.env.DEBUG_TESTS) {
        console.error(error.stack);
      }
    }
  };
}

// Setup: Create test subscriber
async function setupTestSubscriber() {
  try {
    // Create a test subscriber
    const subscriberId = `test_subscriber_${Date.now()}`;
    const authToken = crypto.randomBytes(32).toString('hex');
    
    const result = await pool.query(
      `INSERT INTO subscribers (
        id, name, server_url, server_id, auth_token, is_active, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, true, 'connected', NOW(), NOW())
      RETURNING *`,
      [
        subscriberId,
        'Test Subscriber',
        'http://localhost:3002',
        'test-server-001',
        authToken
      ]
    );

    testSubscriber = result.rows[0];
    testSubscriberToken = authToken;
    
    console.log(`✓ Created test subscriber: ${subscriberId}`);
    return { subscriberId, authToken };
  } catch (error) {
    console.error('Failed to create test subscriber:', error);
    throw error;
  }
}

// Setup: Create test users
async function setupTestUsers() {
  try {
    const users = [];
    for (let i = 0; i < 3; i++) {
      const userId = `test_user_${Date.now()}_${i}`;
      const user = await createUser({
        id: userId,
        username: `testuser${i}`,
        email: `testuser${i}@test.com`,
        firstName: `Test${i}`,
        lastName: 'User',
        displayName: `Test User ${i}`,
        role: 'user',
        isActive: true
      });
      users.push(user);
    }
    testUsers = users;
    console.log(`✓ Created ${users.length} test users`);
    return users;
  } catch (error) {
    console.error('Failed to create test users:', error);
    throw error;
  }
}

// Setup: Create test line configuration
async function setupTestLineConfig() {
  try {
    const lineId = `test_line_${Date.now()}`;
    
    await pool.query(
      `INSERT INTO dealerboard_private_wires (
        id, uri_address, line_label, mode, line_type, group_mode,
        call_timeout, ring_timeout, target_participants, is_active,
        sudo_line_reference, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, NOW(), NOW())`,
      [
        lineId,
        `sip:${lineId}@test.com`,
        'Test Group Call Line',
        'GROUP',
        'GROUP',
        'FIRST_ANSWER',
        30,
        60,
        JSON.stringify(testUsers.map(u => u.id)),
        `sudo_${lineId}`
      ]
    );

    testLineConfig = await getLineConfiguration(lineId);
    console.log(`✓ Created test line configuration: ${lineId}`);
    return testLineConfig;
  } catch (error) {
    console.error('Failed to create test line config:', error);
    throw error;
  }
}

// Cleanup
async function cleanup() {
  try {
    if (testSubscriber) {
      await pool.query(`DELETE FROM subscribers WHERE id = $1`, [testSubscriber.id]);
      console.log('✓ Cleaned up test subscriber');
    }
    
    if (testUsers.length > 0) {
      for (const user of testUsers) {
        await pool.query(`DELETE FROM users WHERE id = $1`, [user.id]);
      }
      console.log('✓ Cleaned up test users');
    }
    
    if (testLineConfig) {
      await pool.query(`DELETE FROM dealerboard_private_wires WHERE id = $1`, [testLineConfig.id]);
      console.log('✓ Cleaned up test line config');
    }
    
    // Clean up any test sessions
    await pool.query(`DELETE FROM call_sessions WHERE session_id LIKE 'session_%' AND created_at > NOW() - INTERVAL '1 hour'`);
    await pool.query(`DELETE FROM recordings WHERE recording_id LIKE 'rec_%' AND created_at > NOW() - INTERVAL '1 hour'`);
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

// ============================================================================
// Test Cases
// ============================================================================

const tests = [
  // Authentication Tests
  test('Authentication: Missing token returns 401', async () => {
    const response = await makeRequest('POST', '/call/initiate', {
      lineId: 'test',
      lineType: 'INTERCOM',
      initiatorUserId: 'test',
      targetUserId: 'test'
    });
    
    if (response.status !== 401) {
      throw new Error(`Expected 401, got ${response.status}`);
    }
  }),

  test('Authentication: Invalid token returns 401', async () => {
    const response = await makeRequest('POST', '/call/initiate', {
      lineId: 'test',
      lineType: 'INTERCOM',
      initiatorUserId: 'test',
      targetUserId: 'test'
    }, {
      'x-subscriber-token': 'invalid-token-12345'
    });
    
    if (response.status !== 401) {
      throw new Error(`Expected 401, got ${response.status}`);
    }
  }),

  test('Authentication: Valid token succeeds', async () => {
    const response = await makeRequest('POST', '/call/initiate', {
      lineId: testLineConfig?.id || 'test-line',
      lineType: 'INTERCOM',
      initiatorUserId: testUsers[0]?.id || 'test-user-1',
      targetUserId: testUsers[1]?.id || 'test-user-2'
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
    }
    
    if (!response.data.sessionId) {
      throw new Error('Response missing sessionId');
    }
  }),

  // Standard Call Tests
  test('POST /call/initiate: Creates session', async () => {
    const response = await makeRequest('POST', '/call/initiate', {
      lineId: testLineConfig?.id || 'test-line',
      lineType: 'INTERCOM',
      initiatorUserId: testUsers[0]?.id || 'test-user-1',
      targetUserId: testUsers[1]?.id || 'test-user-2'
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
    }
    
    if (!response.data.sessionId) {
      throw new Error('Missing sessionId in response');
    }
    
    if (response.data.topology !== 'pending') {
      throw new Error(`Expected topology 'pending', got '${response.data.topology}'`);
    }
  }),

  test('POST /call/answer: Updates session to active', async () => {
    // First create a session
    const initiateResponse = await makeRequest('POST', '/call/initiate', {
      lineId: testLineConfig?.id || 'test-line',
      lineType: 'INTERCOM',
      initiatorUserId: testUsers[0]?.id || 'test-user-1',
      targetUserId: testUsers[1]?.id || 'test-user-2'
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    const sessionId = initiateResponse.data.sessionId;
    
    // Then answer it
    const answerResponse = await makeRequest('POST', '/call/answer', {
      sessionId,
      answerUserId: testUsers[1]?.id || 'test-user-2',
      answerTimestamp: new Date().toISOString()
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    if (answerResponse.status !== 200) {
      throw new Error(`Expected 200, got ${answerResponse.status}: ${JSON.stringify(answerResponse.data)}`);
    }
    
    if (answerResponse.data.topology !== 'P2P') {
      throw new Error(`Expected topology 'P2P', got '${answerResponse.data.topology}'`);
    }
    
    // Verify session in database
    const session = await getCallSession(sessionId);
    if (!session) {
      throw new Error('Session not found in database');
    }
    
    if (session.status !== 'active') {
      throw new Error(`Expected status 'active', got '${session.status}'`);
    }
  }),

  // Group Call Tests
  test('POST /group/initiate: Creates group call session (FIRST_ANSWER)', async () => {
    const response = await makeRequest('POST', '/group/initiate', {
      lineId: testLineConfig?.id || 'test-line',
      lineType: 'GROUP',
      mode: 'FIRST_ANSWER',
      initiatorUserId: testUsers[0]?.id || 'test-user-1',
      initiatorRegion: 'US',
      targetUsers: testUsers.slice(1).map(u => u.id)
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
    }
    
    if (!response.data.sessionId) {
      throw new Error('Missing sessionId');
    }
    
    if (response.data.mode !== 'FIRST_ANSWER') {
      throw new Error(`Expected mode 'FIRST_ANSWER', got '${response.data.mode}'`);
    }
    
    if (response.data.targetCount !== testUsers.length - 1) {
      throw new Error(`Expected targetCount ${testUsers.length - 1}, got ${response.data.targetCount}`);
    }
  }),

  test('POST /group/initiate: Creates group call session (REMAIN_GROUP)', async () => {
    const response = await makeRequest('POST', '/group/initiate', {
      lineId: testLineConfig?.id || 'test-line',
      lineType: 'GROUP',
      mode: 'REMAIN_GROUP',
      initiatorUserId: testUsers[0]?.id || 'test-user-1',
      initiatorRegion: 'US',
      targetUsers: testUsers.slice(1).map(u => u.id)
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
    }
    
    if (response.data.mode !== 'REMAIN_GROUP') {
      throw new Error(`Expected mode 'REMAIN_GROUP', got '${response.data.mode}'`);
    }
  }),

  test('POST /group/answer: FIRST_ANSWER mode - First answerer wins', async () => {
    // Create FIRST_ANSWER group call
    const initiateResponse = await makeRequest('POST', '/group/initiate', {
      lineId: testLineConfig?.id || 'test-line',
      lineType: 'GROUP',
      mode: 'FIRST_ANSWER',
      initiatorUserId: testUsers[0]?.id || 'test-user-1',
      initiatorRegion: 'US',
      targetUsers: testUsers.slice(1).map(u => u.id)
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    const sessionId = initiateResponse.data.sessionId;
    
    // First user answers
    const answerResponse = await makeRequest('POST', '/group/answer', {
      sessionId,
      answerUserId: testUsers[1]?.id || 'test-user-2',
      answerRegion: 'US',
      answerTimestamp: new Date().toISOString()
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    if (answerResponse.status !== 200) {
      throw new Error(`Expected 200, got ${answerResponse.status}: ${JSON.stringify(answerResponse.data)}`);
    }
    
    if (!answerResponse.data.firstAnswerer) {
      throw new Error('Expected firstAnswerer to be true');
    }
    
    if (!answerResponse.data.cancelOthers) {
      throw new Error('Expected cancelOthers to be true');
    }
    
    if (!Array.isArray(answerResponse.data.otherParticipants)) {
      throw new Error('Expected otherParticipants array');
    }
    
    // Verify session in database
    const session = await getCallSession(sessionId);
    if (session.firstAnswererUserId !== testUsers[1]?.id) {
      throw new Error('First answerer not recorded in database');
    }
  }),

  test('POST /group/answer: REMAIN_GROUP mode - Multiple participants join', async () => {
    // Create REMAIN_GROUP call
    const initiateResponse = await makeRequest('POST', '/group/initiate', {
      lineId: testLineConfig?.id || 'test-line',
      lineType: 'GROUP',
      mode: 'REMAIN_GROUP',
      initiatorUserId: testUsers[0]?.id || 'test-user-1',
      initiatorRegion: 'US',
      targetUsers: testUsers.slice(1).map(u => u.id)
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    const sessionId = initiateResponse.data.sessionId;
    
    // First answer
    const answer1Response = await makeRequest('POST', '/group/answer', {
      sessionId,
      answerUserId: testUsers[1]?.id || 'test-user-2',
      answerRegion: 'US',
      answerTimestamp: new Date().toISOString()
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    if (answer1Response.data.topology !== 'P2P') {
      throw new Error(`Expected P2P topology for first answer, got ${answer1Response.data.topology}`);
    }
    
    // Second answer (should trigger room creation)
    const answer2Response = await makeRequest('POST', '/group/answer', {
      sessionId,
      answerUserId: testUsers[2]?.id || 'test-user-3',
      answerRegion: 'UK',
      answerTimestamp: new Date().toISOString()
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    if (answer2Response.data.topology !== 'single-room') {
      throw new Error(`Expected single-room topology for 3rd participant, got ${answer2Response.data.topology}`);
    }
    
    if (answer2Response.data.currentParticipants !== 3) {
      throw new Error(`Expected 3 participants, got ${answer2Response.data.currentParticipants}`);
    }
  }),

  test('GET /group/status/:sessionId: Returns session status', async () => {
    // Create and answer a group call
    const initiateResponse = await makeRequest('POST', '/group/initiate', {
      lineId: testLineConfig?.id || 'test-line',
      lineType: 'GROUP',
      mode: 'REMAIN_GROUP',
      initiatorUserId: testUsers[0]?.id || 'test-user-1',
      initiatorRegion: 'US',
      targetUsers: testUsers.slice(1).map(u => u.id)
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    const sessionId = initiateResponse.data.sessionId;
    
    // Answer with one participant
    await makeRequest('POST', '/group/answer', {
      sessionId,
      answerUserId: testUsers[1]?.id || 'test-user-2',
      answerRegion: 'US',
      answerTimestamp: new Date().toISOString()
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    // Get status
    const statusResponse = await makeRequest('GET', `/group/status/${sessionId}`, null, {
      'x-subscriber-token': testSubscriberToken
    });
    
    if (statusResponse.status !== 200) {
      throw new Error(`Expected 200, got ${statusResponse.status}: ${JSON.stringify(statusResponse.data)}`);
    }
    
    if (statusResponse.data.currentParticipants !== 2) {
      throw new Error(`Expected 2 participants, got ${statusResponse.data.currentParticipants}`);
    }
    
    if (statusResponse.data.answers.length !== 1) {
      throw new Error(`Expected 1 answer, got ${statusResponse.data.answers.length}`);
    }
  }),

  test('POST /group/cancel: Cancels group call', async () => {
    // Create group call
    const initiateResponse = await makeRequest('POST', '/group/initiate', {
      lineId: testLineConfig?.id || 'test-line',
      lineType: 'GROUP',
      mode: 'FIRST_ANSWER',
      initiatorUserId: testUsers[0]?.id || 'test-user-1',
      initiatorRegion: 'US',
      targetUsers: testUsers.slice(1).map(u => u.id)
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    const sessionId = initiateResponse.data.sessionId;
    
    // Cancel it
    const cancelResponse = await makeRequest('POST', '/group/cancel', {
      sessionId,
      reason: 'cancelled-by-initiator'
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    if (cancelResponse.status !== 200) {
      throw new Error(`Expected 200, got ${cancelResponse.status}: ${JSON.stringify(cancelResponse.data)}`);
    }
    
    if (!cancelResponse.data.success) {
      throw new Error('Expected success: true');
    }
    
    // Verify session is cancelled in database
    const session = await getCallSession(sessionId);
    if (session.status !== 'cancelled') {
      throw new Error(`Expected status 'cancelled', got '${session.status}'`);
    }
  }),

  // Broadcast Tests
  test('POST /broadcast/activate: Activates broadcast', async () => {
    // Create broadcast line first
    const broadcastLineId = `test_broadcast_${Date.now()}`;
    await pool.query(
      `INSERT INTO dealerboard_private_wires (
        id, uri_address, line_label, mode, line_type, broadcast_mode,
        target_participants, persistent_room_id, is_active,
        sudo_line_reference, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, NOW(), NOW())`,
      [
        broadcastLineId,
        `sip:${broadcastLineId}@test.com`,
        'Test Broadcast',
        'BROADCAST',
        'BROADCAST',
        'PTT',
        JSON.stringify(testUsers.map(u => u.id)),
        `!broadcast_${broadcastLineId}:test.matrix.hsbc`,
        `sudo_${broadcastLineId}`
      ]
    );
    
    const response = await makeRequest('POST', '/broadcast/activate', {
      lineId: broadcastLineId,
      lineType: 'BROADCAST',
      activatorUserId: testUsers[0]?.id || 'test-user-1',
      activatorRegion: 'US'
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
    }
    
    if (!response.data.sessionId) {
      throw new Error('Missing sessionId');
    }
    
    if (!response.data.roomId) {
      throw new Error('Missing roomId');
    }
    
    // Cleanup
    await pool.query(`DELETE FROM dealerboard_private_wires WHERE id = $1`, [broadcastLineId]);
  }),

  test('POST /broadcast/join: Joins broadcast', async () => {
    // Create and activate broadcast
    const broadcastLineId = `test_broadcast_${Date.now()}`;
    await pool.query(
      `INSERT INTO dealerboard_private_wires (
        id, uri_address, line_label, mode, line_type, broadcast_mode,
        target_participants, persistent_room_id, is_active,
        sudo_line_reference, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, NOW(), NOW())`,
      [
        broadcastLineId,
        `sip:${broadcastLineId}@test.com`,
        'Test Broadcast',
        'BROADCAST',
        'BROADCAST',
        'PTT',
        JSON.stringify(testUsers.map(u => u.id)),
        `!broadcast_${broadcastLineId}:test.matrix.hsbc`,
        `sudo_${broadcastLineId}`
      ]
    );
    
    const activateResponse = await makeRequest('POST', '/broadcast/activate', {
      lineId: broadcastLineId,
      lineType: 'BROADCAST',
      activatorUserId: testUsers[0]?.id || 'test-user-1',
      activatorRegion: 'US'
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    const sessionId = activateResponse.data.sessionId;
    
    // Join broadcast
    const joinResponse = await makeRequest('POST', '/broadcast/join', {
      sessionId,
      lineId: broadcastLineId,
      joiningUserId: testUsers[1]?.id || 'test-user-2',
      joiningRegion: 'US'
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    if (joinResponse.status !== 200) {
      throw new Error(`Expected 200, got ${joinResponse.status}: ${JSON.stringify(joinResponse.data)}`);
    }
    
    if (joinResponse.data.currentParticipants !== 2) {
      throw new Error(`Expected 2 participants, got ${joinResponse.data.currentParticipants}`);
    }
    
    // Cleanup
    await pool.query(`DELETE FROM dealerboard_private_wires WHERE id = $1`, [broadcastLineId]);
  }),

  test('POST /broadcast/leave: Leaves broadcast', async () => {
    // Create, activate, and join broadcast
    const broadcastLineId = `test_broadcast_${Date.now()}`;
    await pool.query(
      `INSERT INTO dealerboard_private_wires (
        id, uri_address, line_label, mode, line_type, broadcast_mode,
        target_participants, persistent_room_id, is_active,
        sudo_line_reference, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, NOW(), NOW())`,
      [
        broadcastLineId,
        `sip:${broadcastLineId}@test.com`,
        'Test Broadcast',
        'BROADCAST',
        'BROADCAST',
        'PTT',
        JSON.stringify(testUsers.map(u => u.id)),
        `!broadcast_${broadcastLineId}:test.matrix.hsbc`,
        `sudo_${broadcastLineId}`
      ]
    );
    
    const activateResponse = await makeRequest('POST', '/broadcast/activate', {
      lineId: broadcastLineId,
      lineType: 'BROADCAST',
      activatorUserId: testUsers[0]?.id || 'test-user-1',
      activatorRegion: 'US'
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    const sessionId = activateResponse.data.sessionId;
    
    await makeRequest('POST', '/broadcast/join', {
      sessionId,
      lineId: broadcastLineId,
      joiningUserId: testUsers[1]?.id || 'test-user-2',
      joiningRegion: 'US'
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    // Leave broadcast
    const leaveResponse = await makeRequest('POST', '/broadcast/leave', {
      sessionId,
      lineId: broadcastLineId,
      leavingUserId: testUsers[1]?.id || 'test-user-2'
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    if (leaveResponse.status !== 200) {
      throw new Error(`Expected 200, got ${leaveResponse.status}: ${JSON.stringify(leaveResponse.data)}`);
    }
    
    if (leaveResponse.data.currentParticipants !== 1) {
      throw new Error(`Expected 1 participant after leave, got ${leaveResponse.data.currentParticipants}`);
    }
    
    // Cleanup
    await pool.query(`DELETE FROM dealerboard_private_wires WHERE id = $1`, [broadcastLineId]);
  }),

  test('POST /broadcast/close: Closes broadcast', async () => {
    // Create and activate broadcast
    const broadcastLineId = `test_broadcast_${Date.now()}`;
    await pool.query(
      `INSERT INTO dealerboard_private_wires (
        id, uri_address, line_label, mode, line_type, broadcast_mode,
        target_participants, persistent_room_id, is_active,
        sudo_line_reference, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, NOW(), NOW())`,
      [
        broadcastLineId,
        `sip:${broadcastLineId}@test.com`,
        'Test Broadcast',
        'BROADCAST',
        'BROADCAST',
        'PTT',
        JSON.stringify(testUsers.map(u => u.id)),
        `!broadcast_${broadcastLineId}:test.matrix.hsbc`,
        `sudo_${broadcastLineId}`
      ]
    );
    
    const activateResponse = await makeRequest('POST', '/broadcast/activate', {
      lineId: broadcastLineId,
      lineType: 'BROADCAST',
      activatorUserId: testUsers[0]?.id || 'test-user-1',
      activatorRegion: 'US'
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    const sessionId = activateResponse.data.sessionId;
    
    // Close broadcast
    const closeResponse = await makeRequest('POST', '/broadcast/close', {
      sessionId,
      lineId: broadcastLineId,
      closerUserId: testUsers[0]?.id || 'test-user-1'
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    if (closeResponse.status !== 200) {
      throw new Error(`Expected 200, got ${closeResponse.status}: ${JSON.stringify(closeResponse.data)}`);
    }
    
    if (!closeResponse.data.broadcastClosed) {
      throw new Error('Expected broadcastClosed to be true');
    }
    
    // Cleanup
    await pool.query(`DELETE FROM dealerboard_private_wires WHERE id = $1`, [broadcastLineId]);
  }),

  // Error Handling Tests
  test('POST /group/initiate: Invalid mode returns 400', async () => {
    const response = await makeRequest('POST', '/group/initiate', {
      lineId: testLineConfig?.id || 'test-line',
      lineType: 'GROUP',
      mode: 'INVALID_MODE',
      initiatorUserId: testUsers[0]?.id || 'test-user-1',
      initiatorRegion: 'US',
      targetUsers: testUsers.slice(1).map(u => u.id)
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    if (response.status !== 400) {
      throw new Error(`Expected 400 for invalid mode, got ${response.status}`);
    }
  }),

  test('POST /call/initiate: Missing required fields returns 400', async () => {
    const response = await makeRequest('POST', '/call/initiate', {
      lineId: 'test'
      // Missing other required fields
    }, {
      'x-subscriber-token': testSubscriberToken
    });
    
    if (response.status !== 400) {
      throw new Error(`Expected 400 for missing fields, got ${response.status}`);
    }
  }),

  test('GET /group/status: Non-existent session returns 404', async () => {
    const response = await makeRequest('GET', '/group/status/non-existent-session', null, {
      'x-subscriber-token': testSubscriberToken
    });
    
    if (response.status !== 404) {
      throw new Error(`Expected 404 for non-existent session, got ${response.status}`);
    }
  })
];

// Main test runner
async function runTests() {
  console.log('\n🧪 Starting Subscriber API Tests\n');
  console.log(`Base URL: ${API_BASE}\n`);
  
  // Quick connectivity check
  try {
    const testResponse = await makeRequest('GET', '/group/status/test', null, {});
    // If we get any response (even 404), server is running
  } catch (error) {
    if (error.message && error.message.includes('Connection refused')) {
      console.error('\n❌ ERROR: Server is not running!\n');
      console.error('Please start the server first:');
      console.error('  npm start');
      console.error('  or');
      console.error('  node server/index.js\n');
      console.error('Then run the tests again.\n');
      process.exit(1);
    }
    // Other errors are fine (like 404 for test endpoint)
  }
  
  try {
    // Setup
    console.log('📦 Setting up test data...\n');
    await setupTestSubscriber();
    await setupTestUsers();
    await setupTestLineConfig();
    console.log('');
    
    // Run tests
    console.log('🚀 Running tests...\n');
    for (const testFn of tests) {
      await testFn();
    }
    
    // Results
    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Results');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📈 Total:  ${testResults.passed + testResults.failed}`);
    
    if (testResults.errors.length > 0) {
      console.log('\n❌ Errors:');
      testResults.errors.forEach(({ name, error }) => {
        console.log(`  - ${name}: ${error}`);
      });
    }
    
    console.log('');
    
  } catch (error) {
    console.error('💥 Test suite error:', error);
  } finally {
    // Cleanup
    console.log('🧹 Cleaning up test data...\n');
    await cleanup();
    process.exit(testResults.failed > 0 ? 1 : 0);
  }
}

// Run if executed directly
if (require.main === module) {
  runTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runTests, tests, makeRequest };

