# Builds docs/Arc-8_Executive_Team_Summary_Deck.pptx using PowerPoint COM.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$outPptx = Join-Path $root 'docs\Arc-8_Executive_Team_Summary_Deck.pptx'

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
$cGreen     = Color-RGB 22 101 52     # #166534
$cCardBg    = Color-RGB 248 250 252   # #F8FAFC
$cCardBrd   = Color-RGB 203 213 225   # #CBD5E1
$cTextDark  = Color-RGB 30 41 59      # #1E293B
$cTextMuted = Color-RGB 100 116 139   # #64748B
$cWhite     = Color-RGB 255 255 255   # #FFFFFF

function Create-Slide([string]$title, [string]$subtitle) {
    $slide = $pres.Slides.Add($pres.Slides.Count + 1, 12)
    
    # Header banner
    $banner = $slide.Shapes.AddShape(1, 0, 0, 960, 75)
    $banner.Fill.Solid()
    $banner.Fill.ForeColor.RGB = $cNavy
    $banner.Line.Visible = 0
    
    # Subtitle / Category tag
    $tag = $slide.Shapes.AddTextbox(1, 40, 8, 880, 18)
    $tag.TextFrame.WordWrap = -1
    $tag.TextFrame.MarginLeft = 0; $tag.TextFrame.MarginTop = 0
    $tr = $tag.TextFrame.TextRange
    $tr.Text = $subtitle.ToUpper()
    $tr.Font.Name = 'Segoe UI'
    $tr.Font.Size = 10
    $tr.Font.Bold = -1
    $tr.Font.Color.RGB = $cBlueLight
    
    # Title
    $tb = $slide.Shapes.AddTextbox(1, 40, 26, 880, 42)
    $tb.TextFrame.WordWrap = -1
    $tb.TextFrame.MarginLeft = 0; $tb.TextFrame.MarginTop = 0
    $tr2 = $tb.TextFrame.TextRange
    $tr2.Text = $title
    $tr2.Font.Name = 'Segoe UI'
    $tr2.Font.Size = 22
    $tr2.Font.Bold = -1
    $tr2.Font.Color.RGB = $cWhite
    
    # Footer
    $ft = $slide.Shapes.AddTextbox(1, 40, 512, 880, 20)
    $ft.TextFrame.WordWrap = -1
    $ft.TextFrame.MarginLeft = 0; $ft.TextFrame.MarginTop = 0
    $ftr = $ft.TextFrame.TextRange
    $ftr.Text = 'Arc-8 Platform (Member 360) | Prominence Health MVP | 5-Minute Executive Briefing for CEO'
    $ftr.Font.Name = 'Segoe UI'
    $ftr.Font.Size = 9
    $ftr.Font.Color.RGB = $cTextMuted
    
    return $slide
}

# ==========================================
# SLIDE 1: TITLE SLIDE
# ==========================================
$slide1 = $pres.Slides.Add(1, 12)
$bg1 = $slide1.Shapes.AddShape(1, 0, 0, 960, 540)
$bg1.Fill.Solid()
$bg1.Fill.ForeColor.RGB = $cNavy
$bg1.Line.Visible = 0

$acc = $slide1.Shapes.AddShape(1, 60, 75, 6, 85)
$acc.Fill.Solid()
$acc.Fill.ForeColor.RGB = $cBlueLight
$acc.Line.Visible = 0

$t1 = $slide1.Shapes.AddTextbox(1, 80, 70, 820, 95)
$t1.TextFrame.WordWrap = -1
$r1 = $t1.TextFrame.TextRange
$r1.Text = "Arc-8 Platform: Executive Team Progress Summary`nSprint 1 Deliverables by Workstream"
$r1.Font.Name = 'Segoe UI'
$r1.Font.Size = 30
$r1.Font.Bold = -1
$r1.Font.Color.RGB = $cWhite

