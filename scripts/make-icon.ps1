Add-Type -AssemblyName System.Drawing

$size = [float]1024
$bmp = New-Object System.Drawing.Bitmap(1024, 1024)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

$r = [float]228
$d = [float]($r * 2)

$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$rectTL = New-Object System.Drawing.RectangleF([float]0, [float]0, $d, $d)
$rectTR = New-Object System.Drawing.RectangleF([float]($size - $d), [float]0, $d, $d)
$rectBR = New-Object System.Drawing.RectangleF([float]($size - $d), [float]($size - $d), $d, $d)
$rectBL = New-Object System.Drawing.RectangleF([float]0, [float]($size - $d), $d, $d)

$path.AddArc($rectTL, [float]180, [float]90)
$path.AddArc($rectTR, [float]270, [float]90)
$path.AddArc($rectBR, [float]0, [float]90)
$path.AddArc($rectBL, [float]90, [float]90)
$path.CloseFigure()

$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.PointF([float]0, [float]0)),
  (New-Object System.Drawing.PointF($size, $size)),
  [System.Drawing.Color]::FromArgb(255, 202, 96, 63),
  [System.Drawing.Color]::FromArgb(255, 165, 69, 46)
)
$g.FillPath($bg, $path)

$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [float]92)
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

$pts = @(
  (New-Object System.Drawing.PointF([float]290, [float]524)),
  (New-Object System.Drawing.PointF([float]452, [float]686)),
  (New-Object System.Drawing.PointF([float]742, [float]352))
)
$g.DrawLines($pen, $pts)

$out = Join-Path $PSScriptRoot 'app-icon.png'
if (Test-Path $out) { Remove-Item $out }
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Output "saved: $out"
