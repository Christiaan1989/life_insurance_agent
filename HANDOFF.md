# Sentinel Life · Claims Agent — Engineering Handoff

> Companion to `AGENT_CONTEXT.md`. This document is written for a coding agent picking up the project cold. It is heavily weighted toward the **voice subsystem**, which is the most fragile part of the stack and the part that gets broken accidentally most often.

Last updated: 2026-06-01. Repo root: `/Users/christiaanbecker/Documents/Pycharm/life_insurance_agent`.

---

## 1. What this repo is — one paragraph

A demo-grade voice-first AI claims agent for **Sentinel Life**, a fictional South African life insurer. A customer authenticates with a policy number + national ID, then **speaks** (or types) to an agent that drives the **entire frontend** — auth screen, policy overview, claim intake, document upload, forensic fraud screening, decision, banking confirmation. The agent isn't a chat sidebar; it owns the screen via tool calls. The voice path is **WebRTC realtime to OpenAI** with a Whisper/HTTP-TTS fallback.

Three deployable units:

| Unit | Stack | Port | Purpose |
|---|---|---|---|
| `sentinel_backend/` | FastAPI + Postgres + SQLAlchemy async | `8001` | Policies, claims, banking, OTP, documents |
| `sentinel_agent/` | Python + LangGraph + ChatOpenAI | `2024` | The brain — deterministic gates + LLM agent |
| `agent-chat-ui/` | Next.js 15 + React + TypeScript | `3000` | Voice-first portal, view-driven UI |

There is also an offline forensic library (`Death Certificates/certificate_forensics/`) — pure Python image/PDF analyzer for SA DHA BI-1663 death certificates. Not LLM-based. Real forensics (ELA, JPEG quantization, EXIF, PDF revision history).

---

## 2. Quick start (full stack)

```bash
# 1. Start DB + backend
docker compose -f docker-compose.sentinel.yml up -d

# 2. LangGraph agent server (from project root)
uvx --with langgraph-cli langgraph dev
# Serves the `sentinel_life` graph on http://localhost:2024

# 3. Frontend
cd agent-chat-ui
pnpm dev   # or npm run dev — http://localhost:3000
```

LangGraph caches the system prompt at import time. **Any change to `sentinel_agent/graph.py` requires restarting `langgraph dev`.** The Next.js frontend hot-reloads.

---

## 3. Environment variables — what matters

### Root `.env` (Python — agent + backend)

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o                     # main agent LLM, defaults to gpt-4o
OPENAI_REALTIME_MODEL=gpt-realtime      # voice TTS
OPENAI_REALTIME_VOICE=marin             # voice name (alloy, marin, etc)
OPENAI_REALTIME_TRANSCRIBE_MODEL=gpt-4o-transcribe
OPENAI_REALTIME_TRANSCRIBE_LANGUAGE=en

SENTINEL_API_URL=http://localhost:8001
SENTINEL_API_KEY=sentinel-api-key-2025
SENTINEL_DEV_MODE=false                 # set true to skip OTP email

RESEND_API_KEY=re_...                   # for OTP + report emails
RESEND_FROM_EMAIL=...

LANGSMITH_TRACING=true
LANGSMITH_PROJECT=atlas_v2              # ⚠️ overridden by next line in current .env
LANGSMITH_PROJECT=swapfiets-agent-hub-dev   # ← effective value (last one wins)
```

⚠️ **The `.env` currently has two `LANGSMITH_PROJECT` lines.** Python-dotenv takes the last value, so traces actually land in `swapfiets-agent-hub-dev`. If you want them in `atlas_v2`, delete the second line. Not a bug per se but worth knowing if you go hunting for traces.

### `agent-chat-ui/.env.local`

```bash
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_API_URL=http://localhost:2024
NEXT_PUBLIC_ASSISTANT_ID=sentinel_life
NEXT_PUBLIC_INSURANCE_API_URL=http://localhost:8001
NEXT_PUBLIC_INSURANCE_API_KEY=sentinel-api-key-2025

