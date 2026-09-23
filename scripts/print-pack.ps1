# scripts/print-pack.ps1 — Dong goi bo cai dat cau in cho MOT quan, bam mot lan la xong.
#
# Chay tren MAY DEV (co repo + .env.local). Sinh ra thu muc cau-in-<slug> day du file
# va mot file .zip de mang di lap: chep sang laptop quan -> double-click CAI-DAT.bat.
#
# Truoc day phai tu tay ghep file + go .env.local, thieu mot dong la print-setup.ps1
# dung o buoc 3 ("Thieu file .env.local trong thu muc nguon").
#
# Chay:
#   powershell -ExecutionPolicy Bypass -File print-pack.ps1
#   powershell -ExecutionPolicy Bypass -File print-pack.ps1 -Slug bun-bo -Chars 32
#
# Tham so (bo qua het cung chay duoc, dung mac dinh ben duoi):
#   -Slug    Slug quan trong URL /r/<slug>. Mac dinh: qt-food
#   -BridgePassword  BAT BUOC. Mat khau tai khoan cau in, lay o /super -> "Tai khoan cau in".
#                    Chi hien mot lan luc cap; mat thi vao /super cap lai.
#   -BridgeEmail     Mac dinh: print-<slug>@bridge.local (dung nhu /super sinh ra)
#   -AppUrl  URL trang POS. Mac dinh: https://restaurant-management-zeta.vercel.app/r/<slug>/pos
#   -Chars   Kho giay may in bep: 48 = 80mm (mac dinh), 32 = 58mm
#   -OutDir  Thu muc xuat. Mac dinh: <repo>\cau-in-<slug>

