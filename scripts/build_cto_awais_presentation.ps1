# Builds docs/Arc-8_CTO_Awais_Sprint_Strategy_Presentation.pptx
# Aligned with Client Mandate: Complete System + Full Proper API Integration by January 1, 2027
# Slide 1: Title & Jan 1, 2027 Execution Strategy
# Slide 2: Consolidated Features Table (Part 1: F-01 to F-30)
# Slide 3: Consolidated Features Table (Part 2: F-31 to F-53 + V2-F01 to V2-F09)
# Slide 4: Observed Gaps (G-01..G-16), Live APIs (G-08) & Redis Cache — Must-Do vs. Compromised for Jan 1
# Slide 5: Summary Breakdown: Covered Today vs. Must-Cover by Jan 1 (APIs + Core Gaps) vs. Compromised/Shifted
# Slide 6: Compressed 6-Week Schedule to Launch on January 1, 2027

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$outPptx = Join-Path $root 'docs\Arc-8_CTO_Awais_Sprint_Strategy_Presentation.pptx'

try {
    $existingPpt = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')
    foreach ($p in $existingPpt.Presentations) {
        if ($p.FullName -eq $outPptx) {
            $p.Close()
        }
    }
} catch {}

if (Test-Path $outPptx) {
    Remove-Item $outPptx -Force
}

$ppt = New-Object -ComObject PowerPoint.Application
$pres = $ppt.Presentations.Add(-1)
$pres.PageSetup.SlideWidth = 960
$pres.PageSetup.SlideHeight = 540

function Color-RGB([int]$r, [int]$g, [int]$b) {
    return ($r + ($g * 256) + ($b * 65536))
}

$cNavy      = Color-RGB 15 23 42      # #0F172A
$cBlueDark  = Color-RGB 30 58 138     # #1E3A8A
$cBlueLight = Color-RGB 2 132 199     # #0284C7
$cBlueBg    = Color-RGB 224 242 254   # #E0F2FE
$cGreen     = Color-RGB 22 101 52     # #166534
$cGreenBg   = Color-RGB 220 252 231   # #DCFCE7
$cAmber     = Color-RGB 180 83 9      # #B45309
$cAmberBg   = Color-RGB 254 243 199   # #FEF3C7
$cPurple    = Color-RGB 109 40 217    # #6D28D9
$cPurpleBg  = Color-RGB 237 233 254   # #EDE9FE
$cCardBg    = Color-RGB 248 250 252   # #F8FAFC
$cRowAlt    = Color-RGB 241 245 249   # #F1F5F9
$cCardBrd   = Color-RGB 203 213 225   # #CBD5E1
$cTextDark  = Color-RGB 30 41 59      # #1E293B
$cTextMuted = Color-RGB 100 116 139   # #64748B
$cWhite     = Color-RGB 255 255 255   # #FFFFFF

function Create-Slide([string]$title, [string]$subtitle) {
    $slide = $pres.Slides.Add($pres.Slides.Count + 1, 12)
    
    $banner = $slide.Shapes.AddShape(1, 0, 0, 960, 70)
    $banner.Fill.Solid()
    $banner.Fill.ForeColor.RGB = $cNavy
    $banner.Line.Visible = 0
    
    $tag = $slide.Shapes.AddTextbox(1, 36, 8, 888, 16)
    $tag.TextFrame.WordWrap = -1
    $tag.TextFrame.MarginLeft = 0; $tag.TextFrame.MarginTop = 0
    $tr = $tag.TextFrame.TextRange
    $tr.Text = $subtitle.ToUpper()
    $tr.Font.Name = 'Segoe UI'; $tr.Font.Size = 9.5; $tr.Font.Bold = -1; $tr.Font.Color.RGB = $cBlueLight
    
    $tb = $slide.Shapes.AddTextbox(1, 36, 24, 888, 40)
    $tb.TextFrame.WordWrap = -1
    $tb.TextFrame.MarginLeft = 0; $tb.TextFrame.MarginTop = 0
    $tr2 = $tb.TextFrame.TextRange
    $tr2.Text = $title
    $tr2.Font.Name = 'Segoe UI'; $tr2.Font.Size = 20; $tr2.Font.Bold = -1; $tr2.Font.Color.RGB = $cWhite
    
    $ft = $slide.Shapes.AddTextbox(1, 36, 514, 888, 18)
    $ft.TextFrame.WordWrap = -1
    $ft.TextFrame.MarginLeft = 0; $ft.TextFrame.MarginTop = 0
    $ftr = $ft.TextFrame.TextRange
    $ftr.Text = 'Arc-8 (Member 360) | Target Completion: January 1, 2027 | Full API Integration, F-01..F-53 & G-01..G-16 Plan'
    $ftr.Font.Name = 'Segoe UI'; $ftr.Font.Size = 8.5; $ftr.Font.Color.RGB = $cTextMuted
    
    return $slide
}

