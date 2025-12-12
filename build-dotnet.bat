@echo off
REM Quick wrapper for build-dotnet.ps1
powershell.exe -ExecutionPolicy Bypass -File "%~dp0scripts\build-dotnet.ps1" %*
pause