$sub1 = $slide1.Shapes.AddTextbox(1, 80, 185, 820, 60)
$sub1.TextFrame.WordWrap = -1
$rSub = $sub1.TextFrame.TextRange
$rSub.Text = "Prominence Health MVP (SOW No. 3) | 5-Minute CEO Executive Briefing`nStatus: Live on AWS | 100% QA Bugs Closed | Demo-Ready"
$rSub.Font.Name = 'Segoe UI'
$rSub.Font.Size = 15
$rSub.Font.Color.RGB = Color-RGB 148 163 184

$mc = $slide1.Shapes.AddShape(1, 80, 275, 800, 200)
$mc.Fill.Solid()
$mc.Fill.ForeColor.RGB = Color-RGB 30 41 59
$mc.Line.ForeColor.RGB = Color-RGB 51 65 85

$mt = $slide1.Shapes.AddTextbox(1, 105, 290, 750, 170)
$mt.TextFrame.WordWrap = -1
$rMeta = $mt.TextFrame.TextRange
$rMeta.Text = "TEAM ROSTER & PRESENTERS`n`n" +
              "* Technical & Architecture Lead: Syed Sana Ul Haq Fazli (Presenter)`n" +
              "* Senior DevOps Lead: Shaheer Sarwar (Cloud & Infrastructure)`n" +
              "* Data Architecture Lead: Ramesh Muralasetty (Database & Synthetic Data)`n" +
              "* Senior QA Lead: Shahzad Sultan (Quality Assurance & Test Automation)`n" +
              "* Project Lead: Wayne White | Client Stakeholders: Jimmy (Call Center Lead)"
$rMeta.Font.Name = 'Segoe UI'
$rMeta.Font.Size = 13
$rMeta.Font.Color.RGB = Color-RGB 226 232 240
$rMeta.Paragraphs(1).Font.Bold = -1
$rMeta.Paragraphs(1).Font.Color.RGB = $cBlueLight

# ==========================================
# SLIDE 2: THE 4 BIG WINS AT A GLANCE
# ==========================================
$slide2 = Create-Slide -title 'Overall Delivery at a Glance — The 4 Big Wins' -subtitle 'Executive Summary'

$wins = @(
    @{ Stat = '100%'; Sub = 'AWS Migration'; Desc = 'Decoupled from Azure. Production, Dev (:7777), and QA (:7778) live on AWS with CloudFront HTTPS.'; Color = $cBlueDark },
    @{ Stat = '6 Roles'; Sub = 'Healthcare RBAC'; Desc = 'Tailored personas for Prominence with in-app Role & Privileges Manager to toggle tabs with zero code.'; Color = $cBlueLight },
    @{ Stat = '10 / 10'; Sub = 'QA Defects Closed'; Desc = '100% pass rate on verified audit defects. 167 automated Pytest suite passing green.'; Color = $cGreen },
    @{ Stat = '288 Lines'; Sub = 'User Manual Ready'; Desc = 'Comprehensive System User Manual (Word .docx) delivered for client onboarding and UAT.'; Color = $cBlueDark }
)

$wx = 40
foreach ($w in $wins) {
    $card = $slide2.Shapes.AddShape(1, $wx, 110, 203, 370)
    $card.Fill.Solid()
    $card.Fill.ForeColor.RGB = $cCardBg
    $card.Line.ForeColor.RGB = $cCardBrd
    
    $topLine = $slide2.Shapes.AddShape(1, $wx, 110, 203, 6)
    $topLine.Fill.Solid()
    $topLine.Fill.ForeColor.RGB = $w.Color
    $topLine.Line.Visible = 0
    
    $tb = $slide2.Shapes.AddTextbox(1, $wx + 12, 130, 179, 330)
    $tb.TextFrame.WordWrap = -1
    $r = $tb.TextFrame.TextRange
    $r.Text = $w.Stat + "`n" + $w.Sub + "`n`n" + $w.Desc
    $r.Font.Name = 'Segoe UI'
    $r.Font.Size = 12
    $r.Font.Color.RGB = $cTextDark
    $r.Paragraphs(1).Font.Size = 24
    $r.Paragraphs(1).Font.Bold = -1
    $r.Paragraphs(1).Font.Color.RGB = $w.Color
    $r.Paragraphs(2).Font.Size = 13
    $r.Paragraphs(2).Font.Bold = -1
    $r.Paragraphs(2).Font.Color.RGB = $cTextDark
    
    $wx += 225
}

