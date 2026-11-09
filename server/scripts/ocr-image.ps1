param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$Language = ''
)

# 使用 Windows 内置 OCR 引擎（Windows.Media.Ocr）识别图片文字。
# 不依赖任何第三方组件，离线可用。
# 输出：JSON { language, width, height, lines: [{ text, x, y, w, h }] }

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and
        $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]

function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}

[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime] | Out-Null

$resolved = (Resolve-Path -LiteralPath $Path).ProviderPath

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($resolved)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

$engine = $null
if ($Language) {
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language $Language))
}
if (-not $engine) {
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
}
if (-not $engine) {
    foreach ($tag in 'zh-Hans-CN', 'zh-CN', 'en-US') {
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language $tag))
        if ($engine) { break }
    }
}
if (-not $engine) { throw 'No OCR engine available.' }

$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

$lines = @()
foreach ($line in $result.Lines) {
    $xs = @($line.Words | ForEach-Object { $_.BoundingRect.X })
    $ys = @($line.Words | ForEach-Object { $_.BoundingRect.Y })
    $ws = @($line.Words | ForEach-Object { $_.BoundingRect.Width })
    $hs = @($line.Words | ForEach-Object { $_.BoundingRect.Height })

    # 中文 OCR 常在字与字之间插空格（"传 智 杯"），这里做一次清洗，
    # 只删除两个汉字之间的空白，保留英文单词间的正常空格。
    $clean = $line.Text -replace '(?<=[\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])', ''

    $lines += [pscustomobject]@{
        text = $clean
        x    = [int](($xs | Measure-Object -Minimum).Minimum)
        y    = [int](($ys | Measure-Object -Minimum).Minimum)
        w    = [int](($ws | Measure-Object -Sum).Sum)
        h    = [int](($hs | Measure-Object -Maximum).Maximum)
    }
}

[pscustomobject]@{
    language = $engine.RecognizerLanguage.LanguageTag
    width    = $decoder.PixelWidth
    height   = $decoder.PixelHeight
    lines    = $lines
} | ConvertTo-Json -Depth 5 -Compress