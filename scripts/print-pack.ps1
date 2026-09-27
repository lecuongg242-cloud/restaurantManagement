# scripts/print-pack.ps1 - Dong goi BO CAI CAU IN CHUNG cho moi quan (PRINT-11, QD-019 D6, D7).
#
# Chay tren MAY DEV (co repo). Sinh ra thu muc cau-in\ + cau-in.zip - GIONG NHAU cho moi quan.
# Giai nen ra chi thay CAI-DAT.bat + thu muc bo-cai\ (moi file khac nam trong do) - nguoi lap khong
# phai chon giua hang chuc file:
#   - KHONG co mat khau, KHONG co ten quan. Luc cai, nguoi lap go MA KICH HOAT (tao o /super ->
#     "Ma cai cau in") -> may nhan tai khoan `printer` cua dung quan.
#   - Kem node\node.exe (Node LTS chinh thuc, da kiem SHA-256): may quan khong can cai Node, khong can winget.
#
# Truoc 27/09/2026 moi quan mot goi rieng, mat khau tai khoan cau in nam san trong zip (-BridgePassword).
#
# Chay:
#   powershell -ExecutionPolicy Bypass -File scripts\print-pack.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\print-pack.ps1 -AppBase https://ten-mien -NodeMajor 24
#
# Tham so:
#   -AppBase    Dia chi app (de doi ma kich hoat). Mac dinh: https://restaurant-management-zeta.vercel.app
#   -NodeMajor  Dong Node LTS dong goi kem. Mac dinh 24.
#   -OutDir     Thu muc xuat. Mac dinh <repo>\cau-in
#   -NoPause    Khong mo Explorer, khong cho Enter (chay tu dong).
#   -Upload     Dua cau-in.zip len Storage de chu quan tai o Admin -> May in (PRINT-17). Can
#               SUPABASE_SERVICE_ROLE_KEY trong .env.local cua repo. Ghi de ban cu.
#
# CHI dung ky tu ASCII trong file nay: PowerShell 5.1 doc .ps1 UTF-8 khong BOM theo bang ma ANSI.

param(
  [string]$AppBase = "https://restaurant-management-zeta.vercel.app",
  [int]$NodeMajor = 24,
  [string]$OutDir,
  [switch]$NoPause,
  [switch]$Upload
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

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
  if (-not $NoPause) { Read-Host "Nhan Enter de dong" }
  exit 1
}

if (-not $OutDir) { $OutDir = Join-Path $RepoRoot "cau-in" }
$AppBase = $AppBase.TrimEnd("/")

Write-Host ""
Write-Host "==========================================" -ForegroundColor White
Write-Host " DONG GOI BO CAI CAU IN (CHUNG MOI QUAN)" -ForegroundColor White
Write-Host "==========================================" -ForegroundColor White

# -- 1. Node LTS portable -------------------------------------------------------
Write-Host ""
Write-Host "[1/4] Tai Node $NodeMajor LTS ban chinh thuc cho Windows x64" -ForegroundColor Cyan
$index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -TimeoutSec 60
$rel = $index | Where-Object { $_.version -like "v$NodeMajor.*" -and $_.lts -and ($_.files -contains "win-x64-zip") } |
  Select-Object -First 1
if (-not $rel) { Die "Khong tim thay Node $NodeMajor LTS co ban win-x64-zip tren nodejs.org." }
$ver = $rel.version
$zipName = "node-$ver-win-x64.zip"
$cacheZip = Join-Path $env:TEMP $zipName
if (-not (Test-Path $cacheZip)) {
  Invoke-WebRequest -Uri "https://nodejs.org/dist/$ver/$zipName" -OutFile $cacheZip -UseBasicParsing -TimeoutSec 600
}

# Kiem SHA-256 theo SHASUMS256.txt cua chinh nodejs.org: node.exe se chay duoi SYSTEM tren may moi quan.
$sums = (Invoke-WebRequest -Uri "https://nodejs.org/dist/$ver/SHASUMS256.txt" -UseBasicParsing -TimeoutSec 60).Content
$dong = ($sums -split "`n") | Where-Object { $_ -match "\s$([regex]::Escape($zipName))\s*$" } | Select-Object -First 1
if (-not $dong) { Die "SHASUMS256.txt khong co dong cho $zipName." }
$mong = ($dong -split "\s+")[0].ToLower()
$that = (Get-FileHash -Algorithm SHA256 $cacheZip).Hash.ToLower()
if ($mong -ne $that) {
  Remove-Item $cacheZip -Force
  Die "SHA-256 cua $zipName KHONG khop (tai hong hoac bi sua). Da xoa ban tai - chay lai."
}
Ok "Node $ver - SHA-256 khop nodejs.org"

# -- 2. Ghep thu muc ------------------------------------------------------------
Write-Host ""
Write-Host "[2/4] Ghep thu muc $OutDir" -ForegroundColor Cyan
if (Test-Path $OutDir) { Remove-Item $OutDir -Recurse -Force }
$BoCai = Join-Path $OutDir "bo-cai"
New-Item -ItemType Directory -Force -Path (Join-Path $BoCai "node") | Out-Null

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($cacheZip)
try {
  $entry = $zip.Entries | Where-Object { $_.FullName -like "*/node.exe" } | Select-Object -First 1
  if (-not $entry) { Die "Trong $zipName khong co node.exe." }
  [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $BoCai "node\node.exe"), $true)
} finally { $zip.Dispose() }
Ok "Da lay node\node.exe"

