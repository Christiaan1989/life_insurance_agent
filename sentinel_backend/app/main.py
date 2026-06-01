import hashlib
import random
import string
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import API_KEY, DEMO_OTP_EMAIL, RESEND_API_KEY, RESEND_FROM_EMAIL
from app.database import async_session, engine, get_db
from app.models import (
    BankingDetails, Base, Beneficiary, Claim, ClaimDocument, ClaimEvent,
    MedicalPractitioner, MortalityEvent, OTPToken, Policy, Policyholder,
    PolicyRider, PremiumPayment, SentinelAgent,
)
from app.schemas import (
    BankingDetailsOut, ClaimCreate, ClaimDocumentCreate, ClaimDocumentOut,
    ClaimEventCreate, ClaimEventOut, ClaimOut, ClaimPatch, ClaimSummaryOut,
    DashboardResponse, OTPRequestIn, OTPRequestOut, OTPVerifyIn, OTPVerifyOut,
    PayoutDispatchIn, PayoutDispatchOut, PolicyOut, MortalityEventOut,
)


# ---------------------------------------------------------------------------
# Banking helpers
#
# South African bank reference data. Branch codes are real universal branch
# codes for each retail bank — these are used in production EFT routing.
# The account number is generated deterministically from the policyholder_id
# so the same person always gets the same details across restarts.
# ---------------------------------------------------------------------------
_SA_BANKS = [
    {"bank_name": "Standard Bank", "branch_code": "051001"},
    {"bank_name": "ABSA",          "branch_code": "632005"},
    {"bank_name": "First National Bank", "branch_code": "250655"},
    {"bank_name": "Nedbank",       "branch_code": "198765"},
    {"bank_name": "Capitec Bank",  "branch_code": "470010"},
    {"bank_name": "Investec",      "branch_code": "580105"},
]
_SA_ACCOUNT_TYPES = ["Cheque", "Savings"]


def _generate_banking_for(policyholder_id: str, account_holder: str) -> dict:
    """Deterministically generate realistic SA banking details from a policyholder_id."""
    digest = hashlib.sha256(policyholder_id.encode("utf-8")).digest()
    bank = _SA_BANKS[digest[0] % len(_SA_BANKS)]
    account_type = _SA_ACCOUNT_TYPES[digest[1] % len(_SA_ACCOUNT_TYPES)]
    # 10-digit account number derived from the hash (preserve leading zeros).
    # The full number is used only to derive the masked form — it is never
    # returned or persisted. We store the masked value (e.g. "•••• 2239")
    # so the full account number lives nowhere in the database.
    full_account_number = "".join(str(b % 10) for b in digest[2:12])
    return {
        "bank_name": bank["bank_name"],
        "branch_code": bank["branch_code"],
        "account_type": account_type,
        "account_number": _mask_account_number(full_account_number),
        "account_holder": account_holder,
    }


def _mask_account_number(number: str) -> str:
    if not number:
        return ""
    # Idempotent: an already-masked value (e.g. "•••• 2239") is returned as-is
    # so we never double-mask or accidentally re-expose stored data.
    if "•" in number:
        return number
    if len(number) <= 4:
        return number
    return f"•••• {number[-4:]}"


async def _backfill_banking_details() -> None:
    """Ensure every policyholder has a banking_details row.

    Idempotent. Runs once at startup so existing seeded databases pick up
    banking details without needing a re-seed.
    """
    async with async_session() as db:
        result = await db.execute(select(Policyholder))
        policyholders = result.scalars().all()
        if not policyholders:
            return

        existing_ids = set(
            (
                await db.execute(select(BankingDetails.policyholder_id))
            ).scalars().all()
        )

        added = 0
        for ph in policyholders:
            if ph.policyholder_id in existing_ids:
                continue
            details = _generate_banking_for(ph.policyholder_id, ph.full_name)
            db.add(BankingDetails(policyholder_id=ph.policyholder_id, **details))
            added += 1

        if added:
            await db.commit()