# Voice
NEXT_PUBLIC_ENABLE_REALTIME_VOICE=true
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=marin
OPENAI_REALTIME_TRANSCRIBE_MODEL=gpt-4o-transcribe
OPENAI_REALTIME_TRANSCRIBE_LANGUAGE=en
WHISPER_MODEL=whisper-1                 # fallback STT model
```

Setting `NEXT_PUBLIC_ENABLE_REALTIME_VOICE=false` cleanly disables the WebRTC path and forces everything onto HTTP TTS + Whisper STT. Useful when debugging.

---

## 4. The voice subsystem — DEEP

Read this section twice before touching any voice file. The system is two **parallel, independent** WebRTC channels that share nothing except the OpenAI key.

### 4.1 Overview diagram

```
SPEECH OUT (TTS — the agent speaking)
─────────────────────────────────────────────────────────────────────────
Agent message arrives via useStream()
  → useTTSOrchestrator (mounted in ViewRouter only)
     → ttsBeginStreaming()
     → ttsFeedSentence() per sentence as it streams in
     → drainQueue() plays them in order
        → speakSegment(text)
           ① realtimeSpeak()  → WebRTC → /api/realtime/speech → OpenAI Realtime
           ② playLegacyTTS()  → HTTP   → /api/tts            → OpenAI tts-1
     → ttsEndStreaming() when isLoading flips false

SPEECH IN (STT — the user speaking)
─────────────────────────────────────────────────────────────────────────
User clicks mic (orb on Home, or "Voice nav" pill in top bar)
  → useVoiceRecorder.startRecording()
     ① startRealtimeRecording() → WebRTC → /api/realtime/transcription → OpenAI
     ② startLegacyRecording()   → MediaRecorder webm → /api/transcribe → Whisper
  → onTranscript(text)
     ↳ HomeView orb     → submitMessage(text)
     ↳ Chat-bar mic     → submitMessage(text)
     ↳ Top-bar VoiceNav → submitMessage(`[VOICE_NAV] ${text}`)
