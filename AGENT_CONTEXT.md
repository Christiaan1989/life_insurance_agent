# Sentinel Life Insurance Agent — Codebase Context

> Hand this file to a coding agent so it can understand the repo without exploring. Last updated: 2026-05-14.

---

## 1. What this repo is

A full-stack AI insurance-claims assistant for **Sentinel Life** (South African insurer). A customer can log in with their policy number + national ID, then talk to the agent (text or voice) to query their policy, file a Death / Disability / Critical-Illness claim, upload death certificates, and track claim progress. The UI is a Next.js app; the brain is a LangGraph agent running on a separate server; the data lives in a FastAPI + PostgreSQL backend.

---

## 2. High-level directory map

```
life_insurance_agent/
│
├── sentinel_agent/               # Python – LangGraph agent
│   ├── graph.py                  # Graph definition (1 276 lines)
│   ├── tools.py                  # All LangGraph tools (~600 lines)
│   └── __init__.py
│
├── sentinel_backend/             # Python – FastAPI REST API + DB
│   ├── main.py
│   ├── models.py
│   ├── database.py
│   └── ...
│
├── agent-chat-ui/                # TypeScript – Next.js 15 frontend
│   ├── src/
│   │   ├── app/                  # Next.js App Router
│   │   │   ├── page.tsx          # Entry: mounts StreamProvider → ViewRouter
│   │   │   ├── layout.tsx        # Root layout (fonts, head)
│   │   │   └── api/              # API routes (proxies to OpenAI)
│   │   │       ├── realtime/
│   │   │       │   ├── speech/route.ts        # WebRTC SDP proxy – TTS
│   │   │       │   └── transcription/route.ts # WebRTC SDP proxy – STT
│   │   │       ├── tts/route.ts              # Fallback TTS (OpenAI tts-1)
│   │   │       └── transcribe/route.ts       # Fallback STT (Whisper)
│   │   │
│   │   ├── components/
│   │   │   └── views/
│   │   │       ├── ViewRouter.tsx            # Top-level, hosts TTS orchestrator
│   │   │       ├── HomeView.tsx
│   │   │       ├── AuthView.tsx              # OTP verification screen
│   │   │       ├── DashboardView.tsx         # Policy stats + chat panel
│   │   │       ├── PolicyOverviewView.tsx
│   │   │       ├── ClaimsView.tsx
│   │   │       ├── ClaimOutcomeView.tsx
│   │   │       ├── PaymentsView.tsx
│   │   │       └── shared/
│   │   │           ├── ChatPanel.tsx         # Renders message list
│   │   │           ├── ChatInput.tsx         # Text + mic input bar
│   │   │           └── TopBar.tsx
│   │   │
│   │   ├── hooks/
│   │   │   ├── use-tts.ts                    # TTS engine (module-level singleton)
│   │   │   ├── use-tts-orchestrator.ts       # Wires agent messages → TTS
│   │   │   ├── use-voice-recorder.ts         # Mic capture + transcription
│   │   │   ├── use-active-view.ts            # Reads agent tool calls → current view
│   │   │   ├── use-pending-auth.ts           # Detects unresolved auth request
│   │   │   └── use-policy-dashboard.ts       # Fetches /policies/{id} + /dashboard
│   │   │
│   │   ├── lib/
│   │   │   ├── realtime-speech.ts            # WebRTC TTS connection manager
│   │   │   └── voice-debug.ts               # Client-side voice event logger
│   │   │
│   │   └── providers/
│   │       ├── Stream.tsx                    # LangGraph SDK useStream wrapper
│   │       ├── Thread.tsx                    # Thread ID management
│   │       └── Artifact.tsx
│   │
│   ├── .env.local                            # Frontend env vars
│   └── package.json
│
├── docker-compose.sentinel.yml   # Starts PostgreSQL + sentinel_backend
├── pyproject.toml                # Python deps (uv)
├── .env                          # Python env vars (agent + backend)
└── AGENT_CONTEXT.md              # ← this file
```

---

## 3. How the system fits together at runtime

