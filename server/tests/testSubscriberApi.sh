#!/bin/bash

# Quick test script for Subscriber API
# Usage: ./testSubscriberApi.sh

echo "🧪 Testing Subscriber API Endpoints"
echo "===================================="
echo ""

BASE_URL="${TEST_BASE_URL:-https://localhost:5000}"
API_BASE="${BASE_URL}/api/subscriber"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# You'll need to set these after creating a test subscriber
SUBSCRIBER_TOKEN="${SUBSCRIBER_TOKEN:-your-token-here}"

if [ "$SUBSCRIBER_TOKEN" = "your-token-here" ]; then
    echo -e "${YELLOW}⚠️  Warning: SUBSCRIBER_TOKEN not set. Set it in environment or edit this script.${NC}"
    echo "   You can get a token by creating a subscriber via the admin API."
    echo ""
fi

# Test function
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    echo -n "Testing $description... "
    
    if [ -z "$data" ]; then
        response=$(curl -s -k -w "\n%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -H "x-subscriber-token: $SUBSCRIBER_TOKEN" \
            "${API_BASE}${endpoint}")
    else
        response=$(curl -s -k -w "\n%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -H "x-subscriber-token: $SUBSCRIBER_TOKEN" \
            -d "$data" \
            "${API_BASE}${endpoint}")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}✓${NC} (HTTP $http_code)"
        return 0
    else
        echo -e "${RED}✗${NC} (HTTP $http_code)"
        echo "  Response: $body"
        return 1
    fi
}

# Authentication test
echo "1. Testing Authentication"
echo "------------------------"
# Note: These tests need to be run without token or with invalid token
# test_endpoint "POST" "/call/initiate" '{"lineId":"test","lineType":"INTERCOM","initiatorUserId":"test","targetUserId":"test"}' "Missing token (should fail)"

echo ""
echo "2. Testing Standard Call Endpoints"
echo "-----------------------------------"
# Note: Replace with actual test data
test_endpoint "POST" "/call/initiate" '{"lineId":"test-line","lineType":"INTERCOM","initiatorUserId":"user1","targetUserId":"user2"}' "Initiate call"
# test_endpoint "POST" "/call/answer" '{"sessionId":"...","answerUserId":"user2"}' "Answer call"

echo ""
echo "3. Testing Group Call Endpoints"
echo "--------------------------------"
test_endpoint "POST" "/group/initiate" '{"lineId":"test-line","lineType":"GROUP","mode":"FIRST_ANSWER","initiatorUserId":"user1","initiatorRegion":"US","targetUsers":["user2","user3"]}' "Initiate FIRST_ANSWER group call"
test_endpoint "POST" "/group/initiate" '{"lineId":"test-line","lineType":"GROUP","mode":"REMAIN_GROUP","initiatorUserId":"user1","initiatorRegion":"US","targetUsers":["user2","user3"]}' "Initiate REMAIN_GROUP group call"

echo ""
echo "4. Testing Broadcast Endpoints"
echo "------------------------------"
test_endpoint "POST" "/broadcast/activate" '{"lineId":"broadcast-line","lineType":"BROADCAST","activatorUserId":"user1","activatorRegion":"US"}' "Activate broadcast"

echo ""
echo "✅ Test script complete!"
echo ""
echo "Note: This is a basic test. For comprehensive testing, use:"
echo "  node server/tests/subscriberApi.test.js"

