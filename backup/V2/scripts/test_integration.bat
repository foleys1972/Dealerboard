@echo off
echo 🔗 Testing Integration...
echo.
echo 🚀 Starting backend server...
cd Backend\API
call venv\Scripts\activate.bat
start /b python main.py
echo.
echo Waiting for backend to start...
timeout /t 5 /nobreak >nul
echo.
echo 🧪 Testing API health...
curl -s http://localhost:8000/health
if %errorlevel% equ 0 (
    echo ✅ Backend API is running
) else (
    echo ❌ Backend API failed to start
    exit /b 
)
echo.
echo 🧪 Testing bank configuration...
curl -X POST http://localhost:8000/banks/demo_bank/configure -H "Content-Type: application/json" -d @..\..\test_data\sample_bank_config.json
echo.
echo 🧪 Testing DND functionality...
curl -X POST http://localhost:8000/dnd/user123/enable
curl http://localhost:8000/dnd/user123/status
echo.
echo ✅ Integration tests completed
echo.
echo Backend is still running. Press any key to stop it.
pause >nul
taskkill /f /im python.exe
