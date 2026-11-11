# Generates 17 100% synthetic (Zero-PHI) pipe-delimited UHS SFTP extract files
# matching the exact QNXT headers and column counts from Prominence Health / UHS.

param(
    [string[]]$OutputDirs = @(
        "D:\OnStak-Projects\Arc-8\data\uhs_synthetic_sftp\10Nov2026",
        "D:\OnStak-Projects\requirements\SFTP\Data from UHS\10Nov2026"
    ),
    [int]$MemberCount = 50
)

$ErrorActionPreference = "Stop"

$FirstNamesF = @("Aaliyah","Beatrice","Camila","Daniela","Elena","Fatima","Grace","Hannah","Iris","Janelle","Kiana","Leah","Maya","Nora","Olivia","Priya","Quinn","Rosa","Sophia","Tara","Uma","Vanessa","Willa","Ximena","Yara")
$FirstNamesM = @("Aaron","Bryan","Carlos","Diego","Elliot","Felix","Gabriel","Hassan","Isaac","Julian","Kai","Leon","Marcus","Nikolas","Owen","Pedro","Quincy","Rafael","Samir","Thomas","Umar","Victor","Wesley","Xavier","Yusuf")
$LastNames   = @("Adams","Brooks","Cardoza","Diaz","Edwards","Flores","Garcia","Hernandez","Iyer","Johnson","Khan","Lopez","Martinez","Nguyen","OBrien","Park","Quintero","Reyes","Singh","Torres","Underwood","Velasquez","Williams","Xu","Young")
$Cities      = @(
    @{ City="RENO"; State="NV"; Zip="89501"; County="WASHOE"; Region="North Nevada" },
    @{ City="SPARKS"; State="NV"; Zip="89431"; County="WASHOE"; Region="North Nevada" },
    @{ City="CARSON CITY"; State="NV"; Zip="89701"; County="CARSON CITY"; Region="North Nevada" },
    @{ City="LAS VEGAS"; State="NV"; Zip="89101"; County="CLARK"; Region="South Nevada" },
    @{ City="HENDERSON"; State="NV"; Zip="89014"; County="CLARK"; Region="South Nevada" }
)
$Streets     = @("PINE ST","MAPLE AVE","CEDAR BLVD","OAK LN","ELM DR","SIERRA WAY","SAGE ST","JUNIPER AVE","ASPEN DR","WILLOW LN")
$LOBs        = @("Medicare Advantage","Commercial","Medicaid")
$Programs    = @(
    @{ Name="PROMINENCE SENIOR PLUS HMO"; ID="QEPGM0000000001"; PlanID="BP00002101"; LOB="Medicare Advantage"; Code="HMO" },
    @{ Name="HEALTHFIRST HMO"; ID="QEPGM0000000006"; PlanID="BP00002358"; LOB="Commercial"; Code="HMO" },
    @{ Name="PROMINENCE MEDICAID SELECT"; ID="QEPGM0000000009"; PlanID="BP00002510"; LOB="Medicaid"; Code="HMO" }
)
$Providers   = @(
    @{ ProvID="PR00010101"; First="JAMES"; Last="SCHAUPP"; Degree="MD"; NPI="1770679706"; TaxID="990000101"; SpecCode="207Q00000X"; SpecDesc="FAMILY MEDICINE"; IsPCP="True"; GroupName="RENO FAMILY PHYSICIANS LTD"; GroupID="PR00110101"; City="RENO"; Zip="89502"; Addr="1200 SIERRA MEDICAL PKWY" },
    @{ ProvID="PR00010102"; First="SARAH"; Last="CHEN"; Degree="MD"; NPI="1881780817"; TaxID="990000102"; SpecCode="207R00000X"; SpecDesc="INTERNAL MEDICINE"; IsPCP="True"; GroupName="SIERRA NEVADA MEDICAL GROUP"; GroupID="PR00110102"; City="RENO"; Zip="89501"; Addr="450 MILL ST STE 200" },
    @{ ProvID="PR00010103"; First="ROBERT"; Last="PATEL"; Degree="DO"; NPI="1992891928"; TaxID="990000103"; SpecCode="207RC0000X"; SpecDesc="CARDIOLOGY"; IsPCP="False"; GroupName="NEVADA HEART SPECIALISTS"; GroupID="PR00110103"; City="SPARKS"; Zip="89431"; Addr="880 PRATER WAY" },
    @{ ProvID="PR00010104"; First="MARIA"; Last="GOMEZ"; Degree="MD"; NPI="1669568605"; TaxID="990000104"; SpecCode="207Q00000X"; SpecDesc="FAMILY MEDICINE"; IsPCP="True"; GroupName="DESERT VALLEY PRIMARY CARE"; GroupID="PR00110104"; City="LAS VEGAS"; Zip="89101"; Addr="3100 CHARLESTON BLVD" },
    @{ ProvID="PR00010105"; First="JEFFREY"; Last="GINGOLD"; Degree="MD"; NPI="1053405282"; TaxID="990000105"; SpecCode="208M00000X"; SpecDesc="HOSPITALIST"; IsPCP="False"; GroupName="NORTHERN NEVADA MEDICAL CENTER"; GroupID="PR00110105"; City="SPARKS"; Zip="89434"; Addr="2375 E PRATER WAY" }
)
$Drugs = @(
    @{ NDC="00071015523"; Brand="ATORVASTATIN CALCIUM 20MG TAB"; Generic="ATORVASTATIN CALCIUM"; Strength="20 MG"; Class="ANTIHYPERLIPIDEMICS"; SubClass="HMG CoA Reductase Inhibitors"; Cost="14.50" },
    @{ NDC="00093721401"; Brand="METFORMIN HCL 500MG TAB"; Generic="METFORMIN HCL"; Strength="500 MG"; Class="ANTIDIABETICS"; SubClass="Biguanides"; Cost="8.20" },
    @{ NDC="00172375860"; Brand="LISINOPRIL 10MG TAB"; Generic="LISINOPRIL"; Strength="10 MG"; Class="ANTIHYPERTENSIVES"; SubClass="ACE Inhibitors"; Cost="6.75" },
    @{ NDC="00002751001"; Brand="JARDIANCE 10MG TAB"; Generic="EMPAGLIFLOZIN"; Strength="10 MG"; Class="ANTIDIABETICS"; SubClass="SGLT-2 Inhibitors"; Cost="412.00" },
    @{ NDC="72603015001"; Brand="ESCITALOPRAM TAB 10MG"; Generic="ESCITALOPRAM OXALATE"; Strength="10 MG"; Class="ANTIDEPRESSANTS"; SubClass="SSRIs"; Cost="9.40" }
)
$Diags = @(
    @{ Code="E119"; Desc="Type 2 diabetes mellitus without complications"; CPT="99214"; Charge="240.00"; Allowed="145.00"; Paid="115.00"; Copay="30.00" },
    @{ Code="I10"; Desc="Essential (primary) hypertension"; CPT="99213"; Charge="165.00"; Allowed="105.00"; Paid="85.00"; Copay="20.00" },
    @{ Code="I509"; Desc="Heart failure, unspecified"; CPT="99223"; Charge="890.00"; Allowed="620.00"; Paid="545.00"; Copay="75.00" },
    @{ Code="J449"; Desc="Chronic obstructive pulmonary disease, unspecified"; CPT="94010"; Charge="310.00"; Allowed="195.00"; Paid="160.00"; Copay="35.00" },
    @{ Code="N1830"; Desc="Chronic kidney disease, stage 3 unspecified"; CPT="80053"; Charge="125.00"; Allowed="68.00"; Paid="58.00"; Copay="10.00" }
)

