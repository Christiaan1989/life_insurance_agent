// Policy Overview view

function PolicyView({ chat, typing, onSend, onNavigate, suggestions }) {
  return (
    <div className="view-fade-in" style={{ height: "100%", display: "grid", gridTemplateColumns: "1.05fr .95fr", gap: 0, overflow: "hidden" }}>
      <div className="scroll" style={{ overflowY: "auto", padding: "10px 28px 28px", borderRight: "1px solid var(--line)" }}>
        <PolicyContent onNavigate={onNavigate} />
      </div>
      <ChatPanel
        messages={chat}
        typing={typing}
        onSend={onSend}
        suggestions={suggestions}
        placeholder="Ask about your cover, premium, or beneficiaries…"
      />
    </div>
  );
}

function PolicyContent({ onNavigate }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: 22 }}>
        <div>
          <div className="label-eyebrow" style={{ marginBottom: 8 }}>Your cover</div>
          <h2 className="h-display tight" style={{ fontSize: 38, margin: 0 }}>Family Term · 20 years</h2>
          <div style={{ marginTop: 8, color: "var(--ink-3)" }}>
            Policy <span className="mono" style={{ color: "var(--ink-2)" }}>SL-7741-09</span> · Active since Mar 2021
          </div>
        </div>
        <span className="badge badge-good"><span style={{ width:6, height:6, borderRadius:"50%", background:"currentColor" }} /> Active</span>
      </div>

      <div className="card" style={{ padding: 22, marginBottom: 18, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, color-mix(in oklab, var(--primary) 8%, transparent), transparent 60%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          <FieldCard label="Sum assured" value="€450,000" accent />
          <FieldCard label="Monthly premium" value="€38.20" />
          <FieldCard label="Next payment" value="14 May 2026" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: "var(--primary-soft)", color: "var(--primary-ink)", display: "inline-flex", alignItems:"center", justifyContent:"center" }}>
              <Icon.Family size={16} />
            </div>
            <div style={{ fontWeight: 600 }}>Beneficiaries</div>
          </div>
          <Beneficiary name="Daniel Okafor" rel="Spouse" share="60%" />
          <Beneficiary name="Iris Okafor" rel="Child" share="25%" />
          <Beneficiary name="Theo Okafor" rel="Child" share="15%" />
          <button className="btn btn-quiet" style={{ marginTop: 12, width: "100%" }}>
            <Icon.Edit size={14} /> Update beneficiaries
          </button>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: "var(--accent-soft)", color: "#6B2A11", display: "inline-flex", alignItems:"center", justifyContent:"center" }}>
              <Icon.Heartbeat size={16} />
            </div>
            <div style={{ fontWeight: 600 }}>What's covered</div>
          </div>
          <Covered label="Death benefit" v="€450,000" />
          <Covered label="Terminal illness" v="Up to 100% of cover" />
          <Covered label="Accidental death" v="+€50,000 booster" />
          <Covered label="Repatriation" v="Included" muted />
        </div>
      </div>

      <div className="card-soft" style={{ padding: 18, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Need to file something?</div>
          <div style={{ fontSize: 14, color: "var(--ink-2)" }}>I'll walk you through it gently — most claims start with a few simple questions.</div>
        </div>
        <button className="btn btn-primary" onClick={() => onNavigate("claim")}>
          File a claim <Icon.ArrowR size={14} />
        </button>
      </div>
    </div>
  );
}

function Beneficiary({ name, rel, share }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--surface-2)", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>
        {name.split(" ").map(s => s[0]).slice(0,2).join("")}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: 14 }}>{name}</div>
        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{rel}</div>
      </div>
      <div className="mono" style={{ fontWeight: 600, color: "var(--primary-ink)" }}>{share}</div>
    </div>
  );
}

function Covered({ label, v, muted }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--line)", color: muted ? "var(--ink-3)" : "var(--ink)" }}>
      <span style={{ fontSize: 14 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{v}</span>
    </div>
  );
}

window.PolicyView = PolicyView;