```

These two channels never share state. The TTS channel is a module-level singleton (lives across React unmounts); the STT channel is per-`useVoiceRecorder` hook (one is mounted per voice-input UI).

### 4.2 Files involved (read in this order)

| File | What it does |
|---|---|
| `agent-chat-ui/src/lib/realtime-speech.ts` | WebRTC TTS connection manager (348 lines). The fragile bit. |
| `agent-chat-ui/src/hooks/use-tts.ts` | Module-level TTS singleton. Audio queue, drain loop, generation counter for cancellation. |
| `agent-chat-ui/src/hooks/use-tts-orchestrator.ts` | Watches the agent message stream and feeds sentences into the singleton. Mounted **only in ViewRouter**. |
| `agent-chat-ui/src/hooks/use-voice-recorder.ts` | Mic capture with dual-mode transcription (realtime → Whisper fallback). One per UI surface. |
| `agent-chat-ui/src/app/api/realtime/speech/route.ts` | Server proxy for the TTS WebRTC SDP offer to OpenAI |
| `agent-chat-ui/src/app/api/realtime/transcription/route.ts` | Server proxy for the STT WebRTC SDP offer to OpenAI |
| `agent-chat-ui/src/app/api/tts/route.ts` | HTTP TTS fallback (OpenAI tts-1, returns audio/mpeg blob) |
| `agent-chat-ui/src/app/api/transcribe/route.ts` | Whisper fallback (multipart upload → text) |
| `agent-chat-ui/src/lib/voice-debug.ts` | `window.__sentinelVoiceLogs` ring buffer, 500 entries max |
| `agent-chat-ui/src/components/views/shared/VoiceNav.tsx` | Top-bar voice-nav pill. Prepends `[VOICE_NAV]` to its messages. |
| `agent-chat-ui/src/components/views/HomeView.tsx` | The orb. Calls `useVoiceRecorder` directly, no prefix. |

### 4.3 The TTS singleton — what's important about it

`use-tts.ts` is **module-level state**, not React state. This is intentional. When a view transitions and `ViewRouter` unmounts components, the audio must keep playing. If you convert it to React state you will break the demo.

Key invariants:

- **One generation counter (`generation`).** Every call to `ttsStop()` or `ttsBeginStreaming()` increments it. Any in-flight `drainQueue` whose `myGen !== generation` immediately exits. This is how we cancel without races.
- **Queue is append-only within a generation.** `ttsFeedSentence()` pushes; `drainQueue()` reads. The drain loop awakens via a `queueWakeup` promise when new sentences arrive or `ttsEndStreaming()` is called.
- **`ttsStop()` is the only way to interrupt.** It bumps generation, cancels the WebRTC response (via `realtimeStopSpeaking`), pauses the `<audio>` element, and revokes blob URLs.
- **Default-on, persisted in localStorage** under `"tts-enabled"`. Toggling persists.

### 4.4 The orchestrator — `use-tts-orchestrator.ts`

Mounted exactly once, in `ViewRouter`. **Do not call this hook anywhere else.** Two effects:

**Effect 1 — progressive streaming during `isLoading=true`:**
1. Find the newest AI message not in `oldAiIdsRef`.
2. Skip if the human message that triggered it begins with `[VOICE_NAV]` — navigation responses are silent.
3. Walk the message text looking for sentence boundaries (`. ! ?` followed by space/newline/end).
4. For each new sentence, call `ttsFeedSentence()`. On the first sentence, call `ttsBeginStreaming()`.
5. When `isLoading` flips false, feed any remaining text + call `ttsEndStreaming()`.

**Effect 2 — catch-up when idle:**
- If TTS is idle and the last AI message has a non-spoken `id`, speak it from scratch.
- Skips `[VOICE_NAV]`-triggered messages but marks them as "spoken" so they don't get retried.

`spokenAiMessageIds` is a module-level `Set<string>` to dedupe across renders.

### 4.5 Realtime TTS — `realtime-speech.ts`

One persistent `RTCPeerConnection` per browser tab. Lazily connected on first `realtimeSpeak()` call.

Connection flow:
1. `new RTCPeerConnection()` + `createDataChannel("oai-events")`.
2. `addTransceiver("audio", { direction: "recvonly" })` — we only need to receive.
3. `createOffer()` → POST to `/api/realtime/speech` with `Content-Type: application/sdp`.
4. Server proxies to `https://api.openai.com/v1/realtime/calls` with `Authorization: Bearer <key>` and a session config (see [route.ts](agent-chat-ui/src/app/api/realtime/speech/route.ts)).
5. Server returns SDP answer; client calls `setRemoteDescription()`.
6. Wait for the data channel to open (10-second timeout).
7. Append a hidden `<audio>` element to the body, set `srcObject` to the remote stream when `ontrack` fires, call `audio.play()`.

`realtimeSpeak(text)`:
1. Cancel any active response (`response.cancel` event) and finish any pending promise.
2. Resume the `<audio>` element if it was paused by a prior stop.
3. Send a `response.create` event with `instructions: "Read this English text aloud verbatim..."` and `conversation: "none"`.
4. Wait for `output_audio_buffer.stopped` (preferred) or `output_audio_buffer.cleared` or `response.done` with a 1.5-second drain delay.
5. Timeout = `max(12_000, text.length * 120)` ms.
6. Returns `true` on success, `false` if connection failed (caller falls back to HTTP TTS).

### 4.6 Realtime STT — the recorder

`useVoiceRecorder` is a regular React hook (one per UI surface). It does NOT share connections — each `startRecording()` creates a fresh `RTCPeerConnection`.

State machine:
```
{ status: "idle" } → { status: "requesting" } → { status: "recording", startedAt } → { status: "processing" } → { status: "idle" }
```

Realtime flow:
1. `getUserMedia({ audio: true })`.
2. `new RTCPeerConnection()`, `addTrack(micTrack)`, `createDataChannel("oai-events")`.
3. POST SDP offer to `/api/realtime/transcription`.
4. On the data channel, listen for:
   - `input_audio_buffer.speech_started` → cancel auto-stop timer (user is talking).
   - `conversation.item.input_audio_transcription.delta` → append to a per-`item_id` buffer.
   - `conversation.item.input_audio_transcription.completed` → final transcript for that segment; schedule auto-stop (1600 ms default).
