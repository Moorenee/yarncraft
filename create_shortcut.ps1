# Create Desktop Shortcut for YarnCraft Companion Application
$WshShell = New-Object -ComObject WScript.Shell
$desktopPath = [System.Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath "YarnCraft Companion.lnk"

$appDir = $PSScriptRoot
$vbsPath = Join-Path $appDir "Launch_App.vbs"
$icoPath = Join-Path $appDir "icon.ico"

$shortcut = $WshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "`"$vbsPath`""
$shortcut.WorkingDirectory = $appDir
$shortcut.Description = "YarnCraft Companion - Crochet & Knitting Stash Tracker"

if (Test-Path $icoPath) {
    $shortcut.IconLocation = "$icoPath, 0"
} else {
    # Clean system icon fallback
    $shortcut.IconLocation = "shell32.dll, 43"
}

$shortcut.Save()
Write-Host "✅ Desktop shortcut created successfully on your Desktop: $shortcutPath" -ForegroundColor Green
