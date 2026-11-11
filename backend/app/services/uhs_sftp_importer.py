"""Parser and PostgreSQL loader for UHS / Prominence QNXT pipe-delimited SFTP extracts.

Translates the 17 ``PHP_To_OEight_*`` and ``PHP_CallTracking*`` pipe-delimited (``|``)
text files into Arc-8's normalized ``m360_*`` and ``coding_*`` tables.
"""
from __future__ import annotations

import csv
import logging
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.coding import CodingMember, CodingProvider
from ..models.member360 import (
    Member360Accumulator,
    Member360AccumulatorScope,
    Member360Broker,
    Member360Claim,
    Member360ClaimDetail,
    Member360ClaimLine,
    Member360Coverage,
    Member360Dependent,
    Member360EmployerGroup,
    Member360ExternalKeyMap,
    Member360Medication,
    Member360Member,
    Member360Note,
    Member360Problem,
    Member360Provider,
    Member360ProviderLocation,
    Member360ProviderNetwork,
    Member360ProviderPayTo,
)

logger = logging.getLogger(__name__)


def _parse_date(val: Optional[str]) -> Optional[date]:
    if not val:
        return None
    raw = val.strip()
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(raw[:10], fmt).date()
        except ValueError:
            continue
    return None


def _parse_datetime(val: Optional[str]) -> Optional[datetime]:
    if not val:
        return None
    raw = val.strip()
    if not raw:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw[:19], fmt)
        except ValueError:
            continue
    return None


def _parse_decimal(val: Optional[str]) -> Optional[Decimal]:
    if not val:
        return None
    raw = val.strip().replace("$", "").replace(",", "")
    if not raw:
        return None
    try:
        return Decimal(raw)
    except InvalidOperation:
        return None


def _parse_int(val: Optional[str], default: Optional[int] = None) -> Optional[int]:
    if not val:
        return default
    raw = val.strip()
    if not raw:
        return default
    try:
        return int(float(raw))
    except ValueError:
        return default


def detect_uhs_feed_type(file_name: str, header_line: str) -> Optional[str]:
    """Identify which of the 17 UHS SFTP extract types a file represents."""
    fname = file_name.lower()
    cols = {c.strip() for c in header_line.split("|") if c.strip()}
    if "|" not in header_line:
        return None

    if "memberdetails" in fname or ("InternalMemberID" in cols and "PhyAddrLine1" in cols):
        return "member_details"
    if "enrollmentdetails" in fname or ("EnrollID" in cols and "SpanType" in cols):
        return "enrollment_details"
    if "memberpcpdetails" in fname or ("InternalPCPID" in cols and "PCPNPI" in cols):
        return "member_pcp_details"
    if "memberdesignee" in fname or ("membermemid" in cols and "designeememid" in cols):
        return "member_designee"
    if "accumdetails" in fname or ("SpecificType" in cols and "IndividualAccum" in cols):
        return "accum_details"
    if "claimdetails" in fname or ("claimid" in cols and "PrinDiag" in cols):
        return "claim_details"
    if "claimedits" in fname or ("ClaimEditRuleID" in cols and "RemitReasonID" in cols):
        return "claim_edits"
    if "claimmaildate" in fname or ("MailDate" in cols and "PayeeName" in cols):
        return "claim_mail_date"
    if "pharmacy" in fname or ("PrescriptionNumber" in cols and "NDCNUmber" in cols):
        return "pharmacy"
    if "provider_dtls" in fname or ("NationalProviderID" in cols and "ProviderSpecialty1_Desc" in cols):
        return "provider_details"
    if "provider_location" in fname or ("LocationAddr1" in cols and "isPCPLocation" in cols):
        return "provider_location"
    if "provider_affiliation" in fname or ("GroupAffiliationEffDate" in cols and "ParorNonPar" in cols):
        return "provider_affiliation"
    if "calltrackingdetail" in fname or ("callerid" in cols and "calltype_description" in cols):
        return "call_tracking_detail"
    if "calltrackingnotes" in fname or ("callerid" in cols and "DateLoaded" in cols and "Item" in cols):
        return "call_tracking_notes"
    if "groupdetails" in fname or ("GROUP_NUMBER" in cols and "BenefitPlanName" in cols):
        return "group_details"
    if "borkerdetails" in fname or "brokerdetails" in fname or ("BrokerID" in cols and "BrokerName" in cols):
        return "broker_details"
    if "provider_payto" in fname or ("Vendor1099ReportInfoID" in cols):
        return "provider_payto"
    return None


