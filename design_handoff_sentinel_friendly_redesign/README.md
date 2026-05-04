# Handoff: Sentinel Life — Friendly Redesign

## Overview

A complete visual redesign of the **Sentinel Life** insurance agent UI. The current product feels dark, edgy, and impersonal (gold accents on near-black, oversized "FILE A CLAIM" headers, heavy SVG patterns). This redesign repositions the brand as **warm, human, and gentle** — the kind of UI you want sitting next to you when something stressful happens (filing a bereavement claim, updating beneficiaries, etc.).

The redesign covers the **agent-driven product surface**: a chat-first experience with screens that update contextually as the agent guides the user through tasks (home, policy overview, claim filing, claim outcome, dashboard).

## About the Design Files

The files in `prototype/` are **design references created in HTML/JSX** — they are interactive prototypes showing intended look, layout, copy, and behavior. **They are not production code to copy directly.**

Your task is to **recreate these designs in Sentinel Life's existing codebase** (React + Tailwind / styled components / whatever the team uses), reusing existing layout primitives, button components, form components, and patterns where possible. The HTML mocks should be the visual source of truth — match the colors, typography, spacing, radii, copy tone, and interaction feel — but the implementation should slot into the existing component architecture.

If components don't exist yet for a given pattern (e.g. the voice orb, the gentle stepper, the warm chat bubble), build them as new shared components named to match the existing naming convention.

## Fidelity

**High-fidelity (hifi).** The mocks specify final colors (with hex values), typography (DM Sans + Fraunces), spacing, radii, shadows, copy tone, and microinteractions. Recreate pixel-perfectly.

The design uses **CSS variables** for all design tokens — the same tokens should be added to the codebase's theme system so palette swaps (sage / ocean / peach), density, and dark mode (future) are configurable.

---

## Design Principles

1. **Warm, not corporate.** Cream backgrounds (not white), forest-ink text (not black), gentle radii (14–24px), soft shadows. No sharp edges, no aggressive gradients, no high-contrast borders.
2. **Conversational copy.** "We're here for you," "Take your time," "Hi Maya — how can I help today?" — never "FILE A CLAIM."
3. **Chat as a peer, not a chatbot.** The chat panel is co-equal with the main view; it's how the agent assists the user as they look at their policy or fill out a form.
4. **The agent drives the screen.** When the user asks "I want to file a claim," the home view transitions to the claim view automatically. Screens are contextual responses to conversation state.
5. **Generous whitespace.** Big type for hero moments (Fraunces 38–56px), generous gaps (16–24px), uncluttered cards. Resist the urge to fill space.
6. **Soft motion.** 0.45s view fades, gentle orb pulse rings, no bouncy or attention-grabbing animations.

---

## Design Tokens

All tokens are CSS custom properties on `body`. Three palette variants are supported via `body[data-palette="green|blue|peach"]`. Density via `body[data-density="compact|default|cozy"]`.

### Colors — Sage (default / approved)

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#FBF8F3` | Page background (warm cream) |
| `--surface` | `#FFFFFF` | Cards, inputs, sidebar |
| `--surface-2` | `#F4EFE7` | Secondary surfaces, soft cards |
| `--ink` | `#143028` | Primary text (deep forest) |
| `--ink-2` | `#3F574F` | Secondary text |
| `--ink-3` | `#6E7E78` | Tertiary text, muted |
| `--ink-4` | `#9DABA6` | Placeholders, disabled |
| `--line` | `#E8DFCF` | Borders, dividers |
| `--line-2` | `#DCD2BE` | Stronger borders, dashed dropzones |
| `--primary` | `#1F8E64` | Primary actions, accents |
| `--primary-2` | `#2DB67D` | Hover, gradient end |
| `--primary-soft` | `#E1F4EA` | Tint backgrounds, soft chips |
| `--primary-ink` | `#0E3A2A` | Text on primary-soft |
| `--accent` | `#FF8E66` | Coral accent (claims, warmth) |
| `--accent-soft` | `#FFE3D6` | Coral tint background |
| `--warning` | `#E8A93C` | — |
| `--warning-soft` | `#FCEFD2` | — |
| `--danger` | `#D2614C` | — |
| `--danger-soft` | `#FAE0D8` | — |

