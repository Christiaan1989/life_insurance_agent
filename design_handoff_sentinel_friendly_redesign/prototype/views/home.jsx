// Home view — warm hero with voice orb, suggestion chips

function HomeView({ onAsk, onNavigate }) {
  return (
    <div className="view-fade-in" style={{ height: "100%", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <div className="blob" style={{ top: -260, right: -180 }} />
      <div className="blob blob-2" style={{ bottom: -200, left: -120 }} />
      <div className="dots" />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 24px", position: "relative", zIndex: 1 }}>
        <div className="orb-wrap" style={{ marginBottom: 36 }}>
          <div className="orb-ring" />
          <div className="orb-ring r2" />
          <div className="orb-ring r3" />
          <button className="orb" aria-label="Talk to Sentinel">
            <Icon.Mic size={42} strokeWidth={1.6} />
          </button>
        </div>

        <div className="label-eyebrow" style={{ marginBottom: 14 }}>Sentinel · Life cover assistant</div>
        <h1 className="h-display tight" style={{ fontSize: 56, margin: "0 0 14px", textAlign: "center", maxWidth: 720 }}>
          Hi Maya — how can I help today?
        </h1>
        <p style={{ fontSize: 17, color: "var(--ink-2)", maxWidth: 520, textAlign: "center", margin: "0 0 36px" }}>
          Ask me anything about your cover, beneficiaries, or a recent event. I'm here to help — gently and at your pace.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", maxWidth: 760 }}>
          <SuggestChip icon={<Icon.Shield size={14} />} label="See my policy" onClick={() => onNavigate("policy")} />
          <SuggestChip icon={<Icon.Heart size={14} />} label="File a claim" tone="accent" onClick={() => onNavigate("claim")} />
          <SuggestChip icon={<Icon.Family size={14} />} label="Update beneficiaries" onClick={() => onAsk("I'd like to update my beneficiaries")} />
          <SuggestChip icon={<Icon.Money size={14} />} label="View payments" onClick={() => onNavigate("dashboard")} />
          <SuggestChip icon={<Icon.Doc size={14} />} label="Download my certificate" onClick={() => onAsk("Please email me my policy certificate")} />
        </div>

        <div style={{ marginTop: 56, display: "flex", alignItems: "center", gap: 10, color: "var(--ink-3)", fontSize: 13 }}>
          <Icon.Phone size={14} />
          <span>Prefer a person? Call <strong style={{ color: "var(--ink)" }}>0800 SENTINEL</strong> — Mon–Fri, 8am–8pm</span>
        </div>
      </div>

      <div style={{ padding: "16px 24px 22px", display: "flex", justifyContent: "center", position: "relative", zIndex: 1 }}>
        <div style={{ width: "100%", maxWidth: 720 }}>
          <HomeComposer onSubmit={onAsk} />
        </div>
      </div>
    </div>
  );
}

function SuggestChip({ icon, label, onClick, tone }) {
  const accent = tone === "accent";
  return (
    <button onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "10px 16px",
        borderRadius: 999,
        background: accent ? "var(--accent-soft)" : "var(--surface)",
        border: `1px solid ${accent ? "color-mix(in oklab, var(--accent) 35%, transparent)" : "var(--line)"}`,
        color: accent ? "#6B2A11" : "var(--ink)",
        fontWeight: 500, fontSize: 14,
        cursor: "pointer",
        boxShadow: "var(--shadow-sm)",
        fontFamily: "inherit",
      }}>
      {icon}{label}
    </button>
  );
}

function HomeComposer({ onSubmit }) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text.trim());
    setText("");
  };
  return (
    <div className="composer" style={{ padding: "10px 10px 10px 18px" }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
        placeholder="Type, or tap the mic above to talk…"
        rows={1}
        style={{ minHeight: 28 }}
      />
      <button className="btn btn-primary" onClick={submit} disabled={!text.trim()} style={{ opacity: text.trim() ? 1 : 0.5 }}>
        Ask <Icon.ArrowR size={14} />
      </button>
    </div>
  );
}

window.HomeView = HomeView;