5. On `stopRecording()`:
   - Send `input_audio_buffer.commit`.
   - Wait up to 2500 ms for the final `.completed` event.
   - Call `onTranscript(fullText)`.
   - Close peer connection.

The server VAD config (in [transcription/route.ts](agent-chat-ui/src/app/api/realtime/transcription/route.ts)) uses `threshold: 0.5`, `prefix_padding_ms: 300`, `silence_duration_ms: 650`. The transcription prompt biases the model toward insurance vocab.

### 4.7 The two voice-input UIs — distinct purposes

There are **two voice-input controls** in the UI and they do different things:

| Control | Where | What it sends | TTS response? |
|---|---|---|---|
| **Voice orb** (big circle on Home) | `HomeView.tsx` | Plain transcript: `submitMessage(text)` | Yes — agent speaks the reply |
| **Voice-nav pill** ("Voice nav") | `TopBar` via `VoiceNav.tsx` | `[VOICE_NAV] ${text}` | No — silent navigation |
| **Chat-bar mic** (small mic in input) | `ChatInput.tsx` | Plain transcript | Yes |

The `[VOICE_NAV]` prefix is a contract:
- The frontend (`use-tts-orchestrator`) silences TTS for any AI message whose triggering human message starts with `[VOICE_NAV]`.
- The agent (`graph.py` system prompt, section "[VOICE_NAV] commands") is instructed to call `set_active_view` and produce **empty content**.
- `ChatPanel.tsx` hides `[VOICE_NAV]` human messages from the visible chat history.

Similarly, `[PRODUCT_INFO]` is a marker used by the Products view buttons (`ProductsView.tsx`). It tells the agent to answer conversationally about products **without calling `set_active_view`** so the user stays on the Products page while the agent explains.

### 4.8 The brittle things — things that have broken before

In order of how often they bite:

1. **Per-utterance `instructions` accidentally narrated.** The instruction string passed to `response.create` is *system context*, not speech text, but the realtime model occasionally narrates it aloud. **Phrase it as a property of the text, not a meta-rule.** Current safe wording:
   ```ts
   instructions: `Read this English text aloud verbatim. Do not translate, switch languages, add, remove, rephrase, or answer anything else:\n\n${trimmed}`,
   ```
   Earlier versions said `"Speak in English only. Never switch languages. Speak exactly this text..."` and the model would occasionally say *"Okay, I will only speak in English"* aloud mid-payment-history. The fix is to embed the rule inside how the text is described ("this English text"), not as a standalone directive.

2. **Removing the English directive entirely breaks language stability.** The session-level instructions (in `route.ts`) are not enough on their own — without per-utterance reinforcement the model occasionally switches to other languages or accents. The session-level English rule must stay AND the per-utterance "English text verbatim" rule must stay. Both belt + braces.

3. **Audio element paused after stop, not resumed.** `realtimeStopSpeaking()` pauses the `<audio>` element. The next `realtimeSpeak()` call must `audio.play()` again or the next response is silent. This is handled in `realtimeSpeak()` (look for `if (audioElement?.paused) audioElement.play()`).

4. **Browser autoplay policy.** The very first audio call after page load can fail if there's been no user gesture. The connect path tries `audio.play()` and swallows the error; the next user-initiated TTS works fine. The greeting on `HomeView` is gated on the first `click` or `touchstart` for exactly this reason.

5. **Generation counter races.** If you add a new code path that mutates `audioQueue` or starts a `drainQueue` without bumping/checking `generation`, you can get duplicate audio playing in parallel. Every entry point should either be inside the same generation as the current drain, or it should call `ttsStop()` first.

6. **The TTS orchestrator must be mounted in `ViewRouter`, not deeper.** If you move `useTTSOrchestrator()` into a per-view component, it will unmount mid-stream during view transitions and lose track of which sentences it has spoken. The whole reason the singleton exists is to survive these transitions.

7. **The recorder calls `cleanupRealtime()` on every unmount.** If you mount `useVoiceRecorder` in a component that re-renders aggressively, you'll thrash WebRTC connections. Mount it once in a stable component (HomeView, VoiceNav, ChatInput) and pass the `toggle` handler down.

