@echo off
REM Direct Trader Communications - Windows Testing Setup Script
REM This script sets up the testing environment for the application

echo 🚀 Setting up Direct Trader Communications Testing Environment
echo ==============================================================

REM Check if we're in the right directory
if not exist "README.md" (
    echo ❌ Error: Please run this script from the project root directory
    exit /b 1
)

echo 📱 Setting up iOS Testing Environment...

REM Check if Xcode is available (macOS only)
where xcodebuild >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  Xcode not found. iOS testing requires macOS with Xcode installed.
    echo    For Windows users, you can test the backend API only.
    echo.
)

REM Navigate to iOS directory
cd iOS

REM Check if Podfile exists
if not exist "Podfile" (
    echo ❌ Podfile not found in iOS directory
    exit /b 1
)

REM Install CocoaPods if not installed (macOS only)
where pod >nul 2>&1
if %errorlevel% neq 0 (
    echo 📦 Installing CocoaPods...
    gem install cocoapods
)

REM Install dependencies
echo 📦 Installing iOS dependencies...
pod install

REM Check if installation was successful
if %errorlevel% equ 0 (
    echo ✅ iOS dependencies installed successfully
) else (
    echo ❌ Failed to install iOS dependencies
    exit /b 1
)

REM Go back to project root
cd ..

echo 🐍 Setting up Backend Testing Environment...

REM Check if Python is installed
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Python not found. Please install Python 3.11+
    echo    Download from: https://www.python.org/downloads/
    exit /b 1
)

REM Navigate to backend directory
cd Backend\API

REM Create virtual environment
echo 📦 Creating Python virtual environment...
python -m venv venv

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Install dependencies
echo 📦 Installing backend dependencies...
pip install -r requirements.txt

REM Check if installation was successful
if %errorlevel% equ 0 (
    echo ✅ Backend dependencies installed successfully
) else (
    echo ❌ Failed to install backend dependencies
    exit /b 1
)

REM Go back to project root
cd ..\..

echo 🧪 Setting up Test Data...

REM Create test data directory
if not exist "test_data" mkdir test_data

REM Create sample bank configuration
echo {> test_data\sample_bank_config.json
echo   "bank_id": "demo_bank",>> test_data\sample_bank_config.json
echo   "bank_name": "Demo Trading Bank",>> test_data\sample_bank_config.json
echo   "oracle_sbc_host": "sbc.demo.com",>> test_data\sample_bank_config.json
echo   "oracle_sbc_port": 5061,>> test_data\sample_bank_config.json
echo   "audiocodes_host": "audiocodes.demo.com",>> test_data\sample_bank_config.json
echo   "audiocodes_port": 5060,>> test_data\sample_bank_config.json
echo   "sip_domain": "demo.com",>> test_data\sample_bank_config.json
echo   "lines": [>> test_data\sample_bank_config.json
echo     {>> test_data\sample_bank_config.json
echo       "id": "hoot-1",>> test_data\sample_bank_config.json
echo       "name": "Trading Floor",>> test_data\sample_bank_config.json
echo       "number": "1001",>> test_data\sample_bank_config.json
echo       "type": "hoot",>> test_data\sample_bank_config.json
echo       "status": "active",>> test_data\sample_bank_config.json
echo       "participants": ["Trader A", "Trader B", "Manager"]>> test_data\sample_bank_config.json
echo     },>> test_data\sample_bank_config.json
echo     {>> test_data\sample_bank_config.json
echo       "id": "ard-1",>> test_data\sample_bank_config.json
echo       "name": "Emergency Line",>> test_data\sample_bank_config.json
echo       "number": "2001",>> test_data\sample_bank_config.json
echo       "type": "ard",>> test_data\sample_bank_config.json
echo       "status": "ready",>> test_data\sample_bank_config.json
echo       "participants": []>> test_data\sample_bank_config.json
echo     }>> test_data\sample_bank_config.json
echo   ]>> test_data\sample_bank_config.json
echo }>> test_data\sample_bank_config.json

echo ✅ Test data created successfully

echo 🔧 Creating Test Scripts...