async def _mask_stored_account_numbers() -> None:
    """Ensure no full account number is persisted.

    Idempotent. Replaces any legacy banking row that still holds a full
    account number with its masked form (e.g. "•••• 2239"). Runs at startup
    so existing databases are cleaned without a re-seed. After this, the full
    account number lives nowhere in the database.
    """
    async with async_session() as db:
        result = await db.execute(select(BankingDetails))
        records = result.scalars().all()
        changed = 0
        for rec in records:
            if rec.account_number and "•" not in rec.account_number:
                rec.account_number = _mask_account_number(rec.account_number)
                changed += 1
        if changed:
            await db.commit()


app = FastAPI(title="Sentinel Life Claims API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------
async def verify_api_key(x_api_key: str = Header(...)):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def on_startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Make sure every policyholder has banking details for payout. Safe to
    # call on every boot — no-op if the rows already exist.
    await _backfill_banking_details()
    # Mask any legacy full account numbers still in storage. Idempotent.
    await _mask_stored_account_numbers()


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "ok", "service": "Sentinel Life Claims API"}


# ---------------------------------------------------------------------------
# Auth: OTP flow
# ---------------------------------------------------------------------------
@app.post("/auth/request-otp", response_model=OTPRequestOut)
async def request_otp(body: OTPRequestIn, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Policy)
        .where(Policy.policy_id == body.policy_id)
        .options(selectinload(Policy.policyholder))
    )
    policy = result.scalars().first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    ph = policy.policyholder
    if ph.national_id != body.national_id:
        raise HTTPException(status_code=401, detail="National ID does not match policy records")

    code = "".join(random.choices(string.digits, k=6))
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    token = OTPToken(
        policyholder_id=ph.policyholder_id,
        code=code,
        purpose="auth",
        expires_at=expires,
    )
    db.add(token)
    await db.commit()

    send_email = DEMO_OTP_EMAIL or ph.email
    email_hint = send_email[:3] + "***@" + send_email.split("@")[-1] if send_email else "unknown"

    if RESEND_API_KEY:
        try:
            import resend
            resend.api_key = RESEND_API_KEY
            resend.Emails.send({
                "from": RESEND_FROM_EMAIL,
                "to": [send_email],
                "subject": "Sentinel Life – Your verification code",
                "html": f"""
                    <div style="font-family:sans-serif;max-width:480px">
                        <h2 style="color:#1a3c5e">Sentinel Life</h2>
                        <p>Your one-time verification code is:</p>
                        <h1 style="letter-spacing:8px;color:#1a3c5e">{code}</h1>
                        <p style="color:#666">Valid for 10 minutes. Do not share this code.</p>
                    </div>
                """,
            })
        except Exception as e:
            print(f"[OTP] Email failed: {e} — code: {code}")
    else:
        print(f"[OTP] Code for {ph.full_name} ({body.policy_id}): {code}")

    return OTPRequestOut(
        message=f"A 6-digit code has been sent to the email on your policy record.",
        email_hint=email_hint,
    )


@app.post("/auth/verify-otp", response_model=OTPVerifyOut)
async def verify_otp(body: OTPVerifyIn, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Policy)
        .where(Policy.policy_id == body.policy_id)
        .options(selectinload(Policy.policyholder))
    )
    policy = result.scalars().first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    ph = policy.policyholder
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(OTPToken)
        .where(
            OTPToken.policyholder_id == ph.policyholder_id,
            OTPToken.used == False,
            OTPToken.expires_at > now,
        )
        .order_by(OTPToken.created_at.desc())
    )
    token = result.scalars().first()

    if not token:
        raise HTTPException(status_code=400, detail="No valid OTP found. Please request a new one.")

    token.attempts += 1
    if token.attempts > 5:
        await db.commit()
        raise HTTPException(status_code=400, detail="Too many attempts. Please request a new code.")

    if token.code != body.code:
        await db.commit()
        raise HTTPException(status_code=400, detail="Incorrect code. Please try again.")

    token.used = True
    await db.commit()

    return OTPVerifyOut(
        verified=True,
        policyholder_id=ph.policyholder_id,
        full_name=ph.full_name,
        message=f"Identity verified. Welcome, {ph.full_name.split()[0]}.",
    )


