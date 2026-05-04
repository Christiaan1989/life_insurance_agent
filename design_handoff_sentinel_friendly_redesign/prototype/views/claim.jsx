// File a Claim view — stepper + form + photo upload

function ClaimView({ chat, typing, onSend, onNavigate, claimState, setClaimState, suggestions }) {
  const stepNames = ["About", "Details", "Documents", "Review"];

  return (
    <div className="view-fade-in" style={{ height: "100%", display: "grid", gridTemplateColumns: "1.05fr .95fr", overflow: "hidden" }}>
      <div className="scroll" style={{ overflowY: "auto", padding: "10px 28px 28px", borderRight: "1px solid var(--line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <div className="label-eyebrow" style={{ marginBottom: 6 }}>Claim · Bereavement</div>
            <h2 className="h-display tight" style={{ fontSize: 34, margin: 0 }}>We're here for you.</h2>
            <p style={{ color: "var(--ink-2)", margin: "8px 0 0", fontSize: 15, maxWidth: 520 }}>
              Take your time. You can pause anytime — I'll save your progress.
            </p>
          </div>
        </div>

        <div style={{ marginBottom: 22 }}>
          <Stepper steps={stepNames} current={claimState.step} />
        </div>

        {claimState.step === 0 && <Step0 state={claimState} set={setClaimState} />}
        {claimState.step === 1 && <Step1 state={claimState} set={setClaimState} />}
        {claimState.step === 2 && <Step2 state={claimState} set={setClaimState} />}
        {claimState.step === 3 && <Step3 state={claimState} />}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
          <button className="btn btn-quiet" onClick={() => {
            if (claimState.step === 0) onNavigate("home");
            else setClaimState({ ...claimState, step: claimState.step - 1 });
          }}>
            ← Back
          </button>
          {claimState.step < 3 ? (
            <button className="btn btn-primary" onClick={() => setClaimState({ ...claimState, step: claimState.step + 1 })}>
              Continue <Icon.ArrowR size={14} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => onNavigate("outcome")}>
              Submit claim <Icon.Check size={14} />
            </button>
          )}
        </div>
      </div>

      <ChatPanel
        messages={chat}
        typing={typing}
        onSend={onSend}
        suggestions={suggestions}
        placeholder="Ask anything about this claim…"
      />
    </div>
  );
}

function Step0({ state, set }) {
  const types = [
    { id: "death", label: "Death of policyholder", icon: <Icon.Heart size={18} /> },
    { id: "terminal", label: "Terminal illness", icon: <Icon.Heartbeat size={18} /> },
    { id: "accident", label: "Accidental death", icon: <Icon.Bolt size={18} /> },
  ];
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 12 }}>What kind of claim is this?</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {types.map(t => (
          <button key={t.id}
            onClick={() => set({ ...state, type: t.id })}
            className="card"
            style={{
              padding: 16, textAlign: "left", cursor: "pointer",
              borderColor: state.type === t.id ? "var(--primary)" : "var(--line)",
              boxShadow: state.type === t.id ? "0 0 0 3px color-mix(in oklab, var(--primary) 18%, transparent)" : "var(--shadow-sm)",
              background: state.type === t.id ? "var(--primary-soft)" : "var(--surface)",
              fontFamily: "inherit",
            }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-2)", color: "var(--primary-ink)", display:"inline-flex", alignItems:"center", justifyContent:"center", marginBottom: 12 }}>
              {t.icon}
            </div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{t.label}</div>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 22, fontWeight: 600, fontSize: 16, marginBottom: 12 }}>Who are you?</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }}>Your full name</label>
          <input className="input" value={state.claimantName} onChange={(e) => set({ ...state, claimantName: e.target.value })} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }}>Relationship to policyholder</label>
          <input className="input" value={state.relationship} onChange={(e) => set({ ...state, relationship: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

function Step1({ state, set }) {
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 12 }}>A few gentle details</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }}>Date of event</label>
          <input className="input" type="date" value={state.eventDate} onChange={(e) => set({ ...state, eventDate: e.target.value })} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }}>Place</label>
          <input className="input" placeholder="City, country" value={state.place} onChange={(e) => set({ ...state, place: e.target.value })} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }}>What happened, in your own words?</label>
          <textarea className="input" rows={4} value={state.notes} onChange={(e) => set({ ...state, notes: e.target.value })}
            placeholder="A few sentences are enough — I'll ask for more only if needed." />
        </div>
      </div>
      <div className="card-soft" style={{ marginTop: 14, padding: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Icon.Info size={16} />
        <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
          You don't need everything right now. Anything missing can be added later, or I can call you to walk through it.
        </div>
      </div>
    </div>
  );
}

