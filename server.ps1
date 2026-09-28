# ==============================================================================
# 编织手作日记 (Craft & Yarn Companion) - Local Zero-Dependency Web Server
# Powered by Windows native PowerShell [System.Net.HttpListener]
# ==============================================================================

$port = 8080
$path = $PSScriptRoot

# Retrieve local Wi-Fi / LAN IP addresses
$localIPs = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | 
            Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | 
            Select-Object -ExpandProperty IPAddress

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Prefixes.Add("http://127.0.0.1:$port/")

try {
    $listener.Start()
} catch {
    # If 8080 is in use, try 8081
    $port = 8081
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$port/")
    $listener.Prefixes.Add("http://127.0.0.1:$port/")
    $listener.Start()
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "       编织手作日记 (YarnCraft Companion) 正在运行        " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "电脑本地访问地址: http://localhost:$port" -ForegroundColor Cyan

if ($localIPs) {
    Write-Host "`n📱 如果想用手机拍照记录毛线与项目，手机连同一 Wi-Fi 打开:" -ForegroundColor Yellow
    foreach ($ip in $localIPs) {
        Write-Host "   👉 http://$($ip):$port" -ForegroundColor Green
    }
}
Write-Host "`n按 Ctrl+C 可停止本地服务。" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Green

# Automatically launch as a standalone desktop application window
$appUrl = "http://localhost:$port"
$edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"

if (Test-Path $edgePath) {
    Start-Process $edgePath -ArgumentList "--app=$appUrl", "--window-size=1240,860"
} elseif (Test-Path $chromePath) {
    Start-Process $chromePath -ArgumentList "--app=$appUrl", "--window-size=1240,860"
} else {
    Start-Process $appUrl
}

# MIME Types Map
$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".webp" = "image/webp"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $reqPath = $request.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($reqPath) -or $reqPath -eq "/") {
            $reqPath = "index.html"
        }

        $filePath = Join-Path $path $reqPath

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = $mimeTypes[$ext]
            if (-not $mime) { $mime = "application/octet-stream" }

            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentType = $mime
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("File not found")
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }
        $response.Close()
    } catch {
        # Listener closed or aborted
    }
}
