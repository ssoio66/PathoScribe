param(
  [string]$OutputRoot = (Join-Path $PSScriptRoot "..\output\pdf\outsourced-test")
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
$tempRoot = Join-Path $PSScriptRoot "..\tmp\outsourced-fixtures"
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

Add-Type -AssemblyName System.Drawing

function Add-Text($graphics, $font, $brush, $text, $x, $y, $width = 1000) {
  $graphics.DrawString($text, $font, $brush, [System.Drawing.RectangleF]::new($x, $y, $width, 80))
}

function New-ReportImage($path, $caseLabel, $orderNumber, $institution, $specimen, $testName, $receivedDate, $reportedDate, $result, $note) {
  $bitmap = [System.Drawing.Bitmap]::new(1275, 1650)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::White)
  $ink = [System.Drawing.Brushes]::DarkSlateGray
  $muted = [System.Drawing.Brushes]::DimGray
  $line = [System.Drawing.Pen]::new([System.Drawing.Color]::LightGray, 2)
  $titleFont = [System.Drawing.Font]::new("Malgun Gothic", 28, [System.Drawing.FontStyle]::Bold)
  $labelFont = [System.Drawing.Font]::new("Malgun Gothic", 17, [System.Drawing.FontStyle]::Bold)
  $valueFont = [System.Drawing.Font]::new("Malgun Gothic", 17)
  $smallFont = [System.Drawing.Font]::new("Malgun Gothic", 13)
  $watermarkFont = [System.Drawing.Font]::new("Malgun Gothic", 42, [System.Drawing.FontStyle]::Bold)

  $graphics.DrawRectangle($line, 55, 55, 1165, 1540)
  Add-Text $graphics $titleFont $ink "교육용 가상 위탁검사 결과지" 90 90 1050
  Add-Text $graphics $smallFont $muted "PathoScribe synthetic fixture · $caseLabel" 90 140 1050
  $graphics.DrawLine($line, 90, 210, 1180, 210)
  $rows = @(
    @("가상 의뢰번호", $orderNumber), @("검사기관명", $institution), @("검체", $specimen),
    @("검사명", $testName), @("접수일", $receivedDate), @("보고일", $reportedDate),
    @("결과", $result), @("참고사항", $note)
  )
  $y = 255
  foreach ($row in $rows) {
    $graphics.DrawRectangle($line, 90, $y, 1090, 82)
    Add-Text $graphics $labelFont $muted $row[0] 115 ($y + 18) 250
    Add-Text $graphics $valueFont $ink $row[1] 390 ($y + 18) 750
    $y += 92
  }
  $graphics.DrawRectangle($line, 90, 1030, 1090, 280)
  Add-Text $graphics $labelFont $muted "검사기관 참고사항" 115 1060 1000
  Add-Text $graphics $smallFont $muted "본 문서는 개인정보가 없는 교육용 합성자료입니다." 115 1125 1000
  Add-Text $graphics $smallFont $muted "진단, 판독, 처방 또는 결과 자동 확정에 사용할 수 없습니다." 115 1175 1000
  $graphics.TranslateTransform(210, 1280)
  $graphics.RotateTransform(-22)
  Add-Text $graphics $watermarkFont ([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(42, 63, 92, 140))) "교육용 가상 위탁검사 결과지" 0 0 1000
  $graphics.ResetTransform()
  $graphics.DrawString("담당자 원문 대조 필요 · 자동 저장/확정 안 함", $smallFont, $muted, 90, 1515)
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  $graphics.Dispose(); $bitmap.Dispose(); $line.Dispose(); $titleFont.Dispose(); $labelFont.Dispose(); $valueFont.Dispose(); $smallFont.Dispose(); $watermarkFont.Dispose()
}