# ==========================================
# SLIDE 3: TECH LEAD SUMMARY (SYED FAZLI)
# ==========================================
$slide3 = Create-Slide -title 'Architecture & Full-Stack Engineering' -subtitle 'Workstream Summary: Syed Sana Fazli (Technical Lead)'

$cardsSyed = @(
    @{ Title = 'Decoupled from Azure (Jira SP1-01)';
       Points = "* Stripped out Azure Key Vault, Blob Storage, and Entra ID.`n* Rebuilt backend storage using Amazon S3 for member documents.`n* Solved dynamic multi-port API routing across local, dev, and QA." },
    @{ Title = 'Enterprise OIDC Auth & RBAC (SP1-02)';
       Points = "* Built JWT authentication with corporate OIDC / Cognito support.`n* Enforced strict deny-by-default role and tenant isolation.`n* Created 6 healthcare personas tailored specifically for Prominence." },
    @{ Title = 'Zero-Code Role & Privileges Manager';
       Points = "* Interactive admin UI allowing management to customize access.`n* Admins can toggle any sidebar module or chart tab via checkboxes.`n* Instant permission updates with zero code deployments." },
    @{ Title = 'Arc-8 Rebranding & UI Polish';
       Points = "* Completely cleaned out legacy 'Nexora' naming from code and DB.`n* High-contrast Light Mode (for call center clarity) plus Dark Mode.`n* Live multi-language translation (English, Spanish, French)." }
)

$sx = 40; $sy = 110; $sidx = 0
foreach ($c in $cardsSyed) {
    $card = $slide3.Shapes.AddShape(1, $sx, $sy, 425, 175)
    $card.Fill.Solid()
    $card.Fill.ForeColor.RGB = $cCardBg
    $card.Line.ForeColor.RGB = $cCardBrd
    
    $tb = $slide3.Shapes.AddTextbox(1, $sx + 15, $sy + 12, 395, 150)
    $tb.TextFrame.WordWrap = -1
    $r = $tb.TextFrame.TextRange
    $r.Text = $c.Title + "`n" + $c.Points
    $r.Font.Name = 'Segoe UI'
    $r.Font.Size = 12
    $r.Font.Color.RGB = $cTextDark
    $r.Paragraphs(1).Font.Size = 14
    $r.Paragraphs(1).Font.Bold = -1
    $r.Paragraphs(1).Font.Color.RGB = $cBlueDark
    
    $sidx++
    if ($sidx -eq 2) { $sx = 40; $sy = 305 } else { $sx += 455 }
}

# ==========================================
# SLIDE 4: DEVOPS SUMMARY (SHAHEER SARWAR)
# ==========================================
$slide4 = Create-Slide -title 'Cloud Infrastructure & CI/CD Pipelines' -subtitle 'Workstream Summary: Shaheer Sarwar (Senior DevOps Lead)'

$cardsDevOps = @(
    @{ Title = 'AWS Cloud Infrastructure (Jira SP1-05)';
       Points = "* Migrated entire server stack to AWS EC2 (16.59.20.139).`n* Provisioned isolated VPC networking, subnets, and security groups.`n* Configured PostgreSQL 16 database and Redis 7 cache server.`n* Created Amazon S3 buckets for HIPAA-compliant document storage." },
    @{ Title = 'Multi-Environment Isolation';
       Points = "* Dev Environment: Running on port :7777 for active engineering.`n* QA Testing Environment: Running on port :7778 for QA audits.`n* Backend Core: Running on port :8989 with HTTP 200 health checks.`n* CloudFront CDN: High-speed edge delivery at arc8-mvp.site." },
    @{ Title = '1-Click Automated Deployments (SP1-06)';
       Points = "* Created deploy-aws.ps1: Compiles frontend, packages tarballs, syncs via SCP.`n* Restarts containers, runs database migrations, and verifies uptime.`n* Deploys full updates to the AWS server in under 2 minutes." },
    @{ Title = 'OIDC Security & QA Enablement';
       Points = "* GitHub Actions OIDC Federation: Zero static AWS secret keys in code.`n* Automated CI security gates: Code linting, unit tests, and Trivy scans.`n* Configured SSH tunneling (arc8-key.pem) unblocking remote QA testers." }
)

