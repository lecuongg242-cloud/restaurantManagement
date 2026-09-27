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
#   -ApiBase         Dia chi app (vd https://ten-mien) - de doi MA KICH HOAT (PRINT-11). CAI-DAT.bat dien san.
#   -ActivationCode  Ma kich hoat 8 ky tu (bo qua thi hoi, neu may chua co tai khoan cau in dung duoc).
#   -AppUrl          URL trang POS (de tao loi tat Chrome). Bo qua thi lay tu ket qua kich hoat.
#   -KitchenIp       IP may in bep neu da biet. Bo qua thi script tu do trong mang.
#   -InstallDir      Thu muc cai. Mac dinh C:\cau-in (MOT bo cai cho moi quan - QD-019 D6).
#   -SkipNode        Bo qua buoc Node (khi da co san).

param(
  [string]$ApiBase,
  [string]$ActivationCode,
  [string]$AppUrl,
  [string]$KitchenIp,
  [string]$InstallDir = "C:\cau-in",
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
  if ($ApiBase) { $argList += @("-ApiBase", "`"$ApiBase`"") }
  if ($ActivationCode) { $argList += @("-ActivationCode", "`"$ActivationCode`"") }
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
# Node DI KEM bo cai (node\node.exe, QD-019 D7): khong cai vao he thong, khong can winget (Win10 cu
# khong co), khong phu thuoc PATH (tac vu nen chay duoi SYSTEM). Cau in chi dung thu vien co san cua
# Node nen mot file node.exe la du.
Step 2 "Kiem tra Node"
$bundledNode = Join-Path $SourceDir "node\node.exe"
$node = $null
if (Test-Path $bundledNode) {
  $node = $bundledNode
  Ok ("Node di kem bo cai " + (& $node --version))
} elseif ($SkipNode -or (Get-Command node -ErrorAction SilentlyContinue)) {
  # Chi xay ra khi chay tu repo (may dev) - bo cai that luon co node\node.exe.
  $node = "node"
  Warn "Bo cai khong co node\node.exe - dung Node cua may"
} else {
  Die "Bo cai thieu thu muc node\ (node.exe). Lay lai bo cai day du (cau-in.zip) roi chay lai."
}

# ── 3. Tat cau in cu + chep file ───────────────────────────────────────────────
# Tat cau in DANG CHAY truoc khi chep: cai lai tren may dang chay thi node.exe cu dang bi khoa -> chep
# de that bai. Va cai de ma khong tat thi ban cu chay song song ban moi -> MOI PHIEU BEP RA HAI TO.
# Qua cmd /c chu KHONG dung "2>$null": voi $ErrorActionPreference = "Stop", PowerShell 5.1 bien
# dong loi cua schtasks ("khong tim thay tac vu" - may cai LAN DAU chua co tac vu nay) thanh loi
# DUNG SCRIPT. Da dung cai dat that o qt-food ngay 24/09/2026.
Step 3 "Tat cau in cu va chep file vao $InstallDir"
cmd /c "schtasks /end /tn CauInBep >nul 2>&1"
$cu = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*print-bridge.mjs*' })
foreach ($p in $cu) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
if ($cu.Count -gt 0) { Ok ("Da tat " + $cu.Count + " cau in cu dang chay"); Start-Sleep -Seconds 1 }

$needed = @("print-bridge.mjs", "print-bridge.bat", "print-scan.ps1", "print-activate.ps1", "print-raw.ps1", "go-cai-dat.ps1", "GO-CAI-DAT.bat")
foreach ($f in $needed) {
  if (-not (Test-Path (Join-Path $SourceDir $f))) { Die "Thieu file $f trong thu muc nguon." }
}

if ((Resolve-Path $SourceDir).Path -eq (Resolve-Path -LiteralPath $InstallDir -ErrorAction SilentlyContinue).Path) {
  Ok "Dang chay san trong thu muc cai, khong can chep"
} else {
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  foreach ($f in $needed) {
    Copy-Item (Join-Path $SourceDir $f) (Join-Path $InstallDir $f) -Force
  }
  # Do print-pack sinh ra (khong co khi chay tu repo). Chep vao day de cong cu sua loi + huong dan van con
  # sau khi nguoi lap xoa thu muc giai nen tren Desktop - HUONG-DAN.txt tro toi C:\cau-in.
  foreach ($f in @("KIEM-TRA-MAY-IN.bat", "HUONG-DAN.txt")) {
    if (Test-Path (Join-Path $SourceDir $f)) { Copy-Item (Join-Path $SourceDir $f) (Join-Path $InstallDir $f) -Force }
  }
  if ($node -eq $bundledNode) {
    New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir "node") | Out-Null
    Copy-Item $bundledNode (Join-Path $InstallDir "node\node.exe") -Force
    $node = Join-Path $InstallDir "node\node.exe"
  }
  Ok ("Da chep " + $needed.Count + " file" + $(if ($node -ne "node") { " + node.exe" } else { "" }))
}
$envFile = Join-Path $InstallDir ".env.local"

# ── 3b. Tai khoan cau in ───────────────────────────────────────────────────────
# Uu tien dung lai tai khoan DA CO (cai lai may cu, hoac nang cap tu bo cai cu C:\cau-in-<quan>), NHUNG
# chi khi dang nhap thu duoc. Khong co / dang nhap hong -> hoi MA KICH HOAT (PRINT-11). Bo cai khong
# mang mat khau nao (QD-019 D6).
function Test-BridgeAuth {
  # Ha muc loi trong luc goi node: voi "Stop", PowerShell 5.1 bien moi dong stderr cua chuong trinh
  # ngoai thanh loi DUNG SCRIPT (cung loai loi schtasks o buoc 3).
  $truoc = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  Push-Location $InstallDir
  try {
    & $node (Join-Path $InstallDir "print-bridge.mjs") --test-auth 2>&1 | Out-Null
    return ($LASTEXITCODE -eq 0)
  } finally {
    Pop-Location
    $ErrorActionPreference = $truoc
  }
}

if (-not $ActivationCode -and -not (Test-Path $envFile)) {
  $cuEnv = Get-ChildItem -Path "C:\" -Directory -Filter "cau-in-*" -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName ".env.local" } |
    Where-Object { (Test-Path $_) -and (Select-String -Path $_ -Pattern '^PRINT_BRIDGE_PASSWORD=.+' -Quiet) } |
    Select-Object -First 1
  if ($cuEnv) {
    Copy-Item $cuEnv $envFile -Force
    Ok ("Tim thay bo cai cu: " + (Split-Path -Parent $cuEnv) + " - thu dung lai tai khoan")
  }
}

$daKichHoat = $false
if (-not $ActivationCode -and (Test-Path $envFile) -and (Test-BridgeAuth)) {
  Ok "Tai khoan cau in da co va dang nhap duoc - khong can ma kich hoat"
  $daKichHoat = $true
}
if (-not $daKichHoat) {
  if (-not $ApiBase) { Die "Thieu -ApiBase (dia chi app). Chay bang CAI-DAT.bat trong bo cai." }
  Write-Host ""
  Write-Host "      Kich hoat cau in (bo cai chu quan tai o Admin -> May in da kem ma, khong phai go)."
  $activateArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $InstallDir "print-activate.ps1"),
    "-ApiBase", $ApiBase, "-EnvFile", $envFile)
  if ($ActivationCode) { $activateArgs += @("-Code", $ActivationCode) }
  else { $activateArgs += @("-TimMaTu", $SourceDir) }
  & powershell @activateArgs
  if ($LASTEXITCODE -ne 0) { Die "Chua kich hoat duoc cau in. Chu quan tai lai bo cai o Admin -> May in roi chay lai CAI-DAT.bat." }
  if (-not (Test-BridgeAuth)) { Die "Da kich hoat nhung cau in khong dang nhap duoc. Bao ky thuat." }
  Ok "Cau in dang nhap duoc"
}

