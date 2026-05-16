Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

$rootDir = Split-Path -Parent $PSScriptRoot
$assetDir = Join-Path $rootDir 'assets'
$pngPath = Join-Path $assetDir 'app-icon.png'
$icoPath = Join-Path $assetDir 'app-icon.ico'
$sizes = @(16, 24, 32, 48, 64, 128, 256)

function New-PointF([double]$x, [double]$y) {
  return New-Object System.Drawing.PointF([float]$x, [float]$y)
}

function Fill-Polygon {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Color]$Color,
    [double[][]]$Points
  )

  $brush = New-Object System.Drawing.SolidBrush($Color)
  try {
    $pointList = New-Object 'System.Collections.Generic.List[System.Drawing.PointF]'
    foreach ($pair in $Points) {
      $pointList.Add((New-PointF $pair[0] $pair[1]))
    }
    $Graphics.FillPolygon($brush, $pointList.ToArray())
  } finally {
    $brush.Dispose()
  }
}

function Add-PngFrame {
  param(
    [System.Collections.Generic.List[byte[]]]$Frames,
    [System.Drawing.Bitmap]$SourceBitmap,
    [int]$Size
  )

  $target = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($target)

  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.DrawImage($SourceBitmap, 0, 0, $Size, $Size)

    $memory = New-Object System.IO.MemoryStream
    try {
      $target.Save($memory, [System.Drawing.Imaging.ImageFormat]::Png)
      $Frames.Add($memory.ToArray())
    } finally {
      $memory.Dispose()
    }
  } finally {
    $graphics.Dispose()
    $target.Dispose()
  }
}

$bitmap = New-Object System.Drawing.Bitmap(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)

