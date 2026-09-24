@echo off
REM print-bridge.bat — Chay cau in bep tren laptop cua quan (double-click la chay).
REM
REM Dat file nay CUNG THU MUC voi print-bridge.mjs va .env.local.
REM Yeu cau: da cai Node 20+ (https://nodejs.org, ban LTS).
REM
REM Tu khoi dong lai khi cau in chet (mat mang, may in rut dien, Node crash) — quan khong
REM co nguoi ky thuat truc, tat han la ca toi khong ai biet phieu khong xuong bep.

title Cau in bep - KHONG DUOC DONG CUA SO NAY
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  KHONG TIM THAY NODE.
  echo  Cai Node ban LTS tai https://nodejs.org roi mo lai file nay.
  echo.
  pause
  exit /b 1
)

if not exist ".env.local" (
  echo.
  echo  THIEU FILE .env.local trong thu muc nay.
  echo  Chep .env.local ke ben print-bridge.mjs roi mo lai file nay.
  echo.
  pause
  exit /b 1
)

:loop
echo.
echo ================= CAU IN BEP DANG CHAY =================
echo  Thu nho cua so nay, DUNG dong. Dong = bep khong nhan phieu.
echo ========================================================
echo.
node print-bridge.mjs
REM Ma 3 = da co cau in khac dang chay (thuong la tac vu nen 'CauInBep', khong co cua so).
REM KHONG chay lai: hai cau in cung chay thi moi phieu bep ra HAI to.
if errorlevel 3 if not errorlevel 4 (
  echo.
  echo  ========================================================
  echo   CAU IN DA CHAY NEN ROI - KHONG CAN MO CUA SO NAY.
  echo   Phieu bep van ra binh thuong. Dong cua so nay lai.
  echo  ========================================================
  echo.
  pause
  exit /b 0
)
echo.
echo  [!] Cau in vua dung. Tu chay lai sau 5 giay...
echo  [!] Muon tat han: dong cua so nay.
timeout /t 5 /nobreak >nul
goto loop
