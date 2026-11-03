param([int]$Pid2, [string]$Out = "shot.png")

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Drawing;
using System.Runtime.InteropServices;
public class PW {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
}
"@

$p = Get-Process -Id $Pid2 -ErrorAction SilentlyContinue
if (-not $p) { "no process"; exit 1 }
$h = $p.MainWindowHandle
if ($h -eq 0) { "no window handle"; exit 1 }

$c = New-Object PW+RECT
[PW]::GetClientRect($h, [ref]$c) | Out-Null
$w = $c.R - $c.L
$ht = $c.B - $c.T

$bmp = New-Object System.Drawing.Bitmap($w, $ht)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
# 0x2 = PW_RENDERFULLCONTENT, required for WebView2 / DWM composed windows.
$ok = [PW]::PrintWindow($h, $hdc, 0x2)
$g.ReleaseHdc($hdc)
$out = Join-Path $PSScriptRoot $Out
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
"$out ($w x $ht) printwindow=$ok"