# ---------------------------------------------------------------------------
# Policy
# ---------------------------------------------------------------------------
@app.get("/policies/{policy_id}", response_model=PolicyOut, dependencies=[Depends(verify_api_key)])
async def get_policy(policy_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Policy)
        .where(Policy.policy_id == policy_id)
        .options(
            selectinload(Policy.policyholder),
            selectinload(Policy.beneficiaries),
            selectinload(Policy.riders),
            selectinload(Policy.premium_payments),
        )
    )
    policy = result.scalars().first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    recent_payments = sorted(policy.premium_payments, key=lambda p: p.payment_date, reverse=True)[:6]

    return PolicyOut(
        policy_id=policy.policy_id,
        policy_type=policy.policy_type,
        cover_types=policy.cover_types,
        sum_assured=policy.sum_assured,
        disability_benefit=policy.disability_benefit,
        critical_illness_benefit=policy.critical_illness_benefit,
        premium_amount=policy.premium_amount,
        premium_frequency=policy.premium_frequency,
        start_date=policy.start_date,
        end_date=policy.end_date,
        policy_status=policy.policy_status,
        underwriting_class=policy.underwriting_class,
        exclusions=policy.exclusions,
        escalation_rate=policy.escalation_rate,
        document_reference=policy.document_reference,
        policyholder=policy.policyholder,
        beneficiaries=policy.beneficiaries,
        riders=policy.riders,
        recent_payments=recent_payments,
    )


# ---------------------------------------------------------------------------
# Mortality Events (existing verified events for a policyholder)
# ---------------------------------------------------------------------------
@app.get("/policyholders/{policyholder_id}/events", response_model=list[MortalityEventOut], dependencies=[Depends(verify_api_key)])
async def get_mortality_events(policyholder_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MortalityEvent).where(MortalityEvent.policyholder_id == policyholder_id)
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Banking details for payout
# ---------------------------------------------------------------------------
@app.get(
    "/policyholders/{policyholder_id}/banking",
    response_model=BankingDetailsOut,
    dependencies=[Depends(verify_api_key)],
)
async def get_banking_details(policyholder_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BankingDetails).where(BankingDetails.policyholder_id == policyholder_id)
    )
    record = result.scalars().first()

    # Lazy fallback: if for any reason this policyholder has no banking row
    # yet (e.g. seeded after startup), generate one on the fly so the demo
    # never dead-ends. The startup backfill normally handles this.
    if not record:
        ph = await db.get(Policyholder, policyholder_id)
        if not ph:
            raise HTTPException(status_code=404, detail="Policyholder not found")
        details = _generate_banking_for(ph.policyholder_id, ph.full_name)
        record = BankingDetails(policyholder_id=ph.policyholder_id, **details)
        db.add(record)
        await db.commit()
        await db.refresh(record)

    return BankingDetailsOut(
        banking_id=record.banking_id,
        policyholder_id=record.policyholder_id,
        bank_name=record.bank_name,
        account_holder=record.account_holder,
        account_number=record.account_number,
        account_number_masked=_mask_account_number(record.account_number),
        branch_code=record.branch_code,
        account_type=record.account_type,
    )


