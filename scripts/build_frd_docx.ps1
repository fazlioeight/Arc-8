# Builds docs/Arc-8_Functional_Requirements_Document.docx from the FRD markdown using MS Word COM.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$md   = Join-Path $root 'docs\FUNCTIONAL_REQUIREMENTS_DOCUMENT.md'
$out  = Join-Path $root 'docs\Arc-8_Functional_Requirements_Document.docx'

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$doc = $word.Documents.Add()
$word.ScreenUpdating = $false
$word.Options.Pagination = $false
$word.ActiveWindow.View.Type = 1   # Normal view: avoids layout cost while typing
$sel = $word.Selection

# ---- page setup & styles ----
$ps = $doc.PageSetup
$ps.TopMargin = 72; $ps.BottomMargin = 72; $ps.LeftMargin = 72; $ps.RightMargin = 72
$navy = 0x5B3A1F   # BGR for RGB(31,58,91)

$n = $doc.Styles.Item('Normal'); $n.Font.Name = 'Calibri'; $n.Font.Size = 11
$n.ParagraphFormat.SpaceAfter = 6; $n.ParagraphFormat.LineSpacingRule = 5; $n.ParagraphFormat.LineSpacing = 14
foreach ($h in @(@('Heading 1',18,$navy),@('Heading 2',14,$navy),@('Heading 3',12,$navy))) {
    $s = $doc.Styles.Item($h[0]); $s.Font.Name = 'Calibri'; $s.Font.Size = $h[1]; $s.Font.Bold = $true
    $s.Font.Color = $h[2]; $s.ParagraphFormat.SpaceBefore = 14; $s.ParagraphFormat.SpaceAfter = 6
    $s.ParagraphFormat.KeepWithNext = $true
}
$doc.Styles.Item('Heading 1').ParagraphFormat.Borders.Item(-3).LineStyle = 1   # bottom rule

function Write-Inline([string]$text) {
    # supports **bold**, `code`, and strips escaped \$ and <br/>
    $text = $text -replace '\\\$','$' -replace '<br\s*/?>',' '
    $parts = [regex]::Split($text, '(\*\*.+?\*\*|`.+?`)')
    foreach ($p in $parts) {
        if ($p -eq '') { continue }
        if ($p -match '^\*\*(.+)\*\*$') { $sel.Font.Bold = $true; $sel.TypeText($Matches[1]); $sel.Font.Bold = $false }
        elseif ($p -match '^`(.+)`$') { $sel.Font.Name = 'Consolas'; $sel.Font.Size = 10; $sel.TypeText($Matches[1]); $sel.Font.Name = 'Calibri'; $sel.Font.Size = 11 }
        else { $sel.TypeText($p) }
    }
}
function Style([string]$name) { $sel.Style = $doc.Styles.Item($name) }

# ---- cover page ----
$sel.ParagraphFormat.Alignment = 1
1..6 | % { $sel.TypeParagraph() }
$sel.Font.Size = 32; $sel.Font.Bold = $true; $sel.Font.Color = $navy
$sel.TypeText('Arc-8 (Member 360)'); $sel.TypeParagraph()
$sel.Font.Size = 24; $sel.TypeText('Functional Requirements Document'); $sel.TypeParagraph()
$sel.Font.Size = 14; $sel.Font.Bold = $false; $sel.Font.Color = 0x595959
$sel.TypeParagraph()
$sel.TypeText('Prominence Health First Inc. - SOW No. 3'); $sel.TypeParagraph()
$sel.TypeText('Version 0.1 DRAFT'); $sel.TypeParagraph()
$sel.TypeText('Date: ' + (Get-Date -Format 'MMMM d, yyyy')); $sel.TypeParagraph()
$sel.InsertBreak(7)   # page break
$sel.Font.Size = 11; $sel.Font.Color = 0; $sel.ParagraphFormat.Alignment = 0
Style 'Normal'

# ---- table of contents ----
Style 'Heading 1'; $sel.TypeText('Table of Contents'); $sel.TypeParagraph(); Style 'Normal'
$tocRange = $sel.Range
$doc.TablesOfContents.Add($tocRange, $true, 1, 2) | Out-Null
$sel.EndKey(6) | Out-Null
$sel.InsertBreak(7)

