# Sentinel Life — Claims Agent

Proof-of-concept agentic AI system for life insurance claims intake and triage.

## Architecture

- **FastAPI + Postgres** — Sentinel Life core API with policyholders, policies, beneficiaries, riders, premium payments, claims, documents, and OTP tokens.
- **LangGraph agent** (`sentinel_life`) — Deterministic auth and intake gates, then an LLM-assisted claim workflow.
- **Next.js portal** — Voice-first customer UI with controlled views for auth, policy overview, claim intake, document upload, claim outcome, and dashboard.

## Deterministic Workflow

1. Customer lands on the voice portal.
2. Customer speaks or types the first request.
3. The graph routes to authentication before any policy or claim view can appear.
4. After verification, the graph loads the policy overview.
5. The graph asks for claim type: Death, Disability, or Critical Illness.
6. Death claims require the deceased policyholder's 13-digit South African ID before intake proceeds.
7. The main claim agent gathers details, opens the claim, checks eligibility, collects documents, calculates payout, records a decision, and generates/email reports.

## Quick Start

Start the Sentinel backend:

```bash
docker compose -f docker-compose.sentinel.yml up --build
```

Run the LangGraph server from the repo root:

```bash
langgraph dev
```

Run the frontend:

```bash
cd agent-chat-ui
pnpm dev
```

The UI expects:

```bash
NEXT_PUBLIC_API_URL=http://localhost:2024
NEXT_PUBLIC_ASSISTANT_ID=sentinel_life
NEXT_PUBLIC_INSURANCE_API_URL=http://localhost:8001
NEXT_PUBLIC_INSURANCE_API_KEY=sentinel-api-key-2025
```

## Demo Policies

Useful seeded policies from the Sentinel Life dataset:

| Policy | Policyholder | Cover Types |
|---|---|---|
| `POL-2024-001` | John Michael Dlamini | Death |
| `POL-2024-002` | Nomvula Priscilla Khumalo | Death, Disability, Critical Illness |
| `POL-2024-003` | Sipho Andile Nkosi | Death, Disability |
| `POL-2023-004` | Fatima Baderoon | Death, Critical Illness |
| `POL-2022-006` | Zanele Moyo | Death, Disability, Critical Illness |

## API

All protected Sentinel endpoints require:

```text
X-API-Key: sentinel-api-key-2025
```

Core endpoints:

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/auth/request-otp` | Request an OTP for a policy ID and national ID |
| POST | `/auth/verify-otp` | Verify the latest OTP |
| GET | `/policies/{policy_id}` | Policy, policyholder, beneficiaries, riders, and recent payments |
| POST | `/claims` | Create a life insurance claim |
| GET | `/claims/{claim_id}` | Get claim with events and documents |
| PATCH | `/claims/{claim_id}` | Update claim status/details/payout |
| POST | `/claims/{claim_id}/events` | Log an audit event |
| POST | `/claims/{claim_id}/documents` | Record a supporting document |
