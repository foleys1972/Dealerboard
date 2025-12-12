@echo off
REM Direct Trader Communications - Flutter Installation Script
REM This script helps install Flutter on Windows

echo 🚀 Installing Flutter for Direct Trader Communications
echo =====================================================

echo 📥 Step 1: Download Flutter SDK
echo.
echo Please download Flutter from: https://flutter.dev/docs/get-started/install/windows
echo.
echo 📋 Installation steps:
echo    1. Download the latest stable release
echo    2. Extract to C:\flutter
echo    3. Add C:\flutter\bin to your PATH
echo    4. Run 'flutter doctor' to verify
echo.
echo ⏳ After installing Flutter, press any key to continue...
pause

echo.
echo 🔍 Step 2: Verifying Flutter Installation
echo.

REM Check if Flutter is installed
where flutter >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Flutter not found in PATH
    echo.
    echo Please make sure you:
    echo    1. Extracted Flutter to C:\flutter
    echo    2. Added C:\flutter\bin to your PATH
    echo    3. Restarted your command prompt
    echo.
    echo Then run this script again.
    pause
    exit /b 1
)

echo ✅ Flutter found!
flutter --version

echo.
echo 🔍 Running Flutter Doctor...
flutter doctor

echo.
echo 📦 Step 3: Setting up Flutter project
echo.

REM Navigate to Flutter app directory
cd flutter_app

REM Get Flutter dependencies
echo 📦 Installing Flutter dependencies...
flutter pub get

REM Check if installation was successful
if %errorlevel% equ 0 (
    echo ✅ Flutter dependencies installed successfully
) else (
    echo ❌ Failed to install Flutter dependencies
    echo    Please check your internet connection and try again
    pause
    exit /b 1
)

echo.
echo 🎉 Flutter Setup Complete!
echo =========================
echo.
echo 📋 Next Steps:
echo   1. Run Flutter app: flutter run -d chrome
echo   2. Test on web: flutter run -d chrome
echo   3. Build for web: flutter build web
echo   4. Build for Windows: flutter build windows
echo.
echo 🔧 Quick Commands:
echo   • Run on web: flutter run -d chrome
echo   • Run on Windows: flutter run -d windows
echo   • Build web: flutter build web
echo   • Build Windows: flutter build windows
echo   • Clean project: flutter clean
echo.
echo 📱 Supported Platforms:
echo   • Web (Chrome, Firefox, Safari)
echo   • Windows Desktop
echo   • Android (if Android Studio installed)
echo   • iOS (requires macOS for building)
echo.
echo 🚀 Ready to start development!
echo.
echo To run the app, use: flutter run -d chrome
echo.
pause
