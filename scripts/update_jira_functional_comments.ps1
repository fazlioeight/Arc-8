$token = "ATATT3xFfGF0tHRbQ9VADQES-RoRi3egsAzs0Uqcig5UqQCx2Ko6Dwhx7mEfILz_P8TRHf4oley91MLUTlcrK8IBsKvk5_zYgQSalpGsqRpZErfwefJNG72jguH5T8mwwVYM-R6spWOm3nTs7hGLh6o4B-8756a419L5a7G6mdstEK5ASW8f52g=F867C376"
$email = "syed.fazli@oeight.io"
$domain = "oeightio"
$pair = "$($email):$($token)"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($pair)
$b64 = [System.Convert]::ToBase64String($bytes)
$headers = @{
    Authorization = "Basic $b64"
    Accept = "application/json"
    "Content-Type" = "application/json"
}

$functionalComments = @{
    "A8S-103" = "Verified and Resolved: The clinical task queue query threshold has been expanded from 100 to 500 records. Clinical coordinators and supervisors can now search, filter, and inspect newly created task items (including task IDs 116+) seamlessly across all status views without records being omitted."
    "A8S-104" = "Verified and Resolved: Form validation is now enforced on the Add Note dialog. The modal prohibits blank or whitespace-only submissions, prompting the user with a clear validation reminder if attempted. Empty notes are also rejected at the API layer to safeguard data integrity."
    "A8S-105" = "Verified and Resolved: Quick-action buttons in the member chart header are now strictly aligned with the logged-in user's role and permissions. For non-clinical and audit profiles such as Coder and Billing, unauthorized clinical mutation actions (creating tasks, care journeys, or messaging) are hidden, while retaining access to permitted documentation tools."
    "A8S-106" = "Verified and Resolved: The tab header counter now correctly computes and displays the actual number of active diagnosed conditions and HCC-coded problems on file. Opening the member chart now accurately displays '(4)' matching the active diagnoses listed in the table."
    "A8S-107" = "Verified and Resolved: Accidental privilege changes have been eliminated. Clicking on module titles, descriptions, or sub-menu rows no longer toggles access. Modifying a privilege now requires an explicit, intentional click directly on the toggle switch control."
    "A8S-108" = "Verified and Resolved: The Care Journeys sidebar counter has been corrected from 18 to 19 and is now dynamically synchronized in real time with the active care journeys metric displayed on the dashboard."
    "A8S-109" = "Verified and Resolved: The static counter of 36 has been replaced with dynamic live synchronization. The sidebar navigation badge now accurately reflects the total open and in-progress tasks (89) matching the Care Intelligence dashboard summary."
    "A8S-110" = "Verified and Resolved: The domain filter dropdown now properly recognizes and filters all individual risk categories. Selecting 'Clinical', 'Utilization', 'Cost', or 'Engagement' correctly displays the matching population risk drivers and associated member details without clearing the table."
    "A8S-111" = "Verified and Resolved: Population domain risk score calculations are now fully connected to member risk data and risk insight records. The 'Average score by domain' card accurately displays non-zero average scores and high-risk member counts for Clinical, Utilization, Cost, and Engagement."
    "A8S-112" = "Verified and Resolved: Input validation and data type constraints are now strictly enforced across the Create Care Option form. The Quality field now requires a numeric rating between 0.0 and 5.0 (rejecting alphabetic text), and financial and distance fields require valid positive numbers before submission."
}

$keys = @("A8S-103", "A8S-104", "A8S-105", "A8S-106", "A8S-107", "A8S-108", "A8S-109", "A8S-110", "A8S-111", "A8S-112")

foreach ($k in $keys) {
    $comment = $functionalComments[$k]
    
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
        Write-Host "Updated comment on $k"
    } catch {
        Write-Host "Failed to add comment to $k - $($_.Exception.Message)"
    }
}
