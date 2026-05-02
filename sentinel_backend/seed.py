"""
Migrate Sentinel Life SQLite → PostgreSQL.
Run locally (not inside Docker):
    cd sentinel_backend
    pip install sqlalchemy[asyncio] asyncpg aiosqlite python-dotenv
    python seed.py
"""
import asyncio
import os
import sqlite3
import sys

from dotenv import load_dotenv

load_dotenv()

SQLITE_PATH = os.getenv(
    "SQLITE_PATH",
    "/Users/christiaanbecker/Downloads/Claims Agent/sentinel_life.db"
)
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://sentinel:sentinel@localhost:5433/sentinel_life_db"
)

# ---------------------------------------------------------------------------
# Read everything from SQLite (sync)
# ---------------------------------------------------------------------------
def read_sqlite():
    con = sqlite3.connect(SQLITE_PATH)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    def fetch(table):
        cur.execute(f"SELECT * FROM {table}")
        return [dict(r) for r in cur.fetchall()]

    data = {
        "medical_practitioners": fetch("medical_practitioners"),
        "agents":                fetch("agents"),
        "policyholders":         fetch("policyholders"),
        "policies":              fetch("policies"),
        "beneficiaries":         fetch("beneficiaries"),
        "policy_riders":         fetch("policy_riders"),
        "premium_payments":      fetch("premium_payments"),
        "mortality_events":      fetch("mortality_events"),
    }
    con.close()
    return data


# ---------------------------------------------------------------------------
# Write to PostgreSQL (async)
# ---------------------------------------------------------------------------
async def seed_postgres(data: dict):
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy import text

    # Use the models from the app
    sys.path.insert(0, os.path.dirname(__file__))
    from app.models import (
        Base, MedicalPractitioner, SentinelAgent, Policyholder, Policy,
        Beneficiary, PolicyRider, PremiumPayment, MortalityEvent,
    )

    engine = create_async_engine(DATABASE_URL, echo=False)

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        # Check if already seeded
        from sqlalchemy import select
        existing = await db.execute(select(Policyholder))
        if existing.scalars().first():
            print("✓ Already seeded — skipping.")
            return

        print("Seeding medical_practitioners...")
        for r in data["medical_practitioners"]:
            db.add(MedicalPractitioner(
                practitioner_id=r["practitioner_id"],
                full_name=r["full_name"],
                registration_number=r["registration_number"],
                specialisation=r.get("specialisation"),
                institution=r.get("institution"),
                phone=r.get("phone"),
                email=r.get("email"),
            ))

        print("Seeding agents...")
        for r in data["agents"]:
            db.add(SentinelAgent(
                agent_id=r["agent_id"],
                full_name=r["full_name"],
                role=r["role"],
                email=r["email"],
                is_active=bool(r.get("is_active", 1)),
            ))

        # All policyholders share the demo inbox so OTP works in demos.
        DEMO_EMAIL = os.getenv("DEMO_OTP_EMAIL", "christiaanbecker9@icloud.com")

        print("Seeding policyholders...")
        for r in data["policyholders"]:
            db.add(Policyholder(
                policyholder_id=r["policyholder_id"],
                full_name=r["full_name"],
                date_of_birth=r["date_of_birth"],
                national_id=r["national_id"],
                gender=r["gender"],
                email=DEMO_EMAIL,        # unified demo inbox
                phone=r.get("phone"),
                address=r.get("address"),
                employment_status=r.get("employment_status"),
                created_at=r["created_at"],
            ))

        await db.flush()

        print("Seeding policies...")
        for r in data["policies"]:
            db.add(Policy(
                policy_id=r["policy_id"],
                policyholder_id=r["policyholder_id"],
                policy_type=r["policy_type"],
                cover_types=r["cover_types"],
                sum_assured=r["sum_assured"],
                disability_benefit=r.get("disability_benefit", 0),
                critical_illness_benefit=r.get("critical_illness_benefit", 0),
                premium_amount=r["premium_amount"],
                premium_frequency=r.get("premium_frequency", "Monthly"),
                start_date=r["start_date"],
                end_date=r.get("end_date"),
                policy_status=r.get("policy_status", "Active"),
                underwriting_class=r.get("underwriting_class"),
                exclusions=r.get("exclusions"),
                escalation_rate=r.get("escalation_rate", 0.05),
                document_reference=r.get("document_reference"),
            ))

        await db.flush()

        print("Seeding beneficiaries...")
        # Build a policyholder_id → policy_id mapping for FK
        ph_to_policy: dict[str, str] = {r["policyholder_id"]: r["policy_id"] for r in data["policies"]}
        for r in data["beneficiaries"]:
            db.add(Beneficiary(
                beneficiary_id=r["beneficiary_id"],
                policyholder_id=r["policyholder_id"],
                policy_id=ph_to_policy.get(r["policyholder_id"]),
                full_name=r["full_name"],
                relationship_to_policyholder=r["relationship_to_policyholder"],
                date_of_birth=r.get("date_of_birth"),
                national_id=r.get("national_id"),
                email=r.get("email"),
                phone=r.get("phone"),
                percentage_share=r["percentage_share"],
                is_primary=bool(r.get("is_primary", 1)),
            ))

        print("Seeding policy_riders...")
        for r in data["policy_riders"]:
            db.add(PolicyRider(
                rider_id=r["rider_id"],
                policy_id=r["policy_id"],
                rider_type=r["rider_type"],
                cover_amount=r.get("cover_amount"),
                monthly_premium=r.get("monthly_premium", 0),
                is_active=bool(r.get("is_active", 1)),
            ))

        print("Seeding premium_payments...")
        for r in data["premium_payments"]:
            db.add(PremiumPayment(
                payment_id=r["payment_id"],
                policy_id=r["policy_id"],
                payment_date=r["payment_date"],
                amount_paid=r["amount_paid"],
                payment_method=r.get("payment_method", "Debit Order"),
                payment_status=r.get("payment_status", "Paid"),
                receipt_number=r.get("receipt_number"),
            ))

        print("Seeding mortality_events...")
        for r in data["mortality_events"]:
            db.add(MortalityEvent(
                event_id=r["event_id"],
                policyholder_id=r["policyholder_id"],
                event_type=r["event_type"],
                event_date=r["event_date"],
                place_of_event=r.get("place_of_event"),
                cause_description=r.get("cause_description"),
                icd10_code=r.get("icd10_code"),
                manner=r.get("manner"),
                death_certificate_number=r.get("death_certificate_number"),
                certifying_doctor_id=r.get("certifying_doctor_id"),
                verified=bool(r.get("verified", 0)),
            ))

        await db.commit()
        print(f"""
✅ Seeded successfully:
   {len(data['medical_practitioners'])} medical practitioners
   {len(data['agents'])} agents
   {len(data['policyholders'])} policyholders
   {len(data['policies'])} policies
   {len(data['beneficiaries'])} beneficiaries
   {len(data['policy_riders'])} policy riders
   {len(data['premium_payments'])} premium payments
   {len(data['mortality_events'])} mortality events
        """)

    await engine.dispose()


async def main():
    print(f"Reading from: {SQLITE_PATH}")
    print(f"Writing to:  {DATABASE_URL}")
    data = read_sqlite()
    await seed_postgres(data)


if __name__ == "__main__":
    asyncio.run(main())