```
Browser (Next.js)
  │
  ├─ StreamProvider  ──────────────────────────────────────────────►  LangGraph server
  │   useStream() from @langchain/langgraph-sdk/react                 (localhost:2024)
  │   Connects to ws/http to graph "sentinel_life"                         │
  │                                                                   sentinel_agent/graph.py
  │                                                                         │
  ├─ api/realtime/speech      ─────► OpenAI /v1/realtime/calls (WebRTC TTS)
  ├─ api/realtime/transcription ──► OpenAI /v1/realtime/calls (WebRTC STT)
  ├─ api/tts                  ─────► OpenAI /v1/audio/speech (fallback TTS)
  └─ api/transcribe           ─────► OpenAI /v1/audio/transcriptions (Whisper fallback)

sentinel_agent/graph.py  ──────────────────────────────────────────► FastAPI backend
  http calls via _get/_post/_patch helpers                             (localhost:8001)
  SENTINEL_API_KEY: sentinel-api-key-2025
```

---

## 4. Environment variables

### Python (.env in project root)

```bash
OPENAI_API_KEY=sk-...
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=marin
OPENAI_REALTIME_TRANSCRIBE_MODEL=gpt-4o-transcribe
OPENAI_REALTIME_TRANSCRIBE_LANGUAGE=en
NEXT_PUBLIC_ENABLE_REALTIME_VOICE=true

SENTINEL_API_URL=http://localhost:8001
SENTINEL_API_KEY=sentinel-api-key-2025
SENTINEL_DEV_MODE=false          # set true to skip OTP email in local dev

LANGSMITH_TRACING=true
LANGSMITH_PROJECT=atlas_v2
```

### Next.js (agent-chat-ui/.env.local)

```bash
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_API_URL=http://localhost:2024    # LangGraph server
NEXT_PUBLIC_ASSISTANT_ID=sentinel_life
NEXT_PUBLIC_INSURANCE_API_URL=http://localhost:8001
NEXT_PUBLIC_INSURANCE_API_KEY=sentinel-api-key-2025
NEXT_PUBLIC_ENABLE_REALTIME_VOICE=true
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=marin
OPENAI_REALTIME_TRANSCRIBE_MODEL=gpt-4o-transcribe
OPENAI_REALTIME_TRANSCRIBE_LANGUAGE=en
WHISPER_MODEL=whisper-1
```

---

## 5. LangGraph agent (sentinel_agent/)

### 5.1 AgentState

```python
class AgentState(TypedDict):
    messages: Annotated[list, add_messages]   # Full conversation history
    customer_verified: bool                    # Sticky – survives tool calls
```

### 5.2 Graph nodes and routing

The graph is a **hybrid**: deterministic gating nodes + an LLM agent node.

```
START
  │
  ▼
auth_gate  ─── checks messages for policy_id + national_id
  │               and customer_verified flag
  │
  ├─ → auth_node              (missing creds OR not verified)
  │       │ builds request_authentication tool call without LLM
  │       ▼
  │     tools_node → after_tools → END  (waits for user to verify)
  │
  ├─ → policy_context_node    (verified, policy not yet loaded)
  │       │ calls set_active_view + get_policy
  │       ▼
  │     after_auth → tools_node → ...
  │
  ├─ → claim_type_node        (no claim type stated yet)
  │       │ deterministic LLM prompt asking for Death/Disability/CI
  │       ▼
  │     END
  │
  ├─ → subject_id_node        (no 13-digit SA ID for the deceased/claimant)
  │       │ deterministic LLM prompt asking for ID number
  │       ▼
  │     END
  │
  ├─ → death_certificate_forensics_node  (upload detected, forensics not yet run)
  │       │ calls analyze_death_certificate_forensics tool
  │       ▼
  │     agent_node
  │
  └─ → agent_node             (normal conversation turn)
          │ full LLM with all tools available
          ▼
        after_agent  →  tools_node  →  after_tools
                                          │
                        ┌─────────────────┤ loops back based on state
                        ├─ claim_type_node
                        ├─ subject_id_node
                        ├─ death_certificate_forensics_node
                        ├─ agent_node
                        └─ END
```

