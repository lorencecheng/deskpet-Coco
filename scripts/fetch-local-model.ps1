# DeskPet Coco — 一键安装本地轻量 AI 模型（离线 · 免配置）
# ---------------------------------------------------------------
# 作用：下载 Qwen2.5-0.5B 量化模型 + llama.cpp（Windows CPU 版）到
#       %APPDATA%\DeskPet Coco\local-ai，之后在 App 里点
#       「🤖 用本地模型（离线·免配置）」即可一键启用，全程不需要 API Key。
#
# 用法（任选其一）：
#   1) 右键本文件 →「使用 PowerShell 运行」
#   2) 在 PowerShell 终端：  .\scripts\fetch-local-model.ps1
#
# 说明：
#   * 模型约 400MB，来自 hf-mirror.com（国内可直连的镜像源）。
#   * llama.cpp 为 MIT 开源，自动获取最新 Windows CPU 版。
#   * 只需下载一次；以后每次打开 App 都直接复用，无需再配。
$ErrorActionPreference = 'Stop'

$dest = Join-Path $env:APPDATA 'DeskPet Coco\local-ai'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Write-Host "安装目录：$dest"

# ---- 1) 下载模型 GGUF（约 400MB）----
$modelUrl = 'https://hf-mirror.com/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf'
$modelPath = Join-Path $dest 'qwen2.5-0.5b-instruct-q4_k_m.gguf'
if (-not (Test-Path $modelPath)) {
    Write-Host '下载模型（约400MB，首次较慢）...'
    curl.exe -L --retry 3 -o $modelPath $modelUrl
} else {
    Write-Host '模型已存在，跳过下载。'
}

# ---- 2) 获取并解压 llama.cpp（Windows CPU 版）----
Write-Host '获取 llama.cpp 最新 Windows CPU 版...'
$rel = Invoke-RestMethod 'https://api.github.com/repos/ggml-org/llama.cpp/releases/latest' `
        -Headers @{ 'User-Agent' = 'deskpet-coco' }
$asset = $rel.assets | Where-Object { $_.name -match 'bin-win-cpu-x64\.zip$' } | Select-Object -First 1
if (-not $asset) { throw '未找到 llama.cpp 的 Windows CPU 版压缩包，请稍后重试。' }
$zipPath = Join-Path $dest $asset.name
if (-not (Test-Path $zipPath)) {
    Write-Host "下载 llama.cpp：$($asset.name)"
    curl.exe -L --retry 3 -o $zipPath $asset.browser_download_url
} else {
    Write-Host 'llama.cpp 压缩包已存在，跳过下载。'
}
if (-not (Test-Path (Join-Path $dest 'llama-server.exe'))) {
    Push-Location $dest
    try { tar.exe -xf $zipPath } finally { Pop-Location }
}

# ---- 3) 校验 ----
$exe = Get-ChildItem -Path $dest -Recurse -Filter 'llama-server.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($exe -and (Test-Path $modelPath)) {
    Write-Host ''
    Write-Host '✅ 安装完成！'
    Write-Host "   模型：$modelPath"
    Write-Host "   服务：$($exe.FullName)"
    Write-Host ''
    Write-Host '接下来：重新打开 DeskPet Coco → 右键 →「🧠 AI 设置」→ 点「🤖 用本地模型（离线·免配置）」。'
    Write-Host '完全离线、免费、无需 API Key。'
} else {
    Write-Host ''
    Write-Host '⚠️  下载似乎不完整（模型或 llama-server.exe 缺失）。请检查网络后重新运行本脚本。'
}