def _iter_pipe_rows(file_path: Path):
    """Yield dict rows from a pipe-delimited UHS extract file."""
    with file_path.open("r", encoding="utf-8-sig", errors="ignore", newline="") as fh:
        reader = csv.reader(fh, delimiter="|")
        try:
            raw_headers = next(reader)
        except StopIteration:
            return
        headers = [h.strip().lstrip("\ufeff") for h in raw_headers]
        for row in reader:
            if not row or not any(cell.strip() for cell in row):
                continue
            record: dict[str, str] = {}
            for idx, col in enumerate(headers):
                record[col] = row[idx].strip() if idx < len(row) else ""
            yield record


async def _get_or_create_member(
    session: AsyncSession,
    member_key: str,
    *,
    internal_key: Optional[str] = None,
) -> Optional[Member360Member]:
    key = (member_key or internal_key or "").strip()
    if not key:
        return None
    member = await session.scalar(
        select(Member360Member).where(Member360Member.member_key == key)
    )
    if not member and internal_key and internal_key != key:
        member = await session.scalar(
            select(Member360Member).where(Member360Member.member_key == internal_key.strip())
        )
    if not member:
        mapped_id = await session.scalar(
            select(Member360ExternalKeyMap.target_id).where(
                Member360ExternalKeyMap.entity_type == "member",
                Member360ExternalKeyMap.external_key.in_(
                    [k for k in (key, (internal_key or "").strip()) if k]
                ),
            )
        )
        if mapped_id:
            member = await session.get(Member360Member, mapped_id)
    if not member:
        member = Member360Member(
            member_key=key,
            first_name="Unknown",
            last_name="Member",
            risk_tier="moderate",
            risk_score_composite=Decimal("45.00"),
        )
        session.add(member)
        await session.flush()

    if internal_key and internal_key.strip():
        ext_k = internal_key.strip()[:64]
        existing_map = await session.scalar(
            select(Member360ExternalKeyMap).where(
                Member360ExternalKeyMap.entity_type == "member",
                Member360ExternalKeyMap.external_key == ext_k,
            )
        )
        if not existing_map:
            session.add(
                Member360ExternalKeyMap(
                    entity_type="member",
                    external_key=ext_k,
                    canonical_key=member.member_key[:64],
                    target_id=member.id,
                )
            )
    return member


