# scripts/print-setup.ps1 — Cai dat may in cho MOT quan bang MOT lenh.
#
# Gom toan bo cac buoc lap dat thanh mot script: cai Node, chep file, do va thu may in bep,
# ghi cau hinh, chon may in quay lam mac dinh, tao loi tat POS, dang ky chay nen, chong laptop ngu.
# Truoc day phai lam tay 10 buoc theo HUONG-DAN.txt — de sot buoc, moi quan lam moi khac.
#
# Chay (PowerShell tren laptop cua quan, script tu xin quyen Administrator):
#
#   powershell -ExecutionPolicy Bypass -File print-setup.ps1 -AppUrl "https://ten-mien/r/qt-food/pos"
#
# Tham so:
#   -AppUrl      URL trang POS (de tao loi tat Chrome). Bo qua thi khong tao loi tat.
#   -KitchenIp   IP may in bep neu da biet. Bo qua thi script tu do trong mang.
#   -InstallDir  Thu muc cai. Mac dinh C:\cau-in-qt-food
#   -SkipNode    Bo qua buoc cai Node (khi da cai san).

param(
  [string]$AppUrl,
  [string]$KitchenIp,
  [string]$InstallDir = "C:\cau-in-qt-food",
  [switch]$SkipNode
)

$ErrorActionPreference = "Stop"
$SourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Step($n, $text) {
  Write-Host ""
  Write-Host "[$n/7] $text" -ForegroundColor Cyan
}
function Ok($text) { Write-Host "      OK - $text" -ForegroundColor Green }
function Warn($text) { Write-Host "      ! $text" -ForegroundColor Yellow }
function Die($text) {
  Write-Host ""
  Write-Host "  DUNG LAI: $text" -ForegroundColor Red
  Write-Host ""
  Read-Host "Nhan Enter de dong"
  exit 1
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor White
Write-Host " CAI DAT MAY IN - CAU IN BEP" -ForegroundColor White
Write-Host "==========================================" -ForegroundColor White

# ── 1. Quyen Administrator ─────────────────────────────────────────────────────
# Can quyen nay cho schtasks (dang ky chay nen) va powercfg (chong ngu). Tu xin de
# nguoi cai khong phai biet "chuot phai -> Run as administrator".
Step 1 "Kiem tra quyen Administrator"
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = (New-Object Security.Principal.WindowsPrincipal $identity).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  Warn "Chua co quyen Admin - dang mo lai cua so co quyen..."
  $argList = @("-ExecutionPolicy", "Bypass", "-File", "`"$($MyInvocation.MyCommand.Path)`"")
  if ($AppUrl) { $argList += @("-AppUrl", "`"$AppUrl`"") }
  if ($KitchenIp) { $argList += @("-KitchenIp", "`"$KitchenIp`"") }
  if ($InstallDir) { $argList += @("-InstallDir", "`"$InstallDir`"") }
  if ($SkipNode) { $argList += "-SkipNode" }
  try {
    Start-Process powershell -Verb RunAs -ArgumentList $argList
  } catch {
    Die "Ban da bam 'No' o hop thoai xin quyen. Chay lai va bam 'Yes'."
  }
  exit 0
}
Ok "Da co quyen Administrator"

# ── 2. Node ────────────────────────────────────────────────────────────────────
Step 2 "Kiem tra Node"
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
              [Environment]::GetEnvironmentVariable("Path", "User")
}

if ($SkipNode) {
  Warn "Bo qua theo yeu cau (-SkipNode)"
} elseif (Get-Command node -ErrorAction SilentlyContinue) {
  Ok ("Da co Node " + (node --version))
} else {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "      Dang cai Node LTS (vai phut, khong tat cua so)..."
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
    Refresh-Path
  }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Start-Process "https://nodejs.org"
    Die "Khong tu cai duoc Node. Trang tai vua mo - cai ban LTS roi chay lai script nay."
  }
  Ok ("Da cai Node " + (node --version))
}

# ── 3. Chep file ───────────────────────────────────────────────────────────────
Step 3 "Chep file vao $InstallDir"
$needed = @("print-bridge.mjs", "print-bridge.bat", "print-scan.ps1")
foreach ($f in $needed) {
  if (-not (Test-Path (Join-Path $SourceDir $f))) { Die "Thieu file $f trong thu muc nguon." }
}
if (-not (Test-Path (Join-Path $SourceDir ".env.local"))) {
  Die "Thieu file .env.local trong thu muc nguon (chua co khoa ket noi may chu)."
}

if ((Resolve-Path $SourceDir).Path -eq (Resolve-Path -LiteralPath $InstallDir -ErrorAction SilentlyContinue).Path) {
  Ok "Dang chay san trong thu muc cai, khong can chep"
} else {
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  foreach ($f in ($needed + ".env.local")) {
    Copy-Item (Join-Path $SourceDir $f) (Join-Path $InstallDir $f) -Force
  }
  Ok "Da chep 4 file"
}
$envFile = Join-Path $InstallDir ".env.local"

