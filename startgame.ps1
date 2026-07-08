#Requires -Version 5.1
<#
.SYNOPSIS
    TrueNeverStory — Smart Auto-detecting Game Server Launcher (Windows)
.DESCRIPTION
    Detects LLM providers, adapts config, handles fallbacks.
    Supports: Ollama, LM Studio, vLLM, OpenAI, llama.cpp
.PARAMETER Local
    CORS=localhost only (safe for dev)
.PARAMETER Remote
    CORS=* (default, allows external access)
.EXAMPLE
    .\startgame.ps1
    .\startgame.ps1 -Local
#>

param(
    [switch]$Local,
    [switch]$Remote,
    [switch]$Help
)

if ($Help) {
    Write-Host "Usage: .\startgame.ps1 [-Local|-Remote]"
    Write-Host "  -Local    CORS=localhost only (safe for dev)"
    Write-Host "  -Remote   CORS=* (default, allows external access)"
    exit 0
}

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# ── Colors ────────────────────────────────────────────────────
function Write-Colored {
    param([string]$Text, [string]$Color = "White")
    Write-Host $Text -ForegroundColor $Color
}

# ── Parse flags ────────────────────────────────────────────────
$CORS_MODE = "remote"
if ($Local) { $CORS_MODE = "local" }
if ($Remote) { $CORS_MODE = "remote" }

if ($CORS_MODE -eq "local") {
    $env:TNS_CORS_ORIGIN = "http://localhost:8000"
} else {
    $env:TNS_CORS_ORIGIN = "*"
}

# Auto-create .env from example if missing
if (!(Test-Path ".env") -and (Test-Path ".env.example")) {
    Copy-Item ".env.example" ".env"
    Write-Colored "Created .env from .env.example" "Cyan"
}

# ═══════════════════════════════════════════════════════════════
#  §1  HARDWARE DETECTION
# ═══════════════════════════════════════════════════════════════

$CPU_CORES = (Get-CimInstance Win32_Processor).NumberOfCores
$RAM_BYTES = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
$RAM_GB = [math]::Floor($RAM_BYTES / 1GB)

$GPU_TYPE = "none"
$GPU_NAME = ""
$GPU_VRAM_MB = 0

try {
    $nvidiaSmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
    if ($nvidiaSmi) {
        $gpuInfo = & nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>$null
        if ($gpuInfo) {
            $parts = ($gpuInfo | Select-Object -First 1) -split ","
            $GPU_NAME = $parts[0].Trim()
            $GPU_VRAM_MB = [int]$parts[1].Trim()
            $GPU_TYPE = "nvidia"
        }
    }
} catch {}

if ($CPU_CORES -le 4) {
    $LLM_THREADS = [math]::Max($CPU_CORES - 1, 1)
    $LLM_PARALLEL = 1
} elseif ($CPU_CORES -le 8) {
    $LLM_THREADS = $CPU_CORES - 2
    $LLM_PARALLEL = 2
} else {
    $LLM_THREADS = 6
    $LLM_PARALLEL = 3
}

if ($RAM_GB -le 4) { $LLM_CTX = 4096 }
elseif ($RAM_GB -le 8) { $LLM_CTX = 8192 }
elseif ($RAM_GB -le 16) { $LLM_CTX = 16384 }
else { $LLM_CTX = 32768 }

if ($GPU_VRAM_MB -gt 8000) { $LLM_CTX = 32768 }
elseif ($GPU_VRAM_MB -gt 4000) { $LLM_CTX = 16384 }

# ═══════════════════════════════════════════════════════════════
#  §2  PROVIDER DETECTION
# ═══════════════════════════════════════════════════════════════

$BEST_PROVIDER = ""
$BEST_PROVIDER_URL = ""
$BEST_PROVIDER_MODEL = ""
$BEST_PROVIDER_EMBED = ""
$BEST_PROVIDER_NAME = ""
$BEST_PROVIDER_TYPE = ""

function Detect-Ollama {
    try {
        $resp = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -TimeoutSec 2 -ErrorAction Stop
        $models = $resp.models
        if ($models -and $models.Count -gt 0) {
            $chatModel = ""
            $embedModel = ""
            foreach ($m in $models) {
                $name = $m.name
                if ($name -match "embed|Embed") {
                    if (-not $embedModel) { $embedModel = $name }
                } elseif ($name -match ":latest$" -or -not $chatModel) {
                    $chatModel = $name
                }
            }
            if ($chatModel) {
                $script:BEST_PROVIDER = "ollama"
                $script:BEST_PROVIDER_URL = "http://localhost:11434/v1"
                $script:BEST_PROVIDER_MODEL = $chatModel
                $script:BEST_PROVIDER_EMBED = $embedModel
                $script:BEST_PROVIDER_NAME = "Ollama"
                $script:BEST_PROVIDER_TYPE = "openai"
                Write-Colored "  Found Ollama with model: $chatModel" "Green"
                return $true
            }
        }
    } catch {}
    return $false
}