### 5.3 Tools (tools.py)

| Tool | What it does |
|---|---|
| `request_authentication(policy_id, national_id)` | Triggers the Auth screen in UI; sends OTP email (skipped in DEV_MODE) |
| `set_active_view(view_name)` | Tells the UI which panel to show (via custom event) |
| `get_policy()` | GET /policies/{id} – full policy record |
| `create_claim(claim_type, ...)` | POST /claims |
| `get_claim(claim_id)` | GET /claims/{claim_id} |
| `update_claim(claim_id, ...)` | PATCH /claims/{claim_id} |
| `record_document(claim_id, doc_type, ...)` | POST /documents |
| `analyze_death_certificate_forensics(...)` | Runs multi-pass forensic analysis on uploaded cert |
| `evaluate_claim_evidence(claim_id)` | Holistic evidence review (does NOT auto-fail on exclusions) |
| `check_eligibility(claim_id)` | Basic eligibility check (waiting periods, policy status) |
| `calculate_payout(claim_id)` | Determines payout amount |
| `generate_claim_report(claim_id)` | Creates PDF-style report |
| `send_claim_email(claim_id, email)` | Sends outcome email via Resend |
| `log_event(event_type, detail)` | Audit trail |

**HTTP helpers** (`_get`, `_post`, `_patch`): All API calls go through these wrappers which handle `httpx.ConnectError` gracefully rather than crashing the LangGraph run.

**DEV_MODE**: `SENTINEL_DEV_MODE=true` → `request_authentication` returns immediately with `masked_email: "dev***@localhost"` (no real OTP sent). The AuthView auto-detects this value and skips the OTP input step.

**Exclusions**: Stored in `policy.exclusions` (semicolon-separated string from DB). The agent only mentions a specific exclusion when document evidence directly implicates it — never proactively.

---

## 6. Voice & Realtime — full detail

This is the most complex part of the system. There are **two parallel paths** for both speech output (TTS) and speech input (STT). The realtime path is always tried first; the legacy HTTP path is the fallback.

### 6.1 Architecture overview

```
SPEECH OUTPUT (TTS)
─────────────────────────────────────────────────────────
Agent message arrives
  → useTTSOrchestrator (ViewRouter)
      → ttsBeginStreaming()
      → ttsFeedSentence() per sentence (split on .!?)
      → drainQueue() plays them sequentially
          → speakSegment(text)
              ① realtimeSpeak()  ──── WebRTC ──► /api/realtime/speech ──► OpenAI Realtime
              ② playLegacyTTS()  ──── HTTP  ──► /api/tts ──► OpenAI tts-1  (fallback)
      → ttsEndStreaming()

SPEECH INPUT (STT)
─────────────────────────────────────────────────────────
User clicks mic
  → startRecording()
      ① startRealtimeRecording() ─── WebRTC ──► /api/realtime/transcription ──► OpenAI
      ② startLegacyRecording()   ─── MediaRecorder → /api/transcribe → Whisper  (fallback)
  → onTranscript(text)
  → ChatInput submits text as human message to StreamProvider
```

### 6.2 TTS engine — `src/hooks/use-tts.ts`

**Module-level singleton** (not React state) so audio survives component unmounts:

```typescript
let currentAudio: HTMLAudioElement | null
let isSpeaking = false
let isEnabled = localStorage.getItem("tts-enabled") !== "false"
let audioQueue: Array<() => Promise<void>> = []
let streamingDone = false
let generation = 0          // Cancel token: increment to abort in-flight audio
```

Key functions:

