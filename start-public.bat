@echo off
setlocal
title 20-10 Gift - Public Mode

set "ROOT=%~dp0"
set "BACKEND=%ROOT%20-10be"
set "FRONTEND=%ROOT%20-10fe"

echo.
echo ============================================================
echo   20-10 Gift - Che do chia se qua Cloudflare Tunnel
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [LOI] Khong tim thay Node.js trong PATH.
    pause
    exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo [LOI] Khong tim thay npm.cmd trong PATH.
    pause
    exit /b 1
)

echo [1/4] Dang build frontend production...
pushd "%FRONTEND%"
call npm.cmd run build
if errorlevel 1 (
    popd
    echo [LOI] Build frontend that bai.
    pause
    exit /b 1
)
popd
echo [OK] Frontend da build xong.
echo.

echo [2/4] Dang chay migration database...
pushd "%BACKEND%"
call npm.cmd run migrate
if errorlevel 1 (
    popd
    echo [LOI] Migration database that bai. Tunnel chua duoc mo.
    pause
    exit /b 1
)
popd
echo [OK] Database san sang.
echo.

set "CF_EXE="
if exist "%ROOT%cloudflared.exe" (
    set "CF_EXE=%ROOT%cloudflared.exe"
) else (
    where cloudflared >nul 2>&1
    if not errorlevel 1 set "CF_EXE=cloudflared"
)

if not defined CF_EXE (
    echo [LOI] Khong tim thay cloudflared.exe.
    echo Cai cloudflared hoac dat cloudflared.exe trong thu muc du an.
    pause
    exit /b 1
)

echo [3/4] Dang khoi dong backend va kiem tra readiness...
echo [4/4] Dang mo Cloudflare Tunnel...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%open-tunnel.ps1" ^
    -CloudflaredPath "%CF_EXE%" ^
    -BackendDir "%BACKEND%" ^
    -Port 5001

set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
    echo.
    echo [LOI] Public mode da dung voi ma loi %EXIT_CODE%.
)

echo.
echo Public mode da dung. Backend va tunnel do script tao da duoc tat.
pause
exit /b %EXIT_CODE%
