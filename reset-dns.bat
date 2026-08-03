@echo off
setlocal
title 20-10 Gift - Reset DNS

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dns-settings.ps1" -Action Reset
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
    echo DNS da duoc khoi phuc ve che do tu dong cua router.
) else (
    echo [LOI] Khong the khoi phuc DNS.
)
pause
exit /b %EXIT_CODE%
