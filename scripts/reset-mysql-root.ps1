<#
.SYNOPSIS
  Resets the MySQL 'root'@'localhost' password for the local MySQL97 Windows service.

.DESCRIPTION
  Run from an ELEVATED PowerShell 7 window (Run as Administrator).

  1. Prompts twice for the new root password (hidden input, never printed or logged).
  2. Writes a one-time SQL init file readable only by Administrators and the service account.
  3. Backs up my.ini, temporarily adds init-file= under [mysqld], and restarts the service.
     (The Windows service accepts no extra command-line options, so my.ini is used.)
  4. Always restores my.ini byte-for-byte, deletes the init file, and restarts the service
     again, even if something fails.

  MySQL is unavailable for roughly 10-30 seconds during the two restarts. Other applications
  using this MySQL server will briefly lose their connection.

.EXAMPLE
  pwsh -File scripts\reset-mysql-root.ps1
#>
param(
    [string]$ServiceName = 'MySQL97',
    [string]$IniFile = 'C:\ProgramData\MySQL\MySQL Server 9.7\my.ini',
    [string]$InitFile = 'C:\ProgramData\MySQL\MySQL Server 9.7\lockguard-reset-root.sql'
)

$ErrorActionPreference = 'Stop'

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script from an elevated PowerShell window (Run as Administrator).'
}

$service = Get-CimInstance Win32_Service -Filter "Name='$ServiceName'"
if (-not $service) { throw "Service $ServiceName not found." }

$originalIni = [IO.File]::ReadAllBytes($IniFile)
$iniText = [Text.Encoding]::UTF8.GetString($originalIni)
if ($iniText -match '(?m)^\s*init[-_]file\s*=') { throw "my.ini already contains an init-file setting. Remove it manually before rerunning." }
if ($iniText -notmatch '(?m)^\[mysqld\]\s*$') { throw 'my.ini has no [mysqld] section.' }

$first = Read-Host 'New MySQL root password' -AsSecureString
$second = Read-Host 'Repeat new MySQL root password' -AsSecureString
$plain = [Net.NetworkCredential]::new('', $first).Password
if ($plain -ne [Net.NetworkCredential]::new('', $second).Password) { throw 'Passwords do not match. Nothing was changed.' }
if ($plain.Length -lt 12) { throw 'Use at least 12 characters. Nothing was changed.' }

# MySQL string literal escaping: backslash and single quote.
$escaped = $plain.Replace('\', '\\').Replace("'", "''")
$plain = $null

$backup = "$IniFile.lockguard-backup"
[IO.File]::WriteAllBytes($backup, $originalIni)

try {
    Set-Content -Path $InitFile -Value "ALTER USER IF EXISTS 'root'@'localhost' IDENTIFIED BY '$escaped';" -Encoding ascii -NoNewline
    $escaped = $null

    # Lock the init file down to Administrators and the service account.
    $acl = New-Object System.Security.AccessControl.FileSecurity
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($identity in @('BUILTIN\Administrators', $service.StartName)) {
        $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($identity, 'Read,Write,Delete', 'Allow'))
    }
    Set-Acl -Path $InitFile -AclObject $acl

    $iniPath = $InitFile.Replace('\', '/')
    $withInit = [regex]::Replace($iniText, '(?m)^\[mysqld\]\s*$', "[mysqld]`r`ninit-file=`"$iniPath`"", 1)
    [IO.File]::WriteAllText($IniFile, $withInit, [Text.UTF8Encoding]::new($false))

    Write-Host "Restarting $ServiceName with the one-time password reset..."
    Restart-Service -Name $ServiceName -Force
    (Get-Service $ServiceName).WaitForStatus('Running', [TimeSpan]::FromSeconds(60))
    Start-Sleep -Seconds 5
}
finally {
    Write-Host 'Restoring the original my.ini...'
    [IO.File]::WriteAllBytes($IniFile, $originalIni)
    if (Test-Path $InitFile) { Remove-Item $InitFile -Force }
    Restart-Service -Name $ServiceName -Force
    (Get-Service $ServiceName).WaitForStatus('Running', [TimeSpan]::FromSeconds(60))
    if ((Get-FileHash $IniFile).Hash -eq (Get-FileHash $backup).Hash) { Remove-Item $backup -Force }
    else { Write-Warning "my.ini differs from the backup at $backup. Compare them manually." }
}

Write-Host "Done. $ServiceName is running with its original configuration."
Write-Host "Test the new password with:  & 'C:\Program Files\MySQL\MySQL Server 9.7\bin\mysql.exe' -u root -p -e `"SELECT CURRENT_USER();`""