| Function | Purpose |
|---|---|
| `ttsBeginStreaming()` | Start a new progressive session; increments generation (cancels any previous) |
| `ttsFeedSentence(text)` | Push one sentence into the drain queue |
| `ttsEndStreaming()` | Signal no more sentences; drain loop exits after current queue |
| `ttsSpeak(text)` | One-shot: splits into sentences, feeds all, ends streaming |
| `ttsStop()` | Hard stop: cancels all audio, revokes blob URLs, stops WebRTC |
| `ttsToggle()` | Toggle enabled/disabled (persisted to localStorage) |
| `speakSegment(text)` | Internal: tries `realtimeSpeak`, falls back to `playLegacyTTS` |
| `drainQueue(gen)` | Internal loop: plays promises in order, waits for more if not done |

React hook: `useTTS()` returns `{ enabled, speaking, speak, stop, toggle }`. Uses module-level listener array for cross-component reactivity.

### 6.3 TTS orchestrator — `src/hooks/use-tts-orchestrator.ts`

Mounted **only in `ViewRouter`** (the persistent root component). Watches the message stream and feeds sentences to the TTS engine as they arrive.

**Progressive streaming logic** (during `isLoading = true`):
1. Finds the last new AI message not in `oldAiIdsRef`
2. Checks if the human message that triggered it was a `[VOICE_NAV]` command → skips TTS if so
3. Feeds any new sentences (split on `.!?`) to `ttsFeedSentence()`
4. Calls `ttsBeginStreaming()` on the very first sentence
5. When `isLoading` flips to `false` → feeds remaining text + calls `ttsEndStreaming()`

**Catch-up logic** (when TTS is idle and last AI message is unspoken):
- Calls `ttsSpeak()` for the full text of the unspoken message
- Skips if triggered by `[VOICE_NAV]`

**`spokenAiMessageIds` Set** prevents the same message from being spoken twice.

### 6.4 Realtime TTS — `src/lib/realtime-speech.ts`

WebRTC session to OpenAI Realtime for low-latency speech output.

```
connectRealtimeSpeech()
  1. new RTCPeerConnection()
  2. createDataChannel("oai-events")
  3. addTransceiver("audio", { direction: "recvonly" })
  4. createOffer() → POST /api/realtime/speech { sdp }
  5. setRemoteDescription(answer)
  6. <audio> element → plays remote audio track
  Timeout: 10 seconds

realtimeSpeak(text)
  1. Cancel any active response (response.cancel event)
  2. Send response.create event with instructions: "Speak exactly: {text}"
  3. Wait for output_audio_buffer.stopped OR response.done event
  Timeout: max(12s, text.length × 120ms)
  Returns: boolean (success/failure — false triggers fallback)

realtimeStopSpeaking()
  1. Send response.cancel
  2. Send input_audio_buffer.clear
  3. Pause <audio> element
```

**Data channel events** the TTS listener handles:
- `response.created` → stores `activeResponseId`
- `output_audio_buffer.stopped` → resolves speak promise
- `output_audio_buffer.cleared` → resolves if cancel was sent
- `response.done` → fallback resolve (1.5s delay to let audio drain)
- `error` → benign cancellation errors are swallowed; others reject

### 6.5 API route: `/api/realtime/speech/route.ts`

Proxies a WebRTC SDP offer to OpenAI Realtime:

```typescript
// Session config sent to OpenAI /v1/realtime/calls
{
  type: "realtime",
  model: process.env.OPENAI_REALTIME_MODEL,       // gpt-realtime
  instructions: "Speak exactly this text. Do not answer, add advice, or change wording.",
  output_modalities: ["audio"],
  audio: {
    output: { voice: process.env.OPENAI_REALTIME_VOICE }  // marin
  }
}
```

### 6.6 Voice recorder — `src/hooks/use-voice-recorder.ts`

Microphone capture with dual-mode transcription.

**Recorder state machine**:
```typescript
| { status: "idle" }
| { status: "requesting" }         // Mic permission pending
| { status: "recording"; startedAt: number }
| { status: "processing" }         // Transcription in flight
```

