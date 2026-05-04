// App — wires views, chat simulation, tweaks panel

const { useState, useMemo } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "green",
  "density": "default",
  "showHistory": true,
  "voiceReadback": true,
  "warmCopy": true
}/*EDITMODE-END*/;

const HISTORY = [
  { id: "h1", title: "Filing a claim", meta: "Just now" },
  { id: "h2", title: "Update beneficiaries", meta: "Yesterday" },
  { id: "h3", title: "Premium for May", meta: "2 days ago" },
  { id: "h4", title: "Add accidental cover?", meta: "Last week" },
  { id: "h5", title: "Set up auto-pay", meta: "Mar 12" },
];

// Small simulated AI replies based on the current view + last user message
function simulateReply(view, userText, claimType) {
  const t = userText.toLowerCase();
  if (view === "home") {
    if (t.includes("claim")) return "Of course. I'll guide you gently. Let me open the claim form for you.";
    if (t.includes("benefic")) return "Your current beneficiaries are Daniel (60%), Iris (25%) and Theo (15%). Would you like to update the split, or add someone?";
    if (t.includes("certificate") || t.includes("policy")) return "I'll email a fresh PDF of your certificate to the address on file. Anything else?";
    return "I'm here. Tell me what's on your mind — I'll figure out where it goes.";
  }
  if (view === "policy") {
    if (t.includes("premium")) return "Your premium is €38.20/month, paid on the 14th. Auto-pay is set up on Visa ••2941.";
    if (t.includes("cover")) return "Your sum assured is €450,000, with a €50,000 booster for accidental death.";
    return "Anything specific you'd like to look at — cover, premium, beneficiaries, or coverage details?";
  }
  if (view === "claim") {
    if (t.includes("document") || t.includes("certificate")) return "A photo from your phone is fine for now. I'll let you know if I need anything cleaner.";
    if (t.includes("how long")) return "Most claims like this clear initial review within 2 business days, and pay out within 14 days of approval.";
    return "Take your time. I'll save your progress as you go.";
  }
  if (view === "outcome") {
    return "It's all in motion. You don't need to do anything else right now — Sara will call tomorrow.";
  }
  if (view === "dashboard") {
    return "Anything in particular? I can pull up your policy, the open claim, or recent payments.";
  }
  return "Got it. Tell me a little more.";
}

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [view, setView] = useState("home");
  const [policy] = useState("SL-7741-09");
  const [historyId, setHistoryId] = useState("h1");

  // Chat state per view
  const [chats, setChats] = useState({
    home:      [],
    policy:    [{ role: "ai", text: "Here's your cover at a glance — let me know if you'd like to dig into anything." }],
    claim:     [{ role: "ai", text: "I'm so sorry, Maya. Let's go through this together — slowly." }],
    outcome:   [{ role: "ai", text: "All received. There's nothing more to do for now. I'll keep you posted." }],
    dashboard: [{ role: "ai", text: "Welcome back. Want me to summarise where things stand?" }],
  });
  const [typing, setTyping] = useState(false);

  const [claimState, setClaimState] = useState({
    step: 0,
    type: "death",
    claimantName: "Maya Okafor",
    relationship: "Spouse",
    eventDate: "",
    place: "",
    notes: "",
    docs: [],
  });

  // Apply tweaks to <body> attrs
  React.useEffect(() => {
    document.body.dataset.palette = tweaks.palette;
    document.body.dataset.density = tweaks.density;
  }, [tweaks.palette, tweaks.density]);

  const sendInView = (v, text) => {
    setChats(prev => ({ ...prev, [v]: [...prev[v], { role: "user", text }] }));
    setTyping(true);
    setTimeout(() => {
      const reply = simulateReply(v, text, claimState.type);
      setChats(prev => ({ ...prev, [v]: [...prev[v], { role: "ai", text: reply }] }));
      setTyping(false);
      // If user asked to file a claim from home, navigate
      if (v === "home" && /claim/i.test(text)) {
        setTimeout(() => setView("claim"), 700);
      }
    }, 900);
  };

  // Suggestions per view
  const suggestions = {
    policy: ["What's covered?", "Change my beneficiaries", "When's my next payment?"],
    claim: ["What documents do I need?", "How long will this take?", "Can someone call me instead?"],
    outcome: ["When will I be paid?", "Add a note", "I'd like Sara to call sooner"],
    dashboard: ["Show my policy", "Status of my claim", "Update my card"],
  };

  // Top nav label per view
  const navLabel = {
    home: "Home",
    policy: "Policy overview",
    claim: "Filing a claim",
    outcome: "Claim received",
    dashboard: "Your dashboard",
  }[view];

  const right = (
    <PolicyPill value={policy} onChange={() => {}} />
  );

  return (
    <div className="app" data-history={tweaks.showHistory ? "true" : "false"}>
      <HistorySidebar
        open={tweaks.showHistory}
        items={HISTORY}
        currentId={historyId}
        onPick={setHistoryId}
        onNew={() => setView("home")}
      />

      <div className="view-shell">
        <TopNav
          label={navLabel}
          showHome={view !== "home"}
          onHome={() => setView("home")}
          right={right}
        />
        <div className="view-body">
          {view === "home" && (
            <HomeView
              onAsk={(t) => { setView("home"); sendInView("home", t); }}
              onNavigate={setView}
            />
          )}
          {view === "policy" && (
            <PolicyView
              chat={chats.policy}
              typing={typing}
              onSend={(t) => sendInView("policy", t)}
              onNavigate={setView}
              suggestions={suggestions.policy}
            />
          )}
          {view === "claim" && (
            <ClaimView
              chat={chats.claim}
              typing={typing}
              onSend={(t) => sendInView("claim", t)}
              onNavigate={setView}
              claimState={claimState}
              setClaimState={setClaimState}
              suggestions={suggestions.claim}
            />
          )}
          {view === "outcome" && (
            <OutcomeView
              chat={chats.outcome}
              typing={typing}
              onSend={(t) => sendInView("outcome", t)}
              onNavigate={setView}
              suggestions={suggestions.outcome}
            />
          )}
          {view === "dashboard" && (
            <DashboardView
              chat={chats.dashboard}
              typing={typing}
              onSend={(t) => sendInView("dashboard", t)}
              onNavigate={setView}
              suggestions={suggestions.dashboard}
            />
          )}
        </div>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Palette" />
        <TweakRadio
          label="Theme"
          value={tweaks.palette}
          options={["green", "blue", "peach"]}
          onChange={(v) => setTweak("palette", v)}
        />

        <TweakSection label="Layout" />
        <TweakRadio
          label="Density"
          value={tweaks.density}
          options={["compact", "default", "cozy"]}
          onChange={(v) => setTweak("density", v)}
        />
        <TweakToggle
          label="History sidebar"
          value={tweaks.showHistory}
          onChange={(v) => setTweak("showHistory", v)}
        />

        <TweakSection label="Jump to view" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: "0 4px" }}>
          {[
            ["home", "Home"],
            ["policy", "Policy"],
            ["claim", "Claim form"],
            ["outcome", "Outcome"],
            ["dashboard", "Dashboard"],
          ].map(([k, l]) => (
            <button key={k}
              onClick={() => setView(k)}
              className="btn btn-quiet"
              style={{ fontSize: 12, padding: "8px 10px",
                background: view === k ? "var(--primary-soft)" : undefined,
                borderColor: view === k ? "var(--primary)" : undefined,
                color: view === k ? "var(--primary-ink)" : undefined,
              }}>
              {l}
            </button>
          ))}
        </div>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
