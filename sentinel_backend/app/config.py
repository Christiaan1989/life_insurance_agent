import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://sentinel:sentinel@localhost:5433/sentinel_life_db")
API_KEY = os.getenv("API_KEY", "sentinel-api-key-2025")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "onboarding@resend.dev")
DEMO_OTP_EMAIL = os.getenv("DEMO_OTP_EMAIL", "christiaanbecker9@icloud.com")
