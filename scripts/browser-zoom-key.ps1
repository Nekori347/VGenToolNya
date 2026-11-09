param([ValidateSet('reset','plus','minus')][string]$Action)
$taskRoot = 'F:\[2]Ai\VGenToolNya'
$taskBrowser = Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($taskRoot, [StringComparison]::OrdinalIgnoreCase) -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $taskBrowser) { throw 'Project browser window unavailable' }
$env:TEMP = Join-Path $taskRoot '.cache\keyboard-compile'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NyaKeyboard {
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
}
'@
[NyaKeyboard]::SetForegroundWindow($taskBrowser.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 200
if ([NyaKeyboard]::GetForegroundWindow() -ne $taskBrowser.MainWindowHandle) { throw 'Project browser activation failed' }
$taskKey = @{reset=0x30;plus=0xBB;minus=0xBD}[$Action]
[NyaKeyboard]::keybd_event(0x11,0,0,[UIntPtr]::Zero)
[NyaKeyboard]::keybd_event($taskKey,0,0,[UIntPtr]::Zero)
[NyaKeyboard]::keybd_event($taskKey,0,2,[UIntPtr]::Zero)
[NyaKeyboard]::keybd_event(0x11,0,2,[UIntPtr]::Zero)