function New-RowFromHash([string[]]$Columns, [hashtable]$Values) {
    $out = New-Object string[] $Columns.Count
    for ($i = 0; $i -lt $Columns.Count; $i++) {
        $colName = $Columns[$i]
        if ($Values.ContainsKey($colName)) {
            $out[$i] = [string]$Values[$colName]
        } else {
            $out[$i] = ""
        }
    }
    return ($out -join "|")
}

$SchemaJson = Get-Content "D:\OnStak-Projects\Arc-8\docs\uhs-sftp-schema\uhs_sftp_headers.json" | ConvertFrom-Json
$HeadersByFile = @{}
foreach ($item in $SchemaJson) {
    $HeadersByFile[$item.FileName] = @{
        RawHeader = $item.RawHeader
        Columns   = [string[]]$item.Columns
    }
}

# Initialize line buffers with header row
$FileBuffers = @{}
foreach ($fileName in $HeadersByFile.Keys) {
    $list = New-Object System.Collections.Generic.List[string]
    $list.Add($HeadersByFile[$fileName].RawHeader)
    $FileBuffers[$fileName] = $list
}

# 1. Groups & Brokers
for ($g = 1; $g -le 5; $g++) {
    $grpId = ("GRP000810{0}" -f $g)
    $grpName = "SYNTHETIC EMPLOYER GROUP $g LLC"
    $prog = $Programs[$g % $Programs.Count]
    $loc = $Cities[$g % $Cities.Count]

    $FileBuffers["PHP_To_OEight_GroupDetails_20261026.txt"].Add((New-RowFromHash $HeadersByFile["PHP_To_OEight_GroupDetails_20261026.txt"].Columns @{
        "CUST_ID" = ("EN0000900{0}" -f $g)
        "GROUP_NUMBER" = $grpId
        "GROUP_NAME" = $grpName
        "GRP_EFF_DT" = "2026-01-01"
        "GRP_EXP_DT" = "2026-12-31"
        "BenefitPlanID" = $prog.PlanID
        "BenefitPlanName" = $prog.Name
        "PLAN_ID" = $prog.PlanID
        "PLAN_NM" = $prog.Name
        "PLAN_EFFECTIVE_DATE" = "2026-01-01"
        "PLAN_EXPIRATION_DATE" = "2026-12-31"
        "EOC_NAME" = "SYNTHETIC EOC 2026"
        "RENEWAL DATE" = "2027-01-01"
        "PROGRAM_ID" = $prog.ID
        "PROGRAM" = $prog.Name
        "GROUP CONTACT" = "Test Admin $g"
        "CONTACT_PHONE" = "(775) 555-010$g"
        "GROUP_ADDRESS_1" = "${g}00 CORPORATE WAY"
        "CITY" = $loc.City
        "STATE" = $loc.State
        "ZIP" = $loc.Zip
        "GROUP_CONTACT_E-MAIL" = "hr.group$g@synthetic-example.com"
        "GROUP_SIZE" = "LARGE GREATER THAN 50"
        "REGION" = $loc.Region
        "ORGPOLICYID" = ("QMISC900{0}" -f $g)
        "ORGPOLICY_SOB_DESC" = $prog.Name
        "LOB" = $prog.LOB
        "ARAccountID" = ("ARID9900{0}" -f $g)
    }))

    $FileBuffers["PHP_To_OEight_BorkerDetails_20261026.txt"].Add((New-RowFromHash $HeadersByFile["PHP_To_OEight_BorkerDetails_20261026.txt"].Columns @{
        "GroupID" = $grpId
        "BrokerID" = ("UHS900{0}" -f $g)
        "BrokerName" = "SYNTHETIC INSURANCE BROKERS $g"
        "BrokerStartDate" = "2026-01-01"
        "BrokerEndDate" = "2078-12-31"
    }))
}

