# scripts/go-cai-dat.ps1 - Go cau in khoi may cua quan (PRINT-11).
#
# Dung khi: quan ngung dung, doi may khac, hoac cai hong muon cai lai tu dau.
# Lam: tat cau in dang chay, xoa tac vu nen 'CauInBep', xoa loi tat POS tren Desktop, xoa thu muc cai.
# KHONG thu hoi tai khoan cau in o may chu - viec do lam o /super -> "Ma cai cau in" -> "Thu hoi".
# Bo cai khong giu mat khau nao de thu hoi o day: xoa .env.local o may nay la may nay het dang nhap duoc.
#
# CHI dung ky tu ASCII trong file nay: PowerShell 5.1 doc .ps1 UTF-8 khong BOM theo bang ma ANSI.

param(
  [string]$InstallDir = "C:\cau-in"
)

$ErrorActionPreference = "Stop"

function Ok($text) { Write-Host "      OK - $text" -ForegroundColor Green }
function Warn($text) { Write-Host "      ! $text" -ForegroundColor Yellow }

# Can quyen Admin de xoa tac vu chay duoi SYSTEM.
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = (New-Object Security.Principal.WindowsPrincipal $identity).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  try {
    Start-Process powershell -Verb RunAs -ArgumentList @("-ExecutionPolicy", "Bypass", "-File",
      "`"$($MyInvocation.MyCommand.Path)`"", "-InstallDir", "`"$InstallDir`"")
  } catch {
    Warn "Ban da bam 'No' o hop thoai xin quyen. Chay lai va bam 'Yes'."
    Read-Host "Nhan Enter de dong"
  }
  exit 0
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor White
Write-Host " GO CAU IN KHOI MAY NAY" -ForegroundColor White
Write-Host "==========================================" -ForegroundColor White
$chac = Read-Host "      Go cau in khoi may nay? Bep se KHONG tu nhan phieu nua. (go 'co' de dong y)"
if ($chac -ne "co") { Warn "Da huy - khong go gi."; Read-Host "Nhan Enter de dong"; exit 0 }

# Qua cmd /c: schtasks ghi loi ra stderr khi tac vu khong ton tai -> PowerShell 5.1 + "Stop" se dung script.
cmd /c "schtasks /end /tn CauInBep >nul 2>&1"
cmd /c "schtasks /delete /tn CauInBep /f >nul 2>&1"
Ok "Da xoa tac vu 'CauInBep'"

$cu = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*print-bridge.mjs*' })
foreach ($p in $cu) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
Ok ("Da tat " + $cu.Count + " tien trinh cau in")
Start-Sleep -Seconds 1

$lnk = Join-Path ([Environment]::GetFolderPath("CommonDesktopDirectory")) "POS.lnk"
if (Test-Path $lnk) { Remove-Item $lnk -Force; Ok "Da xoa loi tat POS" }

# Thu muc cai co the chinh la noi dang chay file nay -> doi ra ngoai truoc khi xoa.
Set-Location $env:SystemRoot
foreach ($dir in @($InstallDir) + @(Get-ChildItem -Path "C:\" -Directory -Filter "cau-in-*" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })) {
  if ($dir -and (Test-Path $dir)) {
    try {
      Remove-Item -LiteralPath $dir -Recurse -Force
      Ok "Da xoa $dir"
    } catch {
      Warn "Khong xoa het duoc $dir ($($_.Exception.Message)) - khoi dong lai may roi xoa tay."
    }
  }
}

Write-Host ""
Write-Host " XONG. Nho thu hoi tai khoan cau in o /super neu may nay bi mat hoac khong dung nua." -ForegroundColor Green
Write-Host ""
Read-Host "Nhan Enter de dong"