if (-not $AppUrl) {
  $posLine = Select-String -Path $envFile -Pattern '^POS_URL=(.+)$' | Select-Object -First 1
  if ($posLine) { $AppUrl = $posLine.Matches[0].Groups[1].Value.Trim() }
}

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
    # Cau in in hoa don tu dien thoai/tablet ra DUNG may nay (PRINT-15). Luu TEN, khong dua vao "mac
    # dinh": tac vu nen chay duoi SYSTEM khong thay may in mac dinh cua nguoi dung.
    $dongEnv = @(Get-Content $envFile | Where-Object { $_ -notmatch '^COUNTER_PRINTER=' })
    $dongEnv += "COUNTER_PRINTER=usb:$name"
    Set-Content -Path $envFile -Value $dongEnv -Encoding UTF8
    Ok "Hoa don tu dien thoai se in ra may nay (COUNTER_PRINTER=usb:$name)"
  } else {
    Warn "Bo qua - nho tu dat may in QUAY lam mac dinh, khong hoa don se in o bep"
  }
}

# ── 6. Chay nen + chong ngu ────────────────────────────────────────────────────
Step 6 "Dang ky chay nen va chong laptop ngu"
$bat = Join-Path $InstallDir "print-bridge.bat"

# Tat lan nua (da tat o buoc 3): phong truong hop ai do mo tay cau in cu trong luc dang do may in.
# Ly do phai tat + vi sao qua cmd /c: xem buoc 3.
cmd /c "schtasks /end /tn CauInBep >nul 2>&1"
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
$thuMucCu = @(Get-ChildItem -Path "C:\" -Directory -Filter "cau-in-*" -ErrorAction SilentlyContinue)
if ($thuMucCu.Count -gt 0) {
  Write-Host ""
  Write-Host (" Bo cai cu con de lai: " + (($thuMucCu | ForEach-Object { $_.FullName }) -join ", ")) -ForegroundColor Yellow
  Write-Host " Khong con dung nua - xoa sau khi 4 phep thu duoi day deu dat. DUNG mo print-bridge.bat trong do." -ForegroundColor Yellow
}
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
