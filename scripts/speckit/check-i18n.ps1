#!/usr/bin/env pwsh
<#
  Suoji — 双语成对检查（宪法 V）。

  检查 src/lib/i18n.ts：
    1. dict.zh 与 dict.en 的键集合一致
    2. 两侧取值都非空（支持跨行拼接的字符串）
    3. 每个键的 {placeholder} 集合一致（{n} 只在中文里有就是缺陷）
    4. content.zh / content.en（应用内帮助）的分组与条目数一致

  退出码 0 = 全过，1 = 有问题。
  用法: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/speckit/check-i18n.ps1
#>
[CmdletBinding()]
param([switch]$Json)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$i18nPath = Join-Path $repoRoot 'src/lib/i18n.ts'

if (-not (Test-Path -LiteralPath $i18nPath -PathType Leaf)) {
    Write-Output "FAIL missing $i18nPath"
    exit 1
}

$lines = [System.IO.File]::ReadAllLines($i18nPath, [System.Text.Encoding]::UTF8)

# 顶格结束容器：`};` 或 `} as const;`
function Get-ContainerRange {
    param([string[]]$Lines, [string]$ContainerRegex)

    $start = -1
    for ($i = 0; $i -lt $Lines.Count; $i++) {
        if ($Lines[$i] -match $ContainerRegex) { $start = $i; break }
    }
    if ($start -lt 0) { throw "找不到容器: $ContainerRegex" }

    $end = $Lines.Count
    for ($i = $start + 1; $i -lt $Lines.Count; $i++) {
        if ($Lines[$i] -match '^\}\s*(as\s+\w+)?\s*;\s*$') { $end = $i; break }
    }
    return [PSCustomObject]@{ Start = $start; End = $end }
}

# 在容器内按 `  zh: {` / `  en: {` 切成两块，返回 块名 -> @(开始行, 结束行)
function Get-LocaleRanges {
    param([string[]]$Lines, [int]$Start, [int]$End)

    $ranges = @{}
    $current = $null
    $open = 0
    for ($i = $Start + 1; $i -lt $End; $i++) {
        $line = $Lines[$i]
        if ($line -match '^\s{2}(zh|en)\s*:\s*\{\s*$') {
            $current = $Matches[1]
            $open = $i
            continue
        }
        if ($null -ne $current -and $line -match '^\s{2}\}\s*,?\s*$') {
            $ranges[$current] = @($open, $i)
            $current = $null
            continue
        }
    }
    if (-not $ranges.ContainsKey('zh') -or -not $ranges.ContainsKey('en')) {
        throw "容器里没有成对的 zh / en"
    }
    return $ranges
}

function Get-DictEntries {
    param([string[]]$Lines, [int[]]$Range)

    $entries = @{}
    $i = $Range[0] + 1
    while ($i -lt $Range[1]) {
        $line = $Lines[$i]
        if ($line -match '^\s+"([^"]+)"\s*:\s*(.*)$') {
            $key = $Matches[1]
            $value = $Matches[2]
            # 跨行拼接：一直吃到以逗号收尾的那一行
            while (-not $value.TrimEnd().EndsWith(',')) {
                $i++
                if ($i -ge $Range[1]) { break }
                $value = $value + ' ' + $Lines[$i].Trim()
            }
            $entries[$key] = $value.TrimEnd().TrimEnd(',')
        }
        $i++
    }
    return $entries
}

$problems = New-Object System.Collections.ArrayList

# ------------------------------------------------------------------ dict
try {
    $dictRange = Get-ContainerRange -Lines $lines -ContainerRegex '^const dict = \{'
    $dictLocales = Get-LocaleRanges -Lines $lines -Start $dictRange.Start -End $dictRange.End
    $zh = Get-DictEntries -Lines $lines -Range $dictLocales['zh']
    $en = Get-DictEntries -Lines $lines -Range $dictLocales['en']
} catch {
    Write-Output ("FAIL " + $_.Exception.Message)
    exit 1
}