function Write-JpegPdf($jpegPath, $pdfPath) {
  $jpeg = [System.IO.File]::ReadAllBytes($jpegPath)
  $width = 1275; $height = 1650
  $objects = @()
  $objects += "1 0 obj`n<< /Type /Catalog /Pages 2 0 R >>`nendobj`n"
  $objects += "2 0 obj`n<< /Type /Pages /Kids [3 0 R] /Count 1 >>`nendobj`n"
  $objects += "3 0 obj`n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`nendobj`n"
  $objects += "4 0 obj`n<< /Type /XObject /Subtype /Image /Width $width /Height $height /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length $($jpeg.Length) >>`nstream`n"
  $content = "q`n612 0 0 792 0 0 cm`n/Im0 Do`nQ`n"
  $contentBytes = [System.Text.Encoding]::ASCII.GetBytes($content)
  $objects += ,([pscustomobject]@{ Prefix = $objects[-1]; Binary = $jpeg; Suffix = "`nendstream`nendobj`n" })
  $objects += "5 0 obj`n<< /Length $($contentBytes.Length) >>`nstream`n$content`nendstream`nendobj`n"
  $stream = [System.IO.MemoryStream]::new()
  $writer = [System.IO.BinaryWriter]::new($stream, [System.Text.Encoding]::ASCII, $true)
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes("%PDF-1.4`n%`xE2`xE3`xCF`xD3`n"))
  $offsets = @(-1)
  foreach ($obj in $objects) {
    $offsets += [int]$stream.Position
    if ($obj -is [pscustomobject]) {
      $writer.Write([System.Text.Encoding]::ASCII.GetBytes($obj.Prefix)); $writer.Write($obj.Binary); $writer.Write([System.Text.Encoding]::ASCII.GetBytes($obj.Suffix))
    } else { $writer.Write([System.Text.Encoding]::ASCII.GetBytes($obj)) }
  }
  $xrefOffset = $stream.Position
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes("xref`n0 $($objects.Count + 1)`n0000000000 65535 f `n"))
  for ($i = 1; $i -lt $offsets.Count; $i++) { $writer.Write([System.Text.Encoding]::ASCII.GetBytes(("{0:0000000000} 00000 n `n" -f $offsets[$i]))) }
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes("trailer`n<< /Size $($objects.Count + 1) /Root 1 0 R >>`nstartxref`n$xrefOffset`n%%EOF`n"))
  $writer.Flush(); [System.IO.File]::WriteAllBytes($pdfPath, $stream.ToArray()); $writer.Dispose(); $stream.Dispose()
}

$cases = @(
  @{ name = "교육용_위탁검사_정상_일치"; label = "정상 일치 사례"; order = "EXT-EDU-2026-00418"; institution = "가상검사기관 A"; specimen = "FFPE tissue, block A1"; test = "EGFR mutation analysis"; received = "2026-04-18"; reported = "2026-04-21"; result = "No pathogenic variant detected"; note = "교육용 합성 결과. 임상 판정에 사용하지 않음." },
  @{ name = "교육용_위탁검사_검사번호_불일치"; label = "검사번호 불일치 사례"; order = "EXT-EDU-2026-00999"; institution = "가상검사기관 A"; specimen = "FFPE tissue, block B2"; test = "ALK rearrangement analysis"; received = "2026-04-18"; reported = "2026-04-22"; result = "No rearrangement detected"; note = "내부 의뢰번호와 다른 교육용 결과." },
  @{ name = "교육용_위탁검사_결과_누락"; label = "결과 누락 사례"; order = "EXT-EDU-2026-00420"; institution = "가상검사기관 B"; specimen = "FFPE tissue, block C1"; test = "PD-L1 TPS assessment"; received = "2026-04-19"; reported = "2026-04-23"; result = ""; note = "결과란 공란. 담당자 원문 확인 필요." }
)
foreach ($case in $cases) {
  $jpg = Join-Path $tempRoot ($case.name + ".jpg")
  $pdf = Join-Path $OutputRoot ($case.name + ".pdf")
  New-ReportImage $jpg $case.label $case.order $case.institution $case.specimen $case.test $case.received $case.reported $case.result $case.note
  Write-JpegPdf $jpg $pdf
}
Write-Output "Generated $($cases.Count) educational outsourced-result PDFs in $OutputRoot"