function Draw-FeatureTable($slide, [int]$x, [int]$y, [int]$w, $items, [int]$rowH = 26, [string]$col2Header = 'Module', [string]$col3Header = 'Feature Name') {
    $hdr = $slide.Shapes.AddShape(1, $x, $y, $w, 26)
    $hdr.Fill.Solid(); $hdr.Fill.ForeColor.RGB = $cBlueDark; $hdr.Line.ForeColor.RGB = $cCardBrd
    
    $hId = $slide.Shapes.AddTextbox(1, $x + 4, $y + 3, 54, 22)
    $hId.TextFrame.TextRange.Text = 'ID'; $hId.TextFrame.TextRange.Font.Name = 'Segoe UI'; $hId.TextFrame.TextRange.Font.Size = 9.5; $hId.TextFrame.TextRange.Font.Bold = -1; $hId.TextFrame.TextRange.Font.Color.RGB = $cWhite
    
    $hMod = $slide.Shapes.AddTextbox(1, $x + 60, $y + 3, 114, 22)
    $hMod.TextFrame.TextRange.Text = $col2Header; $hMod.TextFrame.TextRange.Font.Name = 'Segoe UI'; $hMod.TextFrame.TextRange.Font.Size = 9.5; $hMod.TextFrame.TextRange.Font.Bold = -1; $hMod.TextFrame.TextRange.Font.Color.RGB = $cWhite
    
    $hFeat = $slide.Shapes.AddTextbox(1, $x + 176, $y + 3, 178, 22)
    $hFeat.TextFrame.TextRange.Text = $col3Header; $hFeat.TextFrame.TextRange.Font.Name = 'Segoe UI'; $hFeat.TextFrame.TextRange.Font.Size = 9.5; $hFeat.TextFrame.TextRange.Font.Bold = -1; $hFeat.TextFrame.TextRange.Font.Color.RGB = $cWhite
    
    $hSt = $slide.Shapes.AddTextbox(1, $x + 356, $y + 3, 78, 22)
    $hSt.TextFrame.TextRange.Text = 'Jan 1 Plan'; $hSt.TextFrame.TextRange.Font.Name = 'Segoe UI'; $hSt.TextFrame.TextRange.Font.Size = 9.5; $hSt.TextFrame.TextRange.Font.Bold = -1; $hSt.TextFrame.TextRange.Font.Color.RGB = $cWhite
    
    $cy = $y + 26
    $idx = 0
    foreach ($it in $items) {
        $bg = if ($it.Status -match 'Shifted|Compromise') { $cAmberBg } elseif ($it.Status -match 'Live APIs|E2E') { $cPurpleBg } elseif ($it.Status -match 'Must Fix') { $cBlueBg } elseif ($idx % 2 -eq 1) { $cRowAlt } else { $cWhite }
        $stColor = if ($it.Status -match 'Shifted|Compromise') { $cAmber } elseif ($it.Status -match 'Live APIs|E2E') { $cPurple } elseif ($it.Status -match 'Must Fix') { $cBlueDark } else { $cGreen }
        
        $rBox = $slide.Shapes.AddShape(1, $x, $cy, $w, $rowH)
        $rBox.Fill.Solid(); $rBox.Fill.ForeColor.RGB = $bg; $rBox.Line.ForeColor.RGB = $cCardBrd
        
        $c1 = $slide.Shapes.AddTextbox(1, $x + 4, $cy + 3, 54, $rowH - 4)
        $c1.TextFrame.WordWrap = -1; $c1.TextFrame.TextRange.Text = $it.ID
        $c1.TextFrame.TextRange.Font.Name = 'Segoe UI'; $c1.TextFrame.TextRange.Font.Size = 9; $c1.TextFrame.TextRange.Font.Bold = -1; $c1.TextFrame.TextRange.Font.Color.RGB = $cBlueDark
        
        $c2 = $slide.Shapes.AddTextbox(1, $x + 60, $cy + 3, 114, $rowH - 4)
        $c2.TextFrame.WordWrap = -1; $c2.TextFrame.TextRange.Text = $it.Module
        $c2.TextFrame.TextRange.Font.Name = 'Segoe UI'; $c2.TextFrame.TextRange.Font.Size = 8.8; $c2.TextFrame.TextRange.Font.Color.RGB = $cTextMuted
        
        $c3 = $slide.Shapes.AddTextbox(1, $x + 176, $cy + 3, 178, $rowH - 4)
        $c3.TextFrame.WordWrap = -1; $c3.TextFrame.TextRange.Text = $it.Feature
        $c3.TextFrame.TextRange.Font.Name = 'Segoe UI'; $c3.TextFrame.TextRange.Font.Size = 8.8; $c3.TextFrame.TextRange.Font.Bold = -1; $c3.TextFrame.TextRange.Font.Color.RGB = $cTextDark
        
        $c4 = $slide.Shapes.AddTextbox(1, $x + 356, $cy + 3, 78, $rowH - 4)
        $c4.TextFrame.WordWrap = -1; $c4.TextFrame.TextRange.Text = $it.Status
        $c4.TextFrame.TextRange.Font.Name = 'Segoe UI'; $c4.TextFrame.TextRange.Font.Size = 8.3; $c4.TextFrame.TextRange.Font.Bold = -1; $c4.TextFrame.TextRange.Font.Color.RGB = $stColor
        
        $cy += $rowH
        $idx++
    }
}

