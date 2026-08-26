param(
  [string]$EvaluationPath = (Join-Path $PSScriptRoot "..\data\evaluation\evaluation-cases.json"),
  [string]$PdfOutputRoot = (Join-Path $PSScriptRoot "..\output\pdf\outsourced-test"),
  [string]$ImageOutputRoot = (Join-Path $PSScriptRoot "..\output\images\outsourced-test"),
  [string]$PublicOutputRoot = (Join-Path $PSScriptRoot "..\public\fixtures\outsourced-test"),
  [string]$FixtureOutputPath = (Join-Path $PSScriptRoot "..\data\fixtures\outsourced-test\referral-fixtures.json"),
  [string]$OrderOutputPath = (Join-Path $PSScriptRoot "..\data\fixtures\outsourced-test\internal-referral-orders.json")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$evaluationFile = [System.IO.Path]::GetFullPath($EvaluationPath)
if (-not (Test-Path -LiteralPath $evaluationFile -PathType Leaf)) { throw "평가사례 JSON을 찾을 수 없습니다: $evaluationFile" }
$evaluation = Get-Content -LiteralPath $evaluationFile -Raw -Encoding utf8 | ConvertFrom-Json
$pdfRoot = [System.IO.Path]::GetFullPath($PdfOutputRoot)
$imageRoot = [System.IO.Path]::GetFullPath($ImageOutputRoot)
$publicRoot = [System.IO.Path]::GetFullPath($PublicOutputRoot)
New-Item -ItemType Directory -Force -Path $pdfRoot, $imageRoot, $publicRoot, ([System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($FixtureOutputPath))), ([System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($OrderOutputPath))) | Out-Null

$watermark = "교육용 가상자료·실제 의료기록 아님"
$casesById = @{}
foreach ($case in $evaluation.cases) { $casesById[$case.caseId] = $case }

function Get-FieldValue($case, [string]$key, [string]$collection = "expectedExtraction") {
  $fields = if ($collection -eq "referenceFields") { $case.groundTruth.referenceFields } else { $case.groundTruth.expectedExtraction }
  $field = @($fields | Where-Object { $_.key -eq $key }) | Select-Object -First 1
  if ($null -eq $field -or $null -eq $field.value) { return $null }
  return [string]$field.value
}

function Add-Text($graphics, $font, $brush, [string]$text, [float]$x, [float]$y, [float]$width, [float]$height = 70) {
  $value = if ([string]::IsNullOrWhiteSpace($text)) { "null · 확인 필요" } else { $text }
  $graphics.DrawString($value, $font, $brush, [System.Drawing.RectangleF]::new($x, $y, $width, $height))
}

function New-ReportBitmap([string]$path, [hashtable]$values, [string]$caseLabel, [bool]$poorQuality = $false, [string]$format = "jpeg") {
  $width = if ($poorQuality) { 620 } else { 1275 }
  $height = if ($poorQuality) { 820 } else { 1650 }
  $bitmap = [System.Drawing.Bitmap]::new($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::White)
  $ink = [System.Drawing.Brushes]::DarkSlateGray
  $muted = [System.Drawing.Brushes]::DimGray
  $line = [System.Drawing.Pen]::new([System.Drawing.Color]::LightGray, $(if ($poorQuality) { 1 } else { 2 }))
  $scale = if ($poorQuality) { 0.49 } else { 1.0 }
  $titleFont = [System.Drawing.Font]::new("Malgun Gothic", [float](28 * $scale), [System.Drawing.FontStyle]::Bold)
  $labelFont = [System.Drawing.Font]::new("Malgun Gothic", [float](17 * $scale), [System.Drawing.FontStyle]::Bold)
  $valueFont = [System.Drawing.Font]::new("Malgun Gothic", [float](17 * $scale))
  $smallFont = [System.Drawing.Font]::new("Malgun Gothic", [float](13 * $scale))
  $watermarkFont = [System.Drawing.Font]::new("Malgun Gothic", [float](38 * $scale), [System.Drawing.FontStyle]::Bold)

  $graphics.DrawRectangle($line, [float](55 * $scale), [float](55 * $scale), [float](1165 * $scale), [float](1540 * $scale))
  Add-Text $graphics $titleFont $ink "교육용 가상 위탁검사 결과지" (90 * $scale) (90 * $scale) (1050 * $scale) (70 * $scale)
  Add-Text $graphics $smallFont $muted "PathoScribe synthetic fixture · $caseLabel" (90 * $scale) (140 * $scale) (1050 * $scale) (50 * $scale)
  Add-Text $graphics $smallFont ([System.Drawing.Brushes]::Firebrick) $watermark (90 * $scale) (178 * $scale) (1050 * $scale) (50 * $scale)
  $graphics.DrawLine($line, (90 * $scale), (230 * $scale), (1180 * $scale), (230 * $scale))
  $rows = @(
    @("가상 의뢰번호", $values.order_number), @("검사기관명", $values.institution), @("검체", $values.specimen),
    @("검사명", $values.test_name), @("접수일", $values.received_date), @("보고일", $values.reported_date),
    @("수정 보고서 상태", $values.amendment_status), @("결과", $values.result), @("참고사항", $values.reference_note)
  )
  $y = 270 * $scale
  foreach ($row in $rows) {
    $graphics.DrawRectangle($line, (90 * $scale), $y, (1090 * $scale), (82 * $scale))
    Add-Text $graphics $labelFont $muted $row[0] (115 * $scale) ($y + (18 * $scale)) (250 * $scale) (48 * $scale)
    Add-Text $graphics $valueFont $ink $row[1] (390 * $scale) ($y + (18 * $scale)) (750 * $scale) (48 * $scale)
    $y += 92 * $scale
  }
  $graphics.DrawRectangle($line, (90 * $scale), (1190 * $scale), (1090 * $scale), (185 * $scale))
  Add-Text $graphics $smallFont $muted "원문 확인 안내" (115 * $scale) (1220 * $scale) (1000 * $scale) (45 * $scale)
  Add-Text $graphics $smallFont $muted "이 문서는 개인정보가 없는 교육용 합성자료입니다." (115 * $scale) (1270 * $scale) (1000 * $scale) (45 * $scale)
  Add-Text $graphics $smallFont $muted "진단·판독·처방 또는 결과 자동 확정에 사용할 수 없습니다." (115 * $scale) (1320 * $scale) (1000 * $scale) (45 * $scale)
  $graphics.TranslateTransform((150 * $scale), (1450 * $scale))
  $graphics.RotateTransform(-20)
  Add-Text $graphics $watermarkFont ([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(48, 63, 92, 140))) $watermark 0 0 (1000 * $scale) (75 * $scale)
  $graphics.ResetTransform()
  Add-Text $graphics $smallFont $muted "담당자 원문 대조 필요 · 자동 저장/확정 안 함" (90 * $scale) (1550 * $scale) (1050 * $scale) (45 * $scale)
  if ($poorQuality) {
    $veil = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(32, 90, 90, 90))
    for ($stripe = 0; $stripe -lt $height; $stripe += 32) { $graphics.FillRectangle($veil, 0, $stripe, $width, 8) }
    $veil.Dispose()
  }
  if ($format -eq "png") { $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png) } else { $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Jpeg) }
  $graphics.Dispose(); $bitmap.Dispose(); $line.Dispose(); $titleFont.Dispose(); $labelFont.Dispose(); $valueFont.Dispose(); $smallFont.Dispose(); $watermarkFont.Dispose()
}