8. **Whisper fallback uses `audio/webm`.** If you change the MediaRecorder mime type, update both the recorder and `/api/transcribe`. Some browsers don't support webm; the legacy path will silently fail on Safari without a polyfill.

### 4.9 Debug logging

Every voice event hits `window.__sentinelVoiceLogs` (capped at 500 entries). From the browser console:

```js
window.__sentinelVoiceLogs                        // see the recent ring buffer
window.downloadSentinelVoiceLogs()                // download a JSON file
```

Log entries look like `{ timestamp, source: "speech"|"recorder", event, data }`. When the demo breaks live, this is your first stop.

### 4.10 Things NOT to change in the voice files

These have been hand-tuned and breaking them has a high blast radius:

- **The `instructions` string in `realtime-speech.ts`** — see brittle #1, #2.
- **The session-level instructions in `api/realtime/speech/route.ts`** — same.
- **The 1.5-second `responseDoneTimer` fallback** — without it, certain browsers never resolve the speak promise.
- **The 10-second channel-open timeout** — anything shorter causes false negatives on slow connections.
- **The `conversation: "none"` flag in the `response.create` event** — without it, the response gets added to a conversation context and behavior drifts after the second utterance.
- **`addTransceiver("audio", { direction: "recvonly" })`** — required for the TTS connection. The transcription connection uses `addTrack(micTrack)` instead and is **outbound-only audio**. Don't mix them up.

---

## 5. The agent graph — overview

File: `sentinel_agent/graph.py` (~1308 lines).

```
START
  │
  ▼
auth_gate (conditional)
  │
  ├─ unverified ────────────►  auth_node ──►  tools ──►  END (waits for OTP)
  ├─ verified, no policy ──►  policy_context ──►  tools ──►  END or agent
  ├─ verified, no claim type ─►  claim_type ──►  END
  ├─ verified, no subject ID ─►  subject_id ──►  END
  ├─ upload pending forensic ─►  death_certificate_forensics ──►  agent
  └─ otherwise ────────────────►  agent ──►  tools ──►  after_tools (loops or ends)
```

Key state:
```python
class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    customer_verified: bool   # sticky once True
```

Deterministic nodes (no LLM):
- `auth_node` — builds the `request_authentication` tool call from scratch.
- `policy_context_node` — calls `set_active_view("policy_overview")` + `get_policy` deterministically.
- `claim_type_node` — asks for claim type via a one-shot deterministic LLM call.
- `subject_id_node` — asks for the deceased/claimant's 13-digit SA ID.
- `death_certificate_forensics_node` — runs the offline forensic library on uploaded DC.

Main LLM node: `agent_node` (with `bind_tools(AGENT_TOOLS)` — 15 tools registered).

System prompt is `SYSTEM_PROMPT` at line ~715. It contains:
- `[VOICE_NAV]` rule (silent navigation)
- `[PRODUCT_INFO]` rule (stay on Products view)
- Required tool ordering for claim decisions
- Dashboard rule (one short sentence only)
- Banking confirmation Step 7 (added recently — see §7)

---

## 6. Frontend view system — overview

The agent's `set_active_view` tool determines which screen the user sees. The frontend listens for these tool calls via `useActiveView` (`agent-chat-ui/src/hooks/use-active-view.ts`).

