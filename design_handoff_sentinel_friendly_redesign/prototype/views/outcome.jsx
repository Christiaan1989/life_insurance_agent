// Claim outcome view — gentle confirmation

function OutcomeView({ chat, typing, onSend, onNavigate, suggestions }) {
  return (
    <div className="view-fade-in" style={{ height: "100%", display: "grid", gridTemplateColumns: "1.05fr .95fr", overflow: "hidden" }}>
      <div className="scroll" style={{ overflowY: "auto", padding: "10px 28px 28px", borderRight: "1px solid var(--line)", position: "relative" }}>
        <div className="blob" style={{ top: -200, right: -160, width: 520, height: 520 }} />
        <div style={{ position: "relative" }}>
          <div className="label-eyebrow" style={{ marginBottom: 8 }}>Claim received</div>
          <h2 className="h-display tight" style={{ fontSize: 38, margin: 0, maxWidth: 520 }}>
            Thank you, Maya. We've got it from here.
          </h2>
          <p style={{ color: "var(--ink-2)", margin: "12px 0 24px", maxWidth: 520, fontSize: 15.5 }}>
            Your claim is with our care team. There's nothing else you need to do right now.
          </p>

          <div className="card" style={{ padding: 22, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".1em" }}>Reference</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>CL-2026-000931</div>
              </div>
              <span className="badge badge-info"><Icon.Sparkle size={11} /> In review</span>
            </div>

            <Timeline />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <NextStep icon={<Icon.Phone size={16} />} title="A call from Sara" body="Tomorrow before 4pm. She'll walk you through what's next." />
            <NextStep icon={<Icon.Money size={16} />} title="Estimated payout" body="€450,000 — paid within 14 days of approval." accent />
          </div>

          <div className="card-soft" style={{ padding: 18, display: "flex", gap: 14, alignItems: "center" }}>
            <Icon.Heart size={18} />
            <div style={{ flex: 1, fontSize: 14, color: "var(--ink-2)" }}>
              If you need to add anything — a memory, a question, anything — just send it. I'm here.
            </div>
            <button className="btn btn-quiet" onClick={() => onNavigate("dashboard")}>Go to dashboard</button>
          </div>
        </div>
      </div>

      <ChatPanel
        messages={chat}
        typing={typing}
        onSend={onSend}
        suggestions={suggestions}
        placeholder="Add a note, or just talk…"
      />
    </div>
  );
}

function Timeline() {
  const items = [
    { label: "Claim submitted", time: "Just now", state: "done" },
    { label: "Initial review", time: "Within 2 business days", state: "active" },
    { label: "Documents verified", time: "Usually 3–5 days", state: "soon" },
    { label: "Payout to nominated account", time: "Within 14 days of approval", state: "soon" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: 12, position: "relative" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{
              width: 18, height: 18, borderRadius: "50%",
              background: it.state === "done" ? "var(--primary)" : it.state === "active" ? "#fff" : "var(--surface-2)",
              border: it.state === "active" ? "2px solid var(--primary)" : it.state === "soon" ? "2px solid var(--line-2)" : "none",
              boxShadow: it.state === "active" ? "0 0 0 4px color-mix(in oklab, var(--primary) 22%, transparent)" : "none",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              color: "#fff",
            }}>
              {it.state === "done" && <Icon.Check size={11} strokeWidth={3} />}
            </div>
            {i < items.length - 1 && <div style={{ flex: 1, width: 2, background: it.state === "done" ? "var(--primary)" : "var(--line)", marginTop: 2 }} />}
          </div>
          <div style={{ paddingBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: it.state === "soon" ? "var(--ink-3)" : "var(--ink)" }}>{it.label}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{it.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function NextStep({ icon, title, body, accent }) {
  return (
    <div className="card" style={{ padding: 16, background: accent ? "var(--primary-soft)" : "var(--surface)", borderColor: accent ? "color-mix(in oklab, var(--primary) 25%, transparent)" : "var(--line)" }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: accent ? "#fff" : "var(--primary-soft)", color: "var(--primary-ink)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
        {icon}
      </div>
      <div style={{ fontWeight: 600, fontSize: 14, color: accent ? "var(--primary-ink)" : "var(--ink)" }}>{title}</div>
      <div style={{ fontSize: 13, color: accent ? "color-mix(in oklab, var(--primary-ink) 80%, transparent)" : "var(--ink-2)", marginTop: 4 }}>{body}</div>
    </div>
  );
}

window.OutcomeView = OutcomeView;
