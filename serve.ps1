# 開発用の簡易HTTPサーバー（ES Modules は file:// では動かないため）
# 使い方: powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8080]
param([int]$Port = 8080)
$root = [IO.Path]::GetFullPath($PSScriptRoot)
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json'; '.png' = 'image/png'; '.svg' = 'image/svg+xml'; '.webmanifest' = 'application/manifest+json'
  '.glb' = 'model/gltf-binary'
}
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Serving $root at http://localhost:$Port/"
while ($l.IsListening) {
  $ctx = $l.GetContext()
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
  if ($path -eq '/') { $path = '/index.html' }
  $file = [IO.Path]::GetFullPath((Join-Path $root ($path.TrimStart('/') -replace '/', '\')))
  $modelsDir = [IO.Path]::GetFullPath((Join-Path $root 'assets\models'))
  if ($ctx.Request.HttpMethod -eq 'PUT') {
    # Only for tools/optimize-model.html to write the converted model (assets/models only)
    if ($file.StartsWith($modelsDir)) {
      $ms = New-Object IO.MemoryStream
      $ctx.Request.InputStream.CopyTo($ms)
      [IO.File]::WriteAllBytes($file, $ms.ToArray())
      $ctx.Response.StatusCode = 201
    } else {
      $ctx.Response.StatusCode = 403
    }
  } elseif ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
    $bytes = [IO.File]::ReadAllBytes($file)
    $type = $mime[[IO.Path]::GetExtension($file)]
    if (-not $type) { $type = 'application/octet-stream' }
    $ctx.Response.ContentType = $type
    $ctx.Response.Headers.Add('Cache-Control', 'no-store')
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
  }
  $ctx.Response.Close()
}
