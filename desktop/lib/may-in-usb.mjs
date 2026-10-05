// Danh sách máy in Windows cho màn Cài đặt máy in → Máy in quầy → "Cắm USB vào máy này" (P33, DESK-14).
// Ẩn máy in ảo, máy cắm cổng USB đang kết nối lên đầu, máy rút / tắt ghi "chưa kết nối".
import { execFile } from "node:child_process";

/** Máy in ảo của Windows / Office — không in ra giấy, thu ngân hay chọn nhầm. */
const CONG_AO = /^(PORTPROMPT:|SHRFAX:|FILE:|NUL:?|XPSPORT:)$/i;
const TEN_AO = /OneNote|Print to PDF|XPS Document Writer|^Fax$/i;
const CONG_USB = /^USB\d{3}$/i;

/**
 * @typedef {{ ten: string, cong?: string }} MayInWindows
 * @typedef {{ ten: string, nhan: string, ketNoi: boolean | null }} MucMayIn  ketNoi: null = không phải cổng USB
 */

/**
 * @param {MayInWindows[]} may  máy in Windows đã cài (tên + cổng)
 * @param {string[] | null} congCo  cổng USB đang có máy cắm (USB001…); null = không đọc được → không ghi trạng thái
 * @returns {MucMayIn[]}
 */
export function phanLoaiMayIn(may, congCo) {
  const co = congCo && new Set(congCo.map((c) => c.toUpperCase()));
  const ds = [];
  for (const m of may) {
    const ten = String(m?.ten ?? "").trim();
    const cong = String(m?.cong ?? "").trim();
    if (!ten || TEN_AO.test(ten) || CONG_AO.test(cong)) continue;
    if (!co || !CONG_USB.test(cong)) {
      ds.push({ ten, nhan: ten, ketNoi: null });
      continue;
    }
    const ketNoi = co.has(cong.toUpperCase());
    ds.push({ ten, nhan: ketNoi ? `${ten} — đang kết nối (${cong.toUpperCase()})` : `${ten} — chưa kết nối`, ketNoi });
  }
  // Ổn định: máy đang kết nối lên đầu, còn lại giữ thứ tự Windows.
  return [...ds.filter((d) => d.ketNoi === true), ...ds.filter((d) => d.ketNoi !== true)];
}

/** Máy đã lưu mà Windows không còn thấy → vẫn giữ trong danh sách (ghi "chưa kết nối") để không mất lựa chọn. */
export function giuMayDaLuu(ds, tenDaLuu) {
  if (!tenDaLuu || ds.some((d) => d.ten === tenDaLuu)) return ds;
  return [...ds, { ten: tenDaLuu, nhan: `${tenDaLuu} — chưa kết nối`, ketNoi: false }];
}

// Cổng USB đang có máy cắm: đúng cách cổng USB của Windows (usbmon) tìm máy — giao diện thiết bị máy in USB
// (GUID_DEVINTERFACE_USBPRINT) mang "Base Name" + "Port Number" (→ USB001); thiết bị đang cắm thì `#\Control\Linked` = 1,
// hoặc thiết bị USB tương ứng còn trong Win32_PnPEntity (chỉ liệt kê thiết bị đang có mặt). Tên máy in lấy từ Win32_Printer
// (cùng tên mà print-raw.ps1 dùng để in).
const KICH_BAN = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$congCo = @()
$k = 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceClasses\{28d78fad-5a12-11d1-ae5b-0000f803a8c2}'
if (Test-Path -LiteralPath $k) {
  foreach ($d in Get-ChildItem -LiteralPath $k) {
    try {
      $tham = Get-ItemProperty -LiteralPath (Join-Path $d.PSPath '#\Device Parameters')
      if ($null -eq $tham.'Port Number') { continue }
      $cong = '{0}{1:000}' -f $(if ($tham.'Base Name') { $tham.'Base Name' } else { 'USB' }), [int]$tham.'Port Number'
      $coMat = $false
      try { $coMat = (Get-ItemProperty -LiteralPath (Join-Path $d.PSPath '#\Control')).Linked -eq 1 } catch {}
      if (-not $coMat) {
        $id = ($d.PSChildName -replace '^##\?#', '' -replace '#\{[^}]+\}$', '') -replace '#', '\'
        $coMat = $null -ne (Get-CimInstance Win32_PnPEntity -Filter ("DeviceID='" + ($id -replace '\\', '\\' -replace "'", "\'") + "'"))
      }
      if ($coMat) { $congCo += $cong }
    } catch {}
  }
}
$may = @(Get-CimInstance Win32_Printer | ForEach-Object { @{ ten = $_.Name; cong = $_.PortName } })
@{ may = $may; congCo = @($congCo) } | ConvertTo-Json -Compress -Depth 3
`;

/**
 * Đọc máy in Windows + cổng USB đang cắm (PowerShell, ≤ 20 giây).
 * @returns {Promise<{ may: MayInWindows[], congCo: string[] } | null>}  null = không đọc được
 */
export function docMayInWindows() {
  return new Promise((resolve) => {
    execFile(
      "powershell",
      // -EncodedCommand: kịch bản có dấu nháy — truyền qua dòng lệnh dễ vỡ.
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(KICH_BAN, "utf16le").toString("base64")],
      { timeout: 20_000, windowsHide: true, encoding: "utf8" },
      (err, out) => {
        if (err) return resolve(null);
        try {
          const kq = JSON.parse(out.trim());
          resolve({ may: [].concat(kq.may ?? []), congCo: [].concat(kq.congCo ?? []).map(String) });
        } catch {
          resolve(null);
        }
      }
    );
  });
}
