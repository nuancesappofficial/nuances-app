# fix-java-path.ps1
# Fix JAVA_HOME path issue

Write-Host "Fixing JAVA_HOME path..." -ForegroundColor Yellow

# Find correct JDK path
$possiblePaths = @(
    "C:\ProgramData\chocolatey\lib\openjdk11\tools\jdk-11.0.16+8",
    "C:\ProgramData\chocolatey\lib\openjdk11\tools\jdk-11",
    "C:\Program Files\OpenJDK\openjdk-11.0.16_8",
    "C:\Program Files\Java\jdk-11"
)

$javaHome = $null
foreach ($path in $possiblePaths) {
    if (Test-Path "$path\bin\java.exe") {
        $javaHome = $path
        Write-Host "Found JDK: $javaHome" -ForegroundColor Green
        break
    }
}

# If not found, search in chocolatey lib folder
if (!$javaHome) {
    Write-Host "Searching in chocolatey folder..." -ForegroundColor Yellow
    $chocoPaths = Get-ChildItem "C:\ProgramData\chocolatey\lib\openjdk11\tools" -Directory -ErrorAction SilentlyContinue
    foreach ($dir in $chocoPaths) {
        if (Test-Path "$($dir.FullName)\bin\java.exe") {
            $javaHome = $dir.FullName
            Write-Host "Found JDK: $javaHome" -ForegroundColor Green
            break
        }
    }
}

if ($javaHome) {
    # Set environment variables
    Write-Host "Setting JAVA_HOME: $javaHome" -ForegroundColor Yellow
    [System.Environment]::SetEnvironmentVariable('JAVA_HOME', $javaHome, 'User')
    $env:JAVA_HOME = $javaHome
    
    # Add to PATH
    $currentPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $javaPath = "$javaHome\bin"
    
    if ($currentPath -notlike "*$javaPath*") {
        Write-Host "Adding to PATH: $javaPath" -ForegroundColor Yellow
        [System.Environment]::SetEnvironmentVariable('Path', "$currentPath;$javaPath", 'User')
        $env:Path = "$env:Path;$javaPath"
    }
    
    Write-Host ""
    Write-Host "JAVA_HOME fixed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verifying..." -ForegroundColor Yellow
    & "$javaHome\bin\java.exe" -version
    
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Close and reopen PowerShell (Admin)" -ForegroundColor White
    Write-Host "2. Run: cd C:\Android\android-sdk\tools\bin" -ForegroundColor White
    Write-Host "3. Run: echo y | .\sdkmanager --licenses" -ForegroundColor White
    Write-Host "4. Run: .\sdkmanager 'platform-tools' 'platforms;android-34' 'build-tools;34.0.0' 'emulator' 'system-images;android-34;google_apis;x86_64'" -ForegroundColor White
    
} else {
    Write-Host "Could not find JDK installation" -ForegroundColor Red
    Write-Host "Trying to reinstall..." -ForegroundColor Yellow
    choco install openjdk11 -y --force
}
