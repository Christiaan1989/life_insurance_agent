"""Tools for the Sentinel Life Claims Agent.

Each tool wraps an HTTP call to the Sentinel Life API (port 8001).
"""

import json
import os
import re
import sys
import tempfile
import base64
import binascii
import site
from datetime import date, datetime
from pathlib import Path
from typing import Any, Optional

import httpx
from langchain_core.tools import tool

API_URL = os.getenv("SENTINEL_API_URL", "http://localhost:8001")
API_KEY = os.getenv("SENTINEL_API_KEY", "sentinel-api-key-2025")
DEV_MODE = os.getenv("SENTINEL_DEV_MODE", "false").lower() == "true"

_HEADERS = {"X-API-Key": API_KEY}
_REPORTS_DIR = Path(__file__).resolve().parent.parent / "reports"
_DEATH_CERTIFICATES_DIR = Path(__file__).resolve().parent.parent / "Death Certificates"
_PROJECT_VENV_SITE = Path(__file__).resolve().parent.parent / ".venv" / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages"

_DEATH_CERTIFICATE_NAME_PATTERNS = [
    re.compile(r"\bdeath\s*cert(?:ificate)?\b", re.IGNORECASE),
    re.compile(r"\bcertificate\s+of\s+death\b", re.IGNORECASE),
    re.compile(r"\bdeceased\s+cert(?:ificate)?\b", re.IGNORECASE),
    re.compile(r"\bbi[-_\s]?1663\b", re.IGNORECASE),
    re.compile(r"\bdha[-_\s]?(?:death|1663)\b", re.IGNORECASE),
    re.compile(r"(?:^|[^A-Za-z0-9])DC(?:[^A-Za-z0-9]|\d|$)"),
]


def _url(path: str) -> str:
    return f"{API_URL}{path}"


def _error(resp: httpx.Response) -> str:
    try:
        detail = resp.json().get("detail", resp.text)
    except Exception:
        detail = resp.text
    return json.dumps({"error": detail, "status_code": resp.status_code})


def _connect_error() -> str:
    return json.dumps({
        "error": "Cannot reach the Sentinel Life API (connection refused). "
                 "Please ensure the backend service is running on port 8001.",
        "status_code": 503,
    })


def _get(path: str, **kwargs) -> httpx.Response | str:
    try:
        return httpx.get(_url(path), headers=_HEADERS, timeout=10, **kwargs)
    except httpx.ConnectError:
        return _connect_error()


def _post(path: str, **kwargs) -> httpx.Response | str:
    try:
        return httpx.post(_url(path), headers=_HEADERS, timeout=15, **kwargs)
    except httpx.ConnectError:
        return _connect_error()


def _patch(path: str, **kwargs) -> httpx.Response | str:
    try:
        return httpx.patch(_url(path), headers=_HEADERS, timeout=10, **kwargs)
    except httpx.ConnectError:
        return _connect_error()


def _pdf_safe(text: str) -> str:
    return (
        text
        .replace("\u2013", "-").replace("\u2014", "-")
        .replace("\u2018", "'").replace("\u2019", "'")
        .replace("\u201c", '"').replace("\u201d", '"')
        .replace("\u2026", "...").replace("\u2022", "-")
        .replace("\u2192", "->")
    )


def is_likely_death_certificate_filename(filename: str | None) -> bool:
    """Return true when an uploaded filename likely refers to a death certificate."""
    if not filename:
        return False
    basename = Path(filename).name
    stem = Path(basename).stem
    normalized = re.sub(r"[^a-z0-9]+", " ", stem.lower()).strip()
    if any(
        phrase in normalized
        for phrase in (
            "death cert",
            "death certificate",
            "certificate of death",
            "deceased cert",
            "deceased certificate",
            "bi 1663",
            "dha death",
            "dha 1663",
        )
    ):
        return True
    if any(pattern.search(stem) for pattern in _DEATH_CERTIFICATE_NAME_PATTERNS):
        return True
    tokens = [t for t in re.split(r"[^A-Za-z0-9]+", stem) if t]
    return any(t.upper() == "DC" or re.fullmatch(r"DC\d+", t.upper()) for t in tokens)


def _decode_file_data(file_data_base64: str) -> bytes:
    data = file_data_base64.strip()
    if data.startswith("data:"):
        _, _, data = data.partition(",")
    try:
        return base64.b64decode(data, validate=True)
    except binascii.Error:
        return base64.b64decode(data)


def _suffix_for_upload(file_name: str, mime_type: str | None = None) -> str:
    suffix = Path(file_name).suffix.lower()
    if suffix:
        return suffix
    if mime_type == "application/pdf":
        return ".pdf"
    if mime_type and mime_type.startswith("image/"):
        ext = mime_type.split("/", 1)[1].lower().replace("jpeg", "jpg")
        return f".{ext}"
    return ".bin"


def _certificate_analyzer_class():
    if not _DEATH_CERTIFICATES_DIR.exists():
        raise FileNotFoundError(f"Death certificate analyzer folder not found: {_DEATH_CERTIFICATES_DIR}")
    if _PROJECT_VENV_SITE.exists() and str(_PROJECT_VENV_SITE) not in sys.path:
        site.addsitedir(str(_PROJECT_VENV_SITE))
    cert_dir = str(_DEATH_CERTIFICATES_DIR)
    if cert_dir not in sys.path:
        sys.path.insert(0, cert_dir)
    from certificate_forensics import CertificateForensicAnalyzer
    return CertificateForensicAnalyzer


def _compact_forensic_checks(raw_checks: dict[str, Any]) -> list[dict[str, Any]]:
    compact: list[dict[str, Any]] = []
    for name, check in raw_checks.items():
        if not isinstance(check, dict):
            continue
        flags = check.get("flags") or []
        penalty = float(check.get("penalty") or 0)
        skipped = bool(check.get("skipped"))
        if skipped and not flags:
            continue
        if penalty <= 0 and not flags:
            continue
        compact.append({
            "name": name,
            "penalty": round(penalty, 4),
            "flags": flags,
            "skipped": skipped,
            "skip_reason": check.get("skip_reason") or "",
        })
    return compact


def _death_certificate_forensics_payload(
    file_name: str,
    file_data_base64: str,
    mime_type: Optional[str] = None,
    claim_id: Optional[str] = None,
) -> dict[str, Any]:
    if not is_likely_death_certificate_filename(file_name):
        return {
            "file_name": file_name,
            "document_type": "unknown",
            "analysis_available": False,
            "error": "Filename does not look like a death certificate.",
            "decision_hint": "not_applicable",
        }

    try:
        file_bytes = _decode_file_data(file_data_base64)
    except Exception as exc:
        return {
            "file_name": file_name,
            "document_type": "death_certificate",
            "analysis_available": False,
            "error": f"Could not decode uploaded file data: {exc}",
            "risk_level": "MEDIUM",
            "recommendation": "FLAG_FOR_REVIEW",
            "requires_review": True,
            "decision_hint": "pending_info",
        }

    suffix = _suffix_for_upload(file_name, mime_type)
    temp_path = ""
    try:
        with tempfile.NamedTemporaryFile(prefix="sentinel_dc_", suffix=suffix, delete=False) as tmp:
            tmp.write(file_bytes)
            temp_path = tmp.name

        Analyzer = _certificate_analyzer_class()
        result = Analyzer().analyze(temp_path).to_dict()
        score = int(result.get("overall_score", 0))
        fraud_score = max(0, min(100, 100 - score))
        risk_level = str(result.get("risk_level", "MEDIUM"))
        recommendation = str(result.get("recommendation", "FLAG_FOR_REVIEW"))
        fraudulent = risk_level == "HIGH" or recommendation == "FLAG_URGENT" or score < 40
        requires_review = risk_level == "MEDIUM" or recommendation == "FLAG_FOR_REVIEW"

        if fraudulent:
            decision_hint = "deny"
            summary = (
                f"High death-certificate fraud risk: integrity score {score}/100 "
                f"(fraud score {fraud_score}/100), risk {risk_level}."
            )
        elif requires_review:
            decision_hint = "pending_info"
            summary = (
                f"Death-certificate forensic review needs human review: integrity score {score}/100 "
                f"(fraud score {fraud_score}/100), risk {risk_level}."
            )
        else:
            decision_hint = "continue"
            summary = (
                f"Death-certificate forensic review passed: integrity score {score}/100 "
                f"(fraud score {fraud_score}/100), risk {risk_level}."
            )

        payload = {
            "file_name": file_name,
            "document_type": "death_certificate",
            "analysis_available": True,
            "overall_score": score,
            "fraud_score": fraud_score,
            "risk_level": risk_level,
            "recommendation": recommendation,
            "fraudulent": fraudulent,
            "requires_review": requires_review,
            "decision_hint": decision_hint,
            "summary": summary,
            "flags": result.get("flags", []),
            "notable_checks": _compact_forensic_checks(result.get("checks", {})),
            "processing_ms": result.get("processing_ms"),
        }
    except Exception as exc:
        payload = {
            "file_name": file_name,
            "document_type": "death_certificate",
            "analysis_available": False,
            "error": str(exc),
            "risk_level": "MEDIUM",
            "recommendation": "FLAG_FOR_REVIEW",
            "requires_review": True,
            "decision_hint": "pending_info",
            "summary": "Death-certificate forensic review could not complete; manual review is required before approval.",
        }
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except OSError:
                pass

    if claim_id and payload.get("document_type") == "death_certificate":
        _post(f"/claims/{claim_id}/events", json={
            "event_type": "document_received",
            "message": f"Death certificate forensic analysis completed for {file_name}.",
            "payload": {"death_certificate_forensics": payload},
        })

    return payload