# 2. Providers (Details, Locations, Affiliations, PayTo)
foreach ($p in $Providers) {
    $FileBuffers["PHP_To_OEight_Provider_Dtls_QNXT_20261026.txt"].Add((New-RowFromHash $HeadersByFile["PHP_To_OEight_Provider_Dtls_QNXT_20261026.txt"].Columns @{
        "ProviderID" = $p.ProvID
        "ProviderType" = "PHYSICIAN"
        "ProviderClass" = "PRACTITIONER"
        "FirstName" = $p.First
        "LastName" = $p.Last
        "ProviderDegree" = $p.Degree
        "NationalProviderID" = $p.NPI
        "TaxID" = $p.TaxID
        "TaxonomyID" = $p.SpecCode
        "QNXTProviderID" = $p.ProvID
        "ProviderSpecialty1_Code" = $p.SpecCode
        "ProviderSpecialty1_Desc" = $p.SpecDesc
        "Gender" = "M"
        "IsPerson" = "True"
        "IsHospitalBased" = "False"
        "IsFacility" = "False"
        "IsSpecialtyPCP1" = $p.IsPCP
    }))

    $FileBuffers["PHP_To_OEight_Provider_Location_QNXT_20261026.txt"].Add((New-RowFromHash $HeadersByFile["PHP_To_OEight_Provider_Location_QNXT_20261026.txt"].Columns @{
        "ProviderID" = $p.ProvID
        "ProviderLastName" = $p.Last
        "ProviderFirstName" = $p.First
        "ProviderGroupID" = $p.GroupID
        "isPCPLocation" = $(if ($p.IsPCP -eq "True") { "Y" } else { "N" })
        "LocationID" = ("LOC_{0}" -f $p.ProvID)
        "LocationName" = $p.GroupName
        "LocationAddr1" = $p.Addr
        "LocationAddrCity" = $p.City
        "LocationAddrState" = "NV"
        "LocationAddrZip" = $p.Zip
        "LocationPhoneNumber" = "7755550199"
        "LocationFaxNumber" = "7755550198"
        "LocationAddrCounty" = "WASHOE"
        "PrimaryLocation" = "Y"
        "isPar" = "Y"
        "LOB" = "Medicare Advantage"
    }))

    $FileBuffers["PHP_To_OEight_Provider_Affiliation_QNXT_20261026.txt"].Add((New-RowFromHash $HeadersByFile["PHP_To_OEight_Provider_Affiliation_QNXT_20261026.txt"].Columns @{
        "ProviderID" = $p.ProvID
        "GroupTaxID" = $p.TaxID
        "InternalVendorID" = ("AF_{0}" -f $p.ProvID)
        "VendorID" = $p.GroupID
        "GroupName" = $p.GroupName
        "GroupAffiliationEffDate" = "2024-01-01"
        "GroupAffiliationTermDate" = "2078-12-31"
        "IsPCP" = $(if ($p.IsPCP -eq "True") { "1" } else { "0" })
        "ParorNonPar" = "Par"
        "GroupClass" = "GROUP"
        "GroupType" = "PAY-TO ENTITY"
        "LOB" = "Medicare Advantage"
        "Program" = "HMO"
    }))

    $FileBuffers["PHP_To_OEight_Provider_PayTo_QNXT_20261026.txt"].Add((New-RowFromHash $HeadersByFile["PHP_To_OEight_Provider_PayTo_QNXT_20261026.txt"].Columns @{
        "InternalVendorID" = $p.GroupID
        "VendorID" = $p.GroupID
        "InboundVendorID_QNXT" = $p.GroupID
        "Vendor1099ReportInfoID" = $p.GroupID
        "LegalName" = $p.GroupName
        "TaxID" = $p.TaxID
        "EffDate" = "2024-01-01"
        "RowState" = "A"
        "AddressID" = ("ADDR_{0}" -f $p.ProvID)
        "TaxIDType" = "EIN"
        "StreetAddress1" = $p.Addr
        "City" = $p.City
        "State" = "NV"
        "ZipCode" = $p.Zip
        "Country" = "UNITED STATES"
        "County" = "WASHOE"
        "RowNumber" = "1"
    }))
}