**Realtime path** (`startRealtimeRecording()`):
```
1. navigator.mediaDevices.getUserMedia({ audio: true })
2. new RTCPeerConnection()
3. addTrack(micTrack) to peer connection
4. createDataChannel("oai-events")
5. createOffer() → POST /api/realtime/transcription { sdp }
6. setRemoteDescription(answer)
   — channel opens (timeout 10s) —
7. User speaks; OpenAI Realtime VAD detects speech start/end
8. Events received on data channel:
     input_audio_buffer.speech_started  → clear auto-stop timer
     conversation.item.input_audio_transcription.delta  → append to buffer
     conversation.item.input_audio_transcription.completed  → final transcript
9. On stopRecording():
     send { type: "input_audio_buffer.commit" }
     wait up to 2.5s for final transcript
     call onTranscript(fullText)
     close peer connection
```

**Legacy path** (`startLegacyRecording()`):
```
1. MediaRecorder(micStream, { mimeType: "audio/webm" })
2. Collect chunks in ondataavailable
3. On stop: new Blob(chunks) → POST /api/transcribe (multipart)
4. Response: { text: "..." } → onTranscript(text)
```

**Options**:
```typescript
{
  mimeType?: string               // Default: "audio/webm"
  onTranscript?: (text) => void   // Called with final text
  autoStopOnSilenceMs?: number | false  // Default: 1600ms
}
```

### 6.7 API route: `/api/realtime/transcription/route.ts`

Proxies a WebRTC SDP offer to OpenAI Realtime for speech-to-text:

```typescript
{
  type: "transcription",
  audio: {
    input: {
      noise_reduction: { type: "near_field" },
      transcription: {
        model: "gpt-4o-transcribe",
        language: "en",
        prompt: "Sentinel life insurance claims conversation. Common words: ..."
      },
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 650   // 650ms silence = end of utterance
      }
    }
  }
}
```

### 6.8 Fallback API routes

**`/api/tts/route.ts`** — HTTP TTS fallback:
```typescript
// POST { text, voice? }
// Calls OpenAI /v1/audio/speech with model tts-1
// Returns audio/mpeg blob → client creates object URL and plays
```

**`/api/transcribe/route.ts`** — Whisper fallback:
```typescript
// POST multipart/form-data with audio file
// Calls OpenAI /v1/audio/transcriptions with whisper-1
// Returns { text: "transcribed text" }
```

### 6.9 Voice debug logging — `src/lib/voice-debug.ts`

```typescript
// All voice events stored in:
window.__sentinelVoiceLogs  // Array<{ timestamp, source, event, data }>

// Export from browser console:
window.downloadSentinelVoiceLogs()  // Downloads JSON file

// Max 500 entries (oldest dropped)
```

---

## 7. Frontend view system

### 7.1 Component hierarchy

```
page.tsx
  └─ ThreadProvider          (manages thread ID via URL query param)
      └─ StreamProvider       (useStream from @langchain/langgraph-sdk/react)
          └─ ArtifactProvider
              └─ ViewRouter   ← useTTSOrchestrator() lives here
                  ├─ ThreadHistory sidebar
                  └─ AnimatePresence
                      ├─ HomeView
                      ├─ AuthView
                      ├─ DashboardView
                      ├─ PolicyOverviewView
                      ├─ PaymentsView
                      ├─ ClaimsView
                      └─ ClaimOutcomeView
```

### 7.2 View routing logic

`useActiveView(messages)` reads `set_active_view` tool calls from the message history and returns the most recently called view name. ViewRouter renders the matching view component.

`usePendingAuth(messages)` finds the last `request_authentication` tool call and checks if `[VERIFIED]` has appeared in a subsequent human message. If unresolved → shows `AuthView`.

### 7.3 Voice navigation (`[VOICE_NAV]`)

When the user says a navigation phrase while voice is active:
1. `ChatInput` prepends `[VOICE_NAV]` to the transcript before submitting
2. The agent sees the prefix and calls `set_active_view()` without narrating
3. `useTTSOrchestrator` detects the prefix in the triggering human message and skips TTS
4. View switches silently with no spoken response

### 7.4 Auth flow