# Script + ps1 chep nguyen trang; .bat CHUAN HOA ve CRLF (khong phu thuoc git checkout LF hay CRLF).
$files = [ordered]@{
  "print-bridge.mjs"   = "print-bridge.mjs"
  "print-scan.ps1"     = "print-scan.ps1"
  "print-setup.ps1"    = "print-setup.ps1"
  "print-activate.ps1" = "print-activate.ps1"
  "print-raw.ps1"      = "print-raw.ps1"
  "go-cai-dat.ps1"     = "go-cai-dat.ps1"
  "print-huongdan.txt" = "HUONG-DAN.txt"
}
foreach ($src in $files.Keys) {
  if (-not (Test-Path (Join-Path $PSScriptRoot $src))) { Die "Thieu scripts\$src trong repo." }
  Copy-Item (Join-Path $PSScriptRoot $src) (Join-Path $BoCai $files[$src]) -Force
}
Write-TextFile (Join-Path $BoCai "print-bridge.bat") ([IO.File]::ReadAllText((Join-Path $PSScriptRoot "print-bridge.bat")))
Ok ("Da chep " + ($files.Count + 1) + " file")

# -- 3. Cua ngo cho nguoi lap ---------------------------------------------------
Write-Host ""
Write-Host "[3/4] Sinh CAI-DAT.bat, KIEM-TRA-MAY-IN.bat, GO-CAI-DAT.bat" -ForegroundColor Cyan

Write-TextFile (Join-Path $OutDir "CAI-DAT.bat") @"
@echo off
REM CAI-DAT.bat - Double-click de cai cau in. Dung cho MOI quan: luc cai se hoi MA KICH HOAT.
REM File nay do scripts/print-pack.ps1 sinh ra, dung sua tay.
cd /d "%~dp0"
REM %* de chay lai voi tham so, vd: CAI-DAT.bat -KitchenIp 192.168.1.87 -ActivationCode ABCD-EFGH
powershell -ExecutionPolicy Bypass -File "%~dp0bo-cai\print-setup.ps1" -ApiBase "$AppBase" %*
"@

Write-TextFile (Join-Path $BoCai "KIEM-TRA-MAY-IN.bat") @'
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

Write-TextFile (Join-Path $BoCai "GO-CAI-DAT.bat") @'
@echo off
REM GO-CAI-DAT.bat - Double-click de go cau in khoi may nay (hoi xac nhan truoc khi xoa).
REM File nay do scripts/print-pack.ps1 sinh ra, dung sua tay.
powershell -ExecutionPolicy Bypass -File "%~dp0go-cai-dat.ps1"
'@
Ok "Da ghi 3 file .bat (CRLF)"

# Chot chan: bo cai CHUNG khong duoc mang bat ky bi mat nao.
$loRi = Get-ChildItem $OutDir -Recurse -File | Where-Object { $_.Extension -ne ".exe" } |
  Select-String -Pattern '^\s*PRINT_BRIDGE_PASSWORD=\S|^\s*SUPABASE_SERVICE_ROLE_KEY=\S|AGE-SECRET-KEY-' -List
if ($loRi) { Die ("Bo cai chua bi mat: " + (($loRi | ForEach-Object { $_.Path }) -join ", ")) }
if (Get-ChildItem $OutDir -Recurse -Force -File -Filter ".env*") { Die "Bo cai co file .env - khong duoc." }
# Ngoai cung CHI co CAI-DAT.bat + bo-cai\ - them file o ngoai la nguoi lap lai phai doan bam cai nao.
$ngoai = @(Get-ChildItem $OutDir -Force | ForEach-Object { $_.Name } | Sort-Object)
if (($ngoai -join ",") -ne "bo-cai,CAI-DAT.bat") { Die ("Ngoai cung bo cai chi duoc co CAI-DAT.bat + bo-cai, dang co: " + ($ngoai -join ", ")) }
Ok "Khong co mat khau / khoa bi mat nao trong bo cai"

# -- 4. Nen ---------------------------------------------------------------------
Write-Host ""
Write-Host "[4/4] Nen thanh file zip" -ForegroundColor Cyan
$zipOut = Join-Path (Split-Path -Parent $OutDir) "cau-in.zip"
if (Test-Path $zipOut) { Remove-Item $zipOut -Force }
Compress-Archive -Path (Join-Path $OutDir "*") -DestinationPath $zipOut -Force
Ok ("Da nen: $zipOut (" + [math]::Round((Get-Item $zipOut).Length / 1MB, 1) + " MB)")

if ($Upload) {
  Write-Host ""
  Write-Host "[+] Dua bo cai len Storage (Admin -> May in -> Tai bo cai)" -ForegroundColor Cyan
  Push-Location $RepoRoot
  try {
    & node (Join-Path $PSScriptRoot "print-upload.mjs") $zipOut
    if ($LASTEXITCODE -ne 0) { Die "Dua bo cai len that bai (xem loi o tren)." }
  } finally { Pop-Location }
  Ok "Chu quan tai duoc o Admin -> May in"
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host " DONG GOI XONG" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host " Thu muc : $OutDir"
Write-Host " File zip: $zipOut"
Write-Host " Node    : $ver"
Write-Host ""
Write-Host " TAI QUAN:" -ForegroundColor Yellow
Write-Host "  1. Chep file zip vao Desktop laptop quan, giai nen (da -Upload: chu quan tu tai o Admin -> May in)"
Write-Host "  2. Goi nguoi quan ly lay MA KICH HOAT (tao o /super -> 'Ma cai cau in'), song 30 phut"
Write-Host "  3. Double-click CAI-DAT.bat -> Yes -> go ma -> tra loi: giay thu ra o BEP hay QUAY, may in quay la cai nao"
Write-Host ""
Write-Host " Bo cai nay KHONG chua mat khau - gui cho nguoi lap qua Zalo/USB duoc." -ForegroundColor Green
Write-Host ""

if (-not $NoPause) {
  explorer.exe $OutDir
  Read-Host "Nhan Enter de dong"
}