try {
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $centerX = 512.0
  $centerY = 488.0
  $discRadius = 368.0

  $shadowColor = [System.Drawing.Color]::FromArgb(46, 5, 16, 33)
  $shadowBrush = New-Object System.Drawing.SolidBrush($shadowColor)
  try {
    $graphics.FillEllipse($shadowBrush, 144, 144, 736, 736)
  } finally {
    $shadowBrush.Dispose()
  }

  $discRect = New-Object System.Drawing.RectangleF(144, 120, 736, 736)
  $discGradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-PointF 196 164),
    (New-PointF 828 870),
    [System.Drawing.Color]::FromArgb(255, 22, 58, 99),
    [System.Drawing.Color]::FromArgb(255, 9, 23, 40)
  )
  $discBlend = New-Object System.Drawing.Drawing2D.ColorBlend(3)
  $discBlend.Colors = @(
    [System.Drawing.Color]::FromArgb(255, 22, 58, 99),
    [System.Drawing.Color]::FromArgb(255, 13, 38, 67),
    [System.Drawing.Color]::FromArgb(255, 9, 23, 40)
  )
  $discBlend.Positions = @(0.0, 0.56, 1.0)
  $discGradient.InterpolationColors = $discBlend

  try {
    $graphics.FillEllipse($discGradient, $discRect)
  } finally {
    $discGradient.Dispose()
  }

  $orangeGlowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(52, 242, 147, 24))
  try {
    $graphics.FillEllipse($orangeGlowBrush, 610, 118, 262, 262)
  } finally {
    $orangeGlowBrush.Dispose()
  }

  $blueGlowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(38, 103, 178, 255))
  try {
    $graphics.FillEllipse($blueGlowBrush, 82, 638, 316, 316)
  } finally {
    $blueGlowBrush.Dispose()
  }

  $innerOverlay = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(7, 255, 255, 255))
  $innerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(20, 255, 255, 255), 2)
  try {
    $graphics.FillEllipse($innerOverlay, 172, 148, 680, 680)
    $graphics.DrawEllipse($innerPen, 172, 148, 680, 680)
  } finally {
    $innerOverlay.Dispose()
    $innerPen.Dispose()
  }

  $bluePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 90, 158, 229), 48)
  $bluePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $bluePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  try {
    $graphics.DrawArc($bluePen, 190, 156, 664, 664, 112, 250)
  } finally {
    $bluePen.Dispose()
  }

  Fill-Polygon $graphics ([System.Drawing.Color]::FromArgb(255, 44, 110, 183)) @(
    @(685, 243),
    @(770, 184),
    @(758, 287)
  )

  $orangePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 255, 176, 52), 48)
  $orangePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $orangePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  try {
    $graphics.DrawArc($orangePen, 190, 156, 664, 664, -8, 206)
  } finally {
    $orangePen.Dispose()
  }

  Fill-Polygon $graphics ([System.Drawing.Color]::FromArgb(255, 242, 147, 24)) @(
    @(258, 828),
    @(344, 772),
    @(331, 875)
  )

  $logoShadowScale = 1.94
  $logoShadowOffsetX = 334.0
  $logoShadowOffsetY = 348.0
  $logoScale = 1.94
  $logoOffsetX = 302.0
  $logoOffsetY = 296.0

  $baseOrange = @(
    @(28.32, 25.61), @(73.05, 25.45), @(120.18, 83.88), @(123.33, 123.9),
    @(205.56, 225.85), @(164.02, 225.85), @(101.93, 148.86), @(97.26, 110.95)
  )
  $baseBlueTop = @(
    @(138.3, 106.35), @(207.54, 25.61), @(129.98, 25.61), @(129.94, 45.74), @(152.48, 45.74)
  )
  $baseBlueBottom = @(
    @(0, 225.78), @(35.95, 225.78), @(94.19, 157.88), @(76.3, 135.7)
  )
  $baseWhite = @(
    @(108.22, 25.61), @(129.98, 25.61), @(129.94, 45.74), @(108.22, 45.74)
  )

  function Scale-Points([double[][]]$Points, [double]$scale, [double]$offsetX, [double]$offsetY) {
    $result = New-Object System.Collections.ArrayList
    foreach ($pair in $Points) {
      $scaledPair = New-Object object[] 2
      $scaledPair[0] = (($pair[0] * $scale) + $offsetX)
      $scaledPair[1] = (($pair[1] * $scale) + $offsetY)
      [void]$result.Add($scaledPair)
    }
    return ,$result.ToArray()
  }

  Fill-Polygon $graphics ([System.Drawing.Color]::FromArgb(56, 8, 18, 31)) (Scale-Points $baseOrange $logoShadowScale $logoShadowOffsetX $logoShadowOffsetY)
  Fill-Polygon $graphics ([System.Drawing.Color]::FromArgb(56, 8, 18, 31)) (Scale-Points $baseBlueTop $logoShadowScale $logoShadowOffsetX $logoShadowOffsetY)
  Fill-Polygon $graphics ([System.Drawing.Color]::FromArgb(56, 8, 18, 31)) (Scale-Points $baseBlueBottom $logoShadowScale $logoShadowOffsetX $logoShadowOffsetY)
  Fill-Polygon $graphics ([System.Drawing.Color]::FromArgb(56, 8, 18, 31)) (Scale-Points $baseWhite $logoShadowScale $logoShadowOffsetX $logoShadowOffsetY)

  Fill-Polygon $graphics ([System.Drawing.Color]::FromArgb(255, 242, 147, 24)) (Scale-Points $baseOrange $logoScale $logoOffsetX $logoOffsetY)
  Fill-Polygon $graphics ([System.Drawing.Color]::FromArgb(255, 44, 110, 183)) (Scale-Points $baseBlueTop $logoScale $logoOffsetX $logoOffsetY)
  Fill-Polygon $graphics ([System.Drawing.Color]::FromArgb(255, 118, 182, 255)) (Scale-Points $baseBlueBottom $logoScale $logoOffsetX $logoOffsetY)
  Fill-Polygon $graphics ([System.Drawing.Color]::FromArgb(255, 238, 244, 251)) (Scale-Points $baseWhite $logoScale $logoOffsetX $logoOffsetY)

  $bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $frames = New-Object 'System.Collections.Generic.List[byte[]]'
  foreach ($size in $sizes) {
    Add-PngFrame -Frames $frames -SourceBitmap $bitmap -Size $size
  }

  $stream = [System.IO.File]::Create($icoPath)
  $writer = New-Object System.IO.BinaryWriter($stream)
  try {
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]$frames.Count)

    $offset = 6 + (16 * $frames.Count)
    for ($index = 0; $index -lt $frames.Count; $index += 1) {
      $frame = $frames[$index]
      $size = $sizes[$index]
      $writer.Write([byte]($(if ($size -ge 256) { 0 } else { $size })))
      $writer.Write([byte]($(if ($size -ge 256) { 0 } else { $size })))
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([UInt16]1)
      $writer.Write([UInt16]32)
      $writer.Write([UInt32]$frame.Length)
      $writer.Write([UInt32]$offset)
      $offset += $frame.Length
    }

    foreach ($frame in $frames) {
      $writer.Write($frame)
    }
  } finally {
    $writer.Dispose()
    $stream.Dispose()
  }
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}
