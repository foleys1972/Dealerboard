#!/bin/bash

# Direct Trader Communications - Testing Setup Script
# This script sets up the testing environment for the application

echo "🚀 Setting up Direct Trader Communications Testing Environment"
echo "=============================================================="

# Check if we're in the right directory
if [ ! -f "README.md" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

echo "📱 Setting up iOS Testing Environment..."

# Check if Xcode is installed
if ! command -v xcodebuild &> /dev/null; then
    echo "❌ Xcode not found. Please install Xcode from the App Store"
    exit 1
fi

# Navigate to iOS directory
cd iOS

# Check if Podfile exists
if [ ! -f "Podfile" ]; then
    echo "❌ Podfile not found in iOS directory"
    exit 1
fi

# Install CocoaPods if not installed
if ! command -v pod &> /dev/null; then
    echo "📦 Installing CocoaPods..."
    sudo gem install cocoapods
fi

# Install dependencies
echo "📦 Installing iOS dependencies..."
pod install

# Check if installation was successful
if [ $? -eq 0 ]; then
    echo "✅ iOS dependencies installed successfully"
else
    echo "❌ Failed to install iOS dependencies"
    exit 1
fi

# Go back to project root
cd ..

echo "🐍 Setting up Backend Testing Environment..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3.11+"
    exit 1
fi

# Navigate to backend directory
cd Backend/API

# Create virtual environment
echo "📦 Creating Python virtual environment..."
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "📦 Installing backend dependencies..."
pip install -r requirements.txt

# Check if installation was successful
if [ $? -eq 0 ]; then
    echo "✅ Backend dependencies installed successfully"
else
    echo "❌ Failed to install backend dependencies"
    exit 1
fi

# Go back to project root
cd ../..

echo "🧪 Setting up Test Data..."

# Create test data directory
mkdir -p test_data

# Create sample bank configuration
cat > test_data/sample_bank_config.json << EOF
{
  "bank_id": "demo_bank",
  "bank_name": "Demo Trading Bank",
  "oracle_sbc_host": "sbc.demo.com",
  "oracle_sbc_port": 5061,
  "audiocodes_host": "audiocodes.demo.com",
  "audiocodes_port": 5060,
  "sip_domain": "demo.com",
  "lines": [
    {
      "id": "hoot-1",
      "name": "Trading Floor",
      "number": "1001",
      "type": "hoot",
      "status": "active",
      "participants": ["Trader A", "Trader B", "Manager"]
    },
    {
      "id": "hoot-2",
      "name": "Risk Management",
      "number": "1002",
      "type": "hoot",
      "status": "active",
      "participants": ["Risk Officer", "Compliance"]
    },
    {
      "id": "ard-1",
      "name": "Emergency Line",
      "number": "2001",
      "type": "ard",
      "status": "ready",
      "participants": []
    },
    {
      "id": "mrd-1",
      "name": "Client A",
      "number": "3001",
      "type": "mrd",
      "status": "ready",
      "participants": []
    }
  ]
}
EOF

echo "✅ Test data created successfully"

echo "🔧 Creating Test Scripts..."

# Create iOS test script
cat > scripts/test_ios.sh << 'EOF'
#!/bin/bash

echo "📱 Testing iOS App..."

# Navigate to iOS directory
cd iOS

# Open Xcode workspace
echo "🚀 Opening Xcode workspace..."
open DirectTrader.xcworkspace

echo "✅ Xcode workspace opened. You can now:"
echo "   1. Select a target device (iPhone 15 Pro recommended)"
echo "   2. Build and run the app (⌘+R)"
echo "   3. Test all features as described in Testing_Guide.md"
EOF

# Create backend test script
cat > scripts/test_backend.sh << 'EOF'
#!/bin/bash

echo "🐍 Testing Backend API..."

# Navigate to backend directory
cd Backend/API

# Activate virtual environment
source venv/bin/activate

# Start the API server
echo "🚀 Starting backend API server..."
echo "   API will be available at: http://localhost:8000"
echo "   Health check: http://localhost:8000/health"
echo "   API docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop the server"

python main.py
EOF

# Create integration test script
cat > scripts/test_integration.sh << 'EOF'
#!/bin/bash

echo "🔗 Testing Integration..."

# Start backend in background
echo "🚀 Starting backend server..."
cd Backend/API
source venv/bin/activate
python main.py &
BACKEND_PID=$!

# Wait for backend to start
sleep 5

# Test API health
echo "🧪 Testing API health..."
curl -s http://localhost:8000/health

if [ $? -eq 0 ]; then
    echo "✅ Backend API is running"
else
    echo "❌ Backend API failed to start"
    kill $BACKEND_PID
    exit 1
fi

# Test bank configuration
echo "🧪 Testing bank configuration..."
curl -X POST http://localhost:8000/banks/demo_bank/configure \
  -H "Content-Type: application/json" \
  -d @../../test_data/sample_bank_config.json

if [ $? -eq 0 ]; then
    echo "✅ Bank configuration successful"
else
    echo "❌ Bank configuration failed"
fi

# Test DND functionality
echo "🧪 Testing DND functionality..."
curl -X POST http://localhost:8000/dnd/user123/enable
curl http://localhost:8000/dnd/user123/status

echo "✅ Integration tests completed"

# Stop backend
kill $BACKEND_PID
EOF

# Make scripts executable
chmod +x scripts/test_ios.sh
chmod +x scripts/test_backend.sh
chmod +x scripts/test_integration.sh

echo "✅ Test scripts created successfully"

echo ""
echo "🎉 Testing Environment Setup Complete!"
echo "======================================"
echo ""
echo "📋 Next Steps:"
echo "   1. Test iOS App:     ./scripts/test_ios.sh"
echo "   2. Test Backend:     ./scripts/test_backend.sh"
echo "   3. Test Integration: ./scripts/test_integration.sh"
echo ""
echo "📚 For detailed testing instructions, see:"
echo "   Documentation/Testing_Guide.md"
echo ""
echo "🔧 Quick Commands:"
echo "   • Start iOS testing:     ./scripts/test_ios.sh"
echo "   • Start backend testing: ./scripts/test_backend.sh"
echo "   • Run integration tests: ./scripts/test_integration.sh"
echo ""
echo "📱 iOS App Testing:"
echo "   1. Open Xcode workspace"
echo "   2. Select iPhone 15 Pro simulator"
echo "   3. Build and run (⌘+R)"
echo "   4. Test all features in the app"
echo ""
echo "🐍 Backend API Testing:"
echo "   1. API runs on http://localhost:8000"
echo "   2. Health check: http://localhost:8000/health"
echo "   3. API docs: http://localhost:8000/docs"
echo "   4. Test all endpoints with curl or Postman"
echo ""
echo "Happy Testing! 🚀"
