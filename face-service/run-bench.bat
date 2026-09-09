@echo off
setlocal
title Face ID - So sanh model
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [LOI] Chua co moi truong Python trong face-service\.venv
  echo Chay lai buoc cai dat, hoac bao Claude dung lai giup.
  pause
  exit /b 1
)

if not exist "..\bench\photos" (
  echo [LOI] Chua co thu muc bench\photos
  pause
  exit /b 1
)

echo Dang so sanh cac model tren anh trong bench\photos ...
echo.
.venv\Scripts\python.exe bench.py %*
echo.
echo Bao cao nam o: bench\results\report.md
pause
endlocal