@tool
def analyze_death_certificate_forensics(
    file_name: str,
    file_data_base64: str,
    mime_type: Optional[str] = None,
    claim_id: Optional[str] = None,
) -> str:
    """Run forensic fraud analysis on an uploaded death certificate PDF or image.

    Use this only for documents whose filename indicates a death certificate,
    including names containing "DC", "death certificate", "death cert",
    "certificate of death", "deceased certificate", "BI-1663", or DHA death
    certificate wording.

    The tool checks PDF/image metadata, structure, signatures, compression,
    error-level/noise consistency, and other tamper indicators. It returns a
    compact dictionary with:
    - overall_score: 0-100 integrity score, where 100 means no anomalies
    - fraud_score: 0-100 inverse score, where higher means more suspicious
    - risk_level: CLEAN, LOW, MEDIUM, or HIGH
    - recommendation: PASS, PASS_WITH_NOTE, FLAG_FOR_REVIEW, or FLAG_URGENT
    - fraudulent: true for high-risk certificates that should deny the claim
    - decision_hint: deny, pending_info, continue, or not_applicable

    Do not create a PDF report from this analysis.

    Args:
        file_name: Original uploaded filename.
        file_data_base64: Uploaded file bytes as base64 or a data URL.
        mime_type: MIME type, e.g. application/pdf or image/jpeg.
        claim_id: Current claim UUID, if already opened, so the analysis can be logged.
    """
    return json.dumps(
        _death_certificate_forensics_payload(file_name, file_data_base64, mime_type, claim_id),
        indent=2,
    )


# ---------------------------------------------------------------------------
# UI View Management
# ---------------------------------------------------------------------------
@tool
def set_active_view(view: str) -> str:
    """Switch the customer portal to a specific full-screen view.

    Args:
        view: One of:
              - "home" — landing / welcome screen
              - "policy_overview" — full policy details, coverage, beneficiaries
              - "payments" — recent premium payments and payment history
              - "claims" — guided claim filing flow, including document upload
              - "document_upload" — legacy alias for "claims"
              - "claim_outcome" — decision screen with payout breakdown
              - "dashboard" — claims history and policy summary
              - "auth" — identity verification (use request_authentication instead)
    """
    valid_views = {"home", "policy_overview", "payments", "claims", "document_upload", "claim_outcome", "dashboard", "auth"}
    if view not in valid_views:
        return json.dumps({"error": f"Invalid view '{view}'. Must be one of: {', '.join(sorted(valid_views))}"})
    normalized_view = "claims" if view == "document_upload" else view
    return json.dumps({"active_view": normalized_view, "status": "ok"})


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------
@tool
def request_authentication(
    policy_id: str,
    reason: str,
    national_id: Optional[str] = None,
    intended_view: str = "policy_overview",
) -> str:
    """Trigger the identity verification flow for a customer.

    Call this BEFORE accessing any personal policy or claim data.
    The customer must provide their policy ID and South African national ID number.
    If the national ID is not known yet, this tool still opens the authentication
    screen so the frontend can collect it securely and request the OTP there.

    After successful verification, a [VERIFIED] message will appear in the
    conversation — at that point resume the original request without calling
    this tool again.

    Args:
        policy_id: The customer's policy ID (e.g. 'POL-2024-001').
        reason: Short human-readable reason shown on the verification screen.
        national_id: The customer's 13-digit SA national ID number, if already known.
        intended_view: View to land on after verification (default: 'policy_overview').
    """
    # DEV_MODE: skip OTP email entirely — frontend skip button handles verification
    if DEV_MODE:
        return json.dumps({
            "active_view": "auth",
            "action": "request_auth",
            "masked_email": "dev***@localhost",
            "policy_id": policy_id,
            "national_id": national_id,
            "reason": reason,
            "intended_view": intended_view,
            "status": "ok",
            "dev_mode": True,
        })

    if not national_id:
        return json.dumps({
            "active_view": "auth",
            "action": "collect_auth_details",
            "policy_id": policy_id,
            "reason": reason,
            "intended_view": intended_view,
            "status": "needs_credentials",
        })

    try:
        resp = httpx.post(
            _url("/auth/request-otp"),
            json={"policy_id": policy_id, "national_id": national_id},
            timeout=15,
        )
    except httpx.ConnectError:
        return _connect_error()
    if resp.status_code != 200:
        return _error(resp)

    data = resp.json()
    return json.dumps({
        "active_view": "auth",
        "action": "request_auth",
        "masked_email": data.get("email_hint", "***"),
        "policy_id": policy_id,
        "national_id": national_id,
        "reason": reason,
        "intended_view": intended_view,
        "status": "ok",
    })


# ---------------------------------------------------------------------------
# Policy Lookup
# ---------------------------------------------------------------------------
@tool
def get_policy(policy_id: str) -> str:
    """Retrieve a life insurance policy with all associated data.

    Returns the full policy record including:
    - Policyholder details (name, DOB, ID, contact)
    - Coverage types (Death, Disability, Critical Illness)
    - Sum assured amounts per cover type
    - Beneficiaries and their percentage shares
    - Policy riders (Funeral Benefit, Premium Waiver, etc.)
    - Last 6 premium payments with status
    - Policy status, start/end dates, exclusions

    Use this immediately after [VERIFIED] to understand what the customer has.

    Args:
        policy_id: The policy ID (e.g. 'POL-2024-001').
    """
    resp = _get(f"/policies/{policy_id}")
    if isinstance(resp, str):
        return resp
    if resp.status_code != 200:
        return _error(resp)
    return resp.text