# 3. Members, Enrollments, PCPs, Designees, Accumulators, Claims, Pharmacy, Call Tracking
for ($m = 1; $m -le $MemberCount; $m++) {
    $memKey = ("MEM{0:D6}" -f (1000 + $m))
    $internalMemId = ("QEMEM{0:D10}" -f (900000 + $m))
    $enrollId = ("ES{0:D10}" -f (800000 + $m))
    $isFemale = ($m % 2 -eq 1)
    $firstName = $(if ($isFemale) { $FirstNamesF[($m - 1) % $FirstNamesF.Count] } else { $FirstNamesM[($m - 1) % $FirstNamesM.Count] }).ToUpper()
    $lastName = $LastNames[($m - 1) % $LastNames.Count].ToUpper()
    $gender = $(if ($isFemale) { "F" } else { "M" })
    $birthYear = 1945 + ($m % 45)
    $birthMonth = 1 + ($m % 12)
    $birthDay = 1 + ($m % 27)
    $dob = ("{0:D4}-{1:D2}-{2:D2}" -f $birthYear, $birthMonth, $birthDay)

    $loc = $Cities[$m % $Cities.Count]
    $street = ("{0} {1}" -f (100 + $m * 7), $Streets[$m % $Streets.Count])
    $phone = ("775555{0:D4}" -f (1000 + $m))
    $email = ("{0}.{1}.{2}@synthetic-member.test" -f $firstName.ToLower(), $lastName.ToLower(), $m)
    $prog = $Programs[$m % $Programs.Count]
    $grpId = ("GRP000810{0}" -f (1 + ($m % 5)))
    $pcp = $Providers[$m % 3] # First 3 are PCPs

    # MemberDetails
    $FileBuffers["PHP_To_OEight_MemberDetails_20261026.txt"].Add((New-RowFromHash $HeadersByFile["PHP_To_OEight_MemberDetails_20261026.txt"].Columns @{
        "InternalMemberID" = $internalMemId
        "MemberID" = $memKey
        "HIC#" = ("SYNTHMBI{0:D4}" -f $m)
        "MemberStatus" = "Active"
        "FirstName" = $firstName
        "LastName" = $lastName
        "MiddleName" = "A"
        "PhyAddrLine1" = $street
        "PhyAddrCity" = $loc.City
        "PhyAddrState" = $loc.State
        "PhyAddrZip" = $loc.Zip
        "PhyAddrCounty" = $loc.County
        "Gender" = $gender
        "DOB" = $dob
        "HomePhone#" = $phone
        "EmailAddress" = $email
        "MailingAddrLine1" = $street
        "MailingCity" = $loc.City
        "MailingState" = $loc.State
        "MailingZip" = $loc.Zip
        "EnrollType" = "I"
        "RaceDescription" = "SYNTHETIC DEMO"
        "PrimaryLanguage" = $(if ($m % 5 -eq 0) { "SPANISH" } else { "ENGLISH" })
        "WrittenLanguage" = $(if ($m % 5 -eq 0) { "SPANISH" } else { "ENGLISH" })
        "SSN" = ""
        "LOB" = $prog.LOB
        "ConfidentialMemberFlag" = "0"
        "ElectronicOptInFlag" = "1"
    }))

    # EnrollmentDetails
    $FileBuffers["PHP_To_OEight_EnrollmentDetails_20261026.txt"].Add((New-RowFromHash $HeadersByFile["PHP_To_OEight_EnrollmentDetails_20261026.txt"].Columns @{
        "EnrollID" = $enrollId
        "SpanType" = "Active Enrollment Span"
        "MemberID" = $memKey
        "SubscriberMemberID" = $memKey
        "GroupNumber" = $grpId
        "GroupName" = "SYNTHETIC EMPLOYER GROUP"
        "GroupSize" = "Large"
        "EnrollmentEffDate" = "2026-01-01"
        "EnrollmentTermDate" = "2026-12-31"
        "GrouplPhysicalAddrCounty" = $loc.County
        "MemberPhysicalAddrCounty" = $loc.County
        "SubscriberPhysicalAddrCounty" = $loc.County
        "MemberRegion" = $loc.Region
        "PlanOfferedRegionByGroup" = $loc.Region
        "GroupPhysicalAddrZIP" = $loc.Zip
        "MemberPhysicalAddrZip" = $loc.Zip
        "PlanOfferedState" = "NV"
        "RatingArea_AtSponsorLevel" = "002-Washoe"
        "ProgramName" = $prog.Name
        "ProgramID" = $prog.ID
        "InternalMemberID" = $internalMemId
        "InternalSubscriberID" = $internalMemId
        "PlanID" = $prog.PlanID
        "POSPlan" = "N"
        "ProductType" = $prog.Code
        "EnrollType" = "I"
        "PlanType" = "Medical"
        "LastPCPProviderID" = $pcp.ProvID
        "EnrollCovTypeEffDate" = "2026-01-01"
        "EnrollCovTypeTermDate" = "2026-12-31"
        "PrimaryOrSecondaryCovType" = "Primary"
        "LOB" = $prog.LOB
        "Program" = $prog.Code
    }))

    # MemberPCPDetails
    $FileBuffers["PHP_To_OEight_MemberPCPDetails_20261026.txt"].Add((New-RowFromHash $HeadersByFile["PHP_To_OEight_MemberPCPDetails_20261026.txt"].Columns @{
        "InternalPCPID" = $pcp.ProvID
        "PCPProvID" = $pcp.ProvID
        "PCPEffDate" = "2026-01-01"
        "PCPTermDate" = "2026-12-31"
        "MemberID" = $memKey
        "PCPSpeciality" = $pcp.SpecDesc
        "PCPSpecialityCode" = $pcp.SpecCode
        "InternalEnrollID" = $enrollId
        "PCPNPI" = $pcp.NPI
        "Source" = "QNXT"
        "PCPAffiliationID" = ("AF_{0}" -f $pcp.ProvID)
        "ProviderGroupTIN" = $pcp.TaxID
        "ProviderGroupName" = $pcp.GroupName
        "PCPTYPE" = "PCP"
        "PCPFirstName" = $pcp.First
        "PCPLastName" = $pcp.Last
        "InternalMemberID" = $internalMemId
        "LOB" = $prog.LOB
    }))

    # MemberDesignee (for every 3rd member)
    if ($m % 3 -eq 0) {
        $FileBuffers["PHP_To_OEight_MemberDesignee_20261026.txt"].Add((New-RowFromHash $HeadersByFile["PHP_To_OEight_MemberDesignee_20261026.txt"].Columns @{
            "membermemid" = $memKey
            "designeememid" = ("DESIG_{0}" -f $memKey)
            "effdate" = "2026-01-01 00:00:00"
            "termdate" = "2026-12-31 00:00:00"
            "designeetypedesc" = "FAMILY REPRESENTATIVE"
        }))
    }

    # AccumDetails (1 DED row + 1 OOP row per member)
    $dedMet = [math]::Round((($m * 37) % 1200) + 50.0, 2)
    $oopMet = [math]::Round($dedMet + (($m * 53) % 1800), 2)
    $FileBuffers["PHP_To_OEight_AccumDetails_20261026.txt"].Add((New-RowFromHash $HeadersByFile["PHP_To_OEight_AccumDetails_20261026.txt"].Columns @{
        "GroupNumber" = $grpId
        "MemberID" = $memKey
        "AltMemberID" = $internalMemId
        "DepMemberID" = $memKey
        "DepAltMemberID" = $internalMemId
        "Name" = "DEDUCT INDIVIDUAL (IN NETWORK)"
        "CoverageType" = "M"
        "SpecificType" = "DED"
        "CurrentAmount" = ("{0:F2}" -f $dedMet)
        "MaximumAmount" = "1500.00"
        "InNetwork" = "1"
        "IndividualAccum" = "1"
        "DateRange" = "01/01/26 - 12/31/26"
        "BenefitPlanID" = $prog.PlanID
        "PlanYear" = "2026"
        "LOB" = $prog.LOB
    }))
    $FileBuffers["PHP_To_OEight_AccumDetails_20261026.txt"].Add((New-RowFromHash $HeadersByFile["PHP_To_OEight_AccumDetails_20261026.txt"].Columns @{
        "GroupNumber" = $grpId
        "MemberID" = $memKey
        "AltMemberID" = $internalMemId
        "DepMemberID" = $memKey
        "DepAltMemberID" = $internalMemId
        "Name" = "OOP MAX INDIVIDUAL (IN NETWORK)"
        "CoverageType" = "M"
        "SpecificType" = "OOP"
        "CurrentAmount" = ("{0:F2}" -f $oopMet)
        "MaximumAmount" = "5000.00"
        "InNetwork" = "1"
        "IndividualAccum" = "1"
        "DateRange" = "01/01/26 - 12/31/26"
        "BenefitPlanID" = $prog.PlanID
        "PlanYear" = "2026"
        "LOB" = $prog.LOB
    }))

    # Claims (2 claims per member)
    for ($c = 1; $c -le 2; $c++) {
        $claimId = ("26SYNTH{0:D4}{1}" -f $m, $c)
        $diag = $Diags[($m + $c) % $Diags.Count]
        $diag2 = $Diags[($m + $c + 1) % $Diags.Count]
        $prov = $Providers[($m + $c) % $Providers.Count]
        $svcDate = ("2026-{0:D2}-{1:D2}" -f (1 + (($m + $c) % 9)), (1 + (($m * 3) % 25)))
        $paidDate = "2026-10-15"

        $FileBuffers["PHP_To_OEight_ClaimDetails_20261026.txt"].Add((New-RowFromHash $HeadersByFile["PHP_To_OEight_ClaimDetails_20261026.txt"].Columns @{
            "ID" = ("{0}{1}" -f $m, $c)
            "claimid" = $claimId
            "claimline" = "1"
            "ClaimStatus" = "PAID"
            "ClaimLineStatus" = "PAID"
            "orgclaimid" = $claimId
            "Company" = "PROMINENCE"
            "ProgramName" = $prog.Name
            "programid" = $prog.ID
            "PolicyProductType" = $prog.Code
            "RenderingProvider" = ("{0}, {1} {2}" -f $prov.Last, $prov.First, $prov.Degree)
            "RenderingProviderNPI" = $prov.NPI
            "RenderingProviderFedID" = $prov.TaxID
            "RenderingProvId" = $prov.ProvID
            "RenderingProviderSpecCode" = $prov.SpecCode
            "RenderingProviderSpecDesc" = $prov.SpecDesc
            "RenderingProviderType" = "PHYSICIAN"
            "PayToFacilityName" = $prov.GroupName
            "PayToFedID" = $prov.TaxID
            "PayToNPI" = $prov.NPI
            "PaytoProvID" = $prov.GroupID
            "enrollid" = $enrollId
            "memid" = $memKey
            "ClaimType" = "Professional"
            "StartServiceDate" = $svcDate
            "EndServiceDate" = $svcDate
            "DOSFrom_ClaimLine" = $svcDate
            "DOSTo_ClaimLine" = $svcDate
            "PaidDate" = $paidDate
            "servunits" = "1"
            "IcdVersion" = "10"
            "PosCode" = "11"
            "PosDesc" = "OFFICE"
            "ProviderParStatus" = "Par"
            "servcode" = $diag.CPT
            "Cpt41" = $diag.CPT
            "PrinDiag" = $diag.Code
            "DiagCode1" = $diag.Code
            "DiagCode2" = $diag2.Code
            "benefitplan" = $prog.PlanID
            "benefitName" = $prog.Name
            "amountpaid" = $diag.Paid
            "claimamt_or_Charges" = $diag.Charge
            "AllowedAmt_or_ContractPaid" = $diag.Allowed
            "memamt" = $diag.Copay
            "copay" = $diag.Copay
            "coinsuranceamt" = "0.00"
            "Deductible" = "0.00"
            "SourceSystem" = "QNXT"
            "FinalizedClaim" = "Y"
            "LOB" = $prog.LOB
            "CleanDate" = $paidDate
            "InternalSubscriberID" = $internalMemId
        }))

        $FileBuffers["PHP_To_OEight_ClaimEdits_20261026.txt"].Add((New-RowFromHash $HeadersByFile["PHP_To_OEight_ClaimEdits_20261026.txt"].Columns @{
            "claimid" = $claimId
            "claimline" = "1"
            "ClaimEditRuleID" = "100"
            "RemitReasonID" = "A01"
            "EOBReasonID" = "A01"
            "ClaimEditDescription" = "Processed according to plan provisions"
            "RemitDescription" = "Copay applied per member benefit schedule"
            "CleanClaim" = "Y"
        }))

        $FileBuffers["PHP_To_OEight_ClaimMailDate_20261026.txt"].Add((New-RowFromHash $HeadersByFile["PHP_To_OEight_ClaimMailDate_20261026.txt"].Columns @{
            "claimid" = $claimId
            "MemberNumber" = $memKey
            "MemberName" = ("{0} {1}" -f $firstName, $lastName)
            "PayeeName" = $prov.GroupName
            "MailDate" = "2026-10-18"
        }))
    }

    # Pharmacy (2 prescriptions per member)
    for ($rx = 1; $rx -le 2; $rx++) {
        $drug = $Drugs[($m + $rx) % $Drugs.Count]
        $rxNum = ("RX{0:D6}{1}" -f (50000 + $m), $rx)
        $rxDate = ("2026-09-{0:D2}" -f (1 + ($m % 25)))
        $FileBuffers["PHP_To_OEight_Pharmacy_20261026.txt"].Add((New-RowFromHash $HeadersByFile["PHP_To_OEight_Pharmacy_20261026.txt"].Columns @{
            "ClaimNumber" = ("RXCLM{0:D6}{1}" -f $m, $rx)
            "MemberID" = $memKey
            "GroupNumber" = $grpId
            "PolicyNumber" = $prog.PlanID
            "Tier" = "1"
            "PrescriptionNumber" = $rxNum
            "DateRxWritten" = $rxDate
            "ClaimCreateDate" = $rxDate
            "DateofService" = $rxDate
            "NDCNUmber" = $drug.NDC
            "DrugDescription" = $drug.Brand
            "DrugDescriptionGenericName" = $drug.Generic
            "QuantityDispensed" = "30.00"
            "DaysSupply" = "30"
            "ClaimStatus" = "PAID"
            "ClaimStatusCodeDescription" = "APPROVED"
            "RefillNumber" = "2"
            "FormularyFlag" = "Y"
            "PharmacyIDCode" = "ncdpd id"
            "PharmacyIDValue" = "1467500001"
            "PharmacyName" = "SIERRA SYNTHETIC PHARMACY"
            "PharmacyAddr1" = "500 VIRGINIA ST"
            "PharmacyCity" = $loc.City
            "PharmacyState" = $loc.State
            "PharmacyZip" = $loc.Zip
            "PrescriberIdentification" = $pcp.NPI
            "PrescriberFirstName" = $pcp.First
            "PrescriberLastName" = $pcp.Last
            "PrescriberCity" = $pcp.City
            "PrescriberState" = "NV"
            "PrescriberTaxonomyCode" = $pcp.SpecCode
            "PrescriberSpecialtyDescription" = $pcp.SpecDesc
            "GenericBrandType" = "Generic"
            "RouteDescription" = "ORAL"
            "Strength" = $drug.Strength
            "DrugFormCode" = "TAB"
            "BilledAmt" = $drug.Cost
            "IngredientCost" = $drug.Cost
            "PaidAmount" = $drug.Cost
            "CopyaAmount" = "5.00"
            "TotalMemberCosts" = "5.00"
            "SourceSystem" = "MIMP"
            "StandardTherapeuticClassDescription" = $drug.Class
            "SpecificTherapeuticClassDescription" = $drug.SubClass
            "LOB" = $prog.LOB
        }))
    }

    # Call Tracking Detail & Notes
    $callId = ("CALL{0:D10}" -f (3500000 + $m))
    $FileBuffers["PHP_CallTrackingDetail_20261026.txt"].Add((New-RowFromHash $HeadersByFile["PHP_CallTrackingDetail_20261026.txt"].Columns @{
        "enrollid" = $enrollId
        "programudtypename" = "MAPD"
        "callerid" = $callId
        "callcode" = ("QEMSC{0:D5}" -f $m)
        "calltype_category" = "CARE COORDINATION"
        "calltype_description" = "OUTREACH & MEDICATION REVIEW"
        "sponsor" = $prog.LOB.ToUpper()
        "status" = "CLOSED"
        "resolution_category" = "SATISFIED"
        "resolution_description" = "SATISFIED"
        "createdate" = "2026-10-15 10:30:00.000000000"
        "createid" = "coord_synthetic"
        "CallReceivedDate" = "2026/10/15"
        "CallReceivedTime" = "10:30:00"
        "lastupdate" = "2026-10-15 10:45:00.000000000"
        "MemID" = $memKey
    }))

    $FileBuffers["PHP_CallTrackingNotes_20261026.txt"].Add((New-RowFromHash $HeadersByFile["PHP_CallTrackingNotes_20261026.txt"].Columns @{
        "callerid" = $callId
        "createid" = "coord_synthetic"
        "createdate" = "2026-10-15 10:30:00.000000000"
        "updateid" = "coord_synthetic"
        "lastupdate" = "2026-10-15 10:45:00.000000000"
        "Number" = "1"
        "Item" = ("Synthetic outreach call completed for member {0} {1} ({2}). Confirmed PCP appointment with Dr. {3} and reviewed medication adherence." -f $firstName, $lastName, $memKey, $pcp.Last)
        "ID" = ("{0}" -f (900000 + $m))
        "DateLoaded" = "2026-10-26 04:05:00.000000000"
    }))
}

# Write all 17 files to every target directory
foreach ($dir in $OutputDirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    foreach ($fileName in $FileBuffers.Keys) {
        $targetPath = Join-Path $dir $fileName
        [System.IO.File]::WriteAllLines($targetPath, $FileBuffers[$fileName], [System.Text.Encoding]::UTF8)
    }
    Write-Host "Wrote 17 synthetic UHS SFTP files to: $dir"
}
