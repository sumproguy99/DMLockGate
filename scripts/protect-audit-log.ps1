<#
.SYNOPSIS
  Adds the append-only triggers to the DM LockGuard audit_logs table.

.DESCRIPTION
  With MySQL binary logging enabled, only privileged accounts can create triggers, and the
  LockGuard application user is deliberately unprivileged. Run this once as the MySQL
  administrator after `php artisan migrate` has created audit_logs.

  The triggers make MySQL reject every UPDATE and DELETE on audit_logs. Safe to rerun.
  Verify afterwards with:  php artisan lockguard:audit-verify

.EXAMPLE
  pwsh -File scripts\protect-audit-log.ps1
#>
param(
    [string]$MySqlExe = 'C:\Program Files\MySQL\MySQL Server 9.7\bin\mysql.exe',
    [string]$AdminUser = 'root',
    [string]$Database = 'lockguard',
    [string]$DbHost = '127.0.0.1',
    [int]$Port = 3306
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $MySqlExe)) { throw "mysql.exe not found at $MySqlExe. Pass -MySqlExe <path>." }

$sql = @"
USE ``$Database``;
CREATE TRIGGER IF NOT EXISTS audit_logs_no_update BEFORE UPDATE ON audit_logs FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only';
CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete BEFORE DELETE ON audit_logs FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only';
SELECT TRIGGER_NAME, EVENT_MANIPULATION FROM information_schema.TRIGGERS
  WHERE TRIGGER_SCHEMA = '$Database' AND EVENT_OBJECT_TABLE = 'audit_logs';
"@

Write-Host "Enter the MySQL password for '$AdminUser' when prompted."
$sql | & $MySqlExe -u $AdminUser -p -h $DbHost -P $Port --table
if ($LASTEXITCODE -ne 0) { throw "mysql.exe failed (exit $LASTEXITCODE). Triggers were not created." }

Write-Host 'audit_logs is now protected against UPDATE and DELETE.'
