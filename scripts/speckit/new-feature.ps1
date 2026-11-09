#!/usr/bin/env pwsh
<#
  Suoji — 新建 feature 的统一入口。

  在 .specify/scripts/powershell/create-new-feature.ps1 之上做两件事：
    1. 用项目约定的短名与编号创建 specs/NNN-<short>/
    2. 往新建的 spec.md 里注入本项目强制的四段（宪法 I–V 的落地钩子）

  用法:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/speckit/new-feature.ps1 `
        -ShortName parse-contract "把一句话录入的解析规则固化成契约测试"

  之后在 pi 里按顺序跑：/speckit.specify → /speckit.plan → /speckit.tasks
#>
[CmdletBinding()]
param(
    [string]$ShortName,
    [int]$Number = 0,
    [switch]$DryRun,
    [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
    [string[]]$Description
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$creator = Join-Path $repoRoot '.specify/scripts/powershell/create-new-feature.ps1'

if (-not (Test-Path -LiteralPath $creator -PathType Leaf)) {
    Write-Error "缺少 $creator —— 先跑 specify init --here --force --integration pi"
    exit 1
}
if (-not $Description -or $Description.Count -eq 0) {
    Write-Error "用法: ./scripts/speckit/new-feature.ps1 -ShortName <2-4 词短名> '<一句话功能描述>'"
    exit 1
}

$desc = ($Description -join ' ').Trim()
$call = @{ Json = $true }
if ($ShortName) { $call['ShortName'] = $ShortName }
if ($Number -gt 0) { $call['Number'] = [string]$Number }
if ($DryRun) { $call['DryRun'] = $true }

$raw = $null
Push-Location -LiteralPath $repoRoot
try {
    $raw = & $creator @call -FeatureDescription $desc 2>&1
} finally {
    Pop-Location
}
$jsonLine = ($raw | Where-Object { "$_".TrimStart().StartsWith('{') } | Select-Object -Last 1)
if (-not $jsonLine) {
    Write-Error ("create-new-feature 没有返回 JSON：" + ($raw -join ' '))
    exit 1
}
$info = $jsonLine | ConvertFrom-Json

$branches = @([regex]::Matches(($raw -join "`n"), '# To persist:'))
if (-not $info.SPEC_FILE) { exit 0 }

$specPath = $info.SPEC_FILE
$mandatory = [ordered]@{
    '兼容边界'        = '列出本 feature 不许变的契约：IPC 命令名与参数、serde camelCase 字段、i18n key、DB 表列语义、提醒窗口与顺延规则。'
    '数据影响'        = '是否有 DDL？是否需要迁移？回滚方式？旧库（0.1.1）能否直接打开？行数是否不变？'
    '双语影响'        = '新增/改动的 key 列表（zh、en 成对，Rust 侧 Labels 同）；只有一种语言的字符串 = 未完成。'
    '不可破坏的不变量' = '引用宪法条款号并写成本 feature 的具体含义，例如：II → 导入失败时库必须与导入前逐行一致。'
}

if (-not $DryRun -and (Test-Path -LiteralPath $specPath -PathType Leaf)) {
    $text = [System.IO.File]::ReadAllText($specPath, [System.Text.Encoding]::UTF8)
    $missing = @()
    foreach ($name in $mandatory.Keys) {
        if ($text -notmatch ('(?m)^##\s*' + [regex]::Escape($name))) { $missing += $name }
    }
    if ($missing.Count -gt 0) {
        $sb = New-Object System.Text.StringBuilder
        [void]$sb.AppendLine()
        foreach ($name in $missing) {
            [void]$sb.AppendLine("## $name")
            [void]$sb.AppendLine()
            [void]$sb.AppendLine("<!-- 填写要求：$($mandatory[$name]) -->")
            [void]$sb.AppendLine()
            [void]$sb.AppendLine('<!-- 没填就删掉本段注释，闸门 scripts/speckit/gate.ps1 会检查这里 -->')
            [void]$sb.AppendLine()
        }
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($specPath, $text.TrimEnd() + "`n" + $sb.ToString(), $utf8NoBom)
    }
}

Write-Output ""
Write-Output "feature : $($info.BRANCH_NAME)"
Write-Output "number  : $($info.FEATURE_NUM)"
Write-Output "spec    : $specPath"
Write-Output ("四段    : " + ($mandatory.Keys -join ' / '))
Write-Output ""
Write-Output "下一步（在 pi 里）:"
Write-Output "  1. /speckit.specify $desc"
Write-Output "  2. 把四段填实，然后 /speckit.clarify（最多 3 个待澄清）"
Write-Output "  3. /speckit.plan → /speckit.tasks → /speckit.analyze → /speckit.implement"
Write-Output ""
Write-Output "闸门检查: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/speckit/gate.ps1"
