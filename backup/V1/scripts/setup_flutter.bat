@echo off
REM Direct Trader Communications - Flutter Setup Script
REM This script sets up Flutter development environment on Windows

echo 🚀 Setting up Flutter Development Environment
echo =============================================

REM Check if Flutter is installed
where flutter >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Flutter not found. Please install Flutter first.
    echo.
    echo 📥 Download Flutter from: https://flutter.dev/docs/get-started/install/windows
    echo.
    echo 📋 Installation steps:
    echo    1. Download Flutter SDK
    echo    2. Extract to C:\flutter
    echo    3. Add C:\flutter\bin to your PATH
    echo    4. Run 'flutter doctor' to verify installation
    echo.
    pause
    exit /b 1
)

echo ✅ Flutter found:
flutter --version

echo.
echo 📦 Setting up Flutter project...

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

REM Run Flutter doctor
echo.
echo 🔍 Running Flutter doctor...
flutter doctor

echo.
echo 🎉 Flutter Setup Complete!
echo ==========================
echo.
echo 📋 Next Steps:
echo   1. Run Flutter app: flutter run
echo   2. Test on web: flutter run -d chrome
echo   3. Build for Android: flutter build apk
echo   4. Build for iOS: flutter build ios (requires macOS)
echo.
echo 🔧 Quick Commands:
echo   • Run app: flutter run
echo   • Run on web: flutter run -d chrome
echo   • Build Android: flutter build apk
echo   • Clean project: flutter clean
echo.
echo 📱 Supported Platforms:
echo   • Android (Windows development)
echo   • Web (Chrome, Firefox, Safari)
echo   • Windows Desktop
echo   • iOS (requires macOS for building)
echo.
echo Happy Flutter Development! 🚀