param(
  [string]$Slug,
  [string]$AppUrl,
  [int]$Chars = 48,
  [string]$OutDir,
  [string]$BridgeEmail,
  [string]$BridgePassword
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

function Ok($text) { Write-Host "      OK - $text" -ForegroundColor Green }

# Ghi UTF-8 KHONG BOM, xuong dong CRLF: file .bat xuong dong kieu Unix thi cmd.exe chay sai.
function Write-TextFile($path, $text) {
  $text = (($text -replace "`r`n", "`n") -replace "`n", "`r`n")
  if (-not $text.EndsWith("`r`n")) { $text += "`r`n" }
  [IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

function Die($text) {
  Write-Host ""
  Write-Host "  DUNG LAI: $text" -ForegroundColor Red
  Write-Host ""
  Read-Host "Nhan Enter de dong"
  exit 1
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor White
Write-Host " DONG GOI BO CAI DAT CAU IN" -ForegroundColor White
Write-Host "==========================================" -ForegroundColor White

# ── 1. Doc .env.local cua repo ─────────────────────────────────────────────────
# Lay dung 2 khoa cau in can. KHONG chep ca file: .env.local cua repo con
# POSTGRES_PASSWORD / STAFF_PIN_PEPPER — laptop quan khong can, chep sang la rai secret.
Write-Host ""
Write-Host "[1/4] Doc cau hinh tu .env.local cua repo" -ForegroundColor Cyan
$envPath = Join-Path $RepoRoot ".env.local"
if (-not (Test-Path $envPath)) {
  Die "Khong thay $envPath. Chay script nay tren may dev co repo day du."
}

$cfg = @{}
foreach ($raw in (Get-Content $envPath -Encoding UTF8)) {
  $line = $raw.Trim()
  if (-not $line -or $line.StartsWith("#")) { continue }
  $eq = $line.IndexOf("=")
  if ($eq -lt 1) { continue }
  $k = $line.Substring(0, $eq).Trim()
  $v = $line.Substring($eq + 1).Trim()
  if ($v.Length -gt 1 -and (($v.StartsWith('"') -and $v.EndsWith('"')) -or
                            ($v.StartsWith("'") -and $v.EndsWith("'")))) {
    $v = $v.Substring(1, $v.Length - 2)
  }
  if (-not $cfg.ContainsKey($k)) { $cfg[$k] = $v }
}

# CO Y chi lay khoa CONG KHAI. SUPABASE_SERVICE_ROLE_KEY khong bao gio roi khoi may dev nua
# (QD-012 §1): no bo qua RLS toan project, mot laptop quan bi mat la lo du lieu MOI nha hang.
foreach ($k in @("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY")) {
  if (-not $cfg[$k]) { Die "Thieu $k trong $envPath" }
}
Ok "Da lay NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (khong lay service-role)"

if (-not $Slug) { $Slug = "qt-food" }
if (-not $BridgeEmail) { $BridgeEmail = "print-$Slug@bridge.local" }
if (-not $BridgePassword) {
  Die "Thieu -BridgePassword. Vao /super -> hang nha hang '$Slug' -> 'Tai khoan cau in' -> 'Cap tai khoan', roi chay lai kem -BridgePassword '<mat khau>'."
}
if (-not $AppUrl) { $AppUrl = "https://restaurant-management-zeta.vercel.app/r/$Slug/pos" }
if (-not $OutDir) { $OutDir = Join-Path $RepoRoot "cau-in-$Slug" }
$InstallDir = "C:\cau-in-$Slug"

Ok "Quan = $Slug"
Ok "POS  = $AppUrl"

# ── 2. Chep file ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[2/4] Ghep thu muc $OutDir" -ForegroundColor Cyan
$files = @{
  "print-bridge.mjs"   = "print-bridge.mjs"
  "print-bridge.bat"   = "print-bridge.bat"
  "print-scan.ps1"     = "print-scan.ps1"
  "print-setup.ps1"    = "print-setup.ps1"
  "print-huongdan.txt" = "HUONG-DAN.txt"
}
foreach ($src in $files.Keys) {
  if (-not (Test-Path (Join-Path $PSScriptRoot $src))) { Die "Thieu scripts\$src trong repo." }
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
foreach ($src in $files.Keys) {
  Copy-Item (Join-Path $PSScriptRoot $src) (Join-Path $OutDir $files[$src]) -Force
}
Ok ("Da chep " + $files.Count + " file")

# ── 3. Sinh .env.local + CAI-DAT.bat ───────────────────────────────────────────
Write-Host ""
Write-Host "[3/4] Sinh .env.local va CAI-DAT.bat" -ForegroundColor Cyan

# PRINTER_HOST co y KHONG ghi o day: print-setup.ps1 buoc 4 tu do may in bep roi ghi vao.
$envOut = @"
# Cau hinh cau in bep - quan $Slug
# File nay do scripts/print-pack.ps1 sinh ra. KHONG gui cho nguoi ngoai.
#
# Tai khoan duoi day chi la thanh vien vai tro `printer` cua DUNG quan nay: lo ra ngoai thi
# thiet hai gioi han trong quan nay, va no khong mo duoc /admin, /pos hay /kds (QD-012 §1).
# Tenant suy tu chinh token - khong co dong nao chi dinh quan o day, nen khong the cau hinh nham.
NEXT_PUBLIC_SUPABASE_URL=$($cfg['NEXT_PUBLIC_SUPABASE_URL'])
NEXT_PUBLIC_SUPABASE_ANON_KEY=$($cfg['NEXT_PUBLIC_SUPABASE_ANON_KEY'])
PRINT_BRIDGE_EMAIL=$BridgeEmail
PRINT_BRIDGE_PASSWORD=$BridgePassword
PRINTER_PORT=9100
PRINTER_CHARS=$Chars
POLL_MS=2000
MAX_JOB_AGE_MIN=30
"@

Write-TextFile (Join-Path $OutDir ".env.local") $envOut
Ok "Da ghi .env.local (PRINTER_HOST de trong, luc cai tu do)"

# Chi mot cua ngo duy nhat cho nguoi lap: CAI-DAT.bat. URL POS va thu muc cai
# nhung san vao day de tai quan bot mot cau hoi de tra loi sai.
$batOut = @"
@echo off
REM CAI-DAT.bat - Double-click de cai dat cau in cho quan $Slug.
REM File nay do scripts/print-pack.ps1 sinh ra, dung sua tay.
cd /d "%~dp0"
REM %* de chay lai voi tham so, vd: CAI-DAT.bat -KitchenIp 192.168.1.87
powershell -ExecutionPolicy Bypass -File "%~dp0print-setup.ps1" -AppUrl "$AppUrl" -InstallDir "$InstallDir" %*
"@
Write-TextFile (Join-Path $OutDir "CAI-DAT.bat") $batOut
Ok "Da ghi CAI-DAT.bat (POS = $AppUrl, cai vao $InstallDir)"

# Windows mo file .ps1 bang Notepad khi double-click, khong chay. Nguoi lap tai quan
# khong go lenh PowerShell duoc -> boc print-scan.ps1 vao mot file .bat.
$checkOut = @'
@echo off
REM KIEM-TRA-MAY-IN.bat - Double-click de do may in va in phieu thu.
REM File nay do scripts/print-pack.ps1 sinh ra, dung sua tay.
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0print-scan.ps1"
echo.
set /p IP=Go IP de in phieu thu (Enter de bo qua):
if not "%IP%"=="" powershell -ExecutionPolicy Bypass -File "%~dp0print-scan.ps1" -TestPrint %IP%
echo.
pause
'@
Write-TextFile (Join-Path $OutDir "KIEM-TRA-MAY-IN.bat") $checkOut
Ok "Da ghi KIEM-TRA-MAY-IN.bat (do may in + in phieu thu)"

# ── 4. Nen lai de mang di ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "[4/4] Nen thanh file zip" -ForegroundColor Cyan
$zip = Join-Path $RepoRoot "cau-in-$Slug.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $OutDir "*") -DestinationPath $zip -Force
Ok "Da nen: $zip"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host " DONG GOI XONG" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host " Thu muc : $OutDir"
Write-Host " File zip: $zip"
Write-Host ""
Write-Host " TAI QUAN:" -ForegroundColor Yellow
Write-Host "  1. Chep thu muc (hoac giai nen file zip) vao Desktop laptop quan"
Write-Host "  2. Double-click CAI-DAT.bat -> bam Yes khi Windows xin quyen"
Write-Host "  3. Chi phai tra loi 2 cau: giay thu ra o BEP hay QUAY, va may in quay la cai nao"
Write-Host ""
Write-Host " CANH BAO: bo nay chua khoa may chu (bo qua RLS toan project)." -ForegroundColor Yellow
Write-Host " Dung gui qua Zalo/email cho nguoi ngoai, dung commit len git." -ForegroundColor Yellow
Write-Host ""

explorer.exe $OutDir
Read-Host "Nhan Enter de dong"