# ==========================================
# SLIDE 1: TITLE SLIDE (JAN 1, 2027 TARGET)
# ==========================================
$slide1 = $pres.Slides.Add(1, 12)
$bg1 = $slide1.Shapes.AddShape(1, 0, 0, 960, 540)
$bg1.Fill.Solid(); $bg1.Fill.ForeColor.RGB = $cNavy; $bg1.Line.Visible = 0

$acc = $slide1.Shapes.AddShape(1, 56, 65, 6, 88)
$acc.Fill.Solid(); $acc.Fill.ForeColor.RGB = $cBlueLight; $acc.Line.Visible = 0

$t1 = $slide1.Shapes.AddTextbox(1, 76, 60, 830, 95)
$t1.TextFrame.WordWrap = -1
$r1 = $t1.TextFrame.TextRange
$r1.Text = "Arc-8 January 1, 2027 Completion Plan`nFull Live API Integration + Feature (F-*) & Gap (G-*) Breakdown"
$r1.Font.Name = 'Segoe UI'; $r1.Font.Size = 26; $r1.Font.Bold = -1; $r1.Font.Color.RGB = $cWhite

$sub1 = $slide1.Shapes.AddTextbox(1, 76, 165, 830, 45)
$sub1.TextFrame.WordWrap = -1
$rSub = $sub1.TextFrame.TextRange
$rSub.Text = "6-Week Execution Plan (Nov 19, 2026 – Jan 1, 2027) | Presenter: Syed Sana Ul Haq Fazli"
$rSub.Font.Name = 'Segoe UI'; $rSub.Font.Size = 14; $rSub.Font.Color.RGB = Color-RGB 148 163 184

$summaryBoxes = @(
    @{ Title = '1. ALREADY COVERED (51 F-* IDs)'; Sub = 'Freeze UI So Team Focuses on APIs'; Color = $cGreen;
       Body = "* 51 of 53 UI & backend features (F-01 to F-53) + 17-feed UHS SFTP parser are ALREADY built.`n* We freeze all UI screens as-built so 100% of engineering goes to Live APIs & Redis caching." },
    @{ Title = '2. MUST DO BY JAN 1 (APIs + 9 Gaps)'; Sub = 'No Compromise on Proper Live APIs'; Color = $cBlueLight;
       Body = "* Nov 19–25 (1 Wk): Fix 9 core data/admin gaps (G-01..G-07, G-09, G-10, G-16) + 30-Day Redis Hot Cache.`n* Nov 26–Dec 22 (4 Wks): Build all 6 Live Client API connectors (QNXT, Talkdesk, SSO, Abarca, CareAdvance, Labs/Titan/GL).`n* Dec 23–31: Real-data E2E & <500ms load test." },
    @{ Title = '3. COMPROMISED / SHIFTED FOR JAN 1'; Sub = 'Where We Save Time to Hit Jan 1'; Color = $cAmber;
       Body = "* Compromise 5 Low-Priority Cosmetic Gaps (G-11 to G-15: marketing copy, chat settings, role widget).`n* Strictly park all 9 Version 2 Features (V2-F01 to V2-F09: Ride Booking, Member Portal, 2-Way SMS, FHIR, Auto-Validated Savings, Direct EDI)." }
)

$bx = 56
foreach ($b in $summaryBoxes) {
    $card = $slide1.Shapes.AddShape(1, $bx, 232, 272, 255)
    $card.Fill.Solid(); $card.Fill.ForeColor.RGB = Color-RGB 30 41 59; $card.Line.ForeColor.RGB = $b.Color
    $top = $slide1.Shapes.AddShape(1, $bx, 232, 272, 6)
    $top.Fill.Solid(); $top.Fill.ForeColor.RGB = $b.Color; $top.Line.Visible = 0
    
    $tb = $slide1.Shapes.AddTextbox(1, $bx + 14, 244, 244, 234)
    $tb.TextFrame.WordWrap = -1
    $r = $tb.TextFrame.TextRange
    $r.Text = $b.Title + "`n" + $b.Sub + "`n`n" + $b.Body
    $r.Font.Name = 'Segoe UI'; $r.Font.Size = 11; $r.Font.Color.RGB = Color-RGB 226 232 240
    $r.Paragraphs(1).Font.Size = 13.5; $r.Paragraphs(1).Font.Bold = -1; $r.Paragraphs(1).Font.Color.RGB = $b.Color
    $r.Paragraphs(2).Font.Size = 10.5; $r.Paragraphs(2).Font.Bold = -1; $r.Paragraphs(2).Font.Color.RGB = Color-RGB 148 163 184
    $bx += 288
}

# ==========================================
# SLIDE 2: CONSOLIDATED FEATURES TABLE (PART 1: F-01 TO F-30)
# ==========================================
$slide2 = Create-Slide -title 'Consolidated Features List (Part 1: F-01 to F-30)' -subtitle 'BRD Section 5 — Clinical Operations, Patient Roster, Member 360, Tasks, Journeys & Risk'