function Write-JpegPdf([string]$jpegPath, [string]$pdfPath) {
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
    if ($obj -is [pscustomobject]) { $writer.Write([System.Text.Encoding]::ASCII.GetBytes($obj.Prefix)); $writer.Write($obj.Binary); $writer.Write([System.Text.Encoding]::ASCII.GetBytes($obj.Suffix)) }
    else { $writer.Write([System.Text.Encoding]::ASCII.GetBytes($obj)) }
  }
  $xrefOffset = $stream.Position
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes("xref`n0 $($objects.Count + 1)`n0000000000 65535 f `n"))
  for ($i = 1; $i -lt $offsets.Count; $i++) { $writer.Write([System.Text.Encoding]::ASCII.GetBytes(("{0:0000000000} 00000 n `n" -f $offsets[$i]))) }
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes("trailer`n<< /Size $($objects.Count + 1) /Root 1 0 R >>`nstartxref`n$xrefOffset`n%%EOF`n"))
  $writer.Flush(); [System.IO.File]::WriteAllBytes($pdfPath, $stream.ToArray()); $writer.Dispose(); $stream.Dispose()
}

function New-Fixture([string]$id, [string]$label, [string]$fileName, [string]$format, [string]$quality, [string]$caseId, [bool]$poorImage = $false, [bool]$revised = $false) {
  $case = $casesById[$caseId]
  if ($null -eq $case) { throw "평가사례를 찾을 수 없습니다: $caseId" }
  $values = [ordered]@{
    order_number = Get-FieldValue $case "order_number"
    institution = Get-FieldValue $case "institution"
    specimen = Get-FieldValue $case "specimen"
    test_name = Get-FieldValue $case "test_name"
    received_date = Get-FieldValue $case "received_date"
    reported_date = Get-FieldValue $case "reported_date"
    amendment_status = if ($revised) { "수정 보고서" } else { Get-FieldValue $case "amendment_status" }
    result = Get-FieldValue $case "result"
    reference_note = Get-FieldValue $case "reference_note"
  }
  $extractedValues = [ordered]@{} + $values
  if ($poorImage) {
    foreach ($key in @("order_number", "institution", "specimen", "test_name", "received_date", "reported_date", "amendment_status", "result")) { $extractedValues[$key] = $null }
    $extractedValues.reference_note = "촬영 상태가 좋지 않아 자동 추출하지 않음. 담당자 원문 확인 필요."
  }
  $baseName = [System.IO.Path]::GetFileNameWithoutExtension($fileName)
  if ($format -eq "pdf") {
    $jpg = Join-Path $env:TEMP ($baseName + ".jpg")
    New-ReportBitmap $jpg $values $label $false "jpeg"
    $pdfPath = Join-Path $pdfRoot $fileName
    Write-JpegPdf $jpg $pdfPath
    Copy-Item -LiteralPath $pdfPath -Destination (Join-Path $publicRoot $fileName) -Force
    Remove-Item -LiteralPath $jpg -Force
  } else {
    $imagePath = Join-Path $imageRoot $fileName
    New-ReportBitmap $imagePath $values $label $poorImage "png"
    Copy-Item -LiteralPath $imagePath -Destination (Join-Path $publicRoot $fileName) -Force
  }
  $reference = @{}
  foreach ($field in $case.groundTruth.referenceFields) { $reference[$field.key] = $field.value }
  [pscustomobject][ordered]@{
    id = $id; label = $label; file_name = $fileName; asset_path = "/fixtures/outsourced-test/$fileName"; format = $format; quality = $quality; watermark = $watermark
    evaluation_case_id = $caseId; source_row_id = $case.sourceRowId; source_type = "generated_demo"; template_version = $case.templateVersion
    extracted = [pscustomobject]$extractedValues; ground_truth_reference = [pscustomobject]$reference
  }
}