# ── 4. May in bep ──────────────────────────────────────────────────────────────
# Buoc de sai nhat: quan co 2 may in, rat de cau hinh nham IP may quay thanh may bep
# roi phieu bep chui ra o quay. Nen bat buoc nguoi cai phai XUONG BEP xac nhan giay.
Step 4 "Tim va thu may in bep"
$scan = Join-Path $InstallDir "print-scan.ps1"

function Test-KitchenPrinter($ip) {
  Write-Host ""
  Write-Host "      Dang in phieu thu toi $ip ..."
  & powershell -ExecutionPolicy Bypass -File $scan -TestPrint $ip | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Warn "Khong ket noi duoc toi $ip"
    return $false
  }
  Write-Host ""
  Write-Host "      >>> DI XUONG BEP XEM GIAY RA CHUA <<<" -ForegroundColor Yellow
  $answer = Read-Host "      Giay ra o dau? (b = bep, q = quay, k = khong ra gi)"
  if ($answer -eq "b") { return $true }
  if ($answer -eq "q") { Warn "Day la may in QUAY, khong phai may bep." }
  else { Warn "Khong ra giay - may in nay khong dung." }
  return $false
}

$kitchen = $null
if ($KitchenIp) {
  if (Test-KitchenPrinter $KitchenIp) { $kitchen = $KitchenIp }
}

if (-not $kitchen) {
  Write-Host "      Dang do may in trong mang (khoang 30 giay)..."
  $candidates = @(& powershell -ExecutionPolicy Bypass -File $scan -Quiet)
  if ($candidates.Count -eq 0) {
    Die @"
Khong tim thay may in nao trong mang.
  - May in bep da cam day LAN vao cung router voi laptop chua?
  - Giu nut FEED roi bat nguon may in -> no tu in phieu co dong 'IP Address'.
  - Laptop co dang bat VPN khong?
"@
  }
  Write-Host ("      Tim thay: " + ($candidates -join ", "))
  foreach ($ip in $candidates) {
    if ($ip -eq $KitchenIp) { continue }  # da thu o tren roi
    if (Test-KitchenPrinter $ip) { $kitchen = $ip; break }
  }
}

if (-not $kitchen) { Die "Khong xac dinh duoc may in bep. Kiem tra lai may in roi chay lai script." }
Ok "May in bep = $kitchen"

# Ghi PRINTER_HOST vao .env.local (giu nguyen cac dong khac).
$lines = Get-Content $envFile
if ($lines -match '^PRINTER_HOST=') {
  $lines = $lines -replace '^PRINTER_HOST=.*', "PRINTER_HOST=$kitchen"
} else {
  $lines += "PRINTER_HOST=$kitchen"
}
Set-Content -Path $envFile -Value $lines -Encoding UTF8
Ok "Da ghi PRINTER_HOST=$kitchen vao .env.local"

# ── 5. May in quay lam mac dinh ────────────────────────────────────────────────
# Chrome --kiosk-printing luon in ra may MAC DINH. Hoa don phai ra quay nen may quay
# bat buoc phai la mac dinh; phieu bep da di duong rieng qua cau in.
Step 5 "Chon may in quay lam may in mac dinh"
$printers = @(Get-Printer | Where-Object {
  $_.Name -notmatch 'OneNote|Microsoft Print to PDF|Microsoft XPS|Fax'
})