REM Create backend test script
echo @echo off> scripts\test_backend.bat
echo echo 🐍 Testing Backend API...>> scripts\test_backend.bat
echo echo.>> scripts\test_backend.bat
echo cd Backend\API>> scripts\test_backend.bat
echo call venv\Scripts\activate.bat>> scripts\test_backend.bat
echo echo 🚀 Starting backend API server...>> scripts\test_backend.bat
echo echo    API will be available at: http://localhost:8000>> scripts\test_backend.bat
echo echo    Health check: http://localhost:8000/health>> scripts\test_backend.bat
echo echo    API docs: http://localhost:8000/docs>> scripts\test_backend.bat
echo echo.>> scripts\test_backend.bat
echo echo Press Ctrl+C to stop the server>> scripts\test_backend.bat
echo echo.>> scripts\test_backend.bat
echo python main.py>> scripts\test_backend.bat

REM Create integration test script
echo @echo off> scripts\test_integration.bat
echo echo 🔗 Testing Integration...>> scripts\test_integration.bat
echo echo.>> scripts\test_integration.bat
echo echo 🚀 Starting backend server...>> scripts\test_integration.bat
echo cd Backend\API>> scripts\test_integration.bat
echo call venv\Scripts\activate.bat>> scripts\test_integration.bat
echo start /b python main.py>> scripts\test_integration.bat
echo echo.>> scripts\test_integration.bat
echo echo Waiting for backend to start...>> scripts\test_integration.bat
echo timeout /t 5 /nobreak ^>nul>> scripts\test_integration.bat
echo echo.>> scripts\test_integration.bat
echo echo 🧪 Testing API health...>> scripts\test_integration.bat
echo curl -s http://localhost:8000/health>> scripts\test_integration.bat
echo if %%errorlevel%% equ 0 (>> scripts\test_integration.bat
echo     echo ✅ Backend API is running>> scripts\test_integration.bat
echo ^) else (>> scripts\test_integration.bat
echo     echo ❌ Backend API failed to start>> scripts\test_integration.bat
echo     exit /b 1>> scripts\test_integration.bat
echo ^)>> scripts\test_integration.bat
echo echo.>> scripts\test_integration.bat
echo echo 🧪 Testing bank configuration...>> scripts\test_integration.bat
echo curl -X POST http://localhost:8000/banks/demo_bank/configure -H "Content-Type: application/json" -d @..\..\test_data\sample_bank_config.json>> scripts\test_integration.bat
echo echo.>> scripts\test_integration.bat
echo echo 🧪 Testing DND functionality...>> scripts\test_integration.bat
echo curl -X POST http://localhost:8000/dnd/user123/enable>> scripts\test_integration.bat
echo curl http://localhost:8000/dnd/user123/status>> scripts\test_integration.bat
echo echo.>> scripts\test_integration.bat
echo echo ✅ Integration tests completed>> scripts\test_integration.bat
echo echo.>> scripts\test_integration.bat
echo echo Backend is still running. Press any key to stop it.>> scripts\test_integration.bat
echo pause ^>nul>> scripts\test_integration.bat
echo taskkill /f /im python.exe>> scripts\test_integration.bat

echo ✅ Test scripts created successfully

echo.
echo 🎉 Testing Environment Setup Complete!
echo ======================================
echo.
echo 📋 Next Steps:
echo   1. Test Backend:     scripts\test_backend.bat
echo   2. Test Integration: scripts\test_integration.bat
echo.
echo 📚 For detailed testing instructions, see:
echo    Documentation\Testing_Guide.md
echo.
echo 🔧 Quick Commands:
echo   • Start backend testing: scripts\test_backend.bat
echo   • Run integration tests: scripts\test_integration.bat
echo.
echo 🐍 Backend API Testing:
echo   1. API runs on http://localhost:8000
echo   2. Health check: http://localhost:8000/health
echo   3. API docs: http://localhost:8000/docs
echo   4. Test all endpoints with curl or Postman
echo.
echo 📱 iOS App Testing (macOS only):
echo   1. Open Xcode workspace: iOS\DirectTrader.xcworkspace
echo   2. Select iPhone 15 Pro simulator
echo   3. Build and run (⌘+R)
echo   4. Test all features in the app
echo.
echo Happy Testing! 🚀
