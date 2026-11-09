#!/usr/bin/env pwsh
<#
  Suoji — 机器化 SDD 闸门。

  校验 .specify/memory/constitution.md 与当前 feature 的 spec/plan/tasks 是否
  满足 AGENTS.md 里描述的五道闸。退出码 0 = 全过，1 = 有 FAIL。

  用法（本机没有 make / pwsh 时）:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/speckit/gate.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/speckit/gate.ps1 -Feature 001
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/speckit/gate.ps1 -Json
#>
[CmdletBinding()]
param(
    [string]$Feature = '',
    [switch]$Json,
    [switch]$SkipI18n
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$specsDir = Join-Path $repoRoot 'specs'
$results = New-Object System.Collections.ArrayList

function Add-Result {
    param([string]$Id, [string]$Title, [string]$Status, [string]$Detail = '')
    [void]$results.Add([PSCustomObject]@{ Id = $Id; Title = $Title; Status = $Status; Detail = $Detail })
}

function Read-Text {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Resolve-FeatureDir {
    if ($Feature) {
        if (Test-Path -LiteralPath $Feature -PathType Container) {
            return (Resolve-Path -LiteralPath $Feature).Path
        }
        $hit = Get-ChildItem -LiteralPath $specsDir -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match ('^0*' + [regex]::Escape($Feature) + '-') } |
            Sort-Object Name | Select-Object -First 1
        if ($hit) { return $hit.FullName }
        throw "找不到 feature '$Feature'（specs/ 下没有匹配的目录）"
    }
    $pointer = Join-Path $repoRoot '.specify/feature.json'
    if (Test-Path -LiteralPath $pointer -PathType Leaf) {
        try {
            $json = [System.IO.File]::ReadAllText($pointer, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
            $dir = $json.feature_directory
            if (-not $dir -and $json.feature) { $dir = $json.feature }
            if ($dir) {
                if (-not [System.IO.Path]::IsPathRooted($dir)) { $dir = Join-Path $repoRoot $dir }
                if (Test-Path -LiteralPath $dir -PathType Container) { return (Resolve-Path -LiteralPath $dir).Path }
            }
        } catch {
            # 指针损坏时退回「最新 feature」，不阻断闸门
        }
    }
    $latest = Get-ChildItem -LiteralPath $specsDir -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^\d{3,}-' } |
        Sort-Object Name -Descending | Select-Object -First 1
    if ($latest) { return $latest.FullName }
    return $null
}

$featureDir = Resolve-FeatureDir

# ---------------------------------------------------------------- C001 宪法
$constPath = Join-Path $repoRoot '.specify/memory/constitution.md'
$const = Read-Text $constPath
if (-not $const) {
    Add-Result 'C001' '宪法已填写' 'FAIL' '.specify/memory/constitution.md 不存在'
} elseif ($const -match '\[(PRINCIPLE_1_NAME|SECTION_2_NAME|SECTION_3_NAME|GOVERNANCE_RULES|CONSTITUTION_VERSION|PROJECT_NAME)\]') {
    Add-Result 'C001' '宪法已填写' 'FAIL' '仍是模板占位符，先按既有代码「考古」写完'
} elseif ($const -notmatch '\*\*Version\*\*:\s*\d+\.\d+\.\d+') {
    Add-Result 'C001' '宪法已填写' 'FAIL' '缺少 **Version**: x.y.z'
} else {
    $ver = [regex]::Match($const, '\*\*Version\*\*:\s*(\d+\.\d+\.\d+)').Groups[1].Value
    Add-Result 'C001' '宪法已填写' 'PASS' "v$ver"
}

# ------------------------------------------------- 当前 feature 是否存在
if (-not $featureDir) {
    Add-Result 'C002' 'spec.md 存在' 'FAIL' 'specs/ 下没有任何 feature；先跑 scripts/speckit/new-feature.ps1'
    Add-Result 'C003' 'spec 四段齐全' 'SKIP' '无 feature'
    Add-Result 'C004' '无模板占位符' 'SKIP' '无 feature'
    Add-Result 'C005' 'FR/SC 可验收' 'SKIP' '无 feature'
    Add-Result 'C006' '待澄清 ≤ 3' 'SKIP' '无 feature'
    Add-Result 'C007' 'tasks 四类任务' 'SKIP' '无 feature'
    Add-Result 'C009' '需求清单已评审' 'SKIP' '无 feature'
    Add-Result 'C010' 'plan 宪法检查' 'SKIP' '无 feature'
} else {
    $specPath = Join-Path $featureDir 'spec.md'
    $spec = Read-Text $specPath

    if (-not $spec) {
        Add-Result 'C002' 'spec.md 存在' 'FAIL' "$specPath 不存在"
    } else {
        Add-Result 'C002' 'spec.md 存在' 'PASS' (Split-Path -Leaf $featureDir)

        # C003 四段（宪法 I–V 的落地钩子）
        $sections = @('兼容边界', '数据影响', '双语影响', '不可破坏的不变量')
        $missingSections = @()
        foreach ($s in $sections) {
            if ($spec -notmatch ('(?m)^##\s*' + [regex]::Escape($s))) { $missingSections += $s }
        }
        if ($missingSections.Count -eq 0) {
            Add-Result 'C003' 'spec 四段齐全' 'PASS' '兼容边界 / 数据影响 / 双语影响 / 不可破坏的不变量'
        } else {
            Add-Result 'C003' 'spec 四段齐全' 'FAIL' ('缺: ' + ($missingSections -join '、'))
        }

        # C004 模板占位符
        $placeholderPattern = '\[(FEATURE NAME|DATE|###-feature-name|Brief Title|Describe |Explain |initial state|Assumption about|What it represents|Add more user stories|specific capability|key interaction)'
        $hits = [regex]::Matches($spec, $placeholderPattern)
        if ($hits.Count -eq 0) {
            Add-Result 'C004' '无模板占位符' 'PASS' ''
        } else {
            $sample = ($hits | ForEach-Object { $_.Value } | Select-Object -Unique -First 3) -join ' '
            Add-Result 'C004' '无模板占位符' 'FAIL' ("$($hits.Count) 处未替换，例如 $sample")
        }

        # C005 可验收性
        $fr = ([regex]::Matches($spec, '\*\*FR-\d{3}\*\*')).Count
        $sc = ([regex]::Matches($spec, '\*\*SC-\d{3}\*\*')).Count
        $us = ([regex]::Matches($spec, 'Priority:\s*P\d')).Count
        if ($fr -ge 1 -and $sc -ge 1) {
            Add-Result 'C005' 'FR/SC 可验收' 'PASS' "FR=$fr SC=$sc US=$us"
        } else {
            Add-Result 'C005' 'FR/SC 可验收' 'FAIL' "FR=$fr SC=$sc（各至少 1 条）"
        }

        # C006 待澄清数量
        $unclear = ([regex]::Matches($spec, 'NEEDS CLARIFICATION:')).Count
        if ($unclear -le 3) {
            Add-Result 'C006' '待澄清 ≤ 3' 'PASS' "未决 $unclear 条"
        } else {
            Add-Result 'C006' '待澄清 ≤ 3' 'FAIL' "未决 $unclear 条，先跑 /speckit.clarify"
        }
    }

    # C007 tasks 四类任务
    $tasksPath = Join-Path $featureDir 'tasks.md'
    $tasks = Read-Text $tasksPath
    if (-not $tasks) {
        Add-Result 'C007' 'tasks 四类任务' 'SKIP' 'tasks.md 未生成（还没跑 /speckit.tasks）'
    } else {
        $classes = @('契约', '门禁', '双语', '数据')
        $miss = @()
        foreach ($c in $classes) { if ($tasks -notmatch ('\[' + $c + '\]')) { $miss += $c } }
        $done = ([regex]::Matches($tasks, '- \[[xX]\]')).Count
        $open = ([regex]::Matches($tasks, '- \[ \]')).Count
        if ($miss.Count -eq 0) {
            Add-Result 'C007' 'tasks 四类任务' 'PASS' "契约/门禁/双语/数据 齐；进度 $done/$($done + $open)"
        } else {
            Add-Result 'C007' 'tasks 四类任务' 'FAIL' ('缺: ' + ($miss -join '、'))
        }
    }

    # C009 需求清单评审状态（信息性：未评审不算失败）
    $reqChecklist = Join-Path $featureDir 'checklists/requirements.md'
    $req = Read-Text $reqChecklist
    if (-not $req) {
        Add-Result 'C009' '需求清单已评审' 'SKIP' 'checklists/requirements.md 未生成'
    } else {
        $ok = ([regex]::Matches($req, '- \[[xX]\]')).Count
        $no = ([regex]::Matches($req, '- \[ \]')).Count
        $total = $ok + $no
        if ($total -gt 0 -and $ok -eq $total) {
            Add-Result 'C009' '需求清单已评审' 'PASS' "$ok/$total"
        } else {
            Add-Result 'C009' '需求清单已评审' 'SKIP' "$ok/$total（G1 时由人补齐）"
        }
    }

    # C010 plan 的宪法检查
    $planPath = Join-Path $featureDir 'plan.md'
    $plan = Read-Text $planPath
    if (-not $plan) {
        Add-Result 'C010' 'plan 宪法检查' 'SKIP' 'plan.md 未生成（还没跑 /speckit.plan）'
    } elseif ($plan -notmatch '(?m)^#+\s*Constitution Check') {
        Add-Result 'C010' 'plan 宪法检查' 'FAIL' 'plan.md 缺 Constitution Check 一节'
    } else {
        $evidence = ([regex]::Matches($plan, '(?m)^\s*[-*]\s*\[[xX ]\].*(→|->|证据)')).Count
        if ($evidence -ge 5) {
            Add-Result 'C010' 'plan 宪法检查' 'PASS' "$evidence 条带证据"
        } else {
            Add-Result 'C010' 'plan 宪法检查' 'SKIP' "五条原则的证据行不足（$evidence/5）"
        }
    }
}

# ------------------------------------------------------------- C008 双语
if ($SkipI18n) {
    Add-Result 'C008' '双语键成对' 'SKIP' '本次跳过（-SkipI18n）'
} else {
    $i18nScript = Join-Path $PSScriptRoot 'check-i18n.ps1'
    if (-not (Test-Path -LiteralPath $i18nScript -PathType Leaf)) {
        Add-Result 'C008' '双语键成对' 'SKIP' 'check-i18n.ps1 缺失'
    } else {
        $hostExe = (Get-Process -Id $PID).Path
        $out = & $hostExe -NoProfile -ExecutionPolicy Bypass -File $i18nScript 2>&1
        $code = $LASTEXITCODE
        if ($code -eq 0) {
            Add-Result 'C008' '双语键成对' 'PASS' (($out | Where-Object { "$_" -match '^(PASS|OK)' } | Select-Object -First 1) -replace '^\S+\s*', '')
        } else {
            $detail = ($out | Where-Object { "$_" -match '^(FAIL|MISSING|EXTRA|EMPTY|PLACEHOLDER|CONTENT)' } | Select-Object -First 3) -join '; '
            if (-not $detail) { $detail = 'check-i18n.ps1 退出码非 0' }
            Add-Result 'C008' '双语键成对' 'FAIL' $detail
        }
    }
}

# ------------------------------------------------------------------ 输出
$fails = @($results | Where-Object { $_.Status -eq 'FAIL' })
$pass = @($results | Where-Object { $_.Status -eq 'PASS' }).Count
$skip = @($results | Where-Object { $_.Status -eq 'SKIP' }).Count

if ($Json) {
    [PSCustomObject]@{
        feature = if ($featureDir) { $featureDir.Replace($repoRoot + [System.IO.Path]::DirectorySeparatorChar, '') } else { $null }
        pass    = $pass
        fail    = $fails.Count
        skip    = $skip
        ok      = ($fails.Count -eq 0)
        checks  = $results
    } | ConvertTo-Json -Depth 5
} else {
    $label = if ($featureDir) { $featureDir.Replace($repoRoot + [System.IO.Path]::DirectorySeparatorChar, '') } else { '(没有 feature)' }
    Write-Host ""
    Write-Host "Suoji SDD gate — $label"
    Write-Host ('-' * 64)
    foreach ($r in $results) {
        $tag = $r.Status.PadRight(4)
        $color = switch ($r.Status) { 'PASS' { 'Green' } 'FAIL' { 'Red' } default { 'DarkGray' } }
        Write-Host ("  $tag  $($r.Id)  $($r.Title)") -ForegroundColor $color -NoNewline
        if ($r.Detail) { Write-Host ("  — " + $r.Detail) } else { Write-Host "" }
    }
    Write-Host ('-' * 64)
    Write-Host ("  PASS $pass   FAIL $($fails.Count)   SKIP $skip")
    if ($fails.Count -eq 0) {
        Write-Host "  闸门通过。" -ForegroundColor Green
    } else {
        Write-Host "  有 FAIL：修完再提交。" -ForegroundColor Red
    }
    Write-Host ""
}

if ($fails.Count -gt 0) { exit 1 } else { exit 0 }
