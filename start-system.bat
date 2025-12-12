@echo off
REM Quick wrapper for start-system.ps1
powershell.exe -ExecutionPolicy Bypass -File "%~dp0scripts\start-system.ps1" %*
pause