$leftPart1 = @(
    @{ ID = 'F-01'; Module = 'Care Intelligence'; Feature = 'Operational KPI tiles'; Status = 'Covered' },
    @{ ID = 'F-02'; Module = 'Care Intelligence'; Feature = 'High-priority member list'; Status = 'Covered' },
    @{ ID = 'F-03'; Module = 'Care Intelligence'; Feature = 'Top risk drivers'; Status = 'Covered' },
    @{ ID = 'F-04'; Module = 'Care Intelligence'; Feature = 'Recent activity feed'; Status = 'Covered' },
    @{ ID = 'F-05'; Module = 'Care Intelligence'; Feature = 'Upcoming care actions'; Status = 'Covered' },
    @{ ID = 'F-06'; Module = 'Patient Roster'; Feature = 'Member roster'; Status = 'Covered' },
    @{ ID = 'F-07'; Module = 'Patient Roster'; Feature = 'Segment filters & sorting'; Status = 'Covered' },
    @{ ID = 'F-08'; Module = 'Member 360'; Feature = 'Header, PCP alert & screen-pop'; Status = 'Covered' },
    @{ ID = 'F-09'; Module = 'Member 360'; Feature = 'Unified timeline'; Status = 'Covered' },
    @{ ID = 'F-10'; Module = 'Member 360'; Feature = 'Notes (AI summary & @mention)'; Status = 'Covered' },
    @{ ID = 'F-11'; Module = 'Member 360'; Feature = 'Care journey workspace'; Status = 'Covered' },
    @{ ID = 'F-12'; Module = 'Member 360'; Feature = 'Clinical & HCC care gaps'; Status = 'Covered' },
    @{ ID = 'F-13'; Module = 'Member 360'; Feature = 'Medications (0-refill/PA) & labs'; Status = 'Covered' },
    @{ ID = 'F-14'; Module = 'Member 360'; Feature = 'Claims & Deductible/MOOP bars'; Status = 'Covered' },
    @{ ID = 'F-15'; Module = 'Member 360'; Feature = 'Member documents & email PDF'; Status = 'Covered' }
)

$rightPart1 = @(
    @{ ID = 'F-16'; Module = 'Member 360'; Feature = 'Member HIPAA audit log'; Status = 'Covered' },
    @{ ID = 'F-17'; Module = 'Member 360'; Feature = 'Member settings & profile'; Status = 'Covered' },
    @{ ID = 'F-18'; Module = 'Member 360'; Feature = '4-Domain risk dimensions'; Status = 'Covered' },
    @{ ID = 'F-19'; Module = 'Member 360'; Feature = 'Guided in-call triage'; Status = 'Covered' },
    @{ ID = 'F-20'; Module = 'Member 360'; Feature = 'Recommended care options'; Status = 'Covered' },
    @{ ID = 'F-21'; Module = 'Member 360'; Feature = 'Direct EDI payer submission'; Status = 'Shifted V2' },
    @{ ID = 'F-22'; Module = 'Clinical Tasks'; Feature = 'Cross-member task queue'; Status = 'Covered' },
    @{ ID = 'F-23'; Module = 'Clinical Tasks'; Feature = 'SBAR task creation'; Status = 'Covered' },
    @{ ID = 'F-24'; Module = 'Clinical Tasks'; Feature = 'Supervisor escalation queue'; Status = 'Covered' },
    @{ ID = 'F-25'; Module = 'Care Journeys'; Feature = 'Journey management'; Status = 'Covered' },
    @{ ID = 'F-26'; Module = 'Care Journeys'; Feature = 'Journey templates / playbooks'; Status = 'Covered' },
    @{ ID = 'F-27'; Module = 'Risk Intelligence'; Feature = 'Population risk analytics'; Status = 'Covered' },
    @{ ID = 'F-28'; Module = 'Care Options'; Feature = 'Steerage catalog'; Status = 'Covered' },
    @{ ID = 'F-29'; Module = 'Care Options'; Feature = 'Care option report'; Status = 'Covered' },
    @{ ID = 'F-30'; Module = 'Messages'; Feature = '2-Way SMS/Chat & Softphone'; Status = 'Shifted V2' }
)

Draw-FeatureTable -slide $slide2 -x 36 -y 80 -w 436 -items $leftPart1
Draw-FeatureTable -slide $slide2 -x 488 -y 80 -w 436 -items $rightPart1

# ==========================================
# SLIDE 3: CONSOLIDATED FEATURES TABLE (PART 2: F-31 TO F-53 + V2-F01 TO V2-F09)
# ==========================================
$slide3 = Create-Slide -title 'Consolidated Features List (Part 2: F-31 to F-53 & V2-F01 to V2-F09)' -subtitle 'BRD Section 5 & Section 13 — VBC Coding, Executive Dashboards, Data, Admin & Version 2 List'

