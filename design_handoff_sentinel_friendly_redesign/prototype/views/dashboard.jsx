// Dashboard view — open claims, recent payments, quick actions

function DashboardView({ chat, typing, onSend, onNavigate, suggestions }) {
  return (
    <div className="view-fade-in" style={{ height: "100%", display: "grid", gridTemplateColumns: "1.05fr .95fr", overflow: "hidden" }}>
      <div className="scroll" style={{ overflowY: "auto", padding: "10px 28px 28px", borderRight: "1px solid var(--line)" }}>
        <div style={{ marginBottom: 18 }}>
          <div className="label-eyebrow" style={{ marginBottom: 8 }}>Your space</div>
          <h2 className="h-display tight" style={{ fontSize: 34, margin: 0 }}>Welcome back, Maya.</h2>
          <p style={{ color: "var(--ink-2)", margin: "8px 0 0", fontSize: 15 }}>One claim in progress, everything else looks calm.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <Stat icon={<Icon.Shield size={16} />} label="Active cover" value="€450,000" sub="Family Term · 20yr" />
          <Stat icon={<Icon.Clock size={16} />} label="Open claim" value="CL-…0931" sub="In review · 1 day ago" accent />
          <Stat icon={<Icon.Money size={16} />} label="Next premium" value="€38.20" sub="14 May 2026" />
        </div>

        <div className="card" style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 600 }}>Open claim</div>
            <button className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 13 }} onClick={() => onNavigate("outcome")}>
              View details <Icon.ArrowR size={12} />
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: "var(--accent-soft)", color: "#6B2A11", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Icon.Heart size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Bereavement claim · CL-2026-000931</div>
              <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>Sara from our care team will call tomorrow before 4pm.</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
                <Pip done /><Pip done /><Pip active /><Pip /><Pip />
              </div>
            </div>
            <span className="badge badge-info">In review</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 12 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Recent payments</div>
            <Pay date="14 Apr 2026" amt="€38.20" status="Paid" />
            <Pay date="14 Mar 2026" amt="€38.20" status="Paid" />
            <Pay date="14 Feb 2026" amt="€38.20" status="Paid" />
            <button className="btn btn-quiet" style={{ marginTop: 10, width: "100%" }}>See all</button>
          </div>
          <div className="card-soft" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Quick actions</div>
            <Quick label="View policy" icon={<Icon.Shield size={14} />} onClick={() => onNavigate("policy")} />
            <Quick label="File a claim" icon={<Icon.Heart size={14} />} onClick={() => onNavigate("claim")} />
            <Quick label="Update beneficiaries" icon={<Icon.Family size={14} />} />
            <Quick label="Talk to a human" icon={<Icon.Phone size={14} />} />
          </div>
        </div>
      </div>

      <ChatPanel
        messages={chat}
        typing={typing}
        onSend={onSend}
        suggestions={suggestions}
        placeholder="Anything else I can help with?"
      />
    </div>
  );
}

function Stat({ icon, label, value, sub, accent }) {
  return (
    <div className="card" style={{ padding: 16, background: accent ? "var(--accent-soft)" : "var(--surface)", borderColor: accent ? "color-mix(in oklab, var(--accent) 35%, transparent)" : "var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: accent ? "#6B2A11" : "var(--ink-3)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>
        {icon} {label}
      </div>
      <div className="h-display" style={{ fontSize: 22, color: accent ? "#6B2A11" : "var(--ink)" }}>{value}</div>
      <div style={{ fontSize: 12, color: accent ? "#6B2A11" : "var(--ink-3)", marginTop: 4, opacity: .8 }}>{sub}</div>
    </div>
  );
}

function Pip({ done, active }) {
  return <div style={{ width: 28, height: 6, borderRadius: 4, background: done ? "var(--primary)" : active ? "var(--primary-2)" : "var(--surface-2)", border: active ? "none" : "none", boxShadow: active ? "0 0 0 3px color-mix(in oklab, var(--primary) 18%, transparent)" : "none" }} />;
}

function Pay({ date, amt, status }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--line)" }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>Premium · {date}</div>
        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Auto-pay · Visa ••2941</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontWeight: 600 }} className="mono">{amt}</span>
        <span className="badge badge-good">{status}</span>
      </div>
    </div>
  );
}

function Quick({ label, icon, onClick }) {
  return (
    <button onClick={onClick} className="btn btn-quiet" style={{ width: "100%", justifyContent: "flex-start", marginBottom: 6, fontWeight: 500, fontSize: 13.5 }}>
      {icon} {label}
    </button>
  );
}

window.DashboardView = DashboardView;
