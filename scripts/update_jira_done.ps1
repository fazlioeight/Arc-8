$token = "ATATT3xFfGF0tHRbQ9VADQES-RoRi3egsAzs0Uqcig5UqQCx2Ko6Dwhx7mEfILz_P8TRHf4oley91MLUTlcrK8IBsKvk5_zYgQSalpGsqRpZErfwefJNG72jguH5T8mwwVYM-R6spWOm3nTs7hGLh6o4B-8756a419L5a7G6mdstEK5ASW8f52g=F867C376"
$email = "syed.fazli@oeight.io"
$domain = "altdigitalmsp"
$pair = "$($email):$($token)"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($pair)
$b64 = [System.Convert]::ToBase64String($bytes)
$headers = @{
    Authorization = "Basic $b64"
    Accept = "application/json"
    "Content-Type" = "application/json"
}

$fixes = @{
    "A8S-103" = "Resolved: Increased tasks fetch ceiling (PAGE_SIZE = 500) in Member360LabTasksPage.js and expanded backend /tasks query limit to 1000 in backend/app/routes/member360.py. All newly created tasks (IDs 116+) are now completely retrieved, searchable, and filterable."
    "A8S-104" = "Resolved: Implemented trimmed body validation in Member360LabWorkspace.js submitDialog and ActionDialog before dispatch. Added server-side validation in backend/app/schemas/member360.py (min_length=1) and backend/app/routes/member360.py rejecting empty or whitespace note submissions with HTTP 400."
    "A8S-105" = "Resolved: Added RBAC permission mapping across all primary actions in Member360LabWorkspace.js. Restricted Billing and Compliance Auditor roles from mutation actions, and scoped Coder role strictly to authorized note operations."
    "A8S-106" = "Resolved: Corrected Diagnosed Conditions & HCC tab header badge expression in Member360LabWorkspace.js to check problems/diagnoses array length (detail?.problems?.length ?? detail?.diagnoses?.length ?? 0), accurately reflecting active diagnoses count."
    "A8S-107" = "Resolved: Removed container-level row click triggers in RolePrivilegesManager.js for both modules and sub-permissions. Replaced passive indicators with explicit toggle switch buttons requiring deliberate clicks to prevent accidental privilege modifications."
    "A8S-108" = "Resolved: Updated initial Care Journeys badge in PortalSidebar.js to 19 and configured real-time synchronization with active journeys count from /api/member360/dashboard."
    "A8S-109" = "Resolved: Replaced static badge count 36 in PortalSidebar.js with live synchronization to open task metrics (open_tasks, 89) from /api/member360/dashboard."
    "A8S-110" = "Resolved: Implemented case-insensitive domain matching in Member360LabRiskIntelligencePage.js so capitalized dropdown filter options cleanly match lowercased risk insight records."
    "A8S-111" = "Resolved: Added clinical, utilization, cost, and engagement risk scores to MemberSummary schema and _summarize_member service. Updated Member360LabRiskIntelligencePage.js to compute and render non-zero average domain scores and high-risk counts."
    "A8S-112" = "Resolved: Added input constraints (type='number', min, max, step) and strict client-side validation in Member360LabWorkspace.js restricting Quality score to 0.0-5.0 and ensuring non-negative costs. Enforced server-side validation ranges via Pydantic Field constraints in backend/app/schemas/member360.py."
}

$keys = @("A8S-103", "A8S-104", "A8S-105", "A8S-106", "A8S-107", "A8S-108", "A8S-109", "A8S-110", "A8S-111", "A8S-112")

foreach ($k in $keys) {
    $comment = $fixes[$k]
    
    # 1. Add resolution comment
    $commentObj = @{
        body = @{
            type = "doc"
            version = 1
            content = @(
                @{
                    type = "paragraph"
                    content = @(
                        @{
                            type = "text"
                            text = $comment
                        }
                    )
                }
            )
        }
    }
    $commentJson = ConvertTo-Json -InputObject $commentObj -Depth 5
    
    try {
        $null = Invoke-RestMethod -Uri "https://$domain.atlassian.net/rest/api/3/issue/$k/comment" -Method POST -Headers $headers -Body $commentJson
        Write-Host "Comment added to $k"
    } catch {
        Write-Host "Failed to add comment to $k - $($_.Exception.Message)"
    }
    
    # 2. Transition to Done (transition id 31)
    $transObj = @{
        transition = @{ id = "31" }
    }
    $transJson = ConvertTo-Json -InputObject $transObj -Depth 3
    
    try {
        $null = Invoke-RestMethod -Uri "https://$domain.atlassian.net/rest/api/3/issue/$k/transitions" -Method POST -Headers $headers -Body $transJson
        Write-Host "Transitioned $k -> Done"
    } catch {
        Write-Host "Failed to transition $k - $($_.Exception.Message)"
    }
}