async def import_uhs_file(
    session: AsyncSession,
    file_path: str | Path,
) -> tuple[str, int]:
    """Parse a UHS pipe-delimited extract file and upsert into the tenant DB.

    Returns ``(feed_type, records_processed)``.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    with path.open("r", encoding="utf-8-sig", errors="ignore") as fh:
        first_line = fh.readline().strip().lstrip("\ufeff")

    feed_type = detect_uhs_feed_type(path.name, first_line)
    if not feed_type:
        raise ValueError(f"Unrecognized UHS pipe-delimited format in {path.name}")

    processed = 0

    if feed_type == "member_details":
        for row in _iter_pipe_rows(path):
            mem_key = row.get("MemberID") or row.get("InternalMemberID")
            if not mem_key:
                continue
            member = await _get_or_create_member(
                session, mem_key, internal_key=row.get("InternalMemberID")
            )
            if not member:
                continue
            member.first_name = (row.get("FirstName") or member.first_name or "").title() or None
            member.last_name = (row.get("LastName") or member.last_name or "").title() or None
            member.date_of_birth = _parse_date(row.get("DOB")) or member.date_of_birth
            member.gender = (row.get("Gender") or member.gender or "")[:16] or None
            member.line_of_business = (row.get("LOB") or member.line_of_business or "")[:64] or None
            member.phone = (
                row.get("HomePhone#") or row.get("MobilePhone") or row.get("WorkPhone") or member.phone or ""
            )[:32] or None
            member.email = (row.get("EmailAddress") or member.email or "")[:255] or None
            member.address_line1 = (row.get("PhyAddrLine1") or row.get("MailingAddrLine1") or "")[:160] or None
            member.address_city = (row.get("PhyAddrCity") or row.get("MailingCity") or "")[:64] or None
            member.address_state = (row.get("PhyAddrState") or row.get("MailingState") or "")[:2] or None
            member.address_zip = (row.get("PhyAddrZip") or row.get("MailingZip") or "")[:10] or None
            lang = (row.get("PrimaryLanguage") or "").title()
            if lang:
                member.preferred_language = lang[:48]

            # Mirror core demographics into CodingMember as well
            coding_mem = await session.scalar(
                select(CodingMember).where(CodingMember.member_key == mem_key)
            )
            if not coding_mem:
                coding_mem = CodingMember(
                    member_key=mem_key,
                    first_name=member.first_name or "Unknown",
                    last_name=member.last_name or "Member",
                    date_of_birth=member.date_of_birth or date(1970, 1, 1),
                    gender=(member.gender or "U")[:1],
                    status=(row.get("MemberStatus") or "Active")[:32],
                    line_of_business=member.line_of_business,
                    primary_language=member.preferred_language,
                    address_city=member.address_city,
                    address_state=member.address_state,
                    address_zip=member.address_zip,
                )
                session.add(coding_mem)
            processed += 1

    elif feed_type == "enrollment_details":
        for row in _iter_pipe_rows(path):
            mem_key = row.get("MemberID") or row.get("InternalMemberID")
            member = await _get_or_create_member(
                session, mem_key or "", internal_key=row.get("InternalMemberID")
            )
            if not member:
                continue
            plan_name = (row.get("ProgramName") or row.get("PlanID") or "")[:128] or None
            lob = (row.get("LOB") or "")[:64] or None
            if plan_name:
                member.plan_name = plan_name
            if lob:
                member.line_of_business = lob

            span_type = (row.get("SpanType") or "").lower()
            cov_status = "termed" if "del" in span_type or "void" in span_type else "active"
            eff_date = _parse_date(row.get("EnrollmentEffDate") or row.get("EnrollCovTypeEffDate"))
            term_date = _parse_date(row.get("EnrollmentTermDate") or row.get("EnrollCovTypeTermDate"))
            is_prim = "sec" not in (row.get("PrimaryOrSecondaryCovType") or "").lower()

            cov = Member360Coverage(
                member_id=member.id,
                plan_name=plan_name,
                line_of_business=lob,
                coverage_status=cov_status,
                effective_date=eff_date,
                term_date=term_date,
                coverage_tier=(row.get("ProductType") or row.get("Program") or "")[:32] or None,
                relationship_to_subscriber="subscriber"
                if row.get("MemberID") == row.get("SubscriberMemberID")
                else "dependent",
                is_primary=is_prim,
            )
            session.add(cov)
            processed += 1

    elif feed_type == "member_pcp_details":
        for row in _iter_pipe_rows(path):
            mem_key = row.get("MemberID") or row.get("InternalMemberID")
            member = await _get_or_create_member(
                session, mem_key or "", internal_key=row.get("InternalMemberID")
            )
            if not member:
                continue
            first = (row.get("PCPFirstName") or "").title()
            last = (row.get("PCPLastName") or "").title()
            pcp_display = f"Dr. {first} {last}".strip() if (first or last) else row.get("ProviderGroupName")
            if pcp_display:
                member.primary_care_provider = pcp_display[:128]
            processed += 1

    elif feed_type == "member_designee":
        for row in _iter_pipe_rows(path):
            mem_key = row.get("membermemid")
            member = await _get_or_create_member(session, mem_key or "")
            if not member:
                continue
            dep = Member360Dependent(
                subscriber_member_id=member.id,
                member_key=(row.get("designeememid") or "")[:64] or None,
                relationship_type=(row.get("designeetypedesc") or "Representative")[:32],
                coverage_status="active",
            )
            session.add(dep)
            processed += 1

    elif feed_type == "accum_details":
        for row in _iter_pipe_rows(path):
            mem_key = row.get("MemberID") or row.get("AltMemberID")
            member = await _get_or_create_member(
                session, mem_key or "", internal_key=row.get("AltMemberID")
            )
            if not member:
                continue
            accum = await session.scalar(
                select(Member360Accumulator).where(Member360Accumulator.member_id == member.id)
            )
            if not accum:
                accum = Member360Accumulator(member_id=member.id)
                session.add(accum)
                await session.flush()

            spec = (row.get("SpecificType") or "").upper()
            curr = _parse_decimal(row.get("CurrentAmount"))
            maximum = _parse_decimal(row.get("MaximumAmount"))
            plan_year = _parse_int(row.get("PlanYear"))
            if plan_year and not accum.plan_year_start:
                accum.plan_year_start = date(plan_year, 1, 1)

            if "DED" in spec:
                accum.deductible_met = curr
                accum.deductible = maximum
            elif "OOP" in spec or "MOOP" in spec:
                accum.out_of_pocket_met = curr
                accum.out_of_pocket_max = maximum

            scope_name = "individual" if row.get("IndividualAccum") in ("1", "Y", "True") else "family"
            scoped = await session.scalar(
                select(Member360AccumulatorScope).where(
                    Member360AccumulatorScope.member_id == member.id,
                    Member360AccumulatorScope.scope == scope_name,
                )
            )
            if not scoped:
                scoped = Member360AccumulatorScope(
                    member_id=member.id,
                    scope=scope_name,
                    plan_year_start=accum.plan_year_start,
                )
                session.add(scoped)
            if "DED" in spec:
                scoped.deductible_met = curr
                scoped.deductible = maximum
            elif "OOP" in spec or "MOOP" in spec:
                scoped.out_of_pocket_met = curr
                scoped.out_of_pocket_max = maximum
            processed += 1

    elif feed_type == "claim_details":
        for row in _iter_pipe_rows(path):
            claim_num = (row.get("claimid") or "").strip()
            mem_key = row.get("memid") or row.get("InternalSubscriberID")
            if not claim_num or not mem_key:
                continue
            member = await _get_or_create_member(
                session, mem_key, internal_key=row.get("InternalSubscriberID")
            )
            if not member:
                continue

            svc_date = _parse_date(row.get("StartServiceDate") or row.get("DOSFrom_ClaimLine"))
            billed = _parse_decimal(row.get("claimamt_or_Charges"))
            allowed = _parse_decimal(row.get("AllowedAmt_or_ContractPaid"))
            paid = _parse_decimal(row.get("amountpaid"))
            mem_resp = _parse_decimal(row.get("memamt"))
            status_val = (row.get("ClaimStatus") or "paid").lower()[:32]

            claim = await session.scalar(
                select(Member360Claim).where(
                    Member360Claim.member_id == member.id,
                    Member360Claim.claim_number == claim_num,
                )
            )
            if not claim:
                claim = Member360Claim(
                    member_id=member.id,
                    claim_number=claim_num[:64],
                    service_date=svc_date,
                    provider=(row.get("RenderingProvider") or row.get("PayToFacilityName") or "")[:160] or None,
                    category=(row.get("ClaimType") or row.get("PosDesc") or "Medical")[:64],
                    status=status_val,
                    billed_amount=billed,
                    paid_amount=paid,
                    member_responsibility=mem_resp,
                )
                session.add(claim)
                await session.flush()

            line_no = _parse_int(row.get("claimline"), default=1) or 1
            proc_code = (row.get("Cpt41") or row.get("Hcpcs") or row.get("servcode") or "")[:32] or None
            line = Member360ClaimLine(
                claim_id=claim.id,
                line_number=line_no,
                service_date=svc_date,
                procedure_code=proc_code,
                procedure_description=(row.get("RenderingProviderSpecDesc") or row.get("PosDesc") or "")[:255] or None,
                billed_amount=billed,
                allowed_amount=allowed,
                paid_amount=paid,
                member_responsibility=mem_resp,
                copay=_parse_decimal(row.get("copay")),
                coinsurance=_parse_decimal(row.get("coinsuranceamt")),
                deductible=_parse_decimal(row.get("Deductible")),
                status=(row.get("ClaimLineStatus") or status_val).lower()[:32],
                denial_reason=(row.get("LineLevelPendRuleDescription") or "")[:255] or None,
            )
            session.add(line)

            # Extract ICD-10 diagnosis codes (PrinDiag + DiagCode1..DiagCode40) into m360_problems
            diag_cols = ["PrinDiag", "AdmitDiag"] + [f"DiagCode{i}" for i in range(1, 41)]
            seen_codes: set[str] = set()
            for idx, col in enumerate(diag_cols):
                code = (row.get(col) or "").strip()
                if not code or code in seen_codes:
                    continue
                seen_codes.add(code)
                existing_prob = await session.scalar(
                    select(Member360Problem).where(
                        Member360Problem.member_id == member.id,
                        Member360Problem.code == code[:32],
                    )
                )
                if not existing_prob:
                    session.add(
                        Member360Problem(
                            member_id=member.id,
                            code=code[:32],
                            code_system="ICD-10",
                            description=f"ICD-10 Diagnosis {code}",
                            status="active",
                            is_primary=(idx == 0),
                            onset_date=svc_date,
                            recorded_by=(row.get("RenderingProvider") or "QNXT Claim Feed")[:255],
                        )
                    )
            processed += 1

    elif feed_type == "claim_edits":
        for row in _iter_pipe_rows(path):
            claim_num = (row.get("claimid") or "").strip()
            if not claim_num:
                continue
            claim = await session.scalar(
                select(Member360Claim).where(Member360Claim.claim_number == claim_num)
            )
            if claim:
                reason = row.get("RemitDescription") or row.get("ClaimEditDescription")
                detail = await session.scalar(
                    select(Member360ClaimDetail).where(Member360ClaimDetail.claim_id == claim.id)
                )
                if not detail:
                    detail = Member360ClaimDetail(claim_id=claim.id, denial_reason=reason)
                    session.add(detail)
                elif reason:
                    detail.denial_reason = reason
            processed += 1

    elif feed_type == "claim_mail_date":
        for row in _iter_pipe_rows(path):
            claim_num = (row.get("claimid") or "").strip()
            if not claim_num:
                continue
            claim = await session.scalar(
                select(Member360Claim).where(Member360Claim.claim_number == claim_num)
            )
            if claim:
                mail_dt = _parse_date(row.get("MailDate"))
                detail = await session.scalar(
                    select(Member360ClaimDetail).where(Member360ClaimDetail.claim_id == claim.id)
                )
                if not detail:
                    detail = Member360ClaimDetail(claim_id=claim.id, remittance_date=mail_dt)
                    session.add(detail)
                elif mail_dt:
                    detail.remittance_date = mail_dt
            processed += 1

    elif feed_type == "pharmacy":
        for row in _iter_pipe_rows(path):
            mem_key = row.get("MemberID")
            rx_num = (row.get("PrescriptionNumber") or row.get("ClaimNumber") or "").strip()
            if not mem_key or not rx_num:
                continue
            member = await _get_or_create_member(session, mem_key)
            if not member:
                continue
            fill_date = _parse_date(row.get("DateofService") or row.get("DateRxWritten"))
            prescriber_first = (row.get("PrescriberFirstName") or "").title()
            prescriber_last = (row.get("PrescriberLastName") or "").title()
            prescriber = f"{prescriber_first} {prescriber_last}".strip() or row.get("PrescriberIdentification")

            med = await session.scalar(
                select(Member360Medication).where(
                    Member360Medication.member_id == member.id,
                    Member360Medication.rx_number == rx_num[:64],
                )
            )
            if not med:
                med = Member360Medication(
                    member_id=member.id,
                    rx_number=rx_num[:64],
                    ndc_code=(row.get("NDCNUmber") or "")[:16] or None,
                    drug_name=(row.get("DrugDescription") or "Prescription Medication")[:255],
                    generic_name=(row.get("DrugDescriptionGenericName") or "")[:255] or None,
                    dose=(row.get("Strength") or "")[:64] or None,
                    route=(row.get("RouteDescription") or "")[:32] or None,
                    days_supply=_parse_int(row.get("DaysSupply")),
                    prescriber=(prescriber or "")[:160] or None,
                    pharmacy=(row.get("PharmacyName") or "")[:160] or None,
                    start_date=_parse_date(row.get("DateRxWritten")) or fill_date,
                    last_fill_date=fill_date,
                    status="active",
                )
                session.add(med)
            else:
                med.last_fill_date = fill_date or med.last_fill_date
            processed += 1

    elif feed_type == "provider_details":
        for row in _iter_pipe_rows(path):
            prov_key = (row.get("ProviderID") or "").strip()[:64]
            npi = (row.get("NationalProviderID") or prov_key or "").strip()[:15]
            if not npi:
                continue
            first = (row.get("FirstName") or "").title()
            last = (row.get("LastName") or "").title()
            degree = row.get("ProviderDegree") or ""
            org = row.get("OrgName") or ""
            display_name = (
                f"{first} {last}, {degree}".strip(", ") if (first or last) else (org or npi)
            )[:160]
            spec = (row.get("ProviderSpecialty1_Desc") or "General Practice").title()[:120]
            is_pcp = (row.get("IsSpecialtyPCP1") or "").lower() in ("true", "1", "y", "yes")

            prov = await session.scalar(
                select(Member360Provider).where(Member360Provider.npi == npi)
            )
            if not prov:
                prov = Member360Provider(
                    npi=npi,
                    name=display_name,
                    specialty=spec,
                    is_pcp=is_pcp,
                    gender=(row.get("Gender") or "")[:16] or None,
                    status="active",
                )
                session.add(prov)
                await session.flush()
            else:
                prov.name = display_name
                prov.specialty = spec
                prov.is_pcp = is_pcp

            if prov_key:
                existing_map = await session.scalar(
                    select(Member360ExternalKeyMap).where(
                        Member360ExternalKeyMap.entity_type == "provider",
                        Member360ExternalKeyMap.external_key == prov_key,
                    )
                )
                if not existing_map:
                    session.add(
                        Member360ExternalKeyMap(
                            entity_type="provider",
                            external_key=prov_key,
                            canonical_key=npi,
                            target_id=prov.id,
                        )
                    )

            c_prov = await session.scalar(
                select(CodingProvider).where(CodingProvider.npi == npi)
            )
            if not c_prov:
                session.add(
                    CodingProvider(
                        npi=npi,
                        tax_id=(row.get("TaxID") or "")[:15] or None,
                        name=display_name[:128],
                    )
                )
            processed += 1

    elif feed_type == "provider_location":
        for row in _iter_pipe_rows(path):
            first = (row.get("ProviderFirstName") or "").title()
            last = (row.get("ProviderLastName") or "").title()
            prov_id = (row.get("ProviderID") or "").strip()[:64]
            prov: Optional[Member360Provider] = None
            if prov_id:
                mapped_id = await session.scalar(
                    select(Member360ExternalKeyMap.target_id).where(
                        Member360ExternalKeyMap.entity_type == "provider",
                        Member360ExternalKeyMap.external_key == prov_id,
                    )
                )
                if mapped_id:
                    prov = await session.get(Member360Provider, mapped_id)
            if not prov:
                prov = await session.scalar(
                    select(Member360Provider).where(
                        (Member360Provider.npi == prov_id[:15])
                        | (Member360Provider.name.ilike(f"%{last}%"))
                    )
                )
            if not prov:
                prov = Member360Provider(
                    npi=prov_id[:15] or None,
                    name=(f"{first} {last}".strip() or row.get("LocationName") or "Provider")[:160],
                    is_pcp=(row.get("isPCPLocation") or "").upper() == "Y",
                )
                session.add(prov)
                await session.flush()

            session.add(
                Member360ProviderLocation(
                    provider_id=prov.id,
                    address_line1=(row.get("LocationAddr1") or "")[:160] or None,
                    address_line2=(row.get("LocationAddr2") or "")[:160] or None,
                    city=(row.get("LocationAddrCity") or "")[:64] or None,
                    state=(row.get("LocationAddrState") or "")[:2] or None,
                    postal_code=(row.get("LocationAddrZip") or "")[:10] or None,
                    phone=(row.get("LocationPhoneNumber") or "")[:32] or None,
                )
            )
            processed += 1

    elif feed_type == "provider_affiliation":
        for row in _iter_pipe_rows(path):
            prov_id = (row.get("ProviderID") or "").strip()[:64]
            prov = None
            if prov_id:
                mapped_id = await session.scalar(
                    select(Member360ExternalKeyMap.target_id).where(
                        Member360ExternalKeyMap.entity_type == "provider",
                        Member360ExternalKeyMap.external_key == prov_id,
                    )
                )
                if mapped_id:
                    prov = await session.get(Member360Provider, mapped_id)
            if not prov:
                prov = await session.scalar(
                    select(Member360Provider).where(Member360Provider.npi == prov_id[:15])
                )
            if prov:
                net_status = (
                    "in_network"
                    if (row.get("ParorNonPar") or "").lower().startswith("par")
                    else "out_of_network"
                )
                session.add(
                    Member360ProviderNetwork(
                        provider_id=prov.id,
                        plan_name=(row.get("Program") or row.get("GroupName") or "")[:128] or None,
                        line_of_business=(row.get("LOB") or "")[:64] or None,
                        network_status=net_status,
                    )
                )
            processed += 1

    elif feed_type == "call_tracking_detail":
        for row in _iter_pipe_rows(path):
            mem_key = row.get("MemID") or row.get("enrollid")
            member = await _get_or_create_member(session, mem_key or "")
            if not member:
                continue
            caller_id = row.get("callerid") or ""
            cat = row.get("calltype_category") or "CALL"
            desc = row.get("calltype_description") or ""
            res = row.get("resolution_description") or row.get("status") or ""
            created = _parse_datetime(row.get("createdate")) or datetime.utcnow()
            author = row.get("createid") or "call_center"

            session.add(
                Member360Note(
                    member_id=member.id,
                    author_email=f"{author}@prominencehealth.com",
                    author_name=author,
                    channel="phone",
                    note_type=f"{cat}: {desc}"[:64],
                    body=f"[{caller_id}] {cat} - {desc} (Resolution: {res})",
                    created_at=created,
                )
            )
            processed += 1

    elif feed_type == "call_tracking_notes":
        # Group lines by callerid
        grouped: dict[str, list[tuple[int, str, dict[str, str]]]] = {}
        for row in _iter_pipe_rows(path):
            cid = (row.get("callerid") or "").strip()
            if not cid:
                continue
            seq = _parse_int(row.get("Number"), default=0) or 0
            text_item = (row.get("Item") or "").strip()
            if text_item:
                grouped.setdefault(cid, []).append((seq, text_item, row))
            processed += 1

        for cid, items in grouped.items():
            items.sort(key=lambda x: x[0])
            combined_text = "\n".join(x[1] for x in items)
            existing_note = await session.scalar(
                select(Member360Note).where(Member360Note.body.like(f"[{cid}]%"))
            )
            if existing_note:
                existing_note.body = f"{existing_note.body}\n{combined_text}"

    elif feed_type == "group_details":
        for row in _iter_pipe_rows(path):
            grp_num = (row.get("GROUP_NUMBER") or "").strip()[:64]
            if not grp_num:
                continue
            grp = await session.scalar(
                select(Member360EmployerGroup).where(Member360EmployerGroup.group_number == grp_num)
            )
            if not grp:
                grp = Member360EmployerGroup(
                    group_number=grp_num,
                    cust_id=(row.get("CUST_ID") or "")[:64] or None,
                    group_name=(row.get("GROUP_NAME") or grp_num)[:160],
                    effective_date=_parse_date(row.get("GRP_EFF_DT")),
                    expiration_date=_parse_date(row.get("GRP_EXP_DT")),
                    renewal_date=_parse_date(row.get("RENEWAL DATE")),
                    benefit_plan_id=(row.get("BenefitPlanID") or row.get("PLAN_ID") or "")[:64] or None,
                    benefit_plan_name=(row.get("BenefitPlanName") or row.get("PLAN_NM") or "")[:160] or None,
                    program_id=(row.get("PROGRAM_ID") or "")[:64] or None,
                    program_name=(row.get("PROGRAM") or "")[:128] or None,
                    contact_name=(row.get("GROUP CONTACT") or "")[:128] or None,
                    contact_phone=(row.get("CONTACT_PHONE") or "")[:32] or None,
                    contact_email=(row.get("GROUP_CONTACT_E-MAIL") or "")[:255] or None,
                    address_line1=(row.get("GROUP_ADDRESS_1") or "")[:160] or None,
                    city=(row.get("CITY") or "")[:64] or None,
                    state=(row.get("STATE") or "")[:2] or None,
                    postal_code=(row.get("ZIP") or "")[:10] or None,
                    group_size=(row.get("GROUP_SIZE") or "")[:64] or None,
                    region=(row.get("REGION") or "")[:64] or None,
                    line_of_business=(row.get("LOB") or "")[:64] or None,
                )
                session.add(grp)
            processed += 1

    elif feed_type == "broker_details":
        for row in _iter_pipe_rows(path):
            broker_id = (row.get("BrokerID") or "").strip()[:64]
            if not broker_id:
                continue
            session.add(
                Member360Broker(
                    broker_id=broker_id,
                    group_number=(row.get("GroupID") or "")[:64] or None,
                    broker_name=(row.get("BrokerName") or broker_id)[:160],
                    start_date=_parse_date(row.get("BrokerStartDate")),
                    end_date=_parse_date(row.get("BrokerEndDate")),
                )
            )
            processed += 1

    elif feed_type == "provider_payto":
        for row in _iter_pipe_rows(path):
            vendor_id = (row.get("VendorID") or row.get("InternalVendorID") or "").strip()[:64]
            if not vendor_id:
                continue
            session.add(
                Member360ProviderPayTo(
                    vendor_id=vendor_id,
                    internal_vendor_id=(row.get("InternalVendorID") or "")[:64] or None,
                    legal_name=(row.get("LegalName") or vendor_id)[:160],
                    tax_id=(row.get("TaxID") or "")[:32] or None,
                    tax_id_type=(row.get("TaxIDType") or "")[:32] or None,
                    effective_date=_parse_date(row.get("EffDate")),
                    term_date=_parse_date(row.get("TermDate")),
                    address_line1=(row.get("StreetAddress1") or "")[:160] or None,
                    city=(row.get("City") or "")[:64] or None,
                    state=(row.get("State") or "")[:2] or None,
                    postal_code=(row.get("ZipCode") or "")[:10] or None,
                    county=(row.get("County") or "")[:64] or None,
                )
            )
            processed += 1

    else:
        for _ in _iter_pipe_rows(path):
            processed += 1

    await session.flush()
    return feed_type, processed
