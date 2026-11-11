# UHS / Prominence SFTP Extract Schema & Arc-8 Database Mapping

> **Zero-PHI Reference:** This directory contains **only Row 1 (column headers)** extracted from the 17 UHS/QNXT pipe-delimited (`|`) SFTP files (`PHP_To_OEight_*` and `PHP_CallTracking*`). No member data or PHI is stored here.

## 1. Do the UHS SFTP Files Have the Same Exact Format as Current Arc-8 Database Tables?

**Short Answer:** **No — they do NOT have identical 1-to-1 column names, Career/ETL mapping is required, AND the data connects cleanly into Arc-8's existing tables.**

Why?
1. **UHS SFTP Files = Raw Source Feeds (QNXT Format):**
   * Wide, flat, pipe-delimited (`|`) text files exported from Prominence Health's core insurance system (**QNXT**).
   * Uses `PascalCase` or `UPPER_CASE` column names (e.g., `FirstName`, `DOB`, `PhyAddrLine1`, `PrinDiag`, `DiagCode1`..`DiagCode40`).
   * For example, `PHP_To_OEight_ClaimDetails` has **176 columns** on a single row.
2. **Arc-8 PostgreSQL Database = Normalized Application Tables (`m360_*` and `coding_*`):**
   * Clean, normalized relational tables in [member360.py](../../backend/app/models/member360.py) and [coding.py](../../backend/app/models/coding.py) using `snake_case` column names (e.g., `first_name`, `date_of_birth`, `address_line1`).
   * Instead of 40 separate diagnosis columns (`DiagCode1`..`DiagCode40`), Arc-8 stores diagnoses cleanly as rows in `m360_problems` or JSON arrays in `coding_claims.diagnosis_codes`.

---

## 2. File-by-File Mapping: UHS SFTP Files → Arc-8 PostgreSQL Tables

