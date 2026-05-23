import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


def _now():
    return datetime.now(timezone.utc)


class MedicalPractitioner(Base):
    __tablename__ = "medical_practitioners"

    practitioner_id = Column(String, primary_key=True)
    full_name = Column(String, nullable=False)
    registration_number = Column(String, nullable=False, unique=True)
    specialisation = Column(String)
    institution = Column(String)
    phone = Column(String)
    email = Column(String)

    mortality_events = relationship("MortalityEvent", back_populates="certifying_doctor")


class SentinelAgent(Base):
    __tablename__ = "sentinel_agents"

    agent_id = Column(String, primary_key=True)
    full_name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    email = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)


class Policyholder(Base):
    __tablename__ = "policyholders"

    policyholder_id = Column(String, primary_key=True)
    full_name = Column(String, nullable=False)
    date_of_birth = Column(String, nullable=False)
    national_id = Column(String, nullable=False, unique=True)
    gender = Column(String, nullable=False)
    email = Column(String)
    phone = Column(String)
    address = Column(String)
    employment_status = Column(String)
    created_at = Column(String, nullable=False)

    policies = relationship("Policy", back_populates="policyholder")
    beneficiaries = relationship("Beneficiary", back_populates="policyholder")
    mortality_events = relationship("MortalityEvent", back_populates="policyholder")
    otp_tokens = relationship("OTPToken", back_populates="policyholder")


class Policy(Base):
    __tablename__ = "policies"

    policy_id = Column(String, primary_key=True)
    policyholder_id = Column(String, ForeignKey("policyholders.policyholder_id"), nullable=False)
    policy_type = Column(String, nullable=False)
    cover_types = Column(String, nullable=False)
    sum_assured = Column(Float, nullable=False)
    disability_benefit = Column(Float, default=0)
    critical_illness_benefit = Column(Float, default=0)
    premium_amount = Column(Float, nullable=False)
    premium_frequency = Column(String, default="Monthly")
    start_date = Column(String, nullable=False)
    end_date = Column(String)
    policy_status = Column(String, default="Active")
    underwriting_class = Column(String)
    exclusions = Column(Text)
    escalation_rate = Column(Float, default=0.05)
    document_reference = Column(String)

    policyholder = relationship("Policyholder", back_populates="policies")
    beneficiaries = relationship("Beneficiary", back_populates="policy")
    riders = relationship("PolicyRider", back_populates="policy")
    premium_payments = relationship("PremiumPayment", back_populates="policy", order_by="PremiumPayment.payment_date.desc()")
    claims = relationship("Claim", back_populates="policy")


class Beneficiary(Base):
    __tablename__ = "beneficiaries"

    beneficiary_id = Column(String, primary_key=True)
    policyholder_id = Column(String, ForeignKey("policyholders.policyholder_id"), nullable=False)
    policy_id = Column(String, ForeignKey("policies.policy_id"))
    full_name = Column(String, nullable=False)
    relationship_to_policyholder = Column(String, nullable=False)
    date_of_birth = Column(String)
    national_id = Column(String)
    email = Column(String)
    phone = Column(String)
    percentage_share = Column(Float, nullable=False)
    is_primary = Column(Boolean, default=True)

    policyholder = relationship("Policyholder", back_populates="beneficiaries")
    policy = relationship("Policy", back_populates="beneficiaries")


class PolicyRider(Base):
    __tablename__ = "policy_riders"

    rider_id = Column(String, primary_key=True)
    policy_id = Column(String, ForeignKey("policies.policy_id"), nullable=False)
    rider_type = Column(String, nullable=False)
    cover_amount = Column(Float)
    monthly_premium = Column(Float, default=0)
    is_active = Column(Boolean, default=True)

    policy = relationship("Policy", back_populates="riders")


class PremiumPayment(Base):
    __tablename__ = "premium_payments"

    payment_id = Column(String, primary_key=True)
    policy_id = Column(String, ForeignKey("policies.policy_id"), nullable=False)
    payment_date = Column(String, nullable=False)
    amount_paid = Column(Float, nullable=False)
    payment_method = Column(String, default="Debit Order")
    payment_status = Column(String, default="Paid")
    receipt_number = Column(String)

    policy = relationship("Policy", back_populates="premium_payments")