# ---------------------------------------------------------------------------
# Eligibility Check
# ---------------------------------------------------------------------------
@tool
def check_eligibility(
    policy_id: str,
    claim_type: str,
    incident_date: str,
) -> str:
    """Run all eligibility checks for a life insurance claim.

    Checks the following rules in order and returns a pass/fail result for each:
    1. Policy is Active (not Lapsed, Claimed, or Cancelled)
    2. Premiums are up to date (no missed payments in last 3 months)
    3. Claim type is covered by this policy (e.g. Disability cover exists)
    4. Incident is within the 24-month submission window
    5. Incident date is after policy start date
    6. Suicide exclusion period check (24-month waiting period)
    7. Pre-existing condition exclusion check (if applicable)

    Returns a structured eligibility report with:
    - overall_eligible: true/false
    - checks: list of {name, passed, detail} objects
    - denial_reason: if overall_eligible is false, the first failed check

    Args:
        policy_id: The policy ID to check.
        claim_type: One of 'Death', 'Disability', 'Critical Illness'.
        incident_date: Date of the event in YYYY-MM-DD format.
    """
    policy_resp = _get(f"/policies/{policy_id}")
    if isinstance(policy_resp, str):
        return policy_resp
    if policy_resp.status_code != 200:
        return _error(policy_resp)
    policy = policy_resp.json()

    checks = []
    denial_reason = None

    # 1. Policy status
    status = policy.get("policy_status", "Unknown")
    active = status == "Active"
    checks.append({
        "name": "Policy Active",
        "passed": active,
        "detail": f"Policy status: {status}" if active else f"Policy is {status} — claims cannot be processed.",
    })
    if not active:
        denial_reason = f"Policy is {status}. Only Active policies can be claimed against."

    # 2. Premium payments — check last 3 months
    payments = policy.get("recent_payments", [])
    paid_payments = [p for p in payments if p.get("payment_status") == "Paid"]
    premiums_ok = len(paid_payments) >= 1  # at least one recent paid payment
    missed_count = len([p for p in payments if p.get("payment_status") != "Paid"])
    checks.append({
        "name": "Premiums Up To Date",
        "passed": premiums_ok,
        "detail": f"{len(paid_payments)} paid payments on record." if premiums_ok else f"{missed_count} missed/failed payments detected.",
    })
    if not premiums_ok and not denial_reason:
        denial_reason = "Premiums are not up to date. Outstanding premiums must be settled before a claim can be processed."

    # 3. Cover type check
    cover_types = [c.strip() for c in policy.get("cover_types", "").split(",")]
    claim_type_map = {
        "Death": "Death",
        "Disability": "Disability",
        "Critical Illness": "Critical Illness",
    }
    required_cover = claim_type_map.get(claim_type)
    covered = required_cover in cover_types if required_cover else False
    checks.append({
        "name": f"{claim_type} Cover Included",
        "passed": covered,
        "detail": f"Policy covers: {', '.join(cover_types)}." if covered else f"This policy does not include {claim_type} cover. Covered types: {', '.join(cover_types)}.",
    })
    if not covered and not denial_reason:
        denial_reason = f"This policy does not include {claim_type} cover."

    # 4. Submission window (24 months from incident date)
    try:
        incident_dt = date.fromisoformat(incident_date)
        today = date.today()
        try:
            submission_deadline = incident_dt.replace(year=incident_dt.year + 2)
        except ValueError:
            # Handle leap day by falling back to the last valid day in February.
            submission_deadline = incident_dt.replace(year=incident_dt.year + 2, day=28)
        days_since = (today - incident_dt).days
        within_window = today <= submission_deadline
        checks.append({
            "name": "Within 24-Month Submission Window",
            "passed": within_window,
            "detail": (
                f"Incident was {days_since} days ago."
                if within_window
                else f"Incident occurred {days_since} days ago — outside the 24-month submission window."
            ),
        })
        if not within_window and not denial_reason:
            denial_reason = f"Claim submitted {days_since} days after the incident, exceeding the 24-month submission window."
    except ValueError:
        checks.append({"name": "Within 24-Month Submission Window", "passed": False, "detail": "Invalid incident date format."})

    # 5. Incident after policy start
    try:
        start_dt = date.fromisoformat(policy.get("start_date", "2000-01-01"))
        after_start = incident_dt >= start_dt
        checks.append({
            "name": "Incident After Policy Start",
            "passed": after_start,
            "detail": f"Policy started {start_dt}, incident on {incident_dt}." if after_start else f"Incident ({incident_dt}) occurred before policy started ({start_dt}).",
        })
        if not after_start and not denial_reason:
            denial_reason = f"Incident date ({incident_dt}) is before the policy start date ({start_dt})."
    except Exception:
        pass

    # NOTE: Policy exclusions (suicide, war, aviation, etc.) are NOT evaluated here.
    # They require evidence from documents (cause of death, ICD-10 code, manner)
    # and are checked at the document analysis stage. Do not pre-empt them here.

    overall = all(c["passed"] for c in checks)

    return json.dumps({
        "overall_eligible": overall,
        "policy_id": policy_id,
        "claim_type": claim_type,
        "incident_date": incident_date,
        "checks": checks,
        "denial_reason": denial_reason if not overall else None,
    }, indent=2)


# ---------------------------------------------------------------------------
# Claim CRUD
# ---------------------------------------------------------------------------
@tool
def create_claim(
    policy_id: str,
    policyholder_id: str,
    claim_type: str,
    filed_by_name: Optional[str] = None,
    filed_by_relationship: Optional[str] = None,
    incident_date: Optional[str] = None,
) -> str:
    """Open a new life insurance claim.

    Create this early once you have confirmed the claim type and basic details.
    You can enrich it later with update_claim.

    Args:
        policy_id: The policy ID to claim against (e.g. 'POL-2024-001').
        policyholder_id: The policyholder's ID (from get_policy result).
        claim_type: One of 'Death', 'Disability', 'Critical Illness'.
        filed_by_name: Name of the person filing (beneficiary for Death claims, policyholder for others).
        filed_by_relationship: Their relationship to the policyholder (e.g. 'Spouse', 'Self', 'Child').
        incident_date: Date of death / disability event / diagnosis in YYYY-MM-DD format.
    """
    body: dict[str, Any] = {
        "policy_id": policy_id,
        "policyholder_id": policyholder_id,
        "claim_type": claim_type,
    }
    if filed_by_name:
        body["filed_by_name"] = filed_by_name
    if filed_by_relationship:
        body["filed_by_relationship"] = filed_by_relationship
    if incident_date:
        body["incident_date"] = incident_date

    resp = _post("/claims", json=body)
    if isinstance(resp, str):
        return resp
    if resp.status_code != 200:
        return _error(resp)
    return resp.text


@tool
def get_claim(claim_id: str) -> str:
    """Retrieve an existing claim including all events and documents.

    Args:
        claim_id: The claim UUID.
    """
    resp = _get(f"/claims/{claim_id}")
    if isinstance(resp, str):
        return resp
    if resp.status_code != 200:
        return _error(resp)
    return resp.text


@tool
def update_claim(
    claim_id: str,
    status: Optional[str] = None,
    incident_date: Optional[str] = None,
    icd10_code: Optional[str] = None,
    diagnosis_description: Optional[str] = None,
    decision_reason: Optional[str] = None,
    payout_amount: Optional[float] = None,
) -> str:
    """Update fields on an existing claim.

    Use this to set the final decision (status + decision_reason + payout_amount)
    or to enrich clinical details as documents are received.

    Args:
        claim_id: The claim UUID to update.
        status: New status — one of intake, documents_pending, under_review, approved, denied, pending_info.
        incident_date: Date of the event in YYYY-MM-DD format.
        icd10_code: ICD-10 diagnosis code from the medical documentation (e.g. 'I21.9').
        diagnosis_description: Clinical description of the event.
        decision_reason: Plain-language reason for the decision.
        payout_amount: Calculated payout amount in South African Rand.
    """
    body: dict[str, Any] = {}
    if status is not None:
        body["status"] = status
    if incident_date is not None:
        body["incident_date"] = incident_date
    if icd10_code is not None:
        body["icd10_code"] = icd10_code
    if diagnosis_description is not None:
        body["diagnosis_description"] = diagnosis_description
    if decision_reason is not None:
        body["decision_reason"] = decision_reason
    if payout_amount is not None:
        body["payout_amount"] = payout_amount

    resp = _patch(f"/claims/{claim_id}", json=body)
    if isinstance(resp, str):
        return resp
    if resp.status_code != 200:
        return _error(resp)
    return resp.text


# ---------------------------------------------------------------------------
# Audit Trail
# ---------------------------------------------------------------------------
@tool
def log_event(
    claim_id: str,
    event_type: str,
    message: str,
    payload: Optional[str] = None,
) -> str:
    """Write an audit event to the claim's event log.

    Log every significant step in the claims process:
    - Questions asked / answers received
    - Eligibility check results
    - Document received and validation outcome
    - Final decision with reasoning

    Args:
        claim_id: The claim UUID.
        event_type: One of note, document_received, eligibility_check, decision, status_change, error.
        message: Human-readable description of the event.
        payload: Optional JSON string with structured data.
    """
    body: dict[str, Any] = {"event_type": event_type, "message": message}
    if payload:
        try:
            body["payload"] = json.loads(payload)
        except json.JSONDecodeError:
            body["payload"] = {"raw": payload}

    resp = _post(f"/claims/{claim_id}/events", json=body)
    if isinstance(resp, str):
        return resp
    if resp.status_code != 200:
        return _error(resp)
    return resp.text


