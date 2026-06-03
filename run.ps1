$folders = @(
    "src/bot",
    "src/commands",
    "src/agent",
    "src/ssh",
    "src/db",
    "src/crypto",
    "scripts",
    "prisma"
)

$files = @(
    "src/bot/index.ts",
    "src/commands/server.ts",
    "src/commands/container.ts",
    "src/commands/stack.ts",
    "src/agent/index.ts",
    "src/agent/auth.ts",
    "src/ssh/index.ts",
    "src/db/client.ts",
    "src/crypto/index.ts",
    "scripts/container-restart.sh",
    "scripts/container-start.sh",
    "scripts/container-stop.sh",
    "scripts/container-logs.sh",
    "scripts/container-list.sh",
    "scripts/stack-up.sh",
    "scripts/stack-down.sh",
    "scripts/stack-restart.sh",
    "scripts/stack-logs.sh",
    "scripts/system-stats.sh",
    "prisma/schema.prisma",
    "docker-compose.yml",
    ".env"
)

foreach ($folder in $folders) {
    New-Item -ItemType Directory -Force -Path $folder | Out-Null
}

foreach ($file in $files) {
    New-Item -ItemType File -Force -Path $file | Out-Null
}

Write-Host "Done." -ForegroundColor Green