$dx = 40; $dy = 110; $didx = 0
foreach ($c in $cardsDevOps) {
    $card = $slide4.Shapes.AddShape(1, $dx, $dy, 425, 175)
    $card.Fill.Solid()
    $card.Fill.ForeColor.RGB = $cCardBg
    $card.Line.ForeColor.RGB = $cCardBrd
    
    $tb = $slide4.Shapes.AddTextbox(1, $dx + 15, $dy + 12, 395, 150)
    $tb.TextFrame.WordWrap = -1
    $r = $tb.TextFrame.TextRange
    $r.Text = $c.Title + "`n" + $c.Points
    $r.Font.Name = 'Segoe UI'
    $r.Font.Size = 12
    $r.Font.Color.RGB = $cTextDark
    $r.Paragraphs(1).Font.Size = 14
    $r.Paragraphs(1).Font.Bold = -1
    $r.Paragraphs(1).Font.Color.RGB = $cBlueDark
    
    $didx++
    if ($didx -eq 2) { $dx = 40; $dy = 305 } else { $dx += 455 }
}

# ==========================================
# SLIDE 5: DATA LEAD SUMMARY (RAMESH)
# ==========================================
$slide5 = Create-Slide -title 'Data Architecture & Domain Modeling' -subtitle 'Workstream Summary: Ramesh Muralasetty (Data Lead)'

$cardsData = @(
    @{ Title = 'PostgreSQL 16 Schema Migrations';
       Points = "* Replaced committed local SQLite files with formal PostgreSQL 16 schemas.`n* All tenant tables (m360_*) managed under automated Alembic migrations.`n* Zero schema drift across local, dev, and production databases." },
    @{ Title = 'Prominence Synthetic Dataset (v1)';
       Points = "* Seeded realistic member cohorts matching Prominence Health business rules.`n* QNXT Medical Claims: Inpatient, ER, and Outpatient claim records.`n* Abarca PBM Pharmacy: Medication fill history, days supply, and adherence." },
    @{ Title = 'HIPAA Audit Immutability';
       Points = "* Built tamper-evident audit logging table (tenant_audit_events).`n* Records every view, export, and record change with actor ID, IP, and timestamp.`n* Database-level immutability preventing any modification of audit trails." },
    @{ Title = 'Ready for External Feeds (SFTP / ETL)';
       Points = "* Common Data Model ready to ingest real Prominence SFTP files.`n* Designed to link Provider-to-Facility many-to-many relationships by NPI.`n* Structured staging tables prepared for claims (837/QNXT) and pharmacy fills." }
)

$rx = 40; $ry = 110; $ridx = 0
foreach ($c in $cardsData) {
    $card = $slide5.Shapes.AddShape(1, $rx, $ry, 425, 175)
    $card.Fill.Solid()
    $card.Fill.ForeColor.RGB = $cCardBg
    $card.Line.ForeColor.RGB = $cCardBrd
    
    $tb = $slide5.Shapes.AddTextbox(1, $rx + 15, $ry + 12, 395, 150)
    $tb.TextFrame.WordWrap = -1
    $r = $tb.TextFrame.TextRange
    $r.Text = $c.Title + "`n" + $c.Points
    $r.Font.Name = 'Segoe UI'
    $r.Font.Size = 12
    $r.Font.Color.RGB = $cTextDark
    $r.Paragraphs(1).Font.Size = 14
    $r.Paragraphs(1).Font.Bold = -1
    $r.Paragraphs(1).Font.Color.RGB = $cBlueDark
    
    $ridx++
    if ($ridx -eq 2) { $rx = 40; $ry = 305 } else { $rx += 455 }
}