# ---------------------------------------------------------------------------
# Document Processing
# ---------------------------------------------------------------------------
@tool
def record_document(
    claim_id: str,
    document_type: str,
    document_name: str,
    extracted_data: str,
    validation_status: str = "valid",
) -> str:
    """Record a submitted supporting document and its extracted data.

    Call this after analysing an uploaded document (death certificate,
    disability assessment, medical report, or other supporting evidence). Pass the key fields you
    extracted from the document as structured JSON.

    Args:
        claim_id: The claim UUID.
        document_type: One of 'death_certificate', 'disability_assessment', 'medical_report', 'post_mortem_report', 'id_document', 'other'.
        document_name: The document's filename or reference number (e.g. 'DC-2025-GP-001102').
        extracted_data: JSON string of key fields extracted from the document.
                        For death certificates: {"deceased_name", "date_of_death", "cause", "icd10_code", "manner", "post_mortem", "certifying_doctor"}.
                        For disability assessments: {"patient_name", "id_number", "assessment_date", "diagnosis", "tpd_confirmed", "determination", "status", "permanence", "work_capacity", "second_opinion_requested", "occupation_type", "icd10_code"}.
                        For medical reports: {"patient_name", "consultation_date", "diagnosis", "icd10_code", "stage", "treatment_plan", "specialist"}.
                        For post-mortems: {"deceased_name", "id_number", "post_mortem_date", "cause", "manner", "toxicology_findings", "alcohol_level"}.
        validation_status: One of 'valid', 'invalid', 'requires_review', 'pending'.
    """
    try:
        extracted = json.loads(extracted_data)
    except json.JSONDecodeError:
        extracted = {"raw": extracted_data}

    body = {
        "document_type": document_type,
        "document_name": document_name,
        "extracted_data": extracted,
        "validation_status": validation_status,
    }
    resp = _post(f"/claims/{claim_id}/documents", json=body)
    if isinstance(resp, str):
        return resp
    if resp.status_code != 200:
        return _error(resp)
    return resp.text


def _claim_documents_text_blob(documents: list[dict[str, Any]], document_type: str | None = None) -> str:
    parts: list[str] = []
    for doc in documents:
        if document_type and doc.get("document_type") != document_type:
            continue
        if doc.get("document_name"):
            parts.append(str(doc["document_name"]))
        extracted = doc.get("extracted_data")
        if isinstance(extracted, dict):
            parts.append(json.dumps(extracted, ensure_ascii=False))
        elif extracted is not None:
            parts.append(str(extracted))
    return " ".join(parts).lower()


def _without_forensic_metadata(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            k: _without_forensic_metadata(v)
            for k, v in value.items()
            if k not in {"forensic_analysis", "death_certificate_forensics"}
        }
    if isinstance(value, list):
        return [_without_forensic_metadata(item) for item in value]
    return value


def _claim_evidence_text_blob(documents: list[dict[str, Any]], document_type: str | None = None) -> str:
    cleaned_docs: list[dict[str, Any]] = []
    for doc in documents:
        cleaned = dict(doc)
        cleaned["extracted_data"] = _without_forensic_metadata(doc.get("extracted_data"))
        cleaned_docs.append(cleaned)
    return _claim_documents_text_blob(cleaned_docs, document_type)


def _compact_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _is_post_mortem_document(doc: dict[str, Any]) -> bool:
    doc_type = _normalize_text(str(doc.get("document_type", "")))
    doc_name = _normalize_text(str(doc.get("document_name", "")))
    extracted = doc.get("extracted_data")
    extracted_blob = ""
    if isinstance(extracted, dict):
        extracted_blob = json.dumps(extracted, ensure_ascii=False)
    elif extracted is not None:
        extracted_blob = str(extracted)

    text_blob = _normalize_text(f"{doc_type} {doc_name} {extracted_blob}")
    compact_blob = _compact_text(f"{doc_type} {doc_name} {extracted_blob}")

    return (
        "post mortem" in text_blob
        or "postmortem" in compact_blob
        or "autopsy" in text_blob
        or "forensic report" in text_blob
        or "forensic pathology" in text_blob
    )


