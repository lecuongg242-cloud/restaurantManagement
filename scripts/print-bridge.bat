@echo off
REM print-bridge.bat — Chay cau in bep tren laptop cua quan (double-click la chay).
REM
REM Dat file nay CUNG THU MUC voi print-bridge.mjs va .env.local.
REM Node: dung node\node.exe di kem bo cai (khong can cai Node vao may).
REM
REM Tu khoi dong lai khi cau in chet (mat mang, may in rut dien, Node crash) — quan khong
REM co nguoi ky thuat truc, tat han la ca toi khong ai biet phieu khong xuong bep.

title Cau in bep - KHONG DUOC DONG CUA SO NAY
cd /d "%~dp0"

REM Node di kem bo cai (node\node.exe, QD-019 D7) - khong phu thuoc Node cai tren may hay PATH.
REM Tac vu nen chay duoi SYSTEM nen PATH cua nguoi dung khong co tac dung o day.
set "NODE=%~dp0node\node.exe"
if not exist "%NODE%" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo.
    echo  KHONG TIM THAY NODE ^(thieu thu muc node\ trong bo cai^).
    echo  Chay lai CAI-DAT.bat tu bo cai day du.
    echo.
    pause
    exit /b 1
  )
  set "NODE=node"
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
"%NODE%" print-bridge.mjs
set "MA=%errorlevel%"
REM Ma 4 = vua tu cap nhat len ban moi (PRINT-12) - chay lai NGAY, khong tinh la chet.
if "%MA%"=="4" (
  echo  [i] Da cap nhat cau in - chay ban moi.
  goto loop
)
REM Ma 3 = da co cau in khac dang chay (thuong la tac vu nen 'CauInBep', khong co cua so).
REM KHONG chay lai: hai cau in cung chay thi moi phieu bep ra HAI to.
if "%MA%"=="3" (
  echo.
  echo  ========================================================
  echo   CAU IN DA CHAY NEN ROI - KHONG CAN MO CUA SO NAY.
  echo   Phieu bep van ra binh thuong. Dong cua so nay lai.
  echo  ========================================================
  echo.
  pause
  exit /b 0
)
REM Chet bat thuong: dem so lan LIEN TIEP (cau in xoa tep dem sau 5 phut chay khoe). Ban moi tu cap
REM nhat ma chet 3 lan lien tiep -> quay ve ban truoc (print-bridge.old.mjs), de bep khong mat phieu
REM chi vi mot ban cap nhat hong.
set "LOI=0"
if exist loi-lien-tiep.txt set /p LOI=<loi-lien-tiep.txt
set /a LOI=LOI+1
>loi-lien-tiep.txt echo %LOI%
if %LOI% GEQ 3 if exist print-bridge.old.mjs (
  echo  [!] Ban cau in hien tai chet %LOI% lan lien tiep - QUAY VE BAN TRUOC.
  copy /y print-bridge.old.mjs print-bridge.mjs >nul
  del print-bridge.old.mjs
  del loi-lien-tiep.txt
)
echo.
echo  [!] Cau in vua dung. Tu chay lai sau 5 giay...
echo  [!] Muon tat han: dong cua so nay.
timeout /t 5 /nobreak >nul
goto loop
