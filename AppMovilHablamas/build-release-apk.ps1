param(
    [string]$Project = "AppMovilHablamas/AppMovilHablamas/AppMovilHablamas.csproj"
)

$ErrorActionPreference = "Stop"

dotnet publish $Project -f net10.0-android -c Release

Write-Host ""
Write-Host "APK generado en:"
Get-ChildItem "AppMovilHablamas/AppMovilHablamas/bin/Release/net10.0-android" -Filter "*.apk" -Recurse |
    Select-Object -ExpandProperty FullName