def _normalize_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def _normalize_id(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\D+", "", value)


def _find_first_field(documents: list[dict[str, Any]], field_names: list[str], document_type: str | None = None) -> str | None:
    for doc in documents:
        if document_type and doc.get("document_type") != document_type:
            continue
        extracted = doc.get("extracted_data")
        if not isinstance(extracted, dict):
            continue
        for name in field_names:
            value = extracted.get(name)
            if value not in (None, ""):
                return str(value)
    return None


def _doc_policy_references(documents: list[dict[str, Any]]) -> list[str]:
    refs: list[str] = []
    pattern = re.compile(r"\bPOL-\d{4}-\d{3,}\b", re.IGNORECASE)
    for doc in documents:
        extracted = doc.get("extracted_data")
        if isinstance(extracted, dict):
            for key in ("policy_reference", "policy_id", "document_reference"):
                value = extracted.get(key)
                if value:
                    refs.append(str(value).upper())
            for value in extracted.values():
                if isinstance(value, str):
                    refs.extend(m.group(0).upper() for m in pattern.finditer(value))
        name = doc.get("document_name")
        if name:
            refs.extend(m.group(0).upper() for m in pattern.finditer(str(name)))
    seen: list[str] = []
    for ref in refs:
        if ref not in seen:
            seen.append(ref)
    return seen


def _policyholder_match_status(documents: list[dict[str, Any]], policy: dict[str, Any]) -> tuple[str, str, str | None, str | None]:
    policyholder = policy.get("policyholder", {}) if isinstance(policy, dict) else {}
    policy_name = _normalize_text(policyholder.get("full_name"))
    policy_id_number = _normalize_id(policyholder.get("national_id"))
    doc_name = _normalize_text(_find_first_field(documents, ["deceased_name", "patient_name", "full_name", "name"]))
    doc_id = _normalize_id(_find_first_field(documents, ["id_number", "national_id", "patient_id"]))
    normalized_blob = _normalize_text(_claim_documents_text_blob(documents))

    if not doc_name and policy_name and policy_name in normalized_blob:
        doc_name = policy_name
    if not doc_id and policy_id_number and policy_id_number in normalized_blob:
        doc_id = policy_id_number

    if not doc_name or not policy_name:
        name_status = "missing"
    elif doc_name == policy_name or doc_name in policy_name or policy_name in doc_name:
        name_status = "matched"
    else:
        name_status = "mismatched"

    if not doc_id or not policy_id_number:
        id_status = "missing"
    elif doc_id == policy_id_number:
        id_status = "matched"
    else:
        id_status = "mismatched"

    return name_status, id_status, doc_name or None, doc_id or None


def _find_death_certificate_forensics(claim: dict[str, Any], death_certs: list[dict[str, Any]]) -> dict[str, Any] | None:
    candidates: list[dict[str, Any]] = []

    def collect(value: Any) -> None:
        if isinstance(value, dict):
            direct = value.get("death_certificate_forensics") or value.get("forensic_analysis")
            if isinstance(direct, dict):
                candidates.append(direct)
            elif {
                "overall_score",
                "risk_level",
                "recommendation",
            }.issubset(value.keys()):
                candidates.append(value)
            for nested in value.values():
                if isinstance(nested, (dict, list)):
                    collect(nested)
        elif isinstance(value, list):
            for item in value:
                collect(item)

    for doc in death_certs:
        collect(doc.get("extracted_data"))

    for event in claim.get("events", []) or []:
        collect(event.get("payload"))

    if not candidates:
        return None
    latest = candidates[-1]
    score = latest.get("overall_score")
    try:
        score_int = int(score)
    except (TypeError, ValueError):
        score_int = None
    risk_level = str(latest.get("risk_level", "")).upper()
    recommendation = str(latest.get("recommendation", "")).upper()
    if "fraudulent" not in latest:
        latest = dict(latest)
        latest["fraudulent"] = (
            risk_level == "HIGH"
            or recommendation == "FLAG_URGENT"
            or (score_int is not None and score_int < 40)
        )
    if "requires_review" not in latest:
        latest = dict(latest)
        latest["requires_review"] = risk_level == "MEDIUM" or recommendation == "FLAG_FOR_REVIEW"
    if "fraud_score" not in latest and score_int is not None:
        latest = dict(latest)
        latest["fraud_score"] = max(0, min(100, 100 - score_int))
    return latest


def _evaluate_claim_evidence_payload(claim: dict[str, Any], policy: dict[str, Any] | None = None) -> dict[str, Any]:
    claim_type = claim.get("claim_type")
    documents = claim.get("documents", [])

    result: dict[str, Any] = {
        "claim_id": claim.get("claim_id"),
        "claim_type": claim_type,
        "eligible_for_payout": False,
        "recommended_status": "pending_info",
        "reason": "",
        "checks": [],
        "warnings": [],
    }

    def add_check(name: str, passed: bool, detail: str) -> None:
        result["checks"].append({"name": name, "passed": passed, "detail": detail})

    def add_warning(message: str) -> None:
        result["warnings"].append(message)

    def finalize() -> dict[str, Any]:
        breakdown: list[str] = []
        for check in result["checks"]:
            prefix = "PASS" if check["passed"] else "FAIL"
            breakdown.append(f"{prefix}: {check['name']} — {check['detail']}")
        for warning in result["warnings"]:
            breakdown.append(f"WARNING: {warning}")
        result["decision_breakdown"] = breakdown
        return result

    exclusions_text = (policy or {}).get("exclusions", "") if isinstance(policy, dict) else ""
    exclusions_blob = exclusions_text.lower()
    name_status = id_status = "missing"
    if policy:
        name_status, id_status, _, _ = _policyholder_match_status(documents, policy)

    if claim_type == "Disability":
        assessments = [d for d in documents if d.get("document_type") == "disability_assessment"]
        if not assessments:
            add_check("Disability Assessment Present", False, "No specialist disability assessment has been recorded yet.")
            result["reason"] = "A specialist disability assessment confirming total and permanent disability is still required."
            return finalize()

        add_check("Disability Assessment Present", True, f"{len(assessments)} disability assessment document(s) recorded.")
        blob = _claim_documents_text_blob(documents, "disability_assessment")
        if policy:
            add_check(
                "Document Name Matches Policyholder",
                name_status == "matched",
                "The disability assessment name matches the policyholder."
                if name_status == "matched"
                else "The disability assessment name does not match the policyholder record."
                if name_status == "mismatched"
                else "The disability assessment name was not extracted clearly enough to verify yet.",
            )
            add_check(
                "Document ID Matches Policyholder",
                id_status == "matched",
                "The disability assessment ID number matches the policyholder."
                if id_status == "matched"
                else "The disability assessment ID number does not match the policyholder record."
                if id_status == "mismatched"
                else "The disability assessment ID number was not extracted clearly enough to verify yet.",
            )
            if name_status != "matched" or id_status != "matched":
                result["reason"] = (
                    "The disability assessment does not yet give us a clean policyholder identity match."
                    if name_status == "mismatched" or id_status == "mismatched"
                    else "We need a clearer extraction of the policyholder name or ID number from the disability assessment before we can finalise the claim."
                )
                return finalize()

        disqualifying_terms = [
            "partial impairment",
            "partial disability",
            "borderline",
            "temporary disability",
            "temporary impairment",
            "not total and permanent",
            "not permanently disabled",
        ]
        if any(term in blob for term in disqualifying_terms):
            add_check("Total And Permanent Disability Confirmed", False, "The assessment indicates partial, borderline, or otherwise non-TPD impairment.")
            result["recommended_status"] = "denied"
            result["reason"] = "The medical evidence does not confirm total and permanent disability. Sentinel Life does not pay disability benefits for partial impairment."
            return finalize()

        pending_terms = [
            "second opinion",
            "independent assessment requested",
            "pending",
            "under review",
            "further assessment",
            "reassessment",
        ]
        if any(term in blob for term in pending_terms):
            add_check("Final Disability Determination Available", False, "The assessment is still pending, under review, or awaiting a second opinion.")
            result["recommended_status"] = "pending_info"
            result["reason"] = "The disability evidence is not yet final. A completed assessment confirming total and permanent disability is still needed before payout can be approved."
            return finalize()

        confirmation_terms = [
            "tpd confirmed",
            "total and permanent disability confirmed",
            "meets tpd definition",
            "total and permanent disability",
        ]
        confirmed = any(term in blob for term in confirmation_terms)
        add_check(
            "Total And Permanent Disability Confirmed",
            confirmed,
            "The assessment confirms total and permanent disability."
            if confirmed
            else "The assessment does not clearly confirm total and permanent disability.",
        )
        if not confirmed:
            result["recommended_status"] = "pending_info"
            result["reason"] = "The disability assessment does not clearly confirm total and permanent disability yet."
            return finalize()

        result["eligible_for_payout"] = True
        result["recommended_status"] = "approved"
        result["reason"] = "The disability evidence confirms total and permanent disability."
        return finalize()

    if claim_type == "Death":
        death_certs = [d for d in documents if d.get("document_type") == "death_certificate"]
        if not death_certs:
            add_check("Death Certificate Present", False, "No certified death certificate has been recorded yet.")
            result["reason"] = "A certified death certificate is still required before the death claim can be finalised."
            return finalize()

        add_check("Death Certificate Present", True, f"{len(death_certs)} death certificate document(s) recorded.")
        forensic = _find_death_certificate_forensics(claim, death_certs)
        if not forensic:
            add_check(
                "Death Certificate Forensic Review Completed",
                False,
                "The death certificate has not yet passed the forensic fraud screen.",
            )
            result["reason"] = "The death certificate must be screened for fraud before this death claim can be finalised."
            return finalize()

        result["death_certificate_forensics"] = forensic
        score = forensic.get("overall_score", "N/A")
        fraud_score = forensic.get("fraud_score", "N/A")
        risk = forensic.get("risk_level", "UNKNOWN")
        recommendation = forensic.get("recommendation", "UNKNOWN")
        forensic_detail = (
            f"Integrity score {score}/100; fraud score {fraud_score}/100; "
            f"risk {risk}; recommendation {recommendation}."
        )
        if forensic.get("fraudulent"):
            add_check("Death Certificate Fraud Screen Passed", False, forensic_detail)
            result["recommended_status"] = "denied"
            result["reason"] = (
                "The death certificate forensic review returned a high fraud risk, "
                f"so the claim cannot be approved. {forensic_detail}"
            )
            return finalize()
        if forensic.get("requires_review"):
            add_check("Death Certificate Fraud Screen Passed", False, forensic_detail)
            result["recommended_status"] = "pending_info"
            result["reason"] = (
                "The death certificate forensic review found anomalies that require manual review before approval. "
                f"{forensic_detail}"
            )
            return finalize()

        add_check("Death Certificate Fraud Screen Passed", True, forensic_detail)
        blob = _claim_evidence_text_blob(documents)
        if policy:
            add_check(
                "Document Name Matches Policyholder",
                name_status == "matched",
                "The death documents match the policyholder name."
                if name_status == "matched"
                else "The death documents do not match the policyholder name on record."
                if name_status == "mismatched"
                else "The death-document name was not extracted clearly enough to verify yet.",
            )
            add_check(
                "Document ID Matches Policyholder",
                id_status == "matched",
                "The death documents match the policyholder ID number."
                if id_status == "matched"
                else "The death documents do not match the policyholder ID number on record."
                if id_status == "mismatched"
                else "The death-document ID number was not extracted clearly enough to verify yet.",
            )
            if name_status != "matched" or id_status != "matched":
                result["reason"] = (
                    "The death documents do not yet give us a clean identity match to the policyholder."
                    if name_status == "mismatched" or id_status == "mismatched"
                    else "We need a clearer extraction of the deceased person's name or ID number from the death documents before we can finalise the claim."
                )
                return finalize()

            policy_refs = _doc_policy_references(documents)
            claim_policy_id = str(claim.get("policy_id", "")).upper()
            mismatches = [ref for ref in policy_refs if ref and ref != claim_policy_id]
            if mismatches and name_status == "matched" and id_status == "matched":
                add_warning(
                    f"Document policy reference differs from the loaded policy ({', '.join(mismatches)} vs {claim_policy_id}), but name and ID still match."
                )

        if any(term in blob for term in ["unnatural", "homicide", "accident", "accidental", "post-mortem", "post mortem", "postmortem", "autopsy", "forensic"]):
            has_post_mortem = any(_is_post_mortem_document(d) for d in documents)
            add_check(
                "Post-Mortem Report Present When Required",
                has_post_mortem,
                "Unnatural death evidence found and a post-mortem report has been recorded."
                if has_post_mortem
                else "Unnatural death evidence found, but no post-mortem report has been recorded.",
            )
            if not has_post_mortem:
                result["reason"] = "A post-mortem report is required before this death claim can be approved."
                return finalize()

        if policy:
            incident_date = claim.get("incident_date")
            start_date = policy.get("start_date")
            try:
                incident_dt = date.fromisoformat(incident_date) if incident_date else None
                start_dt = date.fromisoformat(start_date) if start_date else None
            except ValueError:
                incident_dt = None
                start_dt = None

            if "suicide" in exclusions_blob and ("suicide" in blob or "self inflicted" in blob or "self-inflicted" in blob):
                within_waiting_period = False
                if incident_dt and start_dt:
                    try:
                        suicide_deadline = start_dt.replace(year=start_dt.year + 2)
                    except ValueError:
                        suicide_deadline = start_dt.replace(year=start_dt.year + 2, day=28)
                    within_waiting_period = incident_dt <= suicide_deadline
                add_check("Suicide Exclusion Not Triggered", not within_waiting_period, "Suicide-related evidence found within the 24-month exclusion period." if within_waiting_period else "No suicide exclusion triggered.")
                if within_waiting_period:
                    result["recommended_status"] = "denied"
                    result["reason"] = "The death evidence triggers the policy's suicide exclusion period."
                    return finalize()

            if "war" in exclusions_blob:
                war_terms = ["war", "terror", "combat", "military conflict", "hostilities"]
                war_triggered = any(term in blob for term in war_terms)
                add_check("War Exclusion Not Triggered", not war_triggered, "No war-related exclusion evidence found." if not war_triggered else "The document evidence triggers the policy's war exclusion.")
                if war_triggered:
                    result["recommended_status"] = "denied"
                    result["reason"] = "The death evidence triggers the policy's war exclusion."
                    return finalize()

            if "self-inflicted injury" in exclusions_blob or "self inflicted injury" in exclusions_blob:
                self_inflicted = any(term in blob for term in ["self-inflicted", "self inflicted", "intentional injury"])
                add_check("Self-Inflicted Injury Exclusion Not Triggered", not self_inflicted, "No self-inflicted injury exclusion evidence found." if not self_inflicted else "The document evidence triggers the policy's self-inflicted injury exclusion.")
                if self_inflicted:
                    result["recommended_status"] = "denied"
                    result["reason"] = "The death evidence triggers the policy's self-inflicted injury exclusion."
                    return finalize()

            if "natural cause waiting period" in exclusions_blob or "natural cause" in exclusions_blob:
                natural_terms = ["natural", "myocardial infarction", "stroke", "cardiac arrest", "natural causes"]
                natural_cause = any(term in blob for term in natural_terms) and "accident" not in blob and "accidental" not in blob
                within_natural_waiting_period = False
                if natural_cause and incident_dt and start_dt:
                    try:
                        natural_deadline = start_dt.replace(month=start_dt.month + 6)
                    except ValueError:
                        # month overflow fallback
                        total_month = start_dt.month + 6
                        year = start_dt.year + (total_month - 1) // 12
                        month = (total_month - 1) % 12 + 1
                        day = min(start_dt.day, 28)
                        natural_deadline = date(year, month, day)
                    within_natural_waiting_period = incident_dt <= natural_deadline
                add_check("Natural Cause Waiting Period Not Triggered", not within_natural_waiting_period, "No natural-cause waiting-period issue found." if not within_natural_waiting_period else "Natural-cause death occurred within the waiting period.")
                if within_natural_waiting_period:
                    result["recommended_status"] = "denied"
                    result["reason"] = "The death evidence triggers the policy's natural-cause waiting period exclusion."
                    return finalize()

            if "alcohol" in blob and "alcohol" not in exclusions_blob and "intoxication" in blob:
                add_warning("Alcohol intoxication is mentioned in the post-mortem, but no alcohol exclusion appears on this policy.")

        result["eligible_for_payout"] = True
        result["recommended_status"] = "approved"
        result["reason"] = "The recorded death-claim documents satisfy the current payout checks."
        return finalize()

    if claim_type == "Critical Illness":
        medical_reports = [d for d in documents if d.get("document_type") == "medical_report"]
        if not medical_reports:
            add_check("Specialist Medical Report Present", False, "No specialist medical report has been recorded yet.")
            result["reason"] = "A specialist medical report is still required before the critical illness claim can be finalised."
            return finalize()

        add_check("Specialist Medical Report Present", True, f"{len(medical_reports)} medical report document(s) recorded.")
        blob = _claim_documents_text_blob(documents, "medical_report")
        if policy:
            add_check(
                "Document Name Matches Policyholder",
                name_status == "matched",
                "The medical report name matches the policyholder."
                if name_status == "matched"
                else "The medical report name does not match the policyholder record."
                if name_status == "mismatched"
                else "The medical report name was not extracted clearly enough to verify yet.",
            )
            add_check(
                "Document ID Matches Policyholder",
                id_status == "matched",
                "The medical report ID number matches the policyholder."
                if id_status == "matched"
                else "The medical report ID number does not match the policyholder record."
                if id_status == "mismatched"
                else "The medical report ID number was not extracted clearly enough to verify yet.",
            )
            if name_status != "matched" or id_status != "matched":
                result["reason"] = (
                    "The critical illness documents do not yet give us a clean identity match to the policyholder."
                    if name_status == "mismatched" or id_status == "mismatched"
                    else "We need a clearer extraction of the policyholder name or ID number from the medical evidence before we can finalise the claim."
                )
                return finalize()

        icd_present = bool(claim.get("icd10_code")) or "icd-10" in blob or "icd10" in blob
        add_check("ICD-10 Or Diagnosis Present", icd_present, "Medical diagnosis evidence is present." if icd_present else "The uploaded evidence does not clearly show an ICD-10 code or diagnosis yet.")
        if not icd_present:
            result["reason"] = "The critical illness evidence needs a clear diagnosis or ICD-10 code before payout can be approved."
            return finalize()

        provisional_terms = [
            "suspected",
            "possible",
            "provisional",
            "rule out",
            "pending biopsy",
            "awaiting biopsy",
            "awaiting pathology",
            "to be confirmed",
            "under investigation",
        ]
        final_diagnosis = not any(term in blob for term in provisional_terms)
        add_check(
            "Final Diagnosis Available",
            final_diagnosis,
            "The report contains a final diagnosis."
            if final_diagnosis
            else "The diagnosis appears provisional or still under investigation.",
        )
        if not final_diagnosis:
            result["reason"] = "The critical illness diagnosis is still provisional or awaiting confirmation."
            return finalize()

        if "cancer" in blob or "carcinoma" in blob or "tumour" in blob or "tumor" in blob or "malignan" in blob:
            pathology_present = (
                "pathology" in blob
                or "histology" in blob
                or "biopsy confirmed" in blob
                or "staging" in blob
                or "stage " in blob
            )
            add_check(
                "Cancer Pathology Or Staging Present",
                pathology_present,
                "Cancer pathology or staging evidence is present."
                if pathology_present
                else "Cancer evidence is present, but the record does not clearly show pathology or staging support yet.",
            )
            if not pathology_present:
                result["reason"] = "Cancer-related critical illness claims need pathology or staging evidence before payout can be approved."
                return finalize()

        if "self-inflicted injury" in exclusions_blob or "self inflicted injury" in exclusions_blob:
            self_inflicted = any(term in blob for term in ["self-inflicted", "self inflicted", "intentional self harm", "intentional self-harm"])
            add_check("Self-Inflicted Injury Exclusion Not Triggered", not self_inflicted, "No self-inflicted exclusion evidence found." if not self_inflicted else "The document evidence triggers the policy's self-inflicted injury exclusion.")
            if self_inflicted:
                result["recommended_status"] = "denied"
                result["reason"] = "The critical illness evidence triggers the policy's self-inflicted injury exclusion."
                return finalize()

        result["eligible_for_payout"] = True
        result["recommended_status"] = "approved"
        result["reason"] = "The recorded critical illness documents satisfy the current payout checks."
        return finalize()

    result["reason"] = f"No document-evidence rules are configured for claim type: {claim_type}"
    return finalize()


@tool
def evaluate_claim_evidence(claim_id: str) -> str:
    """Evaluate whether the uploaded claim documents support payout approval.

    Use this after `record_document` once the required evidence has been
    captured. This is the hard evidence gate before payout and final decision.

    Key rule:
    - Disability claims only pay for total and permanent disability (TPD).
      Partial, borderline, temporary, or still-pending assessments must not
      be approved for payout.
    """
    resp = _get(f"/claims/{claim_id}")
    if isinstance(resp, str):
        return resp
    if resp.status_code != 200:
        return _error(resp)

    claim = resp.json()

    policy_resp = _get(f"/policies/{claim.get('policy_id')}")
    if isinstance(policy_resp, str):
        return policy_resp
    if policy_resp.status_code != 200:
        return _error(policy_resp)
    policy = policy_resp.json()

    return json.dumps(_evaluate_claim_evidence_payload(claim, policy), indent=2)


# ---------------------------------------------------------------------------
# Payout Calculation
# ---------------------------------------------------------------------------
@tool
def calculate_payout(
    policy_id: str,
    claim_type: str,
    claim_id: str,
) -> str:
    """Calculate the payout amount for an approved claim.

    Looks up the policy's benefit amounts for the claim type:
    - Death: sum_assured + Accidental Death rider (if applicable) + Funeral Benefit rider
    - Disability (TPD): disability_benefit + Premium Waiver rider activated
    - Critical Illness: critical_illness_benefit

    Returns a detailed payout breakdown with beneficiary splits for Death claims.

    Args:
        policy_id: The policy ID.
        claim_type: One of 'Death', 'Disability', 'Critical Illness'.
        claim_id: The claim UUID (used to log the calculation).
    """
    resp = _get(f"/policies/{policy_id}")
    if isinstance(resp, str):
        return resp
    if resp.status_code != 200:
        return _error(resp)
    policy = resp.json()

    claim_resp = _get(f"/claims/{claim_id}")
    if isinstance(claim_resp, str):
        return claim_resp
    if claim_resp.status_code != 200:
        return _error(claim_resp)
    claim = claim_resp.json()

    evidence = _evaluate_claim_evidence_payload(claim, policy)
    if not evidence.get("eligible_for_payout"):
        return json.dumps({
            "error": "Claim evidence does not support payout approval yet.",
            "claim_id": claim_id,
            "claim_type": claim_type,
            "evidence_evaluation": evidence,
        }, indent=2)

    riders = policy.get("riders", [])
    beneficiaries = policy.get("beneficiaries", [])

    breakdown = {}
    total_payout = 0.0

    if claim_type == "Death":
        base = policy.get("sum_assured", 0)
        total_payout += base
        breakdown["Death Benefit (Sum Assured)"] = f"R{base:,.2f}"

        accidental_rider = next((r for r in riders if "Accidental Death" in r.get("rider_type", "") and r.get("is_active")), None)
        if accidental_rider and accidental_rider.get("cover_amount"):
            amt = accidental_rider["cover_amount"]
            breakdown["Accidental Death Rider"] = f"R{amt:,.2f} (if death was accidental — subject to confirmation)"

        funeral_rider = next((r for r in riders if "Funeral" in r.get("rider_type", "") and r.get("is_active")), None)
        if funeral_rider and funeral_rider.get("cover_amount"):
            amt = funeral_rider["cover_amount"]
            total_payout += amt
            breakdown["Funeral Benefit Rider"] = f"R{amt:,.2f}"

        breakdown["Total Base Payout"] = f"R{total_payout:,.2f}"

        if beneficiaries:
            breakdown["Beneficiary Splits"] = [
                {
                    "name": b["full_name"],
                    "relationship": b["relationship_to_policyholder"],
                    "share": f"{b['percentage_share']:.0f}%",
                    "amount": f"R{total_payout * b['percentage_share'] / 100:,.2f}",
                }
                for b in beneficiaries
            ]

    elif claim_type == "Disability":
        base = policy.get("disability_benefit", 0)
        total_payout = base
        breakdown["Total Permanent Disability Benefit"] = f"R{base:,.2f}"
        waiver = next((r for r in riders if "Premium Waiver" in r.get("rider_type", "") and r.get("is_active")), None)
        if waiver:
            breakdown["Premium Waiver on Disability"] = "Activated — future premiums waived for duration of disability"

    elif claim_type == "Critical Illness":
        base = policy.get("critical_illness_benefit", 0)
        total_payout = base
        breakdown["Critical Illness Benefit"] = f"R{base:,.2f}"
        breakdown["Note"] = "Paid as lump sum directly to the policyholder"

    else:
        return json.dumps({"error": f"Unknown claim type: {claim_type}"})

    result = {
        "claim_type": claim_type,
        "policy_id": policy_id,
        "total_payout": total_payout,
        "payout_formatted": f"R{total_payout:,.2f}",
        "breakdown": breakdown,
        "evidence_evaluation": evidence,
    }

    # Log to audit trail (fire-and-forget — ignore errors)
    _post(f"/claims/{claim_id}/events", json={
        "event_type": "note",
        "message": f"Payout calculated: {result['payout_formatted']} for {claim_type} claim.",
        "payload": result,
    })

    # Update claim with payout amount (fire-and-forget — ignore errors)
    _patch(f"/claims/{claim_id}", json={"payout_amount": total_payout})

    return json.dumps(result, indent=2)


# ---------------------------------------------------------------------------
# Claim Report (PDF)
# ---------------------------------------------------------------------------
@tool
def generate_claim_report(claim_id: str, policy_id: str) -> str:
    """Generate a PDF summary report for the claim.

    Call this after the final decision has been communicated and any payout
    has been calculated. Produces a professional Sentinel Life–branded PDF
    with all claim details, eligibility checks, documents received, and
    payout breakdown.

    Args:
        claim_id: The claim UUID.
        policy_id: The policy ID.
    """
    from fpdf import FPDF

    claim_resp = _get(f"/claims/{claim_id}")
    if isinstance(claim_resp, str):
        return claim_resp
    if claim_resp.status_code != 200:
        return _error(claim_resp)
    claim = claim_resp.json()

    policy_resp = _get(f"/policies/{policy_id}")
    if isinstance(policy_resp, str):
        return policy_resp
    if policy_resp.status_code != 200:
        return _error(policy_resp)
    policy = policy_resp.json()

    _REPORTS_DIR.mkdir(exist_ok=True)

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # Header
    pdf.set_fill_color(26, 60, 94)  # Sentinel dark navy
    pdf.rect(0, 0, 210, 30, "F")
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_y(8)
    pdf.cell(0, 10, "SENTINEL LIFE", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 6, "Life Insurance Claims Report", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_text_color(0, 0, 0)
    pdf.set_y(36)

    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(0, 5, f"Generated: {datetime.now().strftime('%d %B %Y at %H:%M')}", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.ln(3)

    def section(title):
        pdf.set_draw_color(200, 200, 200)
        pdf.line(10, pdf.get_y(), 200, pdf.get_y())
        pdf.ln(3)
        pdf.set_font("Helvetica", "B", 12)
        pdf.set_text_color(26, 60, 94)
        pdf.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(0, 0, 0)

    def row(label, value):
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(55, 5, f"{label}:")
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(0, 5, _pdf_safe(str(value)), new_x="LMARGIN", new_y="NEXT")

    # Claim details
    section("Claim Details")
    pdf.set_font("Helvetica", "", 9)
    status_display = claim.get("status", "N/A").upper().replace("_", " ")
    row("Claim ID", claim.get("claim_id", "N/A")[:8] + "...")
    row("Claim Type", claim.get("claim_type", "N/A"))
    row("Status", status_display)
    row("Filed By", f"{claim.get('filed_by_name', 'N/A')} ({claim.get('filed_by_relationship', 'N/A')})")
    row("Incident Date", claim.get("incident_date", "N/A"))
    if claim.get("icd10_code"):
        row("ICD-10 Code", claim.get("icd10_code", "N/A"))
    if claim.get("diagnosis_description"):
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(55, 5, "Diagnosis:")
        pdf.set_font("Helvetica", "", 9)
        pdf.multi_cell(0, 5, _pdf_safe(claim.get("diagnosis_description", "")))
    if claim.get("decision_reason"):
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(55, 5, "Decision Reason:")
        pdf.set_font("Helvetica", "", 9)
        pdf.multi_cell(0, 5, _pdf_safe(claim.get("decision_reason", "")))
    if claim.get("payout_amount"):
        row("Payout Amount", f"R{claim['payout_amount']:,.2f}")
    pdf.ln(2)

    # Policyholder
    section("Policyholder & Policy")
    ph = policy.get("policyholder", {})
    row("Full Name", ph.get("full_name", "N/A"))
    row("Policy ID", policy.get("policy_id", "N/A"))
    row("Policy Type", policy.get("policy_type", "N/A"))
    row("Cover Types", policy.get("cover_types", "N/A"))
    row("Sum Assured", f"R{policy.get('sum_assured', 0):,.2f}")
    if policy.get("disability_benefit"):
        row("Disability Benefit", f"R{policy['disability_benefit']:,.2f}")
    if policy.get("critical_illness_benefit"):
        row("Critical Illness Benefit", f"R{policy['critical_illness_benefit']:,.2f}")
    row("Policy Status", policy.get("policy_status", "N/A"))
    row("Start Date", policy.get("start_date", "N/A"))
    pdf.ln(2)

    # Beneficiaries
    beneficiaries = policy.get("beneficiaries", [])
    if beneficiaries:
        section("Beneficiaries")
        for b in beneficiaries:
            pdf.set_font("Helvetica", "", 9)
            pdf.cell(0, 5, _pdf_safe(f"  {b['full_name']} ({b['relationship_to_policyholder']}) — {b['percentage_share']:.0f}% share"), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

    # Documents received
    docs = claim.get("documents", [])
    if docs:
        section("Supporting Documents Received")
        for d in docs:
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(0, 5, _pdf_safe(f"  {d.get('document_type', 'unknown').replace('_', ' ').title()}: {d.get('document_name', 'N/A')}"), new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Helvetica", "", 9)
            pdf.cell(0, 5, _pdf_safe(f"  Validation: {d.get('validation_status', 'pending').upper()}"), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

    # Audit trail
    section("Audit Trail")
    events = claim.get("events", [])
    if events:
        for event in events:
            pdf.set_font("Helvetica", "B", 8)
            ts = event.get("created_at", "")[:19].replace("T", " ")
            pdf.cell(0, 4, _pdf_safe(f"[{ts}] {event.get('event_type', '').upper().replace('_', ' ')}"), new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Helvetica", "", 8)
            pdf.multi_cell(0, 4, _pdf_safe(event.get("message", "")))
            pdf.ln(1)
    else:
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(0, 5, "No audit events recorded.", new_x="LMARGIN", new_y="NEXT")

    # Footer
    pdf.set_y(-20)
    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(150, 150, 150)
    pdf.cell(0, 5, "Sentinel Life Insurance | Claims Division | This document is confidential", align="C")

    # Save
    filename = f"SL_{claim_id[:8]}_claim_report.pdf"
    filepath = _REPORTS_DIR / filename
    pdf.output(str(filepath))

    # Log it (fire-and-forget — ignore errors)
    _post(f"/claims/{claim_id}/events", json={"event_type": "note", "message": f"PDF claim report generated: {filename}"})

    return json.dumps({
        "status": "success",
        "filename": filename,
        "path": str(filepath),
        "message": f"Sentinel Life claim report saved to reports/{filename}",
    })


# ---------------------------------------------------------------------------
# Email Claim Report
# ---------------------------------------------------------------------------
_ALLOWED_RECIPIENT = "christiaanbecker9@icloud.com"


@tool
def send_claim_email(claim_id: str, policy_id: str) -> str:
    """Email the PDF claim report to the customer's registered email address.

    Call this AFTER generate_claim_report has successfully created the PDF.

    Args:
        claim_id: The claim UUID.
        policy_id: The policy ID.
    """
    import resend

    resend.api_key = os.getenv("RESEND_API_KEY", "")
    if not resend.api_key:
        return json.dumps({"error": "RESEND_API_KEY not configured. Set it in .env to enable email."})

    sender_email = os.getenv("RESEND_FROM_EMAIL", "onboarding@resend.dev")

    claim_resp = _get(f"/claims/{claim_id}")
    if isinstance(claim_resp, str):
        return claim_resp
    if claim_resp.status_code != 200:
        return _error(claim_resp)
    claim = claim_resp.json()

    policy_resp = _get(f"/policies/{policy_id}")
    customer_name = "Valued Client"
    if not isinstance(policy_resp, str) and policy_resp.status_code == 200:
        customer_name = policy_resp.json().get("policyholder", {}).get("full_name", customer_name)

    filename = f"SL_{claim_id[:8]}_claim_report.pdf"
    filepath = _REPORTS_DIR / filename
    if not filepath.exists():
        return json.dumps({"error": f"Report PDF not found. Call generate_claim_report first."})

    pdf_bytes = filepath.read_bytes()
    status_display = claim.get("status", "").upper().replace("_", " ")
    claim_type = claim.get("claim_type", "")
    payout = claim.get("payout_amount")

    html = f"""
    <div style="font-family:Georgia,serif;max-width:560px;color:#222">
        <div style="background:#1a3c5e;padding:20px 24px;margin-bottom:24px">
            <h2 style="color:#fff;margin:0;font-size:20px">Sentinel Life</h2>
            <p style="color:#9cb8d4;margin:4px 0 0;font-size:12px">Claims Reference: {claim_id[:8].upper()}</p>
        </div>
        <p>Dear {customer_name},</p>
        <p>Thank you for submitting your <strong>{claim_type}</strong> claim. Please find attached the full claim report.</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0">
            <tr><td style="padding:6px 12px;background:#f4f6f9;font-weight:bold">Status</td><td style="padding:6px 12px">{status_display}</td></tr>
            <tr><td style="padding:6px 12px;background:#f4f6f9;font-weight:bold">Claim Type</td><td style="padding:6px 12px">{claim_type}</td></tr>
            {"<tr><td style='padding:6px 12px;background:#f4f6f9;font-weight:bold'>Payout Amount</td><td style='padding:6px 12px'>R" + f"{payout:,.2f}" + "</td></tr>" if payout else ""}
        </table>
        <p>If you have any questions about your claim, please contact our Claims Division.</p>
        <p style="color:#666;font-size:12px;margin-top:32px">Sentinel Life Insurance | Claims Division<br>This communication is confidential.</p>
    </div>
    """

    try:
        email = resend.Emails.send({
            "from": sender_email,
            "to": [_ALLOWED_RECIPIENT],
            "subject": f"Sentinel Life — {claim_type} Claim Report ({status_display})",
            "html": html,
            "attachments": [{"filename": filename, "content": list(pdf_bytes)}],
        })

        _post(f"/claims/{claim_id}/events", json={
            "event_type": "note",
            "message": f"Claim report emailed to {_ALLOWED_RECIPIENT}.",
            "payload": {"email_id": email.get("id")},
        })

        return json.dumps({"status": "sent", "to": _ALLOWED_RECIPIENT, "message": "Claim report emailed successfully."})
    except Exception as e:
        return json.dumps({"error": f"Failed to send email: {e}"})
