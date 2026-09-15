# Run interactively. Never pass an API key as an argument or save it in this file.
$ErrorActionPreference = 'Stop'
$taskExitCode = 1
$taskSecureKey = $null
$taskKeyPointer = [IntPtr]::Zero
$taskPreviousKey = [Environment]::GetEnvironmentVariable('GROQ_API_KEY', 'Process')

try {
    $taskNode = (Get-Command node -CommandType Application -ErrorAction Stop).Source
    $taskImageInput = (Read-Host 'Caminho completo de uma foto de alimentos (JPEG, PNG ou WebP)').Trim().Trim('"')
    if ([string]::IsNullOrWhiteSpace($taskImageInput)) {
        throw 'Nenhuma foto selecionada.'
    }
    $taskImage = Get-Item -LiteralPath $taskImageInput -ErrorAction Stop
    if ($taskImage.PSIsContainer -or $taskImage.Length -le 0 -or $taskImage.Length -gt 5MB) {
        throw 'Escolha um arquivo nao vazio de ate 5 MiB.'
    }

    Write-Host 'O arquivo ORIGINAL, inclusive possiveis metadados, sera enviado ao Groq.'
    Write-Host 'Escolha uma foto sem pessoas ou documentos. Uma chamada pode consumir sua cota mesmo se falhar.'
    Write-Host 'O teste nao grava foto, chave ou resultado em arquivo nem no banco de dados.'
    $taskConsent = Read-Host 'Digite ENVIAR para autorizar uma unica chamada (qualquer outra resposta cancela)'
    if ($taskConsent -cne 'ENVIAR') {
        Write-Host 'Cancelado. Nenhuma chamada realizada.'
        $taskExitCode = 0
    } else {
        $taskSecureKey = Read-Host 'Cole a chave de TESTE do Groq (entrada oculta; nao cole na conversa)' -AsSecureString
        if ($taskSecureKey.Length -eq 0) {
            throw 'Chave vazia. Nenhuma chamada realizada.'
        }
        # Node needs plaintext in its process environment; never put it in argv.
        $taskKeyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecureKey)
        [Environment]::SetEnvironmentVariable('GROQ_API_KEY', [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskKeyPointer), 'Process')
        & $taskNode (Join-Path $PSScriptRoot 'groq-vision-smoke.mjs') $taskImage.FullName '--send-original'
        $taskExitCode = $LASTEXITCODE
    }
} catch {
    # Do not echo exception contents: they can contain local paths or secrets.
    Write-Host 'Nao foi possivel concluir. Confira Node instalado, caminho da foto e tamanho (ate 5 MiB).'
    $taskExitCode = 1
} finally {
    [Environment]::SetEnvironmentVariable('GROQ_API_KEY', $taskPreviousKey, 'Process')
    if ($taskKeyPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskKeyPointer)
    }
    if ($null -ne $taskSecureKey) { $taskSecureKey.Dispose() }
    $taskPreviousKey = $null
}

exit $taskExitCode
