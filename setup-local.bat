@echo off
setlocal
title 20-10 Gift - First-time Setup

set "ROOT=%~dp0"
set "BACKEND=%ROOT%20-10be"
set "FRONTEND=%ROOT%20-10fe"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js 20 or newer is required.
  echo Download it from https://nodejs.org/
  pause
  exit /b 1
)

echo [1/5] Installing backend dependencies...
pushd "%BACKEND%"
call npm install --no-audit --no-fund
if errorlevel 1 goto :install_error
popd

echo [2/5] Installing frontend dependencies...
pushd "%FRONTEND%"
call npm install --no-audit --no-fund
if errorlevel 1 goto :install_error
popd

if not exist "%BACKEND%\.env" copy "%BACKEND%\.env.example" "%BACKEND%\.env" >nul
if not exist "%FRONTEND%\.env.local" copy "%FRONTEND%\.env.example" "%FRONTEND%\.env.local" >nul

echo.
echo [3/5] Configure the local environment.
echo A Notepad window will open. At minimum, replace:
echo   DB_PASSWORD=CHANGE_ME
echo   JWT_SECRET=CHANGE_ME_TO_A_LONG_RANDOM_SECRET
echo   ADMIN_PASSWORD=CHANGE_ME
echo.
echo MySQL 8 must be installed and running. Save and close Notepad when done.
start "Backend environment" /wait notepad "%BACKEND%\.env"

echo [4/5] Creating database tables and restoring shared data...
pushd "%BACKEND%"
call npm run migrate
if errorlevel 1 goto :database_error
call npm run restore
if errorlevel 1 goto :database_error
popd

echo [5/5] Creating the local admin account...
pushd "%BACKEND%"
call npm run create-admin
if errorlevel 1 goto :database_error
popd

echo.
echo Setup completed successfully.
echo You can now double-click start-dev.bat.
pause
exit /b 0

:install_error
popd
echo [ERROR] npm install failed. Check the Internet connection and try again.
pause
exit /b 1

:database_error
popd
echo.
echo [ERROR] Database setup failed.
echo Check that MySQL is running and DB_USER/DB_PASSWORD in 20-10be\.env are correct.
pause
exit /b 1