$fixtures = @(
  (New-Fixture "outsourced-match" "정상 일치 사례" "교육용_위탁검사_정상_일치.pdf" "pdf" "readable" "EVAL-OUT-001"),
  (New-Fixture "outsourced-id-mismatch" "검사번호 불일치 사례" "교육용_위탁검사_검사번호_불일치.pdf" "pdf" "readable" "EVAL-OUT-004"),
  (New-Fixture "outsourced-specimen-mismatch" "검체 불일치 사례" "교육용_위탁검사_검체_불일치.pdf" "pdf" "readable" "EVAL-OUT-006"),
  (New-Fixture "outsourced-test-mismatch" "검사명 불일치 사례" "교육용_위탁검사_검사명_불일치.pdf" "pdf" "readable" "EVAL-OUT-005"),
  (New-Fixture "outsourced-received-date-mismatch" "접수일 불일치 사례" "교육용_위탁검사_접수일_불일치.pdf" "pdf" "readable" "EVAL-OUT-007"),
  (New-Fixture "outsourced-report-date-missing" "보고일 누락 사례" "교육용_위탁검사_보고일_누락.pdf" "pdf" "readable" "EVAL-OUT-008"),
  (New-Fixture "outsourced-revised-report" "수정 보고서 사례" "교육용_위탁검사_수정_보고서.pdf" "pdf" "readable" "EVAL-OUT-003" $false $true),
  (New-Fixture "outsourced-result-mismatch" "결과 불일치 사례" "교육용_위탁검사_결과_불일치.pdf" "pdf" "readable" "EVAL-OUT-009"),
  (New-Fixture "outsourced-result-missing" "결과 누락 사례" "교육용_위탁검사_결과_누락.pdf" "pdf" "readable" "EVAL-OUT-010"),
  (New-Fixture "outsourced-image-poor" "촬영 상태 불량 이미지" "교육용_위탁검사_촬영불량.png" "image" "poor" "EVAL-OUT-002" $true)
)

$orders = foreach ($fixture in $fixtures) {
  $ref = $fixture.ground_truth_reference
  [pscustomobject][ordered]@{
    fixture_id = $fixture.id; order_id = $ref.order_number; institution = $ref.institution; test_name = $ref.test_name; specimen = $ref.specimen
    received_date = $ref.received_date; reported_date = $ref.reported_date; amendment_status = $ref.amendment_status; expected_result = $ref.result
    reference_note = "교육용 합성 의뢰정보. 실제 환자·기관 정보가 아님."; evaluation_case_id = $fixture.evaluation_case_id; source_row_id = $fixture.source_row_id
  }
}

$jsonEncoding = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($FixtureOutputPath), ($fixtures | ConvertTo-Json -Depth 8), $jsonEncoding)
[System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($OrderOutputPath), ($orders | ConvertTo-Json -Depth 8), $jsonEncoding)
Write-Output "교육용 위탁검사 fixture $($fixtures.Count)건(PDF $(@($fixtures | Where-Object format -eq 'pdf').Count)건, 이미지 $(@($fixtures | Where-Object format -eq 'image').Count)건)을 생성했습니다."

