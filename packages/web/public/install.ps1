# Installs tgg, the textures.gg command line, from its GitHub releases:
#
#   irm https://textures.gg/install.ps1 | iex
#
# It downloads the Windows archive, checks it against the release's
# SHA256SUMS, puts tgg.exe in %LOCALAPPDATA%\Programs\tgg, and adds that
# folder to your PATH. $env:TGG_VERSION picks a version (default: the
# latest); $env:TGG_INSTALL_DIR picks the folder.
#
# Source: https://github.com/texturesgg/site/blob/main/packages/web/public/install.ps1

# One script block, run on the last line, so a download cut off partway runs
# nothing.
& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'

  $version = $env:TGG_VERSION
  if (-not $version) {
    $version = (Invoke-RestMethod 'https://assets.textures.gg/cli/latest.json').version
  }
  $platform = 'x86_64-pc-windows-msvc'
  $name = "tgg-$version-$platform"
  $base = "https://github.com/texturesgg/texturesgg/releases/download/cli-v$version"

  $tmp = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid())
  New-Item -ItemType Directory $tmp | Out-Null
  try {
    Write-Host "Downloading tgg $version for $platform"
    $zip = Join-Path $tmp "$name.zip"
    Invoke-WebRequest "$base/$name.zip" -OutFile $zip
    # Release files come as application/octet-stream, which Invoke-WebRequest
    # hands back as bytes, so the sums go through a file to read as text.
    $sums = Join-Path $tmp 'SHA256SUMS'
    Invoke-WebRequest "$base/SHA256SUMS" -OutFile $sums

    $expected = $null
    foreach ($line in (Get-Content $sums)) {
      $fields = $line.Trim() -split '\s+'
      if ($fields.Count -eq 2 -and $fields[1] -eq "$name.zip") { $expected = $fields[0] }
    }
    if (-not $expected) { throw "SHA256SUMS doesn't list $name.zip" }
    $actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
    if ($actual -ne $expected.ToLower()) {
      throw "$name.zip doesn't match its checksum; nothing was installed"
    }

    Expand-Archive $zip -DestinationPath $tmp
    $dir = $env:TGG_INSTALL_DIR
    if (-not $dir) { $dir = Join-Path $env:LOCALAPPDATA 'Programs\tgg' }
    New-Item -ItemType Directory -Force $dir | Out-Null
    Copy-Item (Join-Path $tmp "$name\tgg.exe") (Join-Path $dir 'tgg.exe') -Force
    Write-Host "Installed tgg $version to $dir\tgg.exe"

    $path = [string][Environment]::GetEnvironmentVariable('Path', 'User')
    if (-not (($path -split ';') -contains $dir)) {
      [Environment]::SetEnvironmentVariable('Path', "$($path.TrimEnd(';'));$dir".TrimStart(';'), 'User')
      Write-Host "Added $dir to your PATH. Open a new terminal, then run tgg login."
    } else {
      Write-Host 'Run tgg login to sign in.'
    }
  } finally {
    Remove-Item -Recurse -Force $tmp
  }
}