$leftPart2 = @(
    @{ ID = 'F-31'; Module = 'Documents'; Feature = 'Cross-member document library'; Status = 'Covered' },
    @{ ID = 'F-32'; Module = 'VBC Coding'; Feature = 'Coding worklist (chases)'; Status = 'Covered' },
    @{ ID = 'F-33'; Module = 'VBC Coding'; Feature = 'Chase detail & coder audit'; Status = 'Covered' },
    @{ ID = 'F-34'; Module = 'VBC Coding'; Feature = 'Suspect workbench (HCC v28/MEAT)'; Status = 'Covered' },
    @{ ID = 'F-35'; Module = 'VBC Coding'; Feature = 'RAF & coding analytics'; Status = 'Covered' },
    @{ ID = 'F-36'; Module = 'Exec Dashboards'; Feature = 'Plan overview (Plan/4 Mkts/12 Grps)'; Status = 'Covered' },
    @{ ID = 'F-37'; Module = 'Exec Dashboards'; Feature = 'Plan financials (P&L / PMPM)'; Status = 'Covered' },
    @{ ID = 'F-38'; Module = 'Exec Dashboards'; Feature = 'Medical cost analytics'; Status = 'Covered' },
    @{ ID = 'F-39'; Module = 'Exec Dashboards'; Feature = 'Provider MLR & benchmarks (83%)'; Status = 'Covered' },
    @{ ID = 'F-40'; Module = 'Exec Dashboards'; Feature = 'Utilization & admits / 1,000'; Status = 'Covered' },
    @{ ID = 'F-41'; Module = 'Exec Dashboards'; Feature = 'Quality & CMS Star ratings'; Status = 'Covered' },
    @{ ID = 'F-42'; Module = 'Exec Dashboards'; Feature = 'Risk adjustment (RAF/eBUR/mBUR)'; Status = 'Covered' },
    @{ ID = 'F-43'; Module = 'Exec Dashboards'; Feature = 'Metric definitions & glossary'; Status = 'Covered' },
    @{ ID = 'F-44'; Module = 'Exec Dashboards'; Feature = 'Scenarios, filters & JSON datasets'; Status = 'Covered' },
    @{ ID = 'F-45'; Module = 'Provider Dir'; Feature = 'Provider search & geocode cache'; Status = 'Covered' },
    @{ ID = 'F-46'; Module = 'Data & ETL'; Feature = '17-Feed UHS SFTP & file imports'; Status = 'Covered' }
)

$rightPart2 = @(
    @{ ID = 'F-47'; Module = 'Data & ETL'; Feature = 'Job & status center'; Status = 'Covered' },
    @{ ID = 'F-48'; Module = 'Governance'; Feature = 'Live admin (tenant config)'; Status = 'Covered' },
    @{ ID = 'F-49'; Module = 'Governance'; Feature = 'Role & privileges (12-role RBAC)'; Status = 'Covered' },
    @{ ID = 'F-50'; Module = 'Governance'; Feature = 'Master admin console'; Status = 'Covered' },
    @{ ID = 'F-51'; Module = 'Platform'; Feature = 'Platform settings (theme/i18n)'; Status = 'Covered' },
    @{ ID = 'F-52'; Module = 'Platform'; Feature = 'Command palette (Ctrl+K) & nav'; Status = 'Covered' },
    @{ ID = 'F-53'; Module = 'Platform'; Feature = 'Searchable Docs library'; Status = 'Covered' },
    @{ ID = 'V2-F01'; Module = 'Version 2 NEMT'; Feature = 'Medical ride scheduling'; Status = 'Shifted V2' },
    @{ ID = 'V2-F02'; Module = 'Version 2 NEMT'; Feature = 'Transport partner management'; Status = 'Shifted V2' },
    @{ ID = 'V2-F03'; Module = 'Version 2 NEMT'; Feature = 'Nightly payment reconciliation'; Status = 'Shifted V2' },
    @{ ID = 'V2-F04'; Module = 'Version 2 NEMT'; Feature = 'Member ride visibility'; Status = 'Shifted V2' },
    @{ ID = 'V2-F05'; Module = 'Version 2 Portal'; Feature = 'Member self-service portal'; Status = 'Shifted V2' },
    @{ ID = 'V2-F06'; Module = 'Version 2 Comms'; Feature = '2-Way SMS/Chat & Talkdesk widget'; Status = 'Shifted V2' },
    @{ ID = 'V2-F07'; Module = 'Version 2 Data'; Feature = 'External FHIR R4 OAuth & Virgin'; Status = 'Shifted V2' },
    @{ ID = 'V2-F08'; Module = 'Version 2 Finance'; Feature = 'Claims-validated steerage savings'; Status = 'Shifted V2' },
    @{ ID = 'V2-F09'; Module = 'Version 2 Coding'; Feature = 'Direct EDI / MAO-004 submission'; Status = 'Shifted V2' }
)

Draw-FeatureTable -slide $slide3 -x 36 -y 80 -w 436 -items $leftPart2
Draw-FeatureTable -slide $slide3 -x 488 -y 80 -w 436 -items $rightPart2

# ==========================================
# SLIDE 4: CONSOLIDATED G-* LIST (G-01 TO G-16 + LIVE APIS + REDIS CACHE)
# ==========================================
$slide4 = Create-Slide -title 'Observed Gaps (G-01..G-16), Live APIs & Redis Cache — Jan 1 Plan' -subtitle 'Which Items Are Must-Do vs. Which Cosmetic Items We Compromise to Hit Jan 1, 2027'