### Border radius

| Token | Value | Use |
|---|---|---|
| `--r-sm` | `10px` | Small chips, inputs |
| `--r-md` | `14px` | Medium cards, inputs |
| `--r-lg` | `20px` | Large cards |
| `--r-xl` | `28px` | Hero containers |

Buttons are **fully pill-rounded** (`border-radius: 999px`).

### Shadows

| Token | Value |
|---|---|
| `--shadow-sm` | `0 1px 2px rgba(20,48,40,.04), 0 1px 1px rgba(20,48,40,.03)` |
| `--shadow-md` | `0 6px 18px -8px rgba(20,48,40,.10), 0 2px 6px rgba(20,48,40,.04)` |
| `--shadow-lg` | `0 24px 48px -20px rgba(20,48,40,.14), 0 6px 18px -10px rgba(20,48,40,.06)` |

Shadows are **always tinted with the deep ink color** (not pure black) to match the warm palette.

### Spacing

Generally on an 8px base. Common values: `4, 6, 8, 10, 12, 14, 16, 18, 22, 24, 28, 36, 56`. Card padding is typically `16–22px`. Section gaps `12–18px`.

### Typography

Two families, loaded from Google Fonts:

```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

| Use | Family | Weight | Size | Notes |
|---|---|---|---|---|
| Body | DM Sans | 400 | 15px | Default |
| Body (compact) | DM Sans | 400 | 14px | `data-density="compact"` |
| Body (cozy) | DM Sans | 400 | 16px | `data-density="cozy"` |
| Display hero | Fraunces | 600 | 56px | Home greeting; `letter-spacing: -0.02em; line-height: 1.05` |
| Page title | Fraunces | 600 | 34–38px | Section heads |
| Card heading | Fraunces | 600 | 22px | Stat values on dashboard |
| Eyebrow label | DM Sans | 600 | 11px | UPPERCASE, `letter-spacing: 0.14em`, color `--primary` |
| Section label | DM Sans | 600 | 12px | UPPERCASE, `letter-spacing: 0.1em`, color `--ink-3` |
| Body emphasis | DM Sans | 600 | 14–16px | |
| Mono | JetBrains Mono | 400/500 | 12–18px | Policy IDs, claim references |

**Use Fraunces sparingly** — only for hero moments and key page titles. Default to DM Sans for everything else. Avoid Fraunces in cards, body copy, or buttons.

### Font smoothing

Always `-webkit-font-smoothing: antialiased`.

---

## Screens / Views

There are **5 primary views**, all rendered in an app shell with a left history sidebar (toggleable) and a top nav.

### Shared chrome

#### App shell layout
- CSS Grid: `grid-template-columns: 280px 1fr` (history + main)
- When history is hidden: `grid-template-columns: 0 1fr`
- Full viewport height, `overflow: hidden`

#### History sidebar (left, 280px)
- Background: `--surface`
- Border-right: `1px solid --line`
- Header (padding `18px 20px 14px`):
  - 32×32 logo: square, 12px radius, `--primary` background, white "S" 14px bold
  - "Sentinel Life" 14px bold, "Your friendly cover" 11px `--ink-3`
- "+ New conversation" button (quiet style, full-width)
- "RECENT" eyebrow (11px 600 uppercase, `--ink-3`)
- History items: button, padding `10px 12px`, radius 12px, hover `--surface-2`, active `--primary-soft` with `--primary-ink` text
  - Title: 14px 500
  - Meta: 11px `--ink-3`

#### Top nav (height ~60px, padding `14px 24px`)
- Left: 3 square icon buttons (36×36, radius 12, `--surface` bg, `--line` border): home, mic, volume
- Center: pill — `Active` dot + view name (e.g. "Filing a claim") in 12px `--ink-2`
- Right: policy pill ("POLICY" eyebrow + editable mono ID `SL-7741-09`), then square edit button

#### Square icon buttons (`btn-sq`)
- 36×36, radius 12, `--surface` bg, `1px solid --line`, color `--ink-3`
- Hover: `--ink-4` border, `--ink` color
- Used everywhere for icon-only actions

---

### 1. Home

**Purpose**: Warm landing. The user's entry point. They can speak (voice orb), tap a suggestion, or type.

**Layout**:
- Centered single column, max-width 720
- Two soft radial-gradient blobs (one sage top-right, one coral bottom-left), each `filter: blur(20px)`
- Subtle dotted texture overlay (radial-gradient dots, `mask-image: radial-gradient(ellipse, black 30%, transparent 75%)`)

**Components**:
- **Voice orb** (132×132, perfectly round)
  - Background: `linear-gradient(140deg, --primary 0%, --primary-2 70%)`
  - Multi-layer shadow:
    ```
    0 18px 38px -10px color-mix(in oklab, var(--primary) 55%, transparent),
    inset 0 -8px 22px color-mix(in oklab, var(--primary-ink) 30%, transparent),
    inset 0 12px 22px rgba(255,255,255,.30)
    ```
  - White mic icon, 42px
  - Hover `transform: scale(1.04)`, active `scale(0.96)`
  - 3 expanding ring overlays at `inset: -28px / -52px / -78px`, animated `orbPulse 2.8s ease-out infinite` (with 1s + 1.9s delays)
  - Recording state swaps to coral gradient
- **Eyebrow**: "SENTINEL · LIFE COVER ASSISTANT", color `--primary`
- **Headline**: "Hi Maya — how can I help today?" — Fraunces 56px, `letter-spacing: -0.02em`, `line-height: 1.05`, max-width 720, centered
- **Subhead**: "Ask me anything about your cover, beneficiaries, or a recent event. I'm here to help — gently and at your pace." — 17px `--ink-2`, max-width 520
- **Suggestion chips** (5): icon + label, padding `10px 16px`, radius 999, `--surface` bg + `--line` border + `--shadow-sm`. Coral variant (`--accent-soft` bg) for "File a claim".
  - "See my policy" → policy view
  - "File a claim" (coral) → claim view
  - "Update beneficiaries" → triggers chat
  - "View payments" → dashboard
  - "Download my certificate" → triggers chat
- **Phone fallback** (bottom): "Prefer a person? Call **0800 SENTINEL** — Mon–Fri, 8am–8pm" — 13px `--ink-3`
- **Composer** (bottom, 720px max): rounded textarea + mic + plus + primary "Ask →" button. See "Composer" below.

---

### 2. Policy Overview

**Purpose**: User reviews their policy. Chat panel on the right answers questions about premium / cover / beneficiaries.

**Layout**: 2-column grid `1.05fr .95fr`, divider on the column line.

**Left column** (scrolls):
- Eyebrow "YOUR COVER"
- Title "Family Term · 20 years" (Fraunces 38px)
- Sub: "Policy `SL-7741-09` · Active since Mar 2021" (mono inline)
- Active badge (top-right, green pill)

**Cover summary card** (3-col grid of FieldCards):
- "SUM ASSURED" / **€450,000** (accent variant, `--primary-soft` bg)
- "MONTHLY PREMIUM" / **€38.20**
- "NEXT PAYMENT" / **14 May 2026**
- Card has a faint top-left primary tint gradient overlay

**Two-column row**:
- **Beneficiaries card**: avatar (32px circle, `--surface-2` bg, initials), name, relationship, % share (mono, `--primary-ink`). 3 rows, top-bordered. "Update beneficiaries" quiet button at bottom.
- **What's covered card**: 4 rows of label / value, top-bordered.
  - Death benefit / €450,000
  - Terminal illness / Up to 100% of cover
  - Accidental death / +€50,000 booster
  - Repatriation / Included (muted)

**Footer card** (`--surface-2` bg, soft):
- "Need to file something?" / "I'll walk you through it gently — most claims start with a few simple questions."
- Primary "File a claim →" button

**Right column**: chat panel with welcome message "Here's your cover at a glance — let me know if you'd like to dig into anything." and 3 suggestion chips: "What's covered?", "Change my beneficiaries", "When's my next payment?"

---

### 3. File a Claim

**Purpose**: Gentle, calming claim wizard. User has just experienced loss — every detail matters.

**Layout**: Same 2-column split as policy.

**Left column**:
- Eyebrow "CLAIM · BEREAVEMENT"
- Title "We're here for you." (Fraunces 34px)
- Sub: "Take your time. You can pause anytime — I'll save your progress."
- **Stepper**: 4 chips with state (done / active / upcoming)
  - Done: `--primary-soft` bg, primary border, primary number circle with white check
  - Active: white bg, primary border, primary number circle, primary `--shadow` ring
  - Upcoming: `--surface-2` bg, `--line` border, muted text

**Step 0 — About**:
- "What kind of claim is this?" — 3 selectable cards (death / terminal / accident), each with icon, label. Selected = primary border + ring + `--primary-soft` bg.
- "Who are you?" — 2-col input row: full name + relationship.

**Step 1 — Details**:
- 2-col grid: date of event, place
- Full-width textarea: "What happened, in your own words?" (4 rows)
- Reassurance card (soft): "You don't need everything right now. Anything missing can be added later, or I can call you to walk through it."

**Step 2 — Documents**:
- "Add what you have" / "A photo from your phone is fine — I'll figure out the rest."
- **Dropzone**: dashed `--line-2` 2px border, radius 18px, padding 30px, `color-mix(in oklab, --primary 4%, transparent)` bg
  - 56×56 primary-soft icon tile (upload icon)
  - "Drop files here, or tap to browse"
  - "Death certificate, ID, hospital letter — anything you have"
  - Hover: border becomes `--primary`
- 2 quick-action buttons: "Take photo" / "Email later"
- **Attached list** (when files added): card per file, icon tile + name + size + green "Verified" badge

**Step 3 — Review**:
- Card with rows: type, claimant, date, place, doc count, notes (truncated to 80 chars)
- Soft reassurance card: "Once submitted, I'll review within **2 business days** and call you on **+44 7700 900 102** with next steps."

**Bottom action row**: Quiet "← Back" / Primary "Continue →" (or "Submit claim ✓" on final step).

**Right column**: chat panel with "I'm so sorry, Maya. Let's go through this together — slowly." Suggestions: "What documents do I need?", "How long will this take?", "Can someone call me instead?"

---

### 4. Claim Outcome

**Purpose**: Calm confirmation after submission. Reassurance, not celebration.

**Layout**: 2-col split. Left column has a soft sage blob top-right.

**Left column**:
- Eyebrow "CLAIM RECEIVED"
- Title "Thank you, Maya. We've got it from here." (Fraunces 38px)
- Sub: "Your claim is with our care team. There's nothing else you need to do right now."

**Reference card**:
- "REFERENCE" eyebrow + mono `CL-2026-000931` (18px 600)
- Top-right "✦ In review" coral info badge
- **Vertical timeline** below: 4 milestones with state circles + connecting lines
  - Done: filled `--primary` circle with white check, primary line below
  - Active: white circle, 2px primary border, glowing primary ring (`box-shadow: 0 0 0 4px ...`)
  - Soon: empty circle, 2px `--line-2` border, gray label
  - Items: "Claim submitted / Just now", "Initial review / Within 2 business days", "Documents verified / Usually 3–5 days", "Payout to nominated account / Within 14 days of approval"

**Next steps row** (2-col):
- "A call from Sara" / "Tomorrow before 4pm. She'll walk you through what's next." (default card)
- "Estimated payout" / "€450,000 — paid within 14 days of approval." (accent variant — `--primary-soft` bg)

**Footer card** (soft): "If you need to add anything — a memory, a question, anything — just send it. I'm here." + "Go to dashboard" quiet button.

**Right column**: chat panel — "All received. There's nothing more to do for now. I'll keep you posted."

---

### 5. Dashboard

**Purpose**: User's home base. Stats, open claim, recent payments, quick actions.

**Layout**: 2-col split.

**Left column**:
- Eyebrow "YOUR SPACE"
- Title "Welcome back, Maya." (Fraunces 34px)
- Sub: "One claim in progress, everything else looks calm."

**Stat row** (3-col):
- "ACTIVE COVER" / **€450,000** / Family Term · 20yr (default card)
- "OPEN CLAIM" / **CL-…0931** / In review · 1 day ago (accent variant — coral soft bg)
- "NEXT PREMIUM" / **€38.20** / 14 May 2026 (default)

**Open claim card**:
- 44×44 coral-soft icon tile (heart)
- "Bereavement claim · CL-2026-000931" + "Sara from our care team will call tomorrow before 4pm."
- **Pip progress** below (5 pips, 28×6 each, 4px radius): 2 done (`--primary`), 1 active (`--primary-2` with primary glow ring), 2 future (`--surface-2`)
- "In review" coral badge
- "View details →" ghost button top-right

**Two-column row**:
- **Recent payments** (1.2fr): 3 rows: "Premium · DATE" / "Auto-pay · Visa ••2941" / mono amount + green "Paid" badge. Top-bordered. "See all" quiet button at bottom.
- **Quick actions** (0.8fr, soft card): 4 quiet buttons: "View policy", "File a claim", "Update beneficiaries", "Talk to a human"

**Right column**: chat panel — "Welcome back. Want me to summarise where things stand?" Suggestions: "Show my policy", "Status of my claim", "Update my card"

---

## Components

### Buttons

#### `.btn` base
- `display: inline-flex; align-items: center; justify-content: center; gap: 8px`
- `border-radius: 999px` (pill)
- Padding `10px 18px`
- 14px 600 weight
- `transition: transform .15s, background .15s, border-color .15s, color .15s`
- `:active { transform: translateY(1px) }`

#### `.btn-primary`
- `--primary` bg, white text
- Hover: `--primary-2`
- Shadow: `0 8px 16px -8px color-mix(in oklab, --primary 60%, transparent)`

#### `.btn-quiet`
- `--surface` bg, `--line` border, `--ink-2` text
- Hover: `--ink-4` border, `--ink` text

#### `.btn-ghost`
- Transparent, `--ink-2` text
- Hover: `--surface-2` bg, `--ink` text

#### `.btn-sq` (icon-only square)
- 36×36, radius 12 (not pill), `--surface` bg, `1px solid --line`, `--ink-3` color
- Hover: `--ink-4` border, `--ink` color

### Inputs

```css
.input {
  width: 100%;
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: var(--r-md);   /* 14px */
  padding: 12px 14px;
  font-size: 15px;
  color: var(--ink);
  outline: none;
}
.input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 4px color-mix(in oklab, var(--primary) 18%, transparent);
}
```

### Cards

- `.card`: `--surface` bg, `1px solid --line`, `--r-lg` (20px), `--shadow-sm`
- `.card-soft`: `--surface-2` bg, `--r-lg`, no border, no shadow

### Chips / Pills

- `.chip` / `.pill`: padding `5–6px 10–12px`, radius 999, `--surface` bg, `1px solid --line`, 12px 500
- Status badges (`.badge-good/warn/bad/info/mute`): tinted bg + tinted border + tinted text from the matching `*-soft` color and hue

### Stepper

See "File a Claim" above. Three states: done, active, upcoming. Each is a chip with a 18×18 numbered circle.

### Chat panel

- Container: flex column, `min-height: 0` (so scroll works), full height
- **Scroll area**: 720px max-width inner, padding `20px 22px 8px`, gap 14
- **Message bubble** (`.bubble`):
  - Padding `12px 16px`, radius 18px, `--surface` bg, `1px solid --line`
  - 14.5px text, line-height 1.55
  - User variant: `--primary` bg, white text, no border
- **Avatar**: 32×32 circle, 12px 600 weight initials. AI = `--primary-soft` / `--primary-ink`. User = `--accent-soft` / `--ink`.
- **Typing indicator**: 3 dots (6×6, `--ink-4`), `blink 1.2s infinite ease-in-out` with 0.2s stagger
- **Suggestion chips row** (above composer when present): centered flex-wrap row of `.chip` buttons
- **Composer** (bottom):
  - Background gradient mask `linear-gradient(to top, var(--bg) 60%, transparent)` over the chat
  - Inner: `--surface` bg, `1.5px solid --line`, `--r-lg`, padding `8px 8px 8px 14px`
  - Auto-growing textarea (max 140px), enter to send (shift-enter newline)
  - Mic + plus square buttons + primary "Send" pill button
  - Focus state: primary border + soft glow

### Voice orb

See Home view. Uses CSS keyframe `orbPulse`:
```css
@keyframes orbPulse {
  0%   { opacity: .8; transform: scale(.8); }
  100% { opacity: 0;  transform: scale(1.12); }
}
```

### View transitions

```css
.view-fade-in { animation: viewFade .45s cubic-bezier(.2,.8,.2,1); }
@keyframes viewFade {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

Apply this class on every view's root when it mounts.

---

## Interactions & Behavior

### Navigation

- Top-left home button → home view
- Suggestion chips on home → either set view (policy/claim/dashboard) or send a chat message
- "File a claim" button on policy → claim view
- Bottom action row in claim wizard advances/retreats the step
- Submit on final step → outcome view
- "Go to dashboard" on outcome → dashboard
- Dashboard quick actions → matching views

### Chat simulation

When a user sends a message:
1. Append user bubble immediately
2. Show typing indicator (3-dot bubble)
3. After ~900ms, append AI reply, hide typing
4. Reply text is contextual to the current view (see `simulateReply()` in `app.jsx` for current logic — replace with real backend)
5. **Special case**: on home, if user message contains "claim" → after AI reply, navigate to claim view (700ms delay)

### Voice orb

Currently visual only. When wired up:
- Click → start recording, swap orb to coral gradient (`.orb.recording`)
- Click again → stop, send transcribed text to chat
- Rings continue pulsing while recording

### File upload (claim step 2)

- Dropzone: click anywhere to open file picker, or drag files onto it
- Files added to local state, rendered as cards with verified badge (in real impl, run virus/format checks first)

### Form persistence

The claim wizard keeps state in `claimState` — when implementing, persist to local storage or backend on every change so users can pause and resume.

---

## State Management

### Global app state
- `view`: "home" | "policy" | "claim" | "outcome" | "dashboard"
- `policy`: editable policy ID string
- `historyId`: selected history item

### Per-view chat state
- `chats[view]`: array of `{ role: "ai" | "user", text: string }`
- `typing`: bool (single global typing flag)

### Claim wizard state
- `step`: 0–3
- `type`: "death" | "terminal" | "accident"
- `claimantName`: string
- `relationship`: string
- `eventDate`: ISO date string
- `place`: string
- `notes`: string
- `docs`: array of `{ name, size, kind }`

### Tweaks state (dev tool, drop in production)
- `palette`: "green" | "blue" | "peach" — sets `body[data-palette]`
- `density`: "compact" | "default" | "cozy" — sets `body[data-density]`
- `showHistory`: bool — collapses the history sidebar

---

## Copy

All user-facing strings are in the design files. Tone guidelines:

- **Calm and direct.** "We're here for you." not "WE'RE HERE FOR YOU!"
- **Use the user's name** ("Hi Maya", "Thank you, Maya") — assume it's available from auth.
- **First person from the agent.** "I'll review within 2 business days," "I'll save your progress," not "The system will…"
- **Acknowledge feelings** on the claim flow. "I'm so sorry, Maya."
- **Never alarm.** Status copy avoids red/danger language unless something genuinely went wrong. "In review" stays coral-info, not red.
- **Numbers in mono** (JetBrains Mono) — policy IDs, claim refs, amounts. Reads as official without feeling cold.

---

## Assets

No external images or icons are required. All icons are inline SVG, line-style, 1.8 stroke weight, 24×24 viewBox. Full set is in `prototype/icons.jsx` — 32 icons covering home, mic, send, upload, file, camera, shield, heart, chat, arrows, sparkle, phone, volume, edit, history, menu, close, info, clock, money, doc, heartbeat, family, bolt, plus, check, x, square, stop.

When implementing in the codebase, you can either:
- **Lift the SVG paths** from `icons.jsx` into your existing icon component
- Or **swap to your icon library** (Lucide, Phosphor, Heroicons-outline) — the visual language is line-icon / 1.5–2 stroke / rounded caps. Lucide is the closest match.

---

## Files

In `prototype/`:

- `Sentinel Friendly Redesign.html` — root file, contains all CSS variables, base styles, and font imports. Loads React + Babel and the JSX modules below.
- `app.jsx` — top-level `<App>` with view routing, chat state, claim wizard state, tweaks panel
- `shared.jsx` — `<TopNav>`, `<PolicyPill>`, `<ChatPanel>`, `<ChatBubble>`, `<TypingBubble>`, `<Stepper>`, `<FieldCard>`, `<HistorySidebar>`, `<Logo>`
- `icons.jsx` — full icon set (`window.Icon.*`)
- `tweaks-panel.jsx` — dev-only tweaks panel (palette / density / nav). Don't ship to production.
- `views/home.jsx` — `<HomeView>` with voice orb + suggestion chips + composer
- `views/policy.jsx` — `<PolicyView>` with cover summary, beneficiaries, what's covered
- `views/claim.jsx` — `<ClaimView>` with stepper + 4 wizard steps + uploader
- `views/outcome.jsx` — `<OutcomeView>` with reference + timeline + next steps
- `views/dashboard.jsx` — `<DashboardView>` with stats + open claim + payments + quick actions

Open `Sentinel Friendly Redesign.html` in a browser to interact with the live prototype. Use the Tweaks panel (bottom-right) to swap palettes and jump between views.

---

## Implementation order (recommended)

1. **Tokens first.** Add the CSS variables (or theme object equivalent) for the sage palette to your design system.
2. **Type ramp.** Wire up DM Sans + Fraunces. Build `<Display>`, `<Eyebrow>`, `<Body>` style primitives.
3. **Primitives.** `<Button>` (primary/quiet/ghost/sq), `<Input>`, `<Card>`, `<Badge>`, `<Chip>`.
4. **Layout shell.** App grid, history sidebar, top nav.
5. **Chat panel.** Bubble, typing indicator, composer. The most reused complex component.
6. **Home view.** Voice orb, suggestion chips. Wire to your real voice/chat backend.
7. **Policy view.** Static-ish content; mainly composition.
8. **Dashboard view.** Same.
9. **Claim wizard.** State management + 4 steps + dropzone. The biggest piece.
10. **Outcome view.** Timeline component is reusable for other "in progress" states elsewhere in the product.
11. **View transitions.** Add the fade-in wrapper, debounce navigation.
12. **A11y pass.** Tab order, focus states, ARIA on the orb / dropzone / stepper.
