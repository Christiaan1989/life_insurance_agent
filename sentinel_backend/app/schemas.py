from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class OTPRequestIn(BaseModel):
    policy_id: str
    national_id: str


class OTPRequestOut(BaseModel):
    message: str
    email_hint: str


class OTPVerifyIn(BaseModel):
    policy_id: str
    code: str


class OTPVerifyOut(BaseModel):
    verified: bool
    policyholder_id: str
    full_name: str
    message: str


# ---------------------------------------------------------------------------
# Policyholder
# ---------------------------------------------------------------------------
class PolicyholderOut(BaseModel):
    policyholder_id: str
    full_name: str
    date_of_birth: str
    national_id: str
    gender: str
    email: Optional[str]
    phone: Optional[str]
    address: Optional[str]
    employment_status: Optional[str]

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Beneficiary
# ---------------------------------------------------------------------------
class BeneficiaryOut(BaseModel):
    beneficiary_id: str
    full_name: str
    relationship_to_policyholder: str
    date_of_birth: Optional[str]
    national_id: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    percentage_share: float
    is_primary: bool

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Policy Rider
# ---------------------------------------------------------------------------
class PolicyRiderOut(BaseModel):
    rider_id: str
    rider_type: str
    cover_amount: Optional[float]
    monthly_premium: float
    is_active: bool

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Premium Payment
# ---------------------------------------------------------------------------
class PremiumPaymentOut(BaseModel):
    payment_id: str
    payment_date: str
    amount_paid: float
    payment_method: str
    payment_status: str
    receipt_number: Optional[str]

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Policy
# ---------------------------------------------------------------------------
class PolicyOut(BaseModel):
    policy_id: str
    policy_type: str
    cover_types: str
    sum_assured: float
    disability_benefit: float
    critical_illness_benefit: float
    premium_amount: float
    premium_frequency: str
    start_date: str
    end_date: Optional[str]
    policy_status: str
    underwriting_class: Optional[str]
    exclusions: Optional[str]
    escalation_rate: float
    document_reference: Optional[str]
    policyholder: PolicyholderOut
    beneficiaries: list[BeneficiaryOut]
    riders: list[PolicyRiderOut]
    recent_payments: list[PremiumPaymentOut]

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Mortality Event
# ---------------------------------------------------------------------------
class MortalityEventOut(BaseModel):
    event_id: str
    event_type: str
    event_date: str
    place_of_event: Optional[str]
    cause_description: Optional[str]
    icd10_code: Optional[str]
    manner: Optional[str]
    death_certificate_number: Optional[str]
    verified: bool

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Claim Documents
# ---------------------------------------------------------------------------
class ClaimDocumentCreate(BaseModel):
    document_type: str
    document_name: Optional[str] = None
    extracted_data: Optional[dict[str, Any]] = None
    validation_status: str = "pending"


class ClaimDocumentOut(BaseModel):
    document_id: str
    document_type: str
    document_name: Optional[str]
    extracted_data: Optional[dict[str, Any]]
    validation_status: str
    uploaded_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Claim Events
# ---------------------------------------------------------------------------
class ClaimEventCreate(BaseModel):
    event_type: str
    message: Optional[str] = None
    payload: Optional[dict[str, Any]] = None


class ClaimEventOut(BaseModel):
    event_id: str
    event_type: str
    message: Optional[str]
    payload: Optional[dict[str, Any]]
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Claims
# ---------------------------------------------------------------------------
class ClaimCreate(BaseModel):
    policy_id: str
    policyholder_id: str
    claim_type: str  # Death | Disability | Critical Illness
    filed_by_name: Optional[str] = None
    filed_by_relationship: Optional[str] = None
    incident_date: Optional[str] = None
    icd10_code: Optional[str] = None
    diagnosis_description: Optional[str] = None


class ClaimPatch(BaseModel):
    status: Optional[str] = None
    filed_by_name: Optional[str] = None
    filed_by_relationship: Optional[str] = None
    incident_date: Optional[str] = None
    icd10_code: Optional[str] = None
    diagnosis_description: Optional[str] = None
    decision_reason: Optional[str] = None
    payout_amount: Optional[float] = None


class ClaimOut(BaseModel):
    claim_id: str
    policy_id: str
    policyholder_id: str
    claim_type: str
    status: str
    filed_by_name: Optional[str]
    filed_by_relationship: Optional[str]
    incident_date: Optional[str]
    icd10_code: Optional[str]
    diagnosis_description: Optional[str]
    decision_reason: Optional[str]
    payout_amount: Optional[float]
    created_at: datetime
    updated_at: datetime
    events: list[ClaimEventOut]
    documents: list[ClaimDocumentOut]

    model_config = {"from_attributes": True}


class ClaimSummaryOut(BaseModel):
    claim_id: str
    policy_id: str
    claim_type: str
    status: str
    filed_by_name: Optional[str]
    incident_date: Optional[str]
    payout_amount: Optional[float]
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Banking & payout dispatch
# ---------------------------------------------------------------------------
class BankingDetailsOut(BaseModel):
    banking_id: str
    policyholder_id: str
    bank_name: str
    account_holder: str
    account_number: str          # full number (the agent decides whether to mask)
    account_number_masked: str   # convenience: "•••• 4321"
    branch_code: str
    account_type: str

    model_config = {"from_attributes": True}


class PayoutDispatchIn(BaseModel):
    banking_id: str
    confirmed_by: Optional[str] = None  # name/role of the person who confirmed (free text)


class PayoutDispatchOut(BaseModel):
    claim_id: str
    banking_id: str
    bank_name: str
    account_number_masked: str
    payout_amount: Optional[float]
    dispatched_at: datetime
    message: str


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
class DashboardResponse(BaseModel):
    total_claims: int
    approved_count: int
    denied_count: int
    pending_count: int
    approval_rate: float
    claims_by_type: dict[str, int]
    claims_by_status: dict[str, int]
    total_payout_approved: float
    recent_claims: list[ClaimSummaryOut]
