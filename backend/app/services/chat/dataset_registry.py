"""
Static per-table metadata for the shared analytics dataset.

This list defines which tables the dataset chat tool can see. Column types are
read live from each tenant's database, so this registry only carries friendly
names + source sheet hints (used by the prompt).

To add a table: append to DATASET_TABLES, add the matching DDL to the tenant
migration, and ship the column types through the registry's friendly name.
"""
from __future__ import annotations


DATASET_TABLES: dict[str, dict] = {
    "php_claim_details": {
        "sheet_name":    "PHP_ClaimDetails",
        "friendly_name": "Claim Details",
    },
    "php_enrollment_details": {
        "sheet_name":    "PHP_EnrollmentDetails",
        "friendly_name": "Enrollment Details",
    },
    "php_member_details": {
        "sheet_name":    "PHP_MemberDetails",
        "friendly_name": "Member Details",
    },
    "php_member_pcp_details": {
        "sheet_name":    "PHP_MemberPCPDetails",
        "friendly_name": "Member PCP Details",
    },
    "php_pharmacy": {
        "sheet_name":    "PHP_Pharmacy",
        "friendly_name": "Pharmacy",
    },
    "php_provider": {
        "sheet_name":    "PHP_Provider",
        "friendly_name": "Provider",
    },
    "php_provider_affiliation": {
        "sheet_name":    "PHP_ProviderAffiliation",
        "friendly_name": "Provider Affiliation",
    },
    "php_provider_location": {
        "sheet_name":    "PHP_ProviderLocation",
        "friendly_name": "Provider Location",
    },
    "medication_adherence": {
        "sheet_name":    "medication_adherence",
        "friendly_name": "Medication Adherence",
    },
}