function Detect-LMStudio {
    try {
        $resp = Invoke-RestMethod -Uri "http://localhost:1234/v1/models" -Method Get -TimeoutSec 2 -ErrorAction Stop
        if ($resp.data -and $resp.data.Count -gt 0) {
            $model = $resp.data[0].id
            if ($model) {
                $script:BEST_PROVIDER = "lmstudio"
                $script:BEST_PROVIDER_URL = "http://localhost:1234/v1"
                $script:BEST_PROVIDER_MODEL = $model
                $script:BEST_PROVIDER_EMBED = $model
                $script:BEST_PROVIDER_NAME = "LM Studio"
                $script:BEST_PROVIDER_TYPE = "openai"
                Write-Colored "  Found LM Studio with model: $model" "Green"
                return $true
            }
        }
    } catch {}
    return $false
}

function Detect-vLLM {
    try {
        $resp = Invoke-RestMethod -Uri "http://localhost:8080/v1/models" -Method Get -TimeoutSec 2 -ErrorAction Stop
        if ($resp.data -and $resp.data.Count -gt 0) {
            $model = $resp.data[0].id
            if ($model) {
                $script:BEST_PROVIDER = "vllm"
                $script:BEST_PROVIDER_URL = "http://localhost:8080/v1"
                $script:BEST_PROVIDER_MODEL = $model
                $script:BEST_PROVIDER_NAME = "vLLM"
                $script:BEST_PROVIDER_TYPE = "openai"
                Write-Colored "  Found vLLM with model: $model" "Green"
                return $true
            }
        }
    } catch {}
    return $false
}

function Detect-OpenAI {
    if ($env:OPENAI_API_KEY) {
        $script:BEST_PROVIDER = "openai"
        $script:BEST_PROVIDER_URL = "https://api.openai.com/v1"
        $script:BEST_PROVIDER_MODEL = "gpt-4o"
        $script:BEST_PROVIDER_NAME = "OpenAI"
        $script:BEST_PROVIDER_TYPE = "openai"
        Write-Colored "  Found OpenAI API key" "Green"
        return $true
    }
    return $false
}

# Run detection
$detected = Detect-Ollama
if (-not $detected) { $detected = Detect-LMStudio }
if (-not $detected) { $detected = Detect-vLLM }
if (-not $detected) { $detected = Detect-OpenAI }

# ═══════════════════════════════════════════════════════════════
#  §3  ENV HELPERS
# ═══════════════════════════════════════════════════════════════

function Get-EnvKey {
    param([string]$Key, [string]$Default = "")
    if (Test-Path ".env") {
        $line = Get-Content ".env" | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
        if ($line) { return ($line -split "=", 2)[1] }
    }
    return $Default
}

function Set-EnvKey {
    param([string]$Key, [string]$Value)
    $file = ".env"
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        if ($content -match "(?m)^$Key=") {
            $content = $content -replace "(?m)^$Key=.*", "$Key=$Value"
            Set-Content $file $content -NoNewline
        } else {
            Add-Content $file "`n$Key=$Value"
        }
    } else {
        Set-Content $file "$Key=$Value"
    }
}

# ═══════════════════════════════════════════════════════════════
#  §4  AUTO-CONFIGURE .env
# ═══════════════════════════════════════════════════════════════