$gapsLeftOrdered = @(
    @{ ID = 'G-01'; Module = 'Data Quality (High)'; Feature = 'Unify MEM (0-100) & PROM (0-3) risk scores to 0-100'; Status = 'Must Fix (W1)' },
    @{ ID = 'G-02'; Module = 'Identity / MPI (High)'; Feature = 'Deduplicate test records + QNXT MPI matching'; Status = 'Must Fix (W1)' },
    @{ ID = 'G-03'; Module = 'Live Admin (High)'; Feature = 'Seed default journey templates, rules & queues'; Status = 'Must Fix (W1)' },
    @{ ID = 'G-04'; Module = 'Master Admin (High)'; Feature = 'Fix role validator to accept all 12 RBAC roles'; Status = 'Must Fix (W1)' },
    @{ ID = 'G-05'; Module = 'Savings Metric (Med)'; Feature = 'Align Dashboard ($23k) & Care Options ($109k) SQL'; Status = 'Must Fix (W1)' },
    @{ ID = 'G-06'; Module = 'Task Metric (Med)'; Feature = 'Align Overdue Tasks (96 vs 99) on shared SQL query'; Status = 'Must Fix (W1)' },
    @{ ID = 'G-07'; Module = 'Provider Dir (Med)'; Feature = 'Link 17-feed SFTP member & gap counts to Directory'; Status = 'Must Fix (W1)' },
    @{ ID = 'G-08'; Module = '6 Live APIs (Critical)'; Feature = 'Connect QNXT, Talkdesk, Abarca, CareAdv, Titan, GL'; Status = 'Live APIs (W2-5)' },
    @{ ID = 'FR-DAT-02'; Module = 'Redis Cache (Critical)'; Feature = 'Wire 30-Day Redis Hot Cache for live API responses'; Status = 'Must Fix (W1)' }
)

$gapsRightOrdered = @(
    @{ ID = 'G-09'; Module = 'Care Gaps (Med)'; Feature = 'Replace generic gap labels with HEDIS & ICD-10'; Status = 'Must Fix (W1)' },
    @{ ID = 'G-10'; Module = 'RAF Analytics (Med)'; Feature = 'Calibrate RAF target (3.00 -> 1.25) & funnel %'; Status = 'Must Fix (W1)' },
    @{ ID = 'G-11'; Module = 'Coding EDI (Low)'; Feature = 'Hide Submit to Payer button (Moved to V2-F09)'; Status = 'Compromise' },
    @{ ID = 'G-12'; Module = 'Settings UX (Low)'; Feature = 'Hide unused AI-chat settings tabs (15-min hide)'; Status = 'Compromise' },
    @{ ID = 'G-13'; Module = 'Role Preview (Low)'; Feature = 'Demo role-preview widget (Skip: real RBAC works)'; Status = 'Compromise' },
    @{ ID = 'G-14'; Module = 'Docs Library (Low)'; Feature = 'Upload existing PDF manual (0 code changes)'; Status = 'Compromise' },
    @{ ID = 'G-15'; Module = 'Marketing Site (Low)'; Feature = 'Public landing page stats (Skip: internal staff app)'; Status = 'Compromise' },
    @{ ID = 'G-16'; Module = 'Compliance (High)'; Feature = 'Change badge to Built for HIPAA / SOC-2 In Progress'; Status = 'Must Fix (W1)' },
    @{ ID = 'NFR-01'; Module = 'E2E & Speed (Critical)'; Feature = 'Real-data E2E across all 6 APIs & <500ms load test'; Status = 'E2E (W6)' }
)

Draw-FeatureTable -slide $slide4 -x 36 -y 84 -w 436 -items $gapsLeftOrdered -rowH 42 -col2Header 'Area (Severity)' -col3Header 'Item & Jan 1 Action'
Draw-FeatureTable -slide $slide4 -x 488 -y 84 -w 436 -items $gapsRightOrdered -rowH 42 -col2Header 'Area (Severity)' -col3Header 'Item & Jan 1 Action'

# ==========================================
# SLIDE 5: SUMMARY BREAKDOWN — COVERED vs. MUST-COVER BY JAN 1 vs. COMPROMISED/SHIFTED
# ==========================================
$slide5 = Create-Slide -title 'Jan 1, 2027 Breakdown: Covered vs. Must-Cover vs. Compromised' -subtitle 'How We Deliver Full Proper API Integration by Jan 1 Without Missing the Deadline'

