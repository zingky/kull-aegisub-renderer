param(
  [string]$Target = ''
)
Add-Type -AssemblyName System.Drawing

function Get-IcoPixelHash([string]$icoPath, [int]$size) {
  $fi = New-Object System.IO.FileStream((Resolve-Path $icoPath).Path, 'Open', 'Read', 'ReadWrite')
  $ico = New-Object System.Drawing.Icon($fi, $size, $size)
  $bmp = $ico.ToBitmap()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $sha = [System.Security.Cryptography.SHA256]::Create().ComputeHash($ms.ToArray())
  $hex = ([BitConverter]::ToString($sha) -replace '-', '').Substring(0, 16)
  "{0}x{0}: pixel-hash={1}" -f $size, $hex
  $bmp.Dispose(); $ico.Dispose(); $ms.Dispose(); $fi.Close()
}

Write-Host "=== build/icon.ico (icon goc kimishinu) ==="
Get-IcoPixelHash 'build/icon.ico' 32

$targets = @()
if ($Target) { $targets += $Target }
$targets += @(
  'release/win-unpacked/Kull Aegisub Renderer.exe',
  'release/KullAegisubRenderer-1.0.0-portable.exe',
  (Join-Path $env:TEMP 'kull-rcedit-test.exe')
)

Add-Type -Namespace W -Name Native -MemberDefinition @"
[System.Runtime.InteropServices.DllImport("shell32.dll", CharSet=System.Runtime.InteropServices.CharSet.Auto)]
public static extern System.IntPtr ExtractIcon(System.IntPtr hInst, string exeFileName, int iconIndex);
"@

foreach ($t in $targets) {
  if (-not (Test-Path $t)) { continue }
  Write-Host "=== $t ==="
  $h = [W.Native]::ExtractIcon([IntPtr]::Zero, (Resolve-Path $t).Path, 0)
  if ($h -ne [IntPtr]::Zero) {
    $ico = [System.Drawing.Icon]::FromHandle($h)
    $bmp = $ico.ToBitmap()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $sha = [System.Security.Cryptography.SHA256]::Create().ComputeHash($ms.ToArray())
    $hex = ([BitConverter]::ToString($sha) -replace '-', '').Substring(0, 16)
    "  icon 32x32 -> pixel-hash=$hex  $($bmp.Width)x$($bmp.Height)"
    $bmp.Dispose(); $ico.Dispose(); $ms.Dispose()
  } else { '  KHONG extract duoc icon' }
}