if ($env:TNS_NO_AUTOCONFIG -eq "1") {
    Write-Colored "  Auto-configure disabled (TNS_NO_AUTOCONFIG=1)" "DarkGray"
} elseif ($BEST_PROVIDER) {
    Write-Colored "  Configuring for: $BEST_PROVIDER_NAME" "Cyan"

    switch ($BEST_PROVIDER) {
        "ollama" {
            Set-EnvKey "WORLD_LLM_BASE_URL" $BEST_PROVIDER_URL
            Set-EnvKey "WORLD_LLM_API_KEY" "ollama"
            Set-EnvKey "WORLD_LLM_MODEL" $BEST_PROVIDER_MODEL
            if ($BEST_PROVIDER_EMBED) {
                Set-EnvKey "WORLD_EMBEDDING_MODEL" $BEST_PROVIDER_EMBED
                Set-EnvKey "WORLD_EMBEDDING_BASE_URL" "http://localhost:11434/v1"
                Set-EnvKey "WORLD_EMBEDDING_API_KEY" "ollama"
            }
        }
        "lmstudio" {
            Set-EnvKey "WORLD_LLM_BASE_URL" $BEST_PROVIDER_URL
            Set-EnvKey "WORLD_LLM_API_KEY" "lm-studio"
            Set-EnvKey "WORLD_LLM_MODEL" $BEST_PROVIDER_MODEL
        }
        "vllm" {
            Set-EnvKey "WORLD_LLM_BASE_URL" $BEST_PROVIDER_URL
            Set-EnvKey "WORLD_LLM_API_KEY" "vllm"
            Set-EnvKey "WORLD_LLM_MODEL" $BEST_PROVIDER_MODEL
        }
        "openai" {
            Set-EnvKey "WORLD_LLM_BASE_URL" "https://api.openai.com/v1"
            Set-EnvKey "WORLD_LLM_API_KEY" $env:OPENAI_API_KEY
            Set-EnvKey "WORLD_LLM_MODEL" "gpt-4o"
            Set-EnvKey "WORLD_EMBEDDING_MODEL" "text-embedding-3-small"
            Set-EnvKey "WORLD_EMBEDDING_BASE_URL" "https://api.openai.com/v1"
        }
    }

    # Generate auth password if not set
    $pw = Get-EnvKey "AUTH_PASSWORD"
    if (-not $pw) {
        $newPw = -join ((1..8) | ForEach-Object { [char](Get-Random -Minimum 33 -Maximum 126) })
        Set-EnvKey "AUTH_PASSWORD" $newPw
        Write-Colored "  Generated auth password: $newPw" "Green"
        Write-Colored "  (change in Settings after first login)" "DarkGray"
    }
} else {
    Write-Colored "  No LLM providers detected" "Yellow"
    Write-Colored "  Options:" "Cyan"
    Write-Colored "    Ollama:    https://ollama.com/download" "Cyan"
    Write-Colored "    LM Studio: https://lmstudio.ai" "Cyan"
    Write-Colored "    OpenAI:    `$env:OPENAI_API_KEY = 'sk-...'" "Cyan"
    Write-Host ""
}

# ═══════════════════════════════════════════════════════════════
#  §5  BINARY DETECTION
# ═══════════════════════════════════════════════════════════════

$HOST = Get-EnvKey "WORLD_SERVER_HOST" "0.0.0.0"
$PORT = Get-EnvKey "WORLD_SERVER_PORT" "8000"

$BIN = ""
$MODE = "source"

$candidates = @("dist\windows-x64\tns-server.exe", "tns-server.exe")
foreach ($c in $candidates) {
    if (Test-Path $c) { $BIN = $c; $MODE = "binary"; break }
}

# ═══════════════════════════════════════════════════════════════
#  §6  BANNER
# ═══════════════════════════════════════════════════════════════

Write-Host ""
Write-Colored "╔══════════════════════════════════════════════════╗" "White"
Write-Colored "║      TrueNeverStory — Game Server (Windows)      ║" "White"
Write-Colored "╠══════════════════════════════════════════════════╣" "White"
Write-Colored "  Mode:     $MODE" "Cyan"
Write-Colored "  URL:      http://localhost:$PORT" "Cyan"
Write-Colored "  CPU:      $CPU_CORES cores (using $LLM_THREADS threads)" "Cyan"
Write-Colored "  RAM:      $RAM_GB GB (ctx: $LLM_CTX)" "Cyan"
if ($GPU_TYPE -ne "none") {
    Write-Colored "  GPU:      $GPU_NAME ($GPU_VRAM_MB MB VRAM)" "Cyan"
}
Write-Colored "  CORS:     $CORS_MODE" "Cyan"
Write-Host ""

if ($BEST_PROVIDER) {
    Write-Colored "  LLM Provider:" "White"
    Write-Colored "  ● $BEST_PROVIDER_NAME" "Green"
    Write-Colored "    Model:   $BEST_PROVIDER_MODEL" "DarkGray"
    if ($BEST_PROVIDER_EMBED) {
        Write-Colored "    Embed:   $BEST_PROVIDER_EMBED" "DarkGray"
    }
} else {
    Write-Colored "  No LLM providers detected" "Yellow"
}
Write-Host ""
Write-Colored "  Ctrl+C to stop" "Cyan"
Write-Colored "╚══════════════════════════════════════════════════╝" "White"
Write-Host ""

# ═══════════════════════════════════════════════════════════════
#  §7  LAUNCH SERVER
# ═══════════════════════════════════════════════════════════════

Write-Colored "Starting game server..." "DarkGray"

try {
    if ($MODE -eq "binary" -and $BIN) {
        & $BIN
    } else {
        bun run dev
    }
} catch {
    Write-Colored "Server stopped" "Green"
}