@app.post(
    "/claims/{claim_id}/payout-dispatch",
    response_model=PayoutDispatchOut,
    dependencies=[Depends(verify_api_key)],
)
async def dispatch_payout(
    claim_id: str,
    body: PayoutDispatchIn,
    db: AsyncSession = Depends(get_db),
):
    """Record that an approved payout has been dispatched to finance.

    Verifies the claim is approved, that the banking record exists and
    belongs to the same policyholder, and writes a `payout_dispatched`
    claim event. Returns the masked banking summary the agent should read
    back to the customer in the confirmation message.
    """
    claim = await db.get(Claim, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim.status != "approved":
        raise HTTPException(
            status_code=409,
            detail=f"Claim is '{claim.status}', not approved — cannot dispatch payout.",
        )

    banking = await db.get(BankingDetails, body.banking_id)
    if not banking:
        raise HTTPException(status_code=404, detail="Banking details not found")
    if banking.policyholder_id != claim.policyholder_id:
        raise HTTPException(
            status_code=400,
            detail="Banking record does not belong to this claim's policyholder.",
        )

    dispatched_at = datetime.now(timezone.utc)
    event = ClaimEvent(
        claim_id=claim.claim_id,
        event_type="payout_dispatched",
        message=(
            f"Payout of R{claim.payout_amount or 0:,.2f} dispatched to "
            f"{banking.bank_name} {_mask_account_number(banking.account_number)}."
        ),
        payload={
            "banking_id": banking.banking_id,
            "bank_name": banking.bank_name,
            "account_number_masked": _mask_account_number(banking.account_number),
            "branch_code": banking.branch_code,
            "account_type": banking.account_type,
            "payout_amount": claim.payout_amount,
            "confirmed_by": body.confirmed_by,
            "dispatched_at": dispatched_at.isoformat(),
        },
    )
    db.add(event)
    await db.commit()

    return PayoutDispatchOut(
        claim_id=claim.claim_id,
        banking_id=banking.banking_id,
        bank_name=banking.bank_name,
        account_number_masked=_mask_account_number(banking.account_number),
        payout_amount=claim.payout_amount,
        dispatched_at=dispatched_at,
        message=(
            "Payout forwarded to the finance department. Expect funds in the "
            "account within 1–2 weeks. If nothing is received by then, "
            "contact the Sentinel Life call centre on 0800 SENTINEL."
        ),
    )


# ---------------------------------------------------------------------------
# Claims
# ---------------------------------------------------------------------------
@app.post("/claims", response_model=ClaimOut, dependencies=[Depends(verify_api_key)])
async def create_claim(body: ClaimCreate, db: AsyncSession = Depends(get_db)):
    policy = await db.get(Policy, body.policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    claim = Claim(
        policy_id=body.policy_id,
        policyholder_id=body.policyholder_id,
        claim_type=body.claim_type,
        status="intake",
        filed_by_name=body.filed_by_name,
        filed_by_relationship=body.filed_by_relationship,
        incident_date=body.incident_date,
        icd10_code=body.icd10_code,
        diagnosis_description=body.diagnosis_description,
    )
    db.add(claim)
    await db.flush()

    opening_event = ClaimEvent(
        claim_id=claim.claim_id,
        event_type="status_change",
        message=f"{body.claim_type} claim opened for policy {body.policy_id}.",
        payload={"status": "intake"},
    )
    db.add(opening_event)
    await db.commit()

    return await _load_claim(claim.claim_id, db)


@app.get("/claims/{claim_id}", response_model=ClaimOut, dependencies=[Depends(verify_api_key)])
async def get_claim(claim_id: str, db: AsyncSession = Depends(get_db)):
    claim = await _load_claim(claim_id, db)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    return claim


@app.patch("/claims/{claim_id}", response_model=ClaimOut, dependencies=[Depends(verify_api_key)])
async def patch_claim(claim_id: str, body: ClaimPatch, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Claim).where(Claim.claim_id == claim_id))
    claim = result.scalars().first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(claim, field, value)

    claim.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return await _load_claim(claim_id, db)


@app.post("/claims/{claim_id}/events", response_model=ClaimEventOut, dependencies=[Depends(verify_api_key)])
async def add_claim_event(claim_id: str, body: ClaimEventCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Claim).where(Claim.claim_id == claim_id))
    if not result.scalars().first():
        raise HTTPException(status_code=404, detail="Claim not found")

    event = ClaimEvent(
        claim_id=claim_id,
        event_type=body.event_type,
        message=body.message,
        payload=body.payload,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


@app.post("/claims/{claim_id}/documents", response_model=ClaimDocumentOut, dependencies=[Depends(verify_api_key)])
async def add_claim_document(claim_id: str, body: ClaimDocumentCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Claim).where(Claim.claim_id == claim_id))
    claim = result.scalars().first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    # Supersede prior versions of the same logical document. A re-upload of the
    # same document (matched on document_type + document_name) replaces the old
    # copy instead of stacking alongside it, so a correction genuinely fixes the
    # record. Without this, a stale document (e.g. one with a wrong ID number)
    # lingers on the claim and keeps failing identity/evidence checks even after
    # the corrected document is uploaded.
    existing_result = await db.execute(
        select(ClaimDocument).where(
            ClaimDocument.claim_id == claim_id,
            ClaimDocument.document_type == body.document_type,
            ClaimDocument.document_name == body.document_name,
        )
    )
    superseded = existing_result.scalars().all()
    superseded_ids = [old.document_id for old in superseded]
    for old in superseded:
        await db.delete(old)
    if superseded_ids:
        db.add(
            ClaimEvent(
                claim_id=claim_id,
                event_type="document_superseded",
                message=(
                    f"Replaced {len(superseded_ids)} prior version(s) of "
                    f"{body.document_name or body.document_type}."
                ),
                payload={
                    "document_type": body.document_type,
                    "document_name": body.document_name,
                    "superseded_document_ids": superseded_ids,
                },
            )
        )

    doc = ClaimDocument(
        claim_id=claim_id,
        document_type=body.document_type,
        document_name=body.document_name,
        extracted_data=body.extracted_data,
        validation_status=body.validation_status,
    )
    db.add(doc)

    event = ClaimEvent(
        claim_id=claim_id,
        event_type="document_received",
        message=f"Document received: {body.document_name or body.document_type}",
        payload={"document_type": body.document_type, "validation_status": body.validation_status},
    )
    db.add(event)
    await db.commit()
    await db.refresh(doc)
    return doc