foreach ($k in $zh.Keys) {
    if (-not $en.ContainsKey($k)) { [void]$problems.Add("MISSING en: $k") }
}
foreach ($k in $en.Keys) {
    if (-not $zh.ContainsKey($k)) { [void]$problems.Add("EXTRA en (zh 里没有): $k") }
}
foreach ($k in $zh.Keys) {
    if (-not $en.ContainsKey($k)) { continue }
    $zhVal = $zh[$k]
    $enVal = $en[$k]
    if ($zhVal -eq '' -or $zhVal -eq '""') { [void]$problems.Add("EMPTY zh: $k") }
    if ($enVal -eq '' -or $enVal -eq '""') { [void]$problems.Add("EMPTY en: $k") }

    $zhPh = (@([regex]::Matches($zhVal, '\{([a-zA-Z0-9_]+)\}') | ForEach-Object { $_.Groups[1].Value }) | Sort-Object -Unique) -join ','
    $enPh = (@([regex]::Matches($enVal, '\{([a-zA-Z0-9_]+)\}') | ForEach-Object { $_.Groups[1].Value }) | Sort-Object -Unique) -join ','
    if ($zhPh -ne $enPh) { [void]$problems.Add("PLACEHOLDER $k : zh={$zhPh} en={$enPh}") }
}

# --------------------------------------------------------------- content
$contentStats = $null
try {
    $contentRange = Get-ContainerRange -Lines $lines -ContainerRegex '^const content = \{'
    $contentLocales = Get-LocaleRanges -Lines $lines -Start $contentRange.Start -End $contentRange.End
    $contentStats = @{}
    foreach ($locale in @('zh', 'en')) {
        $range = $contentLocales[$locale]
        $body = ($lines[$range[0]..$range[1]]) -join "`n"
        $groups = @([regex]::Matches($body, '(?m)^\s{2}([a-zA-Z]+)\s*:\s*\[') | ForEach-Object { $_.Groups[1].Value })
        $contentStats[$locale] = [PSCustomObject]@{
            Groups = ($groups -join ',')
            Titles = ([regex]::Matches($body, 'title:')).Count
            Lefts  = ([regex]::Matches($body, 'left:')).Count
            Bodies = ([regex]::Matches($body, 'body:')).Count
        }
    }
    if ($contentStats['zh'].Groups -ne $contentStats['en'].Groups) {
        [void]$problems.Add("CONTENT 分组不一致: zh=$($contentStats['zh'].Groups) en=$($contentStats['en'].Groups)")
    }
    foreach ($field in @('Titles', 'Lefts', 'Bodies')) {
        if ($contentStats['zh'].$field -ne $contentStats['en'].$field) {
            [void]$problems.Add("CONTENT $field 数量不一致: zh=$($contentStats['zh'].$field) en=$($contentStats['en'].$field)")
        }
    }
} catch {
    [void]$problems.Add("CONTENT 无法解析: " + $_.Exception.Message)
}

# ------------------------------------------------------------------ 输出
if ($Json) {
    [PSCustomObject]@{
        zh_keys  = $zh.Count
        en_keys  = $en.Count
        problems = @($problems)
        ok       = ($problems.Count -eq 0)
    } | ConvertTo-Json -Depth 4
} else {
    if ($problems.Count -eq 0) {
        $note = ''
        if ($contentStats) {
            $note = "content: steps=$($contentStats['zh'].Titles) rows=$($contentStats['zh'].Lefts) why=$($contentStats['zh'].Bodies)"
        }
        Write-Output "PASS dict zh=$($zh.Count) en=$($en.Count) 键与占位符成对；$note"
    } else {
        Write-Output "FAIL $($problems.Count) 处问题（dict zh=$($zh.Count) en=$($en.Count)）"
        foreach ($p in $problems) { Write-Output "  $p" }
    }
}

if ($problems.Count -gt 0) { exit 1 } else { exit 0 }
