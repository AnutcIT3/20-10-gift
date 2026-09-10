@echo off
setlocal
title 20-10 Gift - First-time Setup

set "ROOT=%~dp0"
set "BACKEND=%ROOT%20-10be"
set "FRONTEND=%ROOT%20-10fe"
set "FACE=%ROOT%face-service"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js 20 or newer is required.
  echo Download it from https://nodejs.org/
  pause
  exit /b 1
)

echo [1/6] Installing backend dependencies...
pushd "%BACKEND%"
call npm install --no-audit --no-fund
if errorlevel 1 goto :install_error
popd

echo [2/6] Installing frontend dependencies...
pushd "%FRONTEND%"
call npm install --no-audit --no-fund
if errorlevel 1 goto :install_error
popd

if not exist "%BACKEND%\.env" copy "%BACKEND%\.env.example" "%BACKEND%\.env" >nul
if not exist "%FRONTEND%\.env.local" copy "%FRONTEND%\.env.example" "%FRONTEND%\.env.local" >nul

echo.
echo [3/6] Configure the local environment.
echo A Notepad window will open. At minimum, replace:
echo   DB_PASSWORD=CHANGE_ME
echo   JWT_SECRET=CHANGE_ME_TO_A_LONG_RANDOM_SECRET
echo   ADMIN_PASSWORD=CHANGE_ME
echo.
echo MySQL 8 must be installed and running. Save and close Notepad when done.
start "Backend environment" /wait notepad "%BACKEND%\.env"

echo [4/6] Creating database tables and restoring shared data...
pushd "%BACKEND%"
call npm run migrate
if errorlevel 1 goto :database_error
call npm run restore
if errorlevel 1 goto :database_error
popd

echo [5/6] Creating the local admin account...
pushd "%BACKEND%"
call npm run create-admin
if errorlevel 1 goto :database_error
popd

echo.
echo [6/6] Preparing the optional Face ID service (Python 3.11)...
rem Optional and never fatal: without it the website runs as before, the Face ID card just stays hidden.
rem Labels below sit outside any parenthesised block on purpose - cmd cannot jump to a label inside one.
if exist "%FACE%\.venv\Scripts\python.exe" goto :face_install
where py >nul 2>&1
if errorlevel 1 goto :face_skip
py -3.11 -c "import sys" >nul 2>&1
if errorlevel 1 goto :face_skip
echo Creating face-service\.venv with Python 3.11...
py -3.11 -m venv "%FACE%\.venv"
if errorlevel 1 goto :face_failed

:face_install
echo Installing face-service\requirements.txt (this can take a few minutes the first time)...
"%FACE%\.venv\Scripts\python.exe" -m pip install -r "%FACE%\requirements.txt"
if errorlevel 1 goto :face_failed
echo [OK] Face ID service is ready. start-dev.bat will open it in a third window.
goto :face_done

:face_skip
echo [WARN] Python 3.11 was not found (py launcher). Skipping Face ID; the website still works.
echo        Install Python 3.11 from https://www.python.org/ and run setup-local.bat again to enable it.
goto :face_done

:face_failed
echo [WARN] Could not install the Face ID service. Skipping; the website still works.
echo        See face-service\README.md (insightface may need Visual Studio Build Tools on Windows).

:face_done
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