# Windows 11 mac dinh TU DOI may in mac dinh thanh cai vua dung gan nhat. Nhan vien in mot
# file PDF la hom sau hoa don lai chui vao "Microsoft Print to PDF" va hien hop thoai luu file.
# Khoa lai (HKCU cua chinh user dang cai - UAC nang quyen van giu nguyen user).
New-ItemProperty -Path "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Windows" `
  -Name LegacyDefaultPrinterMode -Value 1 -PropertyType DWord -Force | Out-Null

if ($printers.Count -eq 0) {
  Warn "Windows chua cai may in nao (may in USB o muc 'Unspecified' = CHUA CO DRIVER)."
  Warn "Cai driver may in QUAY theo hang (Xprinter/SPRT/Gprinter...) roi chay lai script nay."
} else {
  Write-Host ""
  for ($i = 0; $i -lt $printers.Count; $i++) {
    Write-Host ("       [{0}] {1}" -f ($i + 1), $printers[$i].Name)
  }
  Write-Host "       [0] Bo qua, de sau"
  $pick = Read-Host "      May in QUAY (in hoa don) la so may?"
  $idx = 0
  if ([int]::TryParse($pick, [ref]$idx) -and $idx -ge 1 -and $idx -le $printers.Count) {
    $name = $printers[$idx - 1].Name
    $cim = Get-CimInstance -ClassName Win32_Printer -Filter ("Name = '" + $name.Replace("'", "''") + "'")
    Invoke-CimMethod -InputObject $cim -MethodName SetDefaultPrinter | Out-Null
    Ok "May in mac dinh = $name"
  } else {
    Warn "Bo qua - nho tu dat may in QUAY lam mac dinh, khong hoa don se in o bep"
  }
}

# ── 6. Chay nen + chong ngu ────────────────────────────────────────────────────
Step 6 "Dang ky chay nen va chong laptop ngu"
$bat = Join-Path $InstallDir "print-bridge.bat"

# Tat cau in DANG CHAY truoc khi dang ky lai. Cai de (nang cap) ma khong tat thi ban cu van
# chay song song ban moi. Ban cu chua co khoa mot phien (PRINT-08) nen khong nhuong -> neu ca hai
# cung in duoc thi MOI PHIEU BEP RA HAI TO.
schtasks /end /tn "CauInBep" 2>$null | Out-Null
$cu = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*print-bridge.mjs*' })
foreach ($p in $cu) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
if ($cu.Count -gt 0) { Ok ("Da tat " + $cu.Count + " cau in cu dang chay") }

# Chay bang SYSTEM luc khoi dong: khong co cua so de nhan vien tat nham, va chay
# ngay ca khi chua ai dang nhap Windows.
schtasks /create /tn "CauInBep" /tr "`"$bat`"" /sc onstart /ru SYSTEM /rl HIGHEST /f | Out-Null
if ($LASTEXITCODE -eq 0) { Ok "Da dang ky tac vu 'CauInBep' chay khi bat may" }
else { Warn "Khong dang ky duoc tac vu tu chay - se phai mo print-bridge.bat bang tay" }

powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null
# GUID: nhom 'Power buttons and lid' -> 'Lid close action' = 0 (Do nothing) khi cam dien.
powercfg /setacvalueindex SCHEME_CURRENT 4f971e89-eebd-4455-a8de-9e59040e7347 5ca83367-6e45-459f-a27b-476b1d01c936 0 | Out-Null
powercfg /setactive SCHEME_CURRENT | Out-Null
Ok "Cam dien: khong ngu, dong nap van chay"

# ── 7. Loi tat POS + khoi dong cau in ──────────────────────────────────────────
Step 7 "Tao loi tat POS va khoi dong cau in"
if (-not $AppUrl) {
  Write-Host ""
  Write-Host "      Dia chi trang POS, vi du: https://qtfood.vercel.app/r/qt-food/pos"
  $AppUrl = (Read-Host "      Dan dia chi vao day (Enter de bo qua)").Trim()
}
if ($AppUrl) {
  $chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1

  if ($chrome) {
    $lnk = Join-Path ([Environment]::GetFolderPath("CommonDesktopDirectory")) "POS.lnk"
    $shell = New-Object -ComObject WScript.Shell
    $sc = $shell.CreateShortcut($lnk)
    $sc.TargetPath = $chrome
    # --kiosk-printing = bam in la ra giay luon, khong hien hop thoai chon may in.
    # --user-data-dir = ho so Chrome RIENG cho POS. Bat buoc: neu dung chung ho so voi Chrome
    # thuong dang mo, loi tat chi mo them cua so trong tien trinh cu va co --kiosk-printing
    # BI BO QUA -> hop thoai in lai hien ra.
    $sc.Arguments = "--kiosk-printing --user-data-dir=`"C:\pos-chrome`" --app=$AppUrl"
    $sc.Description = "Mo POS (in khong hop thoai)"
    $sc.Save()
    Ok "Da tao loi tat 'POS' tren Desktop"
  } else {
    Warn "Khong tim thay Chrome - cai Chrome roi tao loi tat sau"
  }
} else {
  Warn "Khong co -AppUrl nen bo qua loi tat POS"
}

schtasks /run /tn "CauInBep" | Out-Null
Start-Sleep -Seconds 2
if (Get-Process node -ErrorAction SilentlyContinue) { Ok "Cau in dang chay" }
else { Warn "Chua thay tien trinh cau in - thu double-click print-bridge.bat" }

# ── Ket qua ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host " CAI DAT XONG" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host " May in bep : $kitchen (qua cau in)"
Write-Host " Thu muc    : $InstallDir"
Write-Host " Tu chay    : tac vu 'CauInBep' khi bat may"
Write-Host ""
Write-Host " CON LAI 4 PHEP THU - lam du moi coi la xong:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. Bam 'Phieu bep' tren POS  -> giay ra o BEP, chip tren POS xanh"
Write-Host "  2. In 1 hoa don              -> giay ra o QUAY, khong hien hop thoai"
Write-Host "  3. Tat han laptop, bat lai, KHONG bam gi, doi 1 phut roi bam"
Write-Host "     'Phieu bep'               -> van ra giay o bep"
Write-Host "  4. Rut day mang may in bep, bam 'Phieu bep' -> chip do 'Bep CHUA in'."
Write-Host "     Cam day lai, bam vao chip do -> ra giay"
Write-Host ""
Read-Host "Nhan Enter de dong"
