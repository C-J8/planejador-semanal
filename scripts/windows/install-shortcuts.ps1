$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutShell = New-Object -ComObject WScript.Shell
$shortcutIcons = @{
    'Abrir Planner' = 'planner-open.ico'
    'Parar Planner' = 'planner-stop.ico'
}
foreach ($shortcutName in @('Abrir Planner', 'Parar Planner')) {
    $shortcutPath = Join-Path $desktopPath "$shortcutName.lnk"
    $targetPath = Join-Path $projectRoot "$shortcutName.cmd"
    $iconPath = Join-Path $projectRoot "assets/shortcuts/$($shortcutIcons[$shortcutName])"
    if (!(Test-Path -LiteralPath $targetPath) -or !(Test-Path -LiteralPath $iconPath)) {
        throw "Arquivo ou icone ausente para $shortcutName. Reinstale os arquivos do projeto."
    }
    if (Test-Path -LiteralPath $shortcutPath) {
        $existing = $shortcutShell.CreateShortcut($shortcutPath)
        if ($existing.TargetPath -ne $targetPath) {
            throw "O atalho $shortcutName ja existe e pertence a outro destino. Nenhum atalho alheio sera substituido."
        }
    }
}
foreach ($shortcutName in @('Abrir Planner', 'Parar Planner')) {
    $shortcut = $shortcutShell.CreateShortcut((Join-Path $desktopPath "$shortcutName.lnk"))
    $shortcut.TargetPath = Join-Path $projectRoot "$shortcutName.cmd"
    $shortcut.WorkingDirectory = $projectRoot
    $shortcut.Description = "$shortcutName - projeto local"
    $shortcut.IconLocation = "$(Join-Path $projectRoot "assets/shortcuts/$($shortcutIcons[$shortcutName])"),0"
    $shortcut.Save()
}
# Retire only shortcuts that point to the exact old launchers of this project.
# Keep the .lnk files locally rather than permanently deleting them.
$archivePath = [IO.Path]::GetFullPath((Join-Path $projectRoot ".planner/retired-shortcuts/$([Guid]::NewGuid().ToString('N'))"))
if (!$archivePath.StartsWith(($projectRoot.TrimEnd('\') + '\.planner\'), [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Destino de arquivamento invalido.'
}
foreach ($shortcutName in @('Atualizar Planner', 'Desenvolver Planner', 'Backup Planner')) {
    $shortcutPath = [IO.Path]::GetFullPath((Join-Path $desktopPath "$shortcutName.lnk"))
    if ((Split-Path $shortcutPath -Parent) -ne [IO.Path]::GetFullPath($desktopPath)) { throw 'Origem invalida.' }
    if (!(Test-Path -LiteralPath $shortcutPath)) { continue }
    $existing = $shortcutShell.CreateShortcut($shortcutPath)
    if ($existing.TargetPath -ne (Join-Path $projectRoot "$shortcutName.cmd")) {
        Write-Warning "Preservado: $shortcutName aponta para outro destino."
        continue
    }
    New-Item -ItemType Directory -Path $archivePath -Force | Out-Null
    Move-Item -LiteralPath $shortcutPath -Destination (Join-Path $archivePath "$shortcutName.lnk")
}
Write-Host 'Abrir Planner e Parar Planner instalados com icones. Atalhos antigos deste projeto arquivados.'