class MortalityEvent(Base):
    __tablename__ = "mortality_events"

    event_id = Column(String, primary_key=True)
    policyholder_id = Column(String, ForeignKey("policyholders.policyholder_id"), nullable=False)
    event_type = Column(String, nullable=False)
    event_date = Column(String, nullable=False)
    place_of_event = Column(String)
    cause_description = Column(Text)
    icd10_code = Column(String)
    manner = Column(String)
    death_certificate_number = Column(String)
    certifying_doctor_id = Column(String, ForeignKey("medical_practitioners.practitioner_id"))
    verified = Column(Boolean, default=False)

    policyholder = relationship("Policyholder", back_populates="mortality_events")
    certifying_doctor = relationship("MedicalPractitioner", back_populates="mortality_events")


class OTPToken(Base):
    __tablename__ = "otp_tokens"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    policyholder_id = Column(String, ForeignKey("policyholders.policyholder_id"), nullable=False)
    code = Column(String, nullable=False)
    purpose = Column(String, default="auth")
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False)
    attempts = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=_now)

    policyholder = relationship("Policyholder", back_populates="otp_tokens")


class Claim(Base):
    __tablename__ = "claims"

    claim_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    policy_id = Column(String, ForeignKey("policies.policy_id"), nullable=False)
    policyholder_id = Column(String, ForeignKey("policyholders.policyholder_id"), nullable=False)
    claim_type = Column(String, nullable=False)  # Death | Disability | Critical Illness
    status = Column(String, default="intake")  # intake | documents_pending | under_review | approved | denied | pending_info
    filed_by_name = Column(String)
    filed_by_relationship = Column(String)
    incident_date = Column(String)
    icd10_code = Column(String)
    diagnosis_description = Column(Text)
    decision_reason = Column(Text)
    payout_amount = Column(Float)
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    policy = relationship("Policy", back_populates="claims")
    events = relationship("ClaimEvent", back_populates="claim", order_by="ClaimEvent.created_at")
    documents = relationship("ClaimDocument", back_populates="claim")


class ClaimDocument(Base):
    __tablename__ = "claim_documents"

    document_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    claim_id = Column(String, ForeignKey("claims.claim_id"), nullable=False)
    document_type = Column(String, nullable=False)  # death_certificate | disability_assessment | medical_report | id_document | other
    document_name = Column(String)
    extracted_data = Column(JSON)  # structured data the agent extracted
    validation_status = Column(String, default="pending")  # pending | valid | invalid | requires_review
    uploaded_at = Column(DateTime(timezone=True), default=_now)

    claim = relationship("Claim", back_populates="documents")


class ClaimEvent(Base):
    __tablename__ = "claim_events"

    event_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    claim_id = Column(String, ForeignKey("claims.claim_id"), nullable=False)
    event_type = Column(String, nullable=False)  # note | document_received | eligibility_check | decision | status_change | error
    message = Column(Text)
    payload = Column(JSON)
    created_at = Column(DateTime(timezone=True), default=_now)

    claim = relationship("Claim", back_populates="events")


class BankingDetails(Base):
    """Payout banking details for a policyholder.

    One record per policyholder. Used at claim payout time to confirm where
    the funds should be sent and to record dispatch to the finance team.
    """
    __tablename__ = "banking_details"

    banking_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    policyholder_id = Column(
        String,
        ForeignKey("policyholders.policyholder_id"),
        nullable=False,
        unique=True,
    )
    bank_name = Column(String, nullable=False)            # e.g. "Standard Bank"
    account_holder = Column(String, nullable=False)       # full name on the account
    account_number = Column(String, nullable=False)       # 10-digit SA account number (string to preserve leading zeros)
    branch_code = Column(String, nullable=False)          # SA universal branch code (6 digits)
    account_type = Column(String, default="Cheque")       # Cheque | Savings
    created_at = Column(DateTime(timezone=True), default=_now)