Views:
- `home` — voice orb + suggestion chips
- `policy_overview` — policy details
- `payments` — premium payments table
- `claims` — claim filing UI + document upload
- `claim_outcome` — decision page (decision breakdown, payout, banking confirm)
- `dashboard` — claims history + stats
- `auth` — OTP entry (only shown when there's an unresolved `request_authentication` tool call)
- `products` — read-only product info page (Life, Disability, CI cover)

Routing logic (in `ViewRouter.tsx`):
```ts
currentView = overrideHome
  ? "home"
  : activeView === "auth"
    ? "auth"
    : localView         // client-side pin for Products
      ? localView
      : !chatStarted
        ? "home"
        : activeView
```

`localView` is a client-side pin used **only** for the Products view. It's set when the user clicks "View products" on Home (no message sent) and cleared when the agent navigates away from the snapshot `localViewAnchor`. Without this anchor, opening Products from any active view would snap straight back.

---

## 7. Recent work (this session) — context for continuity

These were the most recent changes. The commits are on `main`.

| Commit | Change |
|---|---|
| `e01858b` | Added banking confirmation step: new `banking_details` table, `GET /policyholders/{id}/banking`, `POST /claims/{id}/payout-dispatch`, two new agent tools (`get_banking_details`, `confirm_payout_dispatch`), new Step 7 in system prompt. Banking is read aloud (masked: "•••• 4321") and customer confirms before dispatch. |
| `40d098e` | Removed "See beneficiaries" chip from Home, reordered: claim → policy → products → payments → dashboard. |
| `393f774` | (Generic commit) |
| `8ea4db6` | Fixed products-view pin anchor bug, restored English TTS cue ("Read this English text..."), added dashboard "one short sentence" rule. |
| `09b9759` | Added Products view + `[PRODUCT_INFO]` marker pattern. |
| `714470d` | Fixed claim-outcome "decision breakdown" duplication of "what we confirmed" PASS items. Initially removed English language directive from TTS (broke). |

### Open considerations / things you might be asked to do next

- **The two `LANGSMITH_PROJECT` lines in `.env`** — collapse to one when convenient.
- **Voice still not 100% production-grade.** Edge cases: noisy environments, accents (Afrikaans/Zulu speakers will not have a great experience — the transcription model is `en` only). Multi-language support is not implemented and would require both transcription + TTS model changes.
- **No human-escalation path implemented.** Every claim that goes off-path (pending_info, denied for evidence reasons) ends in `claim_outcome` view with a verbal explanation. There is no queue, no handoff, no agent assignment.
- **Banking step has no "update banking" tool.** If the customer says the saved bank details are wrong, the agent's instruction is to say "I'll flag this with the Sentinel team to update your banking record" — it does not actually update anything. This is intentional for the demo but a real product would need an update flow.
- **Forensic library lives outside the venv.** `sentinel_agent/tools.py` line ~141 has a `_certificate_analyzer_class()` helper that monkey-patches `sys.path` to import from `Death Certificates/certificate_forensics/`. Don't move that folder without updating the import shim.

---

## 8. Backend API — endpoints used by the agent

Base URL: `http://localhost:8001`. All protected endpoints require `x-api-key: sentinel-api-key-2025`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/health` | unauth |
| `POST` | `/auth/request-otp` | unauth — issues OTP for policy + national ID |
| `POST` | `/auth/verify-otp` | unauth — verifies OTP code |
| `GET` | `/policies/{policy_id}` | full policy with policyholder, beneficiaries, riders, recent_payments |
| `GET` | `/policyholders/{id}/events` | mortality events |
| `GET` | `/policyholders/{id}/banking` | banking details (full + masked account number) — *new* |
| `POST` | `/claims` | create a claim |
| `GET` | `/claims/{claim_id}` | with events + documents |
| `PATCH` | `/claims/{claim_id}` | update status/reason/payout |
| `POST` | `/claims/{claim_id}/events` | audit log |
| `POST` | `/claims/{claim_id}/documents` | document record + extracted_data JSON |
| `POST` | `/claims/{claim_id}/payout-dispatch` | mark approved claim as dispatched to finance — *new* |
| `GET` | `/dashboard` | claims stats by policy |

Banking details are **deterministically generated** from `policyholder_id` (SHA-256 → bank index, account-type index, 10-digit account number). Real SA universal branch codes for Standard Bank, ABSA, FNB, Nedbank, Capitec, Investec. Backfill runs on startup so existing seeded DBs pick up banking without re-seeding.

---

## 9. Demo policies (seeded)

| Policy | Policyholder | Cover Types |
|---|---|---|
| `POL-2024-001` | John Michael Dlamini | Death |
| `POL-2024-002` | Nomvula Priscilla Khumalo | Death, Disability, Critical Illness |
| `POL-2024-003` | Sipho Andile Nkosi | Death, Disability |
| `POL-2023-004` | Fatima Baderoon | Death, Critical Illness |
| `POL-2022-006` | Zanele Moyo | Death, Disability, Critical Illness |
| `POL-2023-009` | Themba Elliot Shabalala | Death (used in the recorded LangSmith demo trace) |

National ID per policyholder is stored in the DB and used for OTP request.

`SENTINEL_DEV_MODE=true` in `.env` returns `masked_email: "dev***@localhost"` from `request_authentication` and AuthView auto-clicks a skip button. This is for fast demo cycles when Resend is unavailable.

---

## 10. Where to look first when things break

| Symptom | First thing to check |
|---|---|
| Agent doesn't speak | `window.__sentinelVoiceLogs` in browser console. Is the WebRTC connection opening? Are `response.created` events arriving? |
| Agent speaks the wrong thing (system text) | The `instructions` string in `realtime-speech.ts`. Has someone rephrased it as a meta-rule? |
| Agent speaks a different language | Both layers of English enforcement. Check `route.ts` session config AND per-utterance `instructions`. |
| Agent doesn't stop talking when interrupted | `ttsStop()` and the generation counter. Did someone bypass it? |
| Voice transcription empty | Whisper fallback. Network tab → `/api/transcribe`. Is `webm` audio actually being captured? |
| Wrong view shown | `useActiveView` reads the message stream for `set_active_view` tool calls. Check the trace. Auth gate also forces `"auth"` if pendingAuth. |
| Products view bounces to Payments | `localViewAnchor` snapshot. Check `ViewRouter.tsx` — the effect should only clear the pin if `activeView !== localViewAnchor`. |
| Banking step never runs | System prompt Step 7. Did someone trim it? Check `graph.py` around line 945. |
| OTP never arrives | `RESEND_API_KEY` not set, or `SENTINEL_DEV_MODE=true` is on (which would auto-skip). |
| LangGraph not picking up prompt change | You did not restart `langgraph dev`. The system prompt is module-level. |

---

## 11. Key design decisions worth understanding

1. **Auth is deterministic, not LLM-driven.** `auth_node` builds the `request_authentication` tool call without calling an LLM. The model cannot skip or reorder this.
2. **`customer_verified` is sticky.** Once True, it survives all subsequent turns. The graph checks this before routing to `auth_node`.
3. **Realtime voice uses WebRTC, not WebSockets.** SDP negotiation through Next.js API routes hides the OpenAI key.
4. **TTS state is module-level**, not React state. Audio survives view transitions.
5. **Exclusions are never proactively mentioned.** Only raised when uploaded document evidence implicates one that's actually on the policy.
6. **All agent HTTP calls go through `_get`/`_post`/`_patch` helpers** which catch `httpx.ConnectError` and return structured error dicts instead of crashing the LangGraph run.
7. **`[VOICE_NAV]` and `[PRODUCT_INFO]` are conventions, not protocol.** Both ends (frontend + system prompt) must honor them. If you add a third marker, update both.
8. **Forensic analysis is real, not LLM "vision".** Image/PDF analyzer in `Death Certificates/certificate_forensics/`. Produces a 0-100 integrity score and a recommendation enum.
9. **DEV_MODE skips OTP end-to-end.** Set both `SENTINEL_DEV_MODE=true` in root `.env` and `SENTINEL_DEV_MODE=true` if used in `.env.local`. Frontend auto-detects `masked_email === "dev***@localhost"`.

---

## 12. Suggested first reads when you onboard

In order:
1. This file (you're done).
2. `AGENT_CONTEXT.md` — the broader architecture context.
3. `sentinel_agent/graph.py` — start at the bottom (line 1265: `workflow = StateGraph(...)`) and trace upward through each node.
4. `agent-chat-ui/src/lib/realtime-speech.ts` — top to bottom.
5. `agent-chat-ui/src/hooks/use-tts.ts` — to understand why module-level state.
6. `agent-chat-ui/src/components/views/ViewRouter.tsx` — the view-routing brain.
7. `sentinel_agent/graph.py` SYSTEM_PROMPT (~line 715) — the soul of the agent.

Run the demo end-to-end at least once with the voice debug panel open before changing anything voice-related. Watch the event sequence. The system makes much more sense once you've seen the WebRTC events flow live.
