@echo off
setlocal
title 20-10 Gift - Fix DNS

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dns-settings.ps1" -Action Fix
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
    echo DNS da duoc doi sang 1.1.1.1 va 1.0.0.1.
    echo Chay reset-dns.bat neu muon khoi phuc DNS tu dong cua router.
) else (
    echo [LOI] Khong the thay doi DNS.
)
pause
exit /b %EXIT_CODE%