function Step2({ state, set }) {
  const docs = state.docs || [];
  const fileRef = useRef();

  const onPick = (e) => {
    const files = Array.from(e.target.files || []);
    const next = [...docs, ...files.map(f => ({ name: f.name, size: Math.round(f.size/1024) + " KB", kind: f.type.startsWith("image") ? "image" : "doc" }))];
    set({ ...state, docs: next });
    e.target.value = "";
  };

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Add what you have</div>
      <div style={{ color: "var(--ink-3)", fontSize: 13, marginBottom: 14 }}>A photo from your phone is fine — I'll figure out the rest.</div>

      <div onClick={() => fileRef.current?.click()}
        style={{
          border: "2px dashed var(--line-2)", borderRadius: 18,
          padding: 30, textAlign: "center", cursor: "pointer",
          background: "color-mix(in oklab, var(--primary) 4%, transparent)",
          transition: "border-color .15s ease, background .15s ease",
        }}
        onDragOver={(e) => e.preventDefault()}
        onMouseOver={(e) => e.currentTarget.style.borderColor = "var(--primary)"}
        onMouseOut={(e) => e.currentTarget.style.borderColor = "var(--line-2)"}>
        <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={onPick} />
        <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--primary-soft)", color: "var(--primary-ink)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
          <Icon.Upload size={22} />
        </div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Drop files here, or tap to browse</div>
        <div style={{ fontSize: 13, color: "var(--ink-3)" }}>Death certificate, ID, hospital letter — anything you have</div>
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
        <button className="btn btn-quiet" style={{ flex: 1 }}><Icon.Camera size={14} /> Take photo</button>
        <button className="btn btn-quiet" style={{ flex: 1 }}><Icon.Doc size={14} /> Email later</button>
      </div>

      {docs.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>Attached ({docs.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {docs.map((d, i) => (
              <div key={i} className="card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-2)", color: "var(--ink-2)", display: "inline-flex", alignItems:"center", justifyContent:"center" }}>
                  {d.kind === "image" ? <Icon.Camera size={16} /> : <Icon.File size={16} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{d.name}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{d.size} · uploaded</div>
                </div>
                <span className="badge badge-good"><Icon.Check size={11} /> Verified</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Step3({ state }) {
  const typeLabel = { death: "Death of policyholder", terminal: "Terminal illness", accident: "Accidental death" }[state.type] || "—";
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 12 }}>One last look</div>
      <div className="card" style={{ padding: 18 }}>
        <Row label="Claim type" value={typeLabel} />
        <Row label="Claimant" value={`${state.claimantName || "—"} (${state.relationship || "—"})`} />
        <Row label="Date of event" value={state.eventDate || "—"} />
        <Row label="Place" value={state.place || "—"} />
        <Row label="Documents" value={`${(state.docs || []).length} attached`} />
        <Row label="Notes" value={state.notes ? state.notes.slice(0, 80) + (state.notes.length > 80 ? "…" : "") : "—"} last />
      </div>
      <div className="card-soft" style={{ marginTop: 14, padding: 14, display: "flex", gap: 10 }}>
        <Icon.Heart size={16} />
        <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
          Once submitted, I'll review within <strong style={{ color: "var(--ink)" }}>2 business days</strong> and call you on <strong style={{ color: "var(--ink)" }}>+44 7700 900 102</strong> with next steps.
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, last }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 0", borderBottom: last ? "none" : "1px solid var(--line)" }}>
      <span style={{ fontSize: 13, color: "var(--ink-3)" }}>{label}</span>
      <span style={{ fontWeight: 500, fontSize: 14, textAlign: "right", maxWidth: "65%" }}>{value}</span>
    </div>
  );
}

window.ClaimView = ClaimView;
