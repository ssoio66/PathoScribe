param(
  [string]$ArchivePath = (Join-Path $PSScriptRoot "..\data\raw\ncc-lung-synthetic-20250107.zip"),
  [string]$OutputPath = (Join-Path $PSScriptRoot "..\data\evaluation\evaluation-cases.json")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

$archive = [System.IO.Path]::GetFullPath($ArchivePath)
$output = [System.IO.Path]::GetFullPath($OutputPath)
if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) {
  throw "원본 ZIP을 찾을 수 없습니다: $archive"
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("pathoscribe-evaluation-" + [guid]::NewGuid().ToString("N"))
$openXmlRoot = Join-Path $tempRoot "openxml"
[System.IO.Directory]::CreateDirectory($openXmlRoot) | Out-Null

try {
  $zip = [System.IO.Compression.ZipFile]::OpenRead($archive)
  try {
    $workbooks = @($zip.Entries | Where-Object { $_.FullName.EndsWith(".xlsx", [System.StringComparison]::OrdinalIgnoreCase) })
    if ($workbooks.Count -ne 1) {
      throw "ZIP에는 XLSX가 정확히 1개 있어야 합니다. 발견: $($workbooks.Count)"
    }
    $workbookEntry = $workbooks[0].FullName
    $workbookPath = Join-Path $tempRoot "source.xlsx"
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($workbooks[0], $workbookPath, $true)
  }
  finally {
    $zip.Dispose()
  }

  [System.IO.Compression.ZipFile]::ExtractToDirectory($workbookPath, $openXmlRoot)
  [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($output)) | Out-Null

  & node.exe (Join-Path $PSScriptRoot "generate-evaluation-cases.mjs") `
    --open-xml $openXmlRoot `
    --archive $archive `
    --workbook $workbookPath `
    --workbook-entry $workbookEntry `
    --output $output

  if ($LASTEXITCODE -ne 0) {
    throw "평가사례 생성에 실패했습니다. 종료 코드: $LASTEXITCODE"
  }
}
finally {
  $resolvedTemp = [System.IO.Path]::GetFullPath($tempRoot)
  $systemTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  if ($resolvedTemp.StartsWith($systemTemp, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTemp)) {
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
  }
}