| # | UHS SFTP File Name | Cols | Target Arc-8 PostgreSQL Table(s) | Key Column Mapping (UHS → Arc-8) | Status in Arc-8 DB |
|---|--------------------|-----:|----------------------------------|----------------------------------|--------------------|
| 1 | `PHP_To_OEight_MemberDetails_*.txt` | 38 | `m360_members`, `coding_members` | `MemberID` → `member_key`<br>`FirstName` → `first_name`<br>`LastName` → `last_name`<br>`DOB` → `date_of_birth`<br>`Gender` → `gender`<br>`PhyAddrLine1/City/State/Zip` → `address_line1/city/state/zip`<br>`HomePhone#` → `phone`<br>`EmailAddress` → `email`<br>`PrimaryLanguage` → `preferred_language`<br>`LOB` → `line_of_business` | **Supported** (Core fields match; extra QNXT fields like `RaceCode`, `ConfidentialMemberFlag` can be ignored or added if needed) |
| 2 | `PHP_To_OEight_EnrollmentDetails_*.txt` | 52 | `m360_coverages`, `m360_members`, `coding_member_eligibility` | `ProgramName`/`PlanID` → `plan_name`<br>`LOB` → `line_of_business`<br>`SpanType` → `coverage_status`<br>`EnrollmentEffDate` → `effective_date`<br>`EnrollmentTermDate` → `term_date`<br>`PrimaryOrSecondaryCovType` → `is_primary` | **Supported** (Maps to `m360_coverages` and updates `m360_members.plan_name`) |
| 3 | `PHP_To_OEight_MemberPCPDetails_*.txt` | 18 | `m360_members`, `coding_members` | `PCPFirstName` + `PCPLastName` → `primary_care_provider` / `pcp_name`<br>`PCPNPI` → `pcp_npi` | **Supported** (Flattens into member's active PCP field) |
| 4 | `PHP_To_OEight_MemberDesignee_*.txt` | 5 | `m360_member_dependents` | `membermemid` → `member_id`<br>`designeememid` → `member_key`<br>`designeetypedesc` → `relationship_type` | **Supported** |
| 5 | `PHP_To_OEight_AccumDetails_*.txt` | 16 | `m360_accumulators`, `m360_accumulator_scopes` | `CurrentAmount` (where `SpecificType='DED'`) → `deductible_met`<br>`MaximumAmount` (where `SpecificType='DED'`) → `deductible`<br>`CurrentAmount` (where `SpecificType='OOP'`) → `out_of_pocket_met`<br>`MaximumAmount` (where `SpecificType='OOP'`) → `out_of_pocket_max`<br>`InNetwork` → `scope` (`in_network` / `out_of_network`) | **Supported** (Pivots DED and OOP rows per member into `m360_accumulators`) |
| 6 | `PHP_To_OEight_ClaimDetails_*.txt` | 176 | `m360_claims`, `m360_claim_lines`, `m360_problems`, `coding_claims` | `claimid` → `claim_number`<br>`claimline` → `line_number`<br>`StartServiceDate` → `service_date`<br>`RenderingProvider` → `provider`<br>`claimamt_or_Charges` → `billed_amount`<br>`AllowedAmt_or_ContractPaid` → `allowed_amount`<br>`amountpaid` → `paid_amount`<br>`memamt` → `member_responsibility`<br>`copay`/`coinsuranceamt`/`Deductible` → `copay`/`coinsurance`/`deductible`<br>`PrinDiag`, `DiagCode1..40` → `m360_problems` & `coding_claims.diagnosis_codes` | **Supported** (Splits header into `m360_claims`, line items into `m360_claim_lines`, and ICD-10 diagnoses into `m360_problems`) |
| 7 | `PHP_To_OEight_ClaimEdits_*.txt` | 8 | `m360_claim_lines`, `m360_claim_details` | `RemitDescription` / `ClaimEditDescription` → `denial_reason` | **Supported** |
| 8 | `PHP_To_OEight_ClaimMailDate_*.txt` | 5 | `m360_claim_details` | `MailDate` → `remittance_date` | **Supported** |
| 9 | `PHP_To_OEight_Pharmacy_*.txt` | 92 | `m360_medications` | `PrescriptionNumber` → `rx_number`<br>`NDCNUmber` → `ndc_code`<br>`DrugDescription` → `drug_name`<br>`DrugDescriptionGenericName` → `generic_name`<br>`Strength` → `dose`<br>`RouteDescription` → `route`<br>`DaysSupply` → `days_supply`<br>`PrescriberFirstName/LastName` → `prescriber`<br>`PharmacyName` → `pharmacy`<br>`DateofService` → `last_fill_date` | **Supported** |
| 10 | `PHP_To_OEight_Provider_Dtls_QNXT_*.txt` | 30 | `m360_providers`, `coding_providers` | `NationalProviderID` → `npi`<br>`TaxID` → `tax_id`<br>`FirstName`/`LastName`/`OrgName` → `name`<br>`ProviderSpecialty1_Desc` → `specialty`<br>`IsSpecialtyPCP1` → `is_pcp`<br>`Gender` → `gender` | **Supported** |
| 11 | `PHP_To_OEight_Provider_Location_QNXT_*.txt` | 18 | `m360_provider_locations`, `coding_provider_locations` | `LocationAddr1/2/City/State/Zip` → `address_line1/2/city/state/postal_code`<br>`LocationPhoneNumber` → `phone` | **Supported** |
| 12 | `PHP_To_OEight_Provider_Affiliation_QNXT_*.txt` | 13 | `m360_provider_networks` | `Program` → `plan_name`<br>`LOB` → `line_of_business`<br>`ParorNonPar` → `network_status` | **Supported** |
| 13 | `PHP_To_OEight_Provider_PayTo_QNXT_*.txt` | 20 | *(Optional / Commercial Finance Payer View)* | Vendor 1099 / Pay-To billing entity details | **Not used in Member 360 MVP** (Can be staged if needed for Payer Console) |
| 14 | `PHP_To_OEight_GroupDetails_*.txt` | 30 | *(Optional / Employer Group Metadata)* | `GROUP_NUMBER`, `GROUP_NAME`, `BenefitPlanName` | **Partially used** (Plan/Group names also exist on EnrollmentDetails) |
| 15 | `PHP_To_OEight_BorkerDetails_*.txt` | 5 | *(Optional / Commercial Broker Metadata)* | `GroupID`, `BrokerID`, `BrokerName` | **Not used in Member 360 MVP** |
| 16 | `PHP_CallTrackingDetail_*.txt` | 16 | `m360_notes` | `MemID` → `member_id`<br>`createid` → `author_name`<br>`calltype_Category`/`calltype_description` → `note_type`<br>`createdate` → `created_at` (`channel='phone'`) | **Supported** (Combines with CallTrackingNotes into Member 360 timeline notes) |
| 17 | `PHP_CallTrackingNotes_*.txt` | 9 | `m360_notes` | `callerid` + `Item` (ordered by `Number`) → `body` | **Supported** |

---

## 3. Clean Header-Only Templates
All 17 empty header-only template files (`*_TEMPLATE.txt`) are stored in [`./templates/`](./templates/), and the machine-readable column dictionary is in [`./uhs_sftp_headers.json`](./uhs_sftp_headers.json).