$cols = @(
    @{ Title = '1. ALREADY COVERED (51 F-* IDs)';
       Sub = 'UI & Core Backend Frozen As-Built';
       Color = $cGreen;
       Body = "* All 51 V1 UI/Backend Features Built:`n  - Care Intelligence & Roster (F-01..F-07)`n  - Member 360 Cockpit & 8 Tabs (F-08..F-20)`n  - SBAR Tasks & Escalations (F-22..F-24)`n  - Care Journeys & 4-Domain Risk (F-25..F-29)`n  - VBC Coding & RAF Analytics (F-32..F-35)`n  - 8-Tab Executive Payer Console (F-36..F-44)`n  - Provider Dir, 17-Feed SFTP, 12-Role RBAC (F-45..F-53)`n`n" +
              "* Inbound Upsert Layer Already Built:`n  - DB tables (m360_*, coding_*) and upsert functions (import_members, claims, meds, labs, problems, risk) are ready to receive live API data." },
    @{ Title = '2. MUST COVER BY JAN 1, 2027';
       Sub = '6 Live Client APIs + Redis Cache + 9 Gaps';
       Color = $cBlueLight;
       Body = "WEEK 1 (Nov 19 – Nov 25):`n" +
              "* Fix 9 Core Data/Admin Gaps (G-01..G-07, G-09, G-10, G-16)`n" +
              "* Wire 30-Day Redis Hot Cache (FR-DAT-02) to cache live API responses for <500ms speed.`n`n" +
              "WEEKS 2–5 (Nov 26 – Dec 22) — 6 LIVE APIs (G-08):`n" +
              "1. Live QNXT APIs (Eligibility, Claims, Accumulators, MPI)`n" +
              "2. Live Talkdesk Webhook & AI Call-Summary API`n" +
              "3. Client Production Enterprise SSO (OIDC/SAML)`n" +
              "4. Live Abarca PBM API (Rx, 0-refills, Prior Auths)`n" +
              "5. Live CareAdvance Two-Way Journey Sync API`n" +
              "6. Live Clinical Labs, Project Titan MRA & Clarity/GL Finance APIs`n`n" +
              "WEEK 6 (Dec 23 – Dec 31):`n" +
              "* Full Real-Data E2E & <500ms Load Test -> Jan 1 Launch." },
    @{ Title = '3. COMPROMISED / SHIFTED';
       Sub = 'Dropped from Jan 1 Scope to Save Time';
       Color = $cAmber;
       Body = "COMPROMISED COSMETIC GAPS (0 Dev Days):`n" +
              "* G-11: Hide 'Submit to Payer' button (Moved to V2)`n" +
              "* G-12: Hide generic AI-chat tabs in Settings`n" +
              "* G-13: Skip demo Role-Preview widget (real RBAC works)`n" +
              "* G-14: Upload existing PDF manual to Docs Library`n" +
              "* G-15: Skip public marketing website placeholder stats`n`n" +
              "SHIFTED TO VERSION 2 (V2-F01 to V2-F09):`n" +
              "* V2-F01..04: NEMT Medical Ride Booking`n" +
              "* V2-F05: Member Self-Service Portal`n" +
              "* V2-F06 (F-30): 2-Way SMS Inbox & Browser Softphone`n" +
              "* V2-F07: External Hospital FHIR R4 OAuth & Virgin Risk`n" +
              "* V2-F08: Automated Claims-Validated Steerage Savings`n" +
              "* V2-F09 (F-21): Direct Outbound CMS EDI Submission" }
)

$cx = 36
foreach ($col in $cols) {
    $card = $slide5.Shapes.AddShape(1, $cx, 82, 285, 422)
    $card.Fill.Solid(); $card.Fill.ForeColor.RGB = $cCardBg; $card.Line.ForeColor.RGB = $col.Color
    $top = $slide5.Shapes.AddShape(1, $cx, 82, 285, 6)
    $top.Fill.Solid(); $top.Fill.ForeColor.RGB = $col.Color; $top.Line.Visible = 0
    
    $tb = $slide5.Shapes.AddTextbox(1, $cx + 12, 92, 261, 404)
    $tb.TextFrame.WordWrap = -1
    $r = $tb.TextFrame.TextRange
    $r.Text = $col.Title + "`n" + $col.Sub + "`n`n" + $col.Body
    $r.Font.Name = 'Segoe UI'; $r.Font.Size = 9.5; $r.Font.Color.RGB = $cTextDark
    $r.Paragraphs(1).Font.Size = 13; $r.Paragraphs(1).Font.Bold = -1; $r.Paragraphs(1).Font.Color.RGB = $col.Color
    $r.Paragraphs(2).Font.Size = 9.5; $r.Paragraphs(2).Font.Bold = -1; $r.Paragraphs(2).Font.Color.RGB = $cTextMuted
    $cx += 301
}

# ==========================================
# SLIDE 6: COMPRESSED 6-WEEK SCHEDULE TO HIT JANUARY 1, 2027
# ==========================================
$slide6 = Create-Slide -title 'Compressed 6-Week Schedule to Launch on January 1, 2027' -subtitle 'Full Proper API Integration + Must-Fix Gaps Completed by Dec 31, 2026'