# ==========================================
# SLIDE 6: QA LEAD SUMMARY (SHAHZAD)
# ==========================================
$slide6 = Create-Slide -title 'Quality Assurance & Defect Resolution' -subtitle 'Workstream Summary: Shahzad Sultan (Senior QA Lead)'

$cardsQA = @(
    @{ Title = '10 / 10 QA Audit Defects Closed';
       Points = "* 100% resolution of verified audit defects across two rounds (BUG-01 to BUG-10).`n* Fixed RBAC route guards on Coding and Admin screens.`n* Verified S3 document uploads, downloads, and inline browser PDF viewing.`n* Validated Light Mode styling and multi-language translation coverage." },
    @{ Title = 'Automated Test Regression Suite';
       Points = "* 167 Pytest automated unit and integration tests passing green on AWS.`n* Jest component test suite guarding Member 360 frontend layouts.`n* Validated tenant isolation so one organization can never see another tenant's data." },
    @{ Title = 'Isolated Test Environment Support';
       Points = "* Maintained and validated test builds on dedicated AWS port :7778.`n* Confirmed zero regressions between Dev (:7777) and QA (:7778).`n* Verified sub-second response times on member profile retrieval." },
    @{ Title = 'Tester User Manual Delivered';
       Points = "* Authored docs/TESTER_USER_MANUAL.md for testing procedures.`n* Documented SSH tunneling, credentials, role switching, and bug reporting.`n* Clean bill of health for Sprint 1 exit." }
)

$qx = 40; $qy = 110; $qidx = 0
foreach ($c in $cardsQA) {
    $card = $slide6.Shapes.AddShape(1, $qx, $qy, 425, 175)
    $card.Fill.Solid()
    $card.Fill.ForeColor.RGB = $cCardBg
    $card.Line.ForeColor.RGB = $cCardBrd
    
    $tb = $slide6.Shapes.AddTextbox(1, $qx + 15, $qy + 12, 395, 150)
    $tb.TextFrame.WordWrap = -1
    $r = $tb.TextFrame.TextRange
    $r.Text = $c.Title + "`n" + $c.Points
    $r.Font.Name = 'Segoe UI'
    $r.Font.Size = 12
    $r.Font.Color.RGB = $cTextDark
    $r.Paragraphs(1).Font.Size = 14
    $r.Paragraphs(1).Font.Bold = -1
    $r.Paragraphs(1).Font.Color.RGB = $cBlueDark
    
    $qidx++
    if ($qidx -eq 2) { $qx = 40; $qy = 305 } else { $qx += 455 }
}

# ==========================================
# SLIDE 7: PRODUCT & BUSINESS VALUE (MEMBER 360)
# ==========================================
$slide7 = Create-Slide -title 'Product Delivery: The Member 360 Call Center Solution' -subtitle 'Business Impact: Prominence Health Call Center'

$prodCards = @(
    @{ Title = 'Built for ~60k Calls / Month'; Color = $cBlueDark;
       Body = "* Replaced 5-6 disconnected systems with ONE screen.`n* Sub-second search by Member ID, Name, Phone, or Benefit Plan.`n* Cuts 15-minute data-hunting times down to seconds." },
    @{ Title = 'Talkdesk Screen-Pop & Red Flags'; Color = $cBlueLight;
       Body = "* Incoming call deep linking (?memberId=) pops member record instantly.`n* Missing PCP Alert: Prompts agent to assign doctor during call.`n* Open Care Gaps Count: Closes clinical and CMS revenue gaps.`n* 0-Refill Medication Alert: Protects CMS Star ratings." },
    @{ Title = 'Simplified 4-Tab Workspace'; Color = $cGreen;
       Body = "* Cleaned 15 confusing tabs down to 4 advocate tabs:`n  1. Overview & Timeline: Chronological touchpoint history.`n  2. Claims & Accumulators: Deductible & MOOP progress.`n  3. Notes & Tasks: Call logs & nurse follow-up tasks.`n  4. S3 Documents: Send forms by email instead of paper." }
)

