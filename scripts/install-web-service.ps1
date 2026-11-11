# Installs the LockGuard-Web Windows service: the built web app ('vite preview' on 127.0.0.1:4173),
# which Nginx Proxy Manager publishes as https://lockguard.dmfmedia.net.
# Same NSSM settings as the other LockGuard services (C:\ProgramData\LockGuard\install-services.ps1).
# Run as Administrator. After frontend changes run 'npm run build'; the service serves frontend\dist.
$ErrorActionPreference = 'Stop'

$nssm = 'C:\Program Files\nssm\nssm.exe'
$node = 'C:\Program Files\nodejs\node.exe'
$frontend = 'D:\aiprod\00-Eufy\frontend'
$logs = 'C:\ProgramData\LockGuard\logs'
$name = 'LockGuard-Web'
New-Item -ItemType Directory -Force $logs | Out-Null
if (-not (Test-Path "$frontend\dist\index.html")) { throw 'frontend\dist is missing: run npm run build first.' }

if (Get-Service $name -ErrorAction SilentlyContinue) {
    & $nssm stop $name | Out-Null
    & $nssm remove $name confirm | Out-Null
}
& $nssm install $name $node 'node_modules/vite/bin/vite.js preview' | Out-Null
& $nssm set $name DisplayName 'LockGuard Web (port 4173)' | Out-Null
& $nssm set $name Description 'DM LockGuard component (managed by NSSM).' | Out-Null
& $nssm set $name AppDirectory $frontend | Out-Null
& $nssm set $name Start SERVICE_AUTO_START | Out-Null
& $nssm set $name AppStdout (Join-Path $logs "$name.log") | Out-Null
& $nssm set $name AppStderr (Join-Path $logs "$name.log") | Out-Null
& $nssm set $name AppRotateFiles 1 | Out-Null
& $nssm set $name AppRotateOnline 0 | Out-Null
& $nssm set $name AppRotateBytes 10485760 | Out-Null
& $nssm set $name AppKillProcessTree 0 | Out-Null
& $nssm set $name AppExit Default Exit | Out-Null
sc.exe failure $name reset= 86400 actions= restart/5000/restart/5000/restart/30000 | Out-Null
sc.exe failureflag $name 1 | Out-Null

# Free port 4173 from a hand-started 'npm run preview' window, then start the service.
Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -match 'vite(\.js)?"?\s+preview|npm run preview' -and $_.ProcessId -ne $PID } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1
& $nssm start $name | Out-Null
Write-Output "installed $name"
