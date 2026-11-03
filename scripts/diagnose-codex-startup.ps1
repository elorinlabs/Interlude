param([int]$Hours = 24)
$ErrorActionPreference = 'Stop'
# Read-only snapshot. Never collect command lines, auth files, or conversation content.
$packages = @(Get-AppxPackage '*Codex*' | Select-Object Name, Version, Status, InstallLocation, PackageFamilyName, PackageFullName)
$processes = @(Get-Process ChatGPT -ErrorAction SilentlyContinue | ForEach-Object {
    [pscustomobject]@{ Id = $_.Id; Path = $_.Path; StartedAt = $_.StartTime;
        HasWindow = ($_.MainWindowHandle -ne 0); Responding = $_.Responding }
})
$events = @(Get-WinEvent -FilterHashtable @{
    LogName = 'Microsoft-Windows-AppModel-Runtime/Admin'; StartTime = (Get-Date).AddHours(-$Hours)
} -ErrorAction SilentlyContinue | Where-Object Message -Match 'OpenAI.Codex' |
    Select-Object -First 40 TimeCreated, Id, LevelDisplayName)
$package = Get-AppxPackage '*Codex*' | Sort-Object Version -Descending | Select-Object -First 1
$logRoot = if ($package.PackageFamilyName) {
    Join-Path $env:LOCALAPPDATA ("Packages/{0}/LocalCache/Local/Codex/Logs" -f $package.PackageFamilyName)
}
$logs = @(Get-ChildItem -LiteralPath $logRoot -Recurse -File -Filter '*.log' -ErrorAction SilentlyContinue |
    Where-Object LastWriteTime -GT (Get-Date).AddHours(-$Hours) |
    Sort-Object LastWriteTime -Descending | Select-Object -First 30 | ForEach-Object {
        $content = Get-Content -LiteralPath $_.FullName -Raw
        [pscustomobject]@{ File = $_.Name; Modified = $_.LastWriteTime;
            LaunchRecorded = $content.Contains('Launching app');
            ServerStarted = $content.Contains('Starting app-server connection');
            Bytes = $_.Length }
    })
[pscustomobject]@{ CapturedAt = Get-Date; Packages = $packages; Processes = $processes;
    ActivationEvents = $events; StartupLogs = $logs } | ConvertTo-Json -Depth 5
