# Builds docs/Arc-8_Executive_Technical_Lead_Presentation.pptx using PowerPoint COM.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$outPptx = Join-Path $root 'docs\Arc-8_Executive_Technical_Lead_Presentation.pptx'

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

function Create-Slide([string]$title, [string]$category) {
    $slide = $pres.Slides.Add($pres.Slides.Count + 1, 12)
    
    # Header banner
    $banner = $slide.Shapes.AddShape(1, 0, 0, 960, 80)
    $banner.Fill.Solid()
    $banner.Fill.ForeColor.RGB = $cNavy
    $banner.Line.Visible = 0
    
    # Category tag
    $tag = $slide.Shapes.AddTextbox(1, 40, 10, 880, 20)
    $tag.TextFrame.WordWrap = -1
    $tag.TextFrame.MarginLeft = 0; $tag.TextFrame.MarginTop = 0
    $tr = $tag.TextFrame.TextRange
    $tr.Text = $category.ToUpper()
    $tr.Font.Name = 'Segoe UI'
    $tr.Font.Size = 10
    $tr.Font.Bold = -1
    $tr.Font.Color.RGB = $cBlueLight
    
    # Slide Title
    $tb = $slide.Shapes.AddTextbox(1, 40, 30, 880, 40)
    $tb.TextFrame.WordWrap = -1
    $tb.TextFrame.MarginLeft = 0; $tb.TextFrame.MarginTop = 0
    $tr2 = $tb.TextFrame.TextRange
    $tr2.Text = $title
    $tr2.Font.Name = 'Segoe UI'
    $tr2.Font.Size = 22
    $tr2.Font.Bold = -1
    $tr2.Font.Color.RGB = $cWhite
    
    # Footer
    $ft = $slide.Shapes.AddTextbox(1, 40, 510, 880, 20)
    $ft.TextFrame.WordWrap = -1
    $ft.TextFrame.MarginLeft = 0; $ft.TextFrame.MarginTop = 0
    $ftr = $ft.TextFrame.TextRange
    $ftr.Text = 'Arc-8 Platform (Member 360) | Prominence Health MVP (SOW No. 3) | Confidential - For CEO Review'
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
$r1.Text = "Arc-8 Enterprise Health Platform`nExecutive Architecture and Sprint Progress"
$r1.Font.Name = 'Segoe UI'
$r1.Font.Size = 32
$r1.Font.Bold = -1
$r1.Font.Color.RGB = $cWhite

$sub1 = $slide1.Shapes.AddTextbox(1, 80, 185, 820, 60)
$sub1.TextFrame.WordWrap = -1
$rSub = $sub1.TextFrame.TextRange
$rSub.Text = "Executive Briefing for the CEO | Prominence Health First Inc. (SOW No. 3)`nSingle Pane of Glass for Call Center Advocates, Nurses and Operations"
$rSub.Font.Name = 'Segoe UI'
$rSub.Font.Size = 15
$rSub.Font.Color.RGB = Color-RGB 148 163 184

$mc = $slide1.Shapes.AddShape(1, 80, 285, 800, 190)
$mc.Fill.Solid()
$mc.Fill.ForeColor.RGB = Color-RGB 30 41 59
$mc.Line.ForeColor.RGB = Color-RGB 51 65 85

$mt = $slide1.Shapes.AddTextbox(1, 105, 305, 750, 150)
$mt.TextFrame.WordWrap = -1
$rMeta = $mt.TextFrame.TextRange
$rMeta.Text = "ENGINEERING LEADERSHIP TEAM`n" +
              "* Technical and Architecture Lead: Syed Sana Ul Haq Fazli`n" +
              "* Senior DevOps Lead: Shaheer Sarwar`n" +
              "* Data Architecture Lead: Ramesh Muralasetty | Senior QA Lead: Shahzad Sultan`n" +
              "* Project Lead: Wayne White | Key Client Stakeholders: Jimmy (Call Center Lead), Rabeel`n" +
              "* Current Status: AWS Live at arc8-mvp.site | 10/10 QA Audit Defects Closed | Demo-Ready"
$rMeta.Font.Name = 'Segoe UI'
$rMeta.Font.Size = 13
$rMeta.Font.Color.RGB = Color-RGB 226 232 240
$rMeta.Paragraphs(1).Font.Bold = -1
$rMeta.Paragraphs(1).Font.Color.RGB = $cBlueLight

# ==========================================
# SLIDE 2: EXECUTIVE SUMMARY
# ==========================================
$slide2 = Create-Slide -title 'Executive Summary — Where Arc-8 Stands Today' -category 'Platform Status'

$cards2 = @(
    @{ Title = '1. AWS Infrastructure Live'; Color = $cBlueDark;
       Body = "* Completely decoupled from legacy Azure systems.`n* Production, Dev (:7777), and QA (:7778) live on AWS EC2 and CloudFront.`n* Multi-tenant AWS S3 document storage active.`n* 1-click automated build and deployment scripts." },
    @{ Title = '2. Prominence Call Center Tailored'; Color = $cBlueLight;
       Body = "* Member 360 unified single pane (<1 second load time).`n* Cluttered 15-tab legacy interface reduced to 4 streamlined advocate tabs.`n* Incoming call Talkdesk screen-pop (?memberId=).`n* Real-time alerts: Missing PCP, Care Gaps, 0-Refills." },
    @{ Title = '3. Enterprise Ready and Verified'; Color = $cGreen;
       Body = "* 6 validated Prominence personas live in RBAC.`n* Interactive in-app Role and Privileges Manager.`n* 10/10 verified QA audit defects closed.`n* 288-line System User Manual delivered for UAT.`n* Zero critical blockers; 100% demo-ready." }
)

$x2 = 40
foreach ($c in $cards2) {
    $card = $slide2.Shapes.AddShape(1, $x2, 110, 273, 370)
    $card.Fill.Solid()
    $card.Fill.ForeColor.RGB = $cCardBg
    $card.Line.ForeColor.RGB = $cCardBrd
    
    $topLine = $slide2.Shapes.AddShape(1, $x2, 110, 273, 6)
    $topLine.Fill.Solid()
    $topLine.Fill.ForeColor.RGB = $c.Color
    $topLine.Line.Visible = 0
    
    $tb = $slide2.Shapes.AddTextbox(1, $x2 + 15, 130, 243, 330)
    $tb.TextFrame.WordWrap = -1
    $r = $tb.TextFrame.TextRange
    $r.Text = $c.Title + "`n`n" + $c.Body
    $r.Font.Name = 'Segoe UI'
    $r.Font.Size = 12
    $r.Font.Color.RGB = $cTextDark
    $r.Paragraphs(1).Font.Size = 15
    $r.Paragraphs(1).Font.Bold = -1
    $r.Paragraphs(1).Font.Color.RGB = $c.Color
    
    $x2 += 293
}

# ==========================================
# SLIDE 3: CLOUD & DEVOPS (SHAHEER)
# ==========================================
$slide3 = Create-Slide -title 'Cloud Infrastructure and CI/CD Automation' -category 'DevOps Workstream (Shaheer Sarwar)'

$dCards = @(
    @{ Title = 'AWS Infrastructure and Network (Jira SP1-05)'; X = 40; Y = 110; W = 425; H = 180;
       Body = "* Migrated entire stack from Azure to dedicated AWS instance (16.59.20.139).`n* Provisioned isolated VPC, subnets, and secure firewall security groups.`n* Configured PostgreSQL 16 relational database and Redis 7 caching service.`n* Set up multi-tenant Amazon S3 storage for member documents and claims EOBs." },
    @{ Title = 'Multi-Environment Isolation'; X = 495; Y = 110; W = 425; H = 180;
       Body = "* Dev Workspace: Running on port :7777 for active engineering.`n* QA Testing Workspace: Running on port :7778 for test verification.`n* FastAPI Backend Core: Running on port :8989 with HTTP 200 health checks.`n* CloudFront CDN: High-speed edge distribution for hosted web traffic." },
    @{ Title = '1-Click CI/CD Deployment Script (SP1-06)'; X = 40; Y = 310; W = 425; H = 170;
       Body = "* Built deploy-aws.ps1: Compiles React frontend, creates tarball, syncs via SCP.`n* Restarts services automatically and verifies /health/live status in seconds.`n* Zero-downtime updates with automated database migrations and seeds." },
    @{ Title = 'OIDC Security and QA Enablement'; X = 495; Y = 310; W = 425; H = 170;
       Body = "* GitHub Actions OIDC Federation: Zero static AWS secret keys in repository.`n* Automated CI security gates: Code linting, unit test validation, and Trivy scans.`n* Configured secure SSH tunneling (arc8-key.pem) unblocking remote QA testers." }
)

foreach ($c in $dCards) {
    $card = $slide3.Shapes.AddShape(1, $c.X, $c.Y, $c.W, $c.H)
    $card.Fill.Solid()
    $card.Fill.ForeColor.RGB = $cCardBg
    $card.Line.ForeColor.RGB = $cCardBrd
    
    $tb = $slide3.Shapes.AddTextbox(1, $c.X + 15, $c.Y + 12, $c.W - 30, $c.H - 24)
    $tb.TextFrame.WordWrap = -1
    $r = $tb.TextFrame.TextRange
    $r.Text = $c.Title + "`n" + $c.Body
    $r.Font.Name = 'Segoe UI'
    $r.Font.Size = 11.5
    $r.Font.Color.RGB = $cTextDark
    $r.Paragraphs(1).Font.Size = 13.5
    $r.Paragraphs(1).Font.Bold = -1
    $r.Paragraphs(1).Font.Color.RGB = $cBlueDark
}

# ==========================================
# SLIDE 4: ARCHITECTURE & SECURITY (SYED)
# ==========================================
$slide4 = Create-Slide -title 'Platform Architecture, Auth and Security' -category 'Engineering Leadership (Syed Sana Fazli)'

$aCards = @(
    @{ Title = 'Decoupled Azure Dependencies (Jira SP1-01)'; X = 40; Y = 110; W = 425; H = 180;
       Body = "* Refactored backend config and services, completely removing Azure Key Vault, Azure Blob, and Azure Entra ID dependencies.`n* Implemented S3Backend storage provider for multi-tenant document handling.`n* Solved dynamic multi-port API resolution connecting frontend to :8989 across both local, dev (:7777), and QA (:7778)." },
    @{ Title = 'Enterprise OIDC SSO and RBAC Engine (SP1-02)'; X = 495; Y = 110; W = 425; H = 180;
       Body = "* Built enterprise JWT verification supporting AWS Cognito / corporate OIDC with automatic IdP group-to-role resolution.`n* Strict Deny-by-Default security: Unmapped or cross-tenant requests blocked.`n* Implemented immutable HIPAA audit event triggers (tenant_audit_events).`n* Dynamic tenant switching with authentic session tokens." },
    @{ Title = 'Zero-Code Role and Privileges Manager'; X = 40; Y = 310; W = 425; H = 170;
       Body = "* Built in-app interactive administrative control panel.`n* Empowers leadership/administrators to toggle access to any sidebar module or Member 360 chart tab via checkboxes in real time.`n* Immediate permission enforcement without requiring code changes or redeployments." },
    @{ Title = 'Full Arc-8 Rebranding and UI Accessibility'; X = 495; Y = 310; W = 425; H = 170;
       Body = "* Thoroughly purged legacy Nexora identifiers from backend routes, models, frontend components, and databases.`n* Created high-contrast Light Theme for call center clarity alongside Dark Mode.`n* Implemented in-app multi-language localization (English, Spanish, French)." }
)

foreach ($c in $aCards) {
    $card = $slide4.Shapes.AddShape(1, $c.X, $c.Y, $c.W, $c.H)
    $card.Fill.Solid()
    $card.Fill.ForeColor.RGB = $cCardBg
    $card.Line.ForeColor.RGB = $cCardBrd
    
    $tb = $slide4.Shapes.AddTextbox(1, $c.X + 15, $c.Y + 12, $c.W - 30, $c.H - 24)
    $tb.TextFrame.WordWrap = -1
    $r = $tb.TextFrame.TextRange
    $r.Text = $c.Title + "`n" + $c.Body
    $r.Font.Name = 'Segoe UI'
    $r.Font.Size = 11.5
    $r.Font.Color.RGB = $cTextDark
    $r.Paragraphs(1).Font.Size = 13.5
    $r.Paragraphs(1).Font.Bold = -1
    $r.Paragraphs(1).Font.Color.RGB = $cBlueDark
}

# ==========================================
# SLIDE 5: 6 PROMINENCE HEALTH PERSONAS
# ==========================================
$slide5 = Create-Slide -title 'Prominence Health Role-Based Personas (RBAC Live)' -category 'Clinical Governance'

$personas = @(
    @{ Role = 'Clara Diaz, RN'; Sub = 'Care Coordinator / Advocate';
       Perms = 'Lands directly on Member 360. Simplified view: Roster, Overview, Claims, Notes, Documents. Blocked from Admin and HIPAA Audit Logs.' },
    @{ Role = 'Elena Rostova, RN'; Sub = 'Clinical Care Nurse';
       Perms = 'Full clinical chart access: Post-discharge care journeys, condition care gaps, medication adherence, and lab results.' },
    @{ Role = 'Marcus Vance, MHA'; Sub = 'Operations Supervisor';
       Perms = 'Supervisory command center: High-risk escalations queue, record sharing controls, team task reassignment, and platform settings.' },
    @{ Role = 'David Hayes, CHC'; Sub = 'HIPAA Compliance Auditor';
       Perms = 'Full audit log and access trail visibility. Enforced read-only backend: Any attempt to modify clinical data is blocked with HTTP 403.' },
    @{ Role = 'Victoria Reed'; Sub = 'Business Administrator';
       Perms = 'Operational management: User directory, licensing allotment, and routing rules. Strictly blocked from authoring clinical charts.' },
    @{ Role = 'Alexandra Vance'; Sub = 'System Administrator';
       Perms = 'Master system control: Manages user accounts and uses the interactive Role and Privileges Manager to customize menu and tab permissions.' }
)

$px = 40; $py = 110; $idx = 0
foreach ($p in $personas) {
    $card = $slide5.Shapes.AddShape(1, $px, $py, 273, 175)
    $card.Fill.Solid()
    $card.Fill.ForeColor.RGB = $cCardBg
    $card.Line.ForeColor.RGB = $cCardBrd
    
    $tb = $slide5.Shapes.AddTextbox(1, $px + 12, $py + 10, 249, 155)
    $tb.TextFrame.WordWrap = -1
    $r = $tb.TextFrame.TextRange
    $r.Text = $p.Role + "`n" + $p.Sub + "`n`n" + $p.Perms
    $r.Font.Name = 'Segoe UI'
    $r.Font.Size = 11
    $r.Font.Color.RGB = $cTextDark
    $r.Paragraphs(1).Font.Size = 13
    $r.Paragraphs(1).Font.Bold = -1
    $r.Paragraphs(1).Font.Color.RGB = $cBlueDark
    $r.Paragraphs(2).Font.Size = 10
    $r.Paragraphs(2).Font.Color.RGB = $cBlueLight
    
    $idx++
    if ($idx -eq 3) {
        $px = 40; $py = 305
    } else {
        $px += 293
    }
}

# ==========================================
# SLIDE 6: MEMBER 360 WORKFLOW
# ==========================================
$slide6 = Create-Slide -title 'Member 360 — Purpose-Built Call Center Workflow' -category 'Product and Business Value'

$wfCards = @(
    @{ Step = '1. Sub-Second Search and Screen-Pop'; Color = $cBlueDark;
       Body = "* Instant search by Member ID, Name, Phone, or Plan.`n* Talkdesk incoming call deep linking (?memberId=) pops member chart automatically.`n* Eliminates 15-minute search times across disconnected portals." },
    @{ Step = '2. Call-Time Red Flag Alerts'; Color = $cBlueLight;
       Body = "* Missing PCP Alert: Prompts agent to assign doctor during call.`n* Open Care Gaps Count: Closes clinical and CMS revenue gaps.`n* 0-Refill Medication Warning: Prevents medication drop-off and protects CMS Star ratings." },
    @{ Step = '3. Streamlined 4-Tab Workspace'; Color = $cGreen;
       Body = "* Overview and Timeline: Chronological touchpoint and call history.`n* Claims and Accumulators: Deductible and Max Out-of-Pocket progress bars.`n* Notes and Tasks: Paste Talkdesk AI summaries; create follow-up tasks.`n* Documents: Preview and download member forms backed by AWS S3." }
)

$wx = 40
foreach ($w in $wfCards) {
    $card = $slide6.Shapes.AddShape(1, $wx, 110, 273, 370)
    $card.Fill.Solid()
    $card.Fill.ForeColor.RGB = $cCardBg
    $card.Line.ForeColor.RGB = $cCardBrd
    
    $topLine = $slide6.Shapes.AddShape(1, $wx, 110, 273, 6)
    $topLine.Fill.Solid()
    $topLine.Fill.ForeColor.RGB = $w.Color
    $topLine.Line.Visible = 0
    
    $tb = $slide6.Shapes.AddTextbox(1, $wx + 15, 130, 243, 330)
    $tb.TextFrame.WordWrap = -1
    $r = $tb.TextFrame.TextRange
    $r.Text = $w.Step + "`n`n" + $w.Body
    $r.Font.Name = 'Segoe UI'
    $r.Font.Size = 12
    $r.Font.Color.RGB = $cTextDark
    $r.Paragraphs(1).Font.Size = 15
    $r.Paragraphs(1).Font.Bold = -1
    $r.Paragraphs(1).Font.Color.RGB = $w.Color
    
    $wx += 293
}

# ==========================================
# SLIDE 7: DATA & QA
# ==========================================
$slide7 = Create-Slide -title 'Data Architecture and Quality Assurance Sign-Off' -category 'Delivery and Quality'

$qCards = @(
    @{ Title = 'PostgreSQL and Synthetic Data (Ramesh Muralasetty)'; X = 40; Y = 110; W = 425; H = 180;
       Body = "* Migrated domain entities to PostgreSQL 16 managed under formal Alembic migrations.`n* Replaced local SQLite databases with realistic multi-tenant data schemas.`n* Seeded complete Prominence synthetic cohort (QNXT claims, Abarca PBM fills, diagnoses).`n* Implemented immutable HIPAA audit event tables (tenant_audit_events)." },
    @{ Title = '10/10 QA Audit Defects Resolved (Shahzad Sultan)'; X = 495; Y = 110; W = 425; H = 180;
       Body = "* Closed 100% of verified QA audit defects across two intensive testing rounds (BUG-01 to BUG-10).`n* Resolved RBAC route guards on Coding and Admin pages.`n* Fixed S3 document upload/download and inline browser PDF viewing.`n* Corrected Light Mode styling consistency and i18n translation coverage." },
    @{ Title = 'Automated Test Regression Suite'; X = 40; Y = 310; W = 425; H = 170;
       Body = "* 167 Pytest automated integration and unit test suite verified green on AWS.`n* Jest component test suite guarding Member 360 UI components.`n* Validated cross-tenant data isolation and RBAC token switching." },
    @{ Title = 'Secure Tester Environment Support'; X = 495; Y = 310; W = 425; H = 170;
       Body = "* Maintained isolated testing port (:7778) on AWS EC2.`n* Established SSH tunnel access and credentials documentation for QA testers.`n* Delivered comprehensive Tester User Manual (docs/TESTER_USER_MANUAL.md)." }
)

foreach ($c in $qCards) {
    $card = $slide7.Shapes.AddShape(1, $c.X, $c.Y, $c.W, $c.H)
    $card.Fill.Solid()
    $card.Fill.ForeColor.RGB = $cCardBg
    $card.Line.ForeColor.RGB = $cCardBrd
    
    $tb = $slide7.Shapes.AddTextbox(1, $c.X + 15, $c.Y + 12, $c.W - 30, $c.H - 24)
    $tb.TextFrame.WordWrap = -1
    $r = $tb.TextFrame.TextRange
    $r.Text = $c.Title + "`n" + $c.Body
    $r.Font.Name = 'Segoe UI'
    $r.Font.Size = 11.5
    $r.Font.Color.RGB = $cTextDark
    $r.Paragraphs(1).Font.Size = 13.5
    $r.Paragraphs(1).Font.Bold = -1
    $r.Paragraphs(1).Font.Color.RGB = $cBlueDark
}

# ==========================================
# SLIDE 8: DELIVERABLES & USER MANUAL
# ==========================================
$slide8 = Create-Slide -title 'Completed Handover Artifacts and Client Manuals' -category 'Documentation and Governance'

$mCards = @(
    @{ Title = 'Arc-8 System User Manual (v2.0)'; X = 40; Y = 110; W = 425; H = 180;
       Body = "* Authored 288-line comprehensive guide (USER_MANUAL.md and Arc-8_User_Manual.docx).`n* Covers step-by-step sign-in, OIDC SSO, 15-minute HIPAA auto-lock screen, and password resets.`n* Complete operational walkthrough for Member 360, Care Journeys, Claims, and S3 Documents.`n* Detailed Administrator guides for User Directory and Role Allotment." },
    @{ Title = 'Formal SOW Engineering Deliverables'; X = 495; Y = 110; W = 425; H = 180;
       Body = "* Deliverable D1: Architecture Discovery and 3R Assessment (Reuse, Refactor, Rebuild).`n* Deliverable D2: Solution Design, Security Architecture and RTM v1.0.`n* Target AWS Architecture ADR-001 (#4889).`n* Functional Requirements Document (FRD) and Role Validation Brief." },
    @{ Title = 'Presentation and Training Assets'; X = 40; Y = 310; W = 425; H = 170;
       Body = "* Arc-8 Status Presentation Notebook (ARC8_STATUS_PRESENTATION_NOTEBOOK.md).`n* Team Presentation Deck outline based on 58-minute client walkthrough.`n* Tester Credentials Guide and environment troubleshooting procedures." },
    @{ Title = 'Readiness for Client UAT'; X = 495; Y = 310; W = 425; H = 170;
       Body = "* Documentation aligned with Jimmy and Wayne call center operational goals.`n* Structured to enable rapid Prominence staff onboarding with zero engineering overhead.`n* Ready to be shared directly with Prominence Health executive leadership." }
)

foreach ($c in $mCards) {
    $card = $slide8.Shapes.AddShape(1, $c.X, $c.Y, $c.W, $c.H)
    $card.Fill.Solid()
    $card.Fill.ForeColor.RGB = $cCardBg
    $card.Line.ForeColor.RGB = $cCardBrd
    
    $tb = $slide8.Shapes.AddTextbox(1, $c.X + 15, $c.Y + 12, $c.W - 30, $c.H - 24)
    $tb.TextFrame.WordWrap = -1
    $r = $tb.TextFrame.TextRange
    $r.Text = $c.Title + "`n" + $c.Body
    $r.Font.Name = 'Segoe UI'
    $r.Font.Size = 11.5
    $r.Font.Color.RGB = $cTextDark
    $r.Paragraphs(1).Font.Size = 13.5
    $r.Paragraphs(1).Font.Bold = -1
    $r.Paragraphs(1).Font.Color.RGB = $cBlueDark
}

# ==========================================
# SLIDE 9: NEXT STEPS & DECISIONS
# ==========================================
$slide9 = Create-Slide -title 'Next Steps and Decisions with Leadership' -category 'Executive Roadmap'

$nCards = @(
    @{ Num = '1'; Title = 'Confirm Care Advocate Tab Presets';
       Body = 'Confirm locking Clara Diaz (Care Coordinator) to the simplified 4-tab Member 360 view (Overview, Claims, Notes, Documents) on Day 1, while preserving full clinical tabs for Nurses and Supervisors.' },
    @{ Num = '2'; Title = 'Prominence Client Data Feeds (ETL / SFTP)';
       Body = 'Schedule technical SME session with Ramesh and Prominence data engineers to finalize sample schemas for QNXT medical claims and Abarca pharmacy fill files.' },
    @{ Num = '3'; Title = 'Sensitive Record Visibility Rules';
       Body = 'Confirm 42 CFR Part 2 and behavioral health record partitioning between general Member Services advocates and licensed clinical staff.' },
    @{ Num = '4'; Title = 'Sprint 4: Email Document Integration';
       Body = 'Implement Amazon SES transactional email dispatch for 1-click member document sending, directly addressing Prominence $1,000,000 annual printing cost.' }
)

$ny = 110
foreach ($n in $nCards) {
    $card = $slide9.Shapes.AddShape(1, 40, $ny, 880, 85)
    $card.Fill.Solid()
    $card.Fill.ForeColor.RGB = $cCardBg
    $card.Line.ForeColor.RGB = $cCardBrd
    
    $pill = $slide9.Shapes.AddShape(1, 55, $ny + 18, 50, 50)
    $pill.Fill.Solid()
    $pill.Fill.ForeColor.RGB = $cBlueDark
    $pill.Line.Visible = 0
    $ptb = $slide9.Shapes.AddTextbox(1, 55, $ny + 25, 50, 40)
    $ptr = $ptb.TextFrame.TextRange
    $ptr.Text = $n.Num
    $ptr.Font.Name = 'Segoe UI'
    $ptr.Font.Size = 20
    $ptr.Font.Bold = -1
    $ptr.Font.Color.RGB = $cWhite
    $ptr.ParagraphFormat.Alignment = 2
    
    $tb = $slide9.Shapes.AddTextbox(1, 120, $ny + 12, 785, 65)
    $tb.TextFrame.WordWrap = -1
    $r = $tb.TextFrame.TextRange
    $r.Text = $n.Title + "`n" + $n.Body
    $r.Font.Name = 'Segoe UI'
    $r.Font.Size = 11.5
    $r.Font.Color.RGB = $cTextDark
    $r.Paragraphs(1).Font.Size = 13.5
    $r.Paragraphs(1).Font.Bold = -1
    $r.Paragraphs(1).Font.Color.RGB = $cBlueLight
    
    $ny += 95
}

$pres.SaveAs($outPptx)
$pres.Close()
$ppt.Quit()

Write-Host "Presentation successfully generated at: $outPptx"
