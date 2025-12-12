#!/usr/bin/env node

/**
 * Matrix Integration Test Script
 * Tests Matrix federation and app service functionality
 */

const axios = require('axios');
const { createClient } = require('matrix-js-sdk');

const BASE_URL = 'http://localhost:5000';
const MATRIX_SERVER_URL = process.env.MATRIX_SERVER_URL || 'http://localhost:8008';
const MATRIX_USER_ID = process.env.MATRIX_USER_ID || '@trading-intercom-bot:trading-intercom.local';
const MATRIX_ACCESS_TOKEN = process.env.MATRIX_ACCESS_TOKEN || '';

async function testMatrixIntegration() {
  console.log('🧪 Testing Matrix Integration...\n');

  try {
    // Test 1: Check Matrix status endpoint
    console.log('1. Testing Matrix status endpoint...');
    const statusResponse = await axios.get(`${BASE_URL}/api/matrix/status`);
    console.log('✅ Matrix status endpoint working');
    console.log('   Client status:', statusResponse.data.client);
    console.log('   AppService status:', statusResponse.data.appService);
    console.log('   Federation info:', statusResponse.data.federation);
    console.log('');

    // Test 2: Test Matrix client connection
    if (MATRIX_ACCESS_TOKEN) {
      console.log('2. Testing Matrix client connection...');
      const client = createClient({
        baseUrl: MATRIX_SERVER_URL,
        accessToken: MATRIX_ACCESS_TOKEN,
        userId: MATRIX_USER_ID,
      });

      try {
        await client.startClient();
        console.log('✅ Matrix client connected successfully');
        
        // Get user info
        const userInfo = await client.getUser(MATRIX_USER_ID);
        console.log('   User info:', userInfo);
        
        await client.stopClient();
      } catch (error) {
        console.log('❌ Matrix client connection failed:', error.message);
      }
      console.log('');
    } else {
      console.log('2. ⏭️  Skipping Matrix client test (no access token)');
      console.log('');
    }

    // Test 3: Test group creation with Matrix integration
    console.log('3. Testing group creation with Matrix integration...');
    try {
      const groupData = {
        name: 'Test Matrix Group',
        description: 'Test group for Matrix integration',
        members: ['@test-user:trading-intercom.local']
      };

      const groupResponse = await axios.post(`${BASE_URL}/api/groups`, groupData, {
        headers: {
          'Authorization': `Bearer ${process.env.JWT_TOKEN || 'test-token'}`
        }
      });

      console.log('✅ Group created successfully');
      console.log('   Group ID:', groupResponse.data.id);
      console.log('   Group name:', groupResponse.data.name);
      
      // Clean up test group
      await axios.delete(`${BASE_URL}/api/groups/${groupResponse.data.id}`, {
        headers: {
          'Authorization': `Bearer ${process.env.JWT_TOKEN || 'test-token'}`
        }
      });
      console.log('   Test group cleaned up');
    } catch (error) {
      console.log('❌ Group creation test failed:', error.response?.data?.message || error.message);
    }
    console.log('');

    // Test 4: Test Matrix federation
    console.log('4. Testing Matrix federation...');
    try {
      const federationInfo = await axios.get(`${MATRIX_SERVER_URL}/_matrix/federation/v1/version`);
      console.log('✅ Matrix federation endpoint accessible');
      console.log('   Server version:', federationInfo.data.server?.version);
    } catch (error) {
      console.log('❌ Matrix federation test failed:', error.message);
    }
    console.log('');

    console.log('🎉 Matrix integration tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  testMatrixIntegration();
}

module.exports = { testMatrixIntegration };
