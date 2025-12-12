@echo off
REM Direct Trader Communications - Flutter App Runner
REM This script runs the Flutter app

echo 🚀 Starting Direct Trader Communications Flutter App
echo ===================================================

REM Check if Flutter is installed
where flutter >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Flutter not found. Please install Flutter first.
    echo.
    echo Run: scripts\install_flutter.bat
    pause
    exit /b 1
)

echo ✅ Flutter found!

REM Navigate to Flutter app directory
cd flutter_app

echo 📦 Installing dependencies...
flutter pub get

echo.
echo 🎯 Choose how to run the app:
echo.
echo 1. Run on Web (Chrome) - Recommended
echo 2. Run on Windows Desktop
echo 3. Run on Android (if available)
echo 4. Build for Web
echo 5. Build for Windows
echo.
set /p choice="Enter your choice (1-5): "

if "%choice%"=="1" (
    echo 🌐 Starting Flutter app on Chrome...
    flutter run -d chrome
) else if "%choice%"=="2" (
    echo 🖥️ Starting Flutter app on Windows Desktop...
    flutter run -d windows
) else if "%choice%"=="3" (
    echo 📱 Starting Flutter app on Android...
    flutter run -d android
) else if "%choice%"=="4" (
    echo 🌐 Building Flutter app for Web...
    flutter build web
    echo ✅ Web app built! Check build\web\ folder
    echo 🌐 To serve locally: python -m http.server 8080 -d build\web
) else if "%choice%"=="5" (
    echo 🖥️ Building Flutter app for Windows...
    flutter build windows
    echo ✅ Windows app built! Check build\windows\runner\Release\ folder
) else (
    echo ❌ Invalid choice. Please run the script again.
    pause
    exit /b 1
)

echo.
echo 🎉 Flutter app is running!
echo.
echo 💡 Tips:
echo   • Hot reload: Press 'r' in terminal
echo   • Hot restart: Press 'R' in terminal
echo   • Quit: Press 'q' in terminal
echo.
pause