1. Agent calls `request_authentication(policy_id, national_id)` → tool emits a custom UI event
2. `usePendingAuth` detects the unresolved call → `ViewRouter` renders `AuthView`
3. `AuthView` shows masked email, OTP input
4. On OTP submit: `AuthView` appends `[VERIFIED] <otp>` as a human message
5. `usePendingAuth` sees `[VERIFIED]` → clears pending auth → `ViewRouter` returns to previous view
6. Agent graph sets `customer_verified = True` and continues

**DEV_MODE shortcut**: If `masked_email === "dev***@localhost"`, `AuthView` renders a "⚡ dev: skip verification" button and auto-fires it via `useEffect`. No OTP needed.

---

## 8. StreamProvider and LangGraph SDK

`src/providers/Stream.tsx` wraps `useStream` from `@langchain/langgraph-sdk/react`:

```typescript
useStream({
  apiUrl: process.env.NEXT_PUBLIC_API_URL,       // http://localhost:2024
  assistantId: process.env.NEXT_PUBLIC_ASSISTANT_ID,  // "sentinel_life"
  threadId,
  onCustomEvent: (event) => { /* handle set_active_view, request_authentication */ }
})
```

The hook returns `{ messages, isLoading, submit, ... }` used throughout the app. Thread ID is stored in `?threadId=` URL param so it survives page reload.

---

## 9. Sentinel Backend API (FastAPI)

Base URL: `http://localhost:8001`  
Auth: `x-api-key: sentinel-api-key-2025` header

Key endpoints the agent uses:

| Method | Path | Purpose |
|---|---|---|
| GET | `/policies/{policy_id}` | Full policy record |
| GET | `/dashboard?policy_id={id}` | Dashboard stats + recent claims |
| POST | `/claims` | Create new claim |
| GET | `/claims/{claim_id}` | Get claim details |
| PATCH | `/claims/{claim_id}` | Update claim status/fields |
| POST | `/documents` | Record a document against a claim |
| POST | `/auth/request` | Send OTP email |
| POST | `/auth/verify` | Verify OTP |

**Policy model** (key fields):
```
policy_id, policy_number, policy_status, policy_type, policy_holder_name,
policyholder_national_id, sum_assured, premium_amount, premium_frequency,
cover_types (comma-separated), exclusions (semicolon-separated),
inception_date, recent_payments[]
```

---

## 10. How to start everything locally

```bash
# 1. Start DB + backend
docker compose -f docker-compose.sentinel.yml up -d

# 2. Start LangGraph agent server (from project root)
uvx --with langgraph-cli langgraph dev

# 3. Start Next.js frontend
cd agent-chat-ui
npm run dev       # http://localhost:3000
```

LangGraph server runs at `http://localhost:2024`.  
Backend API runs at `http://localhost:8001`.

---

## 11. Key design decisions to know

1. **Auth is deterministic, not LLM-driven.** `auth_node` builds the `request_authentication` tool call directly from state without calling the LLM. This prevents the model from skipping or reordering auth.

2. **`customer_verified` is sticky state.** Once set to `True` it doesn't reset between turns. The graph checks it before routing to `auth_node`.

3. **Realtime voice uses WebRTC, not WebSockets.** The SDP negotiation proxies through Next.js API routes to avoid CORS and to keep the OpenAI key server-side.

4. **TTS is a module-level singleton**, not React state, so audio doesn't get cut off when a component re-renders or a view transition happens.

5. **Exclusions are never mentioned proactively.** The agent only raises a policy exclusion when uploaded document evidence directly implicates it. The eligibility check does not auto-fail on exclusions.

6. **All agent HTTP calls use `_get`/`_post`/`_patch` helpers.** These catch `httpx.ConnectError` and return a structured error dict instead of crashing the LangGraph run.

7. **`[VOICE_NAV]` prefix silences TTS for that turn.** This lets the user navigate by voice without hearing the agent narrate the navigation.

8. **DEV_MODE skips OTP end-to-end.** Set `SENTINEL_DEV_MODE=true` in `.env` and `SENTINEL_DEV_MODE=true` in `.env.local`. The agent skips the email; the UI auto-clicks the skip button.