@app.get("/claims/{claim_id}/documents", response_model=list[ClaimDocumentOut], dependencies=[Depends(verify_api_key)])
async def get_claim_documents(claim_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ClaimDocument).where(ClaimDocument.claim_id == claim_id)
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@app.get("/dashboard", response_model=DashboardResponse, dependencies=[Depends(verify_api_key)])
async def get_dashboard(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Claim).options(selectinload(Claim.events), selectinload(Claim.documents))
    )
    claims = result.scalars().all()

    approved = [c for c in claims if c.status == "approved"]
    denied = [c for c in claims if c.status == "denied"]
    pending = [c for c in claims if c.status not in ("approved", "denied")]

    by_type: dict[str, int] = defaultdict(int)
    by_status: dict[str, int] = defaultdict(int)
    for c in claims:
        by_type[c.claim_type] += 1
        by_status[c.status] += 1

    total_payout = sum(c.payout_amount or 0 for c in approved)
    decided = len(approved) + len(denied)
    approval_rate = (len(approved) / decided * 100) if decided else 0

    recent = sorted(claims, key=lambda c: c.created_at, reverse=True)[:10]

    return DashboardResponse(
        total_claims=len(claims),
        approved_count=len(approved),
        denied_count=len(denied),
        pending_count=len(pending),
        approval_rate=round(approval_rate, 1),
        claims_by_type=dict(by_type),
        claims_by_status=dict(by_status),
        total_payout_approved=total_payout,
        recent_claims=[
            ClaimSummaryOut(
                claim_id=c.claim_id,
                policy_id=c.policy_id,
                claim_type=c.claim_type,
                status=c.status,
                filed_by_name=c.filed_by_name,
                incident_date=c.incident_date,
                payout_amount=c.payout_amount,
                created_at=c.created_at,
            )
            for c in recent
        ],
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def _load_claim(claim_id: str, db: AsyncSession) -> Claim | None:
    result = await db.execute(
        select(Claim)
        .where(Claim.claim_id == claim_id)
        .options(
            selectinload(Claim.events),
            selectinload(Claim.documents),
        )
    )
    return result.scalars().first()