# ---- body ----
$lines = Get-Content $md -Encoding UTF8
$i = 0
$skipTitle = $true
while ($i -lt $lines.Count) {
    $l = $lines[$i]
    if ($l -match '^# ' -and $skipTitle) { $skipTitle = $false; $i++; continue }
    if ($l -match '^\s*---+\s*$') { $i++; continue }
    if ($l.Trim() -eq '') { $i++; continue }

    if ($l -match '^(#{1,3}) (.+)$') {
        $lvl = $Matches[1].Length - 1; if ($lvl -lt 1) { $lvl = 1 }
        Style "Heading $lvl"; Write-Inline $Matches[2]; $sel.TypeParagraph(); Style 'Normal'; $i++; continue
    }
    if ($l -match '^\|') {
        $rows = @()
        while ($i -lt $lines.Count -and $lines[$i] -match '^\|') {
            if ($lines[$i] -notmatch '^\|\s*:?-{2,}') {
                $cells = ($lines[$i].Trim() -replace '^\||\|$','') -split '(?<!\\)\|' | % { $_.Trim() }
                $rows += ,$cells
            }
            $i++
        }
        # drop an empty header row (the metadata table)
        $hasHeader = ($rows[0] | ? { $_ -ne '' }).Count -gt 0
        if (-not $hasHeader) { $rows = $rows[1..($rows.Count-1)] }
        $cols = ($rows | % { $_.Count } | Measure-Object -Maximum).Maximum
        $tbl = $doc.Tables.Add($sel.Range, $rows.Count, $cols)
        $tbl.Borders.Enable = $true
        $tbl.Range.Font.Size = 9.5
        $tbl.Range.ParagraphFormat.SpaceAfter = 2
        $tbl.AllowAutoFit = $true
        for ($r = 0; $r -lt $rows.Count; $r++) {
            for ($c = 0; $c -lt $cols; $c++) {
                $txt = if ($c -lt $rows[$r].Count) { $rows[$r][$c] } else { '' }
                $txt = ($txt -replace '\\\$','$' -replace '<br\s*/?>',' ' -replace '\*\*','' -replace '`','' -replace '~~','')
                $tbl.Cell($r+1,$c+1).Range.Text = $txt
            }
        }
        if ($hasHeader) {
            $hr = $tbl.Rows.Item(1); $hr.HeadingFormat = $true; $hr.Range.Font.Bold = $true
            $hr.Range.Font.Color = 0xFFFFFF; $hr.Shading.BackgroundPatternColor = $navy
        } else { for ($r = 1; $r -le $rows.Count; $r++) { $tbl.Cell($r,1).Range.Font.Bold = $true } }
        $tbl.Rows.AllowBreakAcrossPages = $false
        $tbl.AutoFitBehavior(2)
        $tbl.TopPadding = 2; $tbl.BottomPadding = 2
        $sel.EndKey(6) | Out-Null
        $sel.TypeParagraph()
        continue
    }
    if ($l -match '^\s*[-*] (.+)$') {
        Style 'List Bullet'; Write-Inline $Matches[1]; $sel.TypeParagraph(); Style 'Normal'; $i++; continue
    }
    if ($l -match '^\s*\d+\. (.+)$') {
        Style 'List Number'; Write-Inline $Matches[1]; $sel.TypeParagraph(); Style 'Normal'; $i++; continue
    }
    Style 'Normal'; Write-Inline $l.Trim(); $sel.TypeParagraph(); $i++
}

$doc.SaveAs2($out, 16)
Write-Output 'saved'
$word.Options.Pagination = $true
$word.ActiveWindow.View.Type = 3   # Print layout

# ---- header / footer with page numbers ----
$sec = $doc.Sections.Item(1)
$sec.PageSetup.DifferentFirstPageHeaderFooter = $true
$sec.Headers.Item(1).Range.Text = 'Arc-8 Functional Requirements Document - v0.1 DRAFT'
$sec.Headers.Item(1).Range.Font.Size = 9
$sec.Footers.Item(1).PageNumbers.Add(1, $false) | Out-Null
Write-Output 'header done'
$doc.TablesOfContents.Item(1).Update()
Write-Output 'toc updated'
$doc.Save()
Write-Output 'resaved'
$doc.Close(0)
$word.Quit()
Write-Output "Saved $out"