$px2 = 40
foreach ($p in $prodCards) {
    $card = $slide7.Shapes.AddShape(1, $px2, 110, 273, 370)
    $card.Fill.Solid()
    $card.Fill.ForeColor.RGB = $cCardBg
    $card.Line.ForeColor.RGB = $cCardBrd
    
    $topLine = $slide7.Shapes.AddShape(1, $px2, 110, 273, 6)
    $topLine.Fill.Solid()
    $topLine.Fill.ForeColor.RGB = $p.Color
    $topLine.Line.Visible = 0
    
    $tb = $slide7.Shapes.AddTextbox(1, $px2 + 15, 130, 243, 330)
    $tb.TextFrame.WordWrap = -1
    $r = $tb.TextFrame.TextRange
    $r.Text = $p.Title + "`n`n" + $p.Body
    $r.Font.Name = 'Segoe UI'
    $r.Font.Size = 12
    $r.Font.Color.RGB = $cTextDark
    $r.Paragraphs(1).Font.Size = 15
    $r.Paragraphs(1).Font.Bold = -1
    $r.Paragraphs(1).Font.Color.RGB = $p.Color
    
    $px2 += 293
}

# ==========================================
# SLIDE 8: DECISIONS FOR THE CEO & NEXT STEPS
# ==========================================
$slide8 = Create-Slide -title 'Immediate Next Steps & Leadership Decisions' -subtitle 'Action Items for the CEO'

$nextItems = @(
    @{ Num = '1'; Title = 'Client Data Feeds (ETL / SFTP)';
       Desc = 'Schedule technical SME session with Prominence data team to finalize sample schemas for QNXT medical claims and Abarca pharmacy fill files.' },
    @{ Num = '2'; Title = 'Confirm Advocate Tab Presets';
       Desc = 'Confirm locking call center advocates (Clara Diaz) to the simplified 4-tab Member 360 view on Day 1, while preserving full clinical tabs for nurses.' },
    @{ Num = '3'; Title = 'Sensitive Record Visibility Rules';
       Desc = 'Confirm 42 CFR Part 2 and behavioral health record partitioning between general Member Services advocates and licensed clinical staff.' },
    @{ Num = '4'; Title = 'Sprint 4: Email Document Integration (Cut $1M Printing Cost)';
       Desc = 'Deploy Amazon SES transactional email dispatch so advocates can email documents to members with 1 click instead of mailing paper.' }
)

$ny2 = 110
foreach ($n in $nextItems) {
    $card = $slide8.Shapes.AddShape(1, 40, $ny2, 880, 85)
    $card.Fill.Solid()
    $card.Fill.ForeColor.RGB = $cCardBg
    $card.Line.ForeColor.RGB = $cCardBrd
    
    $pill = $slide8.Shapes.AddShape(1, 55, $ny2 + 18, 50, 50)
    $pill.Fill.Solid()
    $pill.Fill.ForeColor.RGB = $cBlueDark
    $pill.Line.Visible = 0
    $ptb = $slide8.Shapes.AddTextbox(1, 55, $ny2 + 25, 50, 40)
    $ptr = $ptb.TextFrame.TextRange
    $ptr.Text = $n.Num
    $ptr.Font.Name = 'Segoe UI'
    $ptr.Font.Size = 20
    $ptr.Font.Bold = -1
    $ptr.Font.Color.RGB = $cWhite
    $ptr.ParagraphFormat.Alignment = 2
    
    $tb = $slide8.Shapes.AddTextbox(1, 120, $ny2 + 12, 785, 65)
    $tb.TextFrame.WordWrap = -1
    $r = $tb.TextFrame.TextRange
    $r.Text = $n.Title + "`n" + $n.Desc
    $r.Font.Name = 'Segoe UI'
    $r.Font.Size = 11.5
    $r.Font.Color.RGB = $cTextDark
    $r.Paragraphs(1).Font.Size = 13.5
    $r.Paragraphs(1).Font.Bold = -1
    $r.Paragraphs(1).Font.Color.RGB = $cBlueLight
    
    $ny2 += 95
}

$pres.SaveAs($outPptx)
$pres.Close()
$ppt.Quit()

Write-Host "Executive Summary Deck generated at: $outPptx"
