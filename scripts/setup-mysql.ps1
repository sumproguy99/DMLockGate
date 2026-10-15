<#
.SYNOPSIS
  Creates the DM LockGuard MySQL database and application user, and writes the
  connection settings into backend\.env.

.DESCRIPTION
  - Generates a random 32-character password for the 'lockguard' MySQL user.
  - Prompts once for the MySQL admin password (typed into mysql.exe, never stored).
    The admin account defaults to root; pass -AdminUser <name> to use another account
    with CREATE USER and GRANT privileges.
  - Writes DB_* settings into backend\.env. The password is never printed.
  Safe to rerun: the database is created only if missing, and the user's password is rotated.

.EXAMPLE
  pwsh -File scripts\setup-mysql.ps1    (requires PowerShell 7)
#>
param(
    [string]$MySqlExe = 'C:\Program Files\MySQL\MySQL Server 9.7\bin\mysql.exe',
    [string]$AdminUser = 'root',
    [string]$Database = 'lockguard',
    [string]$AppUser  = 'lockguard',
    [string]$DbHost   = '127.0.0.1',
    [int]$Port        = 3306
)

$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '..\backend\.env' | Resolve-Path

if (-not (Test-Path $MySqlExe)) { throw "mysql.exe not found at $MySqlExe. Pass -MySqlExe <path>." }

# Random password from a cryptographic RNG, alphanumeric to avoid quoting problems in SQL and .env.
$chars = [char[]]'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
$bytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$password = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })

$sql = @"
CREATE DATABASE IF NOT EXISTS ``$Database`` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS '$AppUser'@'localhost' IDENTIFIED BY '$password';
CREATE USER IF NOT EXISTS '$AppUser'@'127.0.0.1' IDENTIFIED BY '$password';
ALTER USER '$AppUser'@'localhost' IDENTIFIED BY '$password';
ALTER USER '$AppUser'@'127.0.0.1' IDENTIFIED BY '$password';
GRANT ALL PRIVILEGES ON ``$Database``.* TO '$AppUser'@'localhost';
GRANT ALL PRIVILEGES ON ``$Database``.* TO '$AppUser'@'127.0.0.1';
FLUSH PRIVILEGES;
"@

Write-Host "Enter the MySQL password for '$AdminUser' when prompted."
$sql | & $MySqlExe -u $AdminUser -p -h $DbHost -P $Port
if ($LASTEXITCODE -ne 0) { throw "mysql.exe failed (exit $LASTEXITCODE). Nothing was written to .env." }

$settings = [ordered]@{
    DB_CONNECTION = 'mysql'
    DB_HOST       = $DbHost
    DB_PORT       = "$Port"
    DB_DATABASE   = $Database
    DB_USERNAME   = $AppUser
    DB_PASSWORD   = $password
}
$lines = Get-Content $envFile
foreach ($key in $settings.Keys) {
    $pattern = "^#?\s*$key="
    $newLine = "$key=$($settings[$key])"
    if ($lines -match $pattern) {
        $lines = $lines -replace "$pattern.*$", $newLine
    } else {
        $lines += $newLine
    }
}
Set-Content -Path $envFile -Value $lines -Encoding utf8NoBOM

Write-Host "Database '$Database' and user '$AppUser' are ready. Settings written to backend\.env (password not shown)."