$rows = @(
    @{ Col1 = 'Phase / Sprint'; Col2 = '2026 Dates'; Col3 = 'Duration'; Col4 = 'Exact Features (F-*), Gaps (G-*) & Live APIs Delivered'; Header = $true },
    @{ Col1 = 'Baseline (Done)'; Col2 = 'Completed Today'; Col3 = 'Done'; Col4 = '51 Active V1 Features Built (F-01..F-20, F-22..F-29, F-31..F-53) + 17-Feed UHS SFTP Parser + Inbound Upsert Services'; Header = $false },
    @{ Col1 = 'Week 1: Core Gaps & Redis Cache'; Col2 = 'Nov 19 – Nov 25'; Col3 = '1 Week'; Col4 = 'Fix 9 Must-Fix Gaps (G-01..G-07, G-09, G-10, G-16), Hide G-11/G-12, Skip G-13..G-15 + Wire 30-Day Redis Hot Cache (FR-DAT-02)'; Header = $false },
    @{ Col1 = 'Weeks 2–3: Live APIs (Part 1)'; Col2 = 'Nov 26 – Dec 9'; Col3 = '2 Weeks'; Col4 = 'Proper API Integration Pt 1 (G-08): Live QNXT APIs (Eligibility, Claims, Accumulators, MPI), Live Talkdesk Webhook/AI Summary API & Prod SSO'; Header = $false },
    @{ Col1 = 'Weeks 4–5: Live APIs (Part 2)'; Col2 = 'Dec 10 – Dec 22'; Col3 = '2 Weeks'; Col4 = 'Proper API Integration Pt 2 (G-08): Live Abarca PBM API (Rx/0-Refills/PA), CareAdvance Sync API, Clinical Labs, Project Titan MRA & Clarity/GL Finance APIs'; Header = $false },
    @{ Col1 = 'Week 6: Real-Data E2E & Go-Live'; Col2 = 'Dec 23 – Dec 31'; Col3 = '1.5 Weeks'; Col4 = 'Full Real-Data E2E Verification across all 6 Live APIs, <500ms Search / <2s Redis Hot-Cache Load Test (NFR-01) -> JAN 1, 2027 LAUNCH'; Header = $false },
    @{ Col1 = 'Post-Jan 1 (Version 2)'; Col2 = 'After Jan 1, 2027'; Col3 = 'Phase 2'; Col4 = 'Shifted V2 Modules (V2-F01..V2-F09: NEMT Ride Booking, Member Portal, 2-Way SMS/Softphone, External FHIR R4, Validated Savings, Direct CMS EDI)'; Header = $false }
)

$ty = 92
foreach ($row in $rows) {
    $h = if ($row.Header) { 36 } else { 56 }
    $bgColor = if ($row.Header) { $cBlueDark } else { $cCardBg }
    $txtColor = if ($row.Header) { $cWhite } else { $cTextDark }
    
    $rBox = $slide6.Shapes.AddShape(1, 36, $ty, 888, $h)
    $rBox.Fill.Solid(); $rBox.Fill.ForeColor.RGB = $bgColor; $rBox.Line.ForeColor.RGB = $cCardBrd
    
    $c1 = $slide6.Shapes.AddTextbox(1, 44, $ty + 8, 175, $h - 12)
    $c1.TextFrame.WordWrap = -1; $c1.TextFrame.TextRange.Text = $row.Col1
    $c1.TextFrame.TextRange.Font.Name = 'Segoe UI'; $c1.TextFrame.TextRange.Font.Size = 11; $c1.TextFrame.TextRange.Font.Bold = -1; $c1.TextFrame.TextRange.Font.Color.RGB = $txtColor
    
    $c2 = $slide6.Shapes.AddTextbox(1, 224, $ty + 8, 130, $h - 12)
    $c2.TextFrame.WordWrap = -1; $c2.TextFrame.TextRange.Text = $row.Col2
    $c2.TextFrame.TextRange.Font.Name = 'Segoe UI'; $c2.TextFrame.TextRange.Font.Size = 11; $c2.TextFrame.TextRange.Font.Bold = -1; $c2.TextFrame.TextRange.Font.Color.RGB = $txtColor
    
    $c3 = $slide6.Shapes.AddTextbox(1, 358, $ty + 8, 95, $h - 12)
    $c3.TextFrame.WordWrap = -1; $c3.TextFrame.TextRange.Text = $row.Col3
    $c3.TextFrame.TextRange.Font.Name = 'Segoe UI'; $c3.TextFrame.TextRange.Font.Size = 11; $c3.TextFrame.TextRange.Font.Bold = -1
    $c3.TextFrame.TextRange.Font.Color.RGB = if ($row.Header) { $cWhite } else { $cGreen }
    
    $c4 = $slide6.Shapes.AddTextbox(1, 458, $ty + 8, 458, $h - 12)
    $c4.TextFrame.WordWrap = -1; $c4.TextFrame.TextRange.Text = $row.Col4
    $c4.TextFrame.TextRange.Font.Name = 'Segoe UI'; $c4.TextFrame.TextRange.Font.Size = 10.5; $c4.TextFrame.TextRange.Font.Color.RGB = $txtColor
    if ($row.Header) { $c4.TextFrame.TextRange.Font.Bold = -1 }
    
    $ty += ($h + 4)
}

$pres.SaveAs($outPptx)
$pres.Close()
$ppt.Quit()

Write-Host "Updated Jan 1, 2027 Full API Integration Presentation generated at: $outPptx"
