# scripts/print-raw.ps1 - Gui DU LIEU THO (lenh ESC/POS) toi may in Windows theo TEN (PRINT-15, QD-020 D5).
#
# Dung cho may in QUAY cam USB vao laptop: cau in (print-bridge.mjs) dung lenh in anh hoa don roi goi
# script nay. Gui qua hang doi in cua Windows voi kieu du lieu RAW - driver khong dung vao noi dung.
#
# Theo TEN may in, KHONG theo may in mac dinh: tac vu nen chay duoi SYSTEM khong thay may in mac dinh
# cua nguoi dung.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File print-raw.ps1 -PrinterName "XP-80C" -Path lenh.bin
#
# Ma thoat: 0 = da gui vao hang doi; 1 = loi (in kem ly do ra stderr).
# CHI dung ky tu ASCII trong file nay: PowerShell 5.1 doc .ps1 UTF-8 khong BOM theo bang ma ANSI.

param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$Path
)

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class InTho {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }

  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool OpenPrinter(string ten, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern int StartDocPrinter(IntPtr h, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int daGhi);

  // Tra "" khi thanh cong, nguoc lai la ly do.
  public static string Gui(string ten, byte[] duLieu) {
    IntPtr h;
    if (!OpenPrinter(ten, out h, IntPtr.Zero))
      return "Khong mo duoc may in '" + ten + "' (loi " + Marshal.GetLastWin32Error() + ")";
    try {
      var di = new DOCINFO { pDocName = "Hoa don", pDataType = "RAW" };
      if (StartDocPrinter(h, 1, di) == 0) return "StartDocPrinter loi " + Marshal.GetLastWin32Error();
      try {
        if (!StartPagePrinter(h)) return "StartPagePrinter loi " + Marshal.GetLastWin32Error();
        int daGhi;
        bool ok = WritePrinter(h, duLieu, duLieu.Length, out daGhi);
        EndPagePrinter(h);
        if (!ok || daGhi != duLieu.Length)
          return "WritePrinter loi " + Marshal.GetLastWin32Error() + " (ghi " + daGhi + "/" + duLieu.Length + ")";
      } finally {
        EndDocPrinter(h);
      }
    } finally {
      ClosePrinter(h);
    }
    return "";
  }
}
"@

$duLieu = [IO.File]::ReadAllBytes($Path)
$loi = [InTho]::Gui($PrinterName, $duLieu)
if ($loi) {
  [Console]::Error.WriteLine($loi)
  exit 1
}
exit 0
