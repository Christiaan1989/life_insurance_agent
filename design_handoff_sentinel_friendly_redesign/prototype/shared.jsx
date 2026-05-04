// Shared components

const { useState, useEffect, useRef } = React;

function Logo() {
  return (
    <div className="logo" aria-label="Sentinel Life">S</div>
  );
}

function TopNav({ label, onHome, showHome = true, right = null }) {
  return (
    <div className="topnav">
      <div className="topnav-left">
        {showHome && (
          <button className="btn-sq" onClick={onHome} title="Home">
            <Icon.Home size={16} />
          </button>
        )}
        <button className="btn-sq" title="Voice navigation">
          <Icon.Mic size={16} />
        </button>
        <button className="btn-sq" title="Voice readback">
          <Icon.Volume size={16} />
        </button>
      </div>
      <div className="pill">
        <span className="dot" />
        <span style={{ fontWeight: 500, color: "var(--ink-2)" }}>{label}</span>
      </div>
      <div className="topnav-right">
        {right}
        <button className="btn-sq" title="New conversation">
          <Icon.Edit size={16} />
        </button>
      </div>
    </div>
  );
}

function PolicyPill({ value, onChange }) {
  return (
    <div className="pill" style={{ paddingLeft: 14 }}>
      <span style={{ fontWeight: 600, color: "var(--ink-3)", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}>Policy</span>
      <input
        value={value} onChange={(e) => onChange(e.target.value)}
        className="mono"
        style={{
          border: "none", outline: "none", background: "transparent",
          width: 110, fontSize: 12, color: "var(--primary-ink)", fontWeight: 600,
        }}
      />
    </div>
  );
}

function ChatBubble({ role, children, time }) {
  return (
    <div className={`msg ${role === "user" ? "msg-user" : "msg-ai"}`}>
      <div className={`avatar ${role === "user" ? "avatar-user" : "avatar-ai"}`}>
        {role === "user" ? "You" : "S"}
      </div>
      <div className="bubble">
        {children}
        {time && <div style={{ fontSize: 11, color: role === "user" ? "rgba(255,255,255,.7)" : "var(--ink-4)", marginTop: 6 }}>{time}</div>}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="msg msg-ai">
      <div className="avatar avatar-ai">S</div>
      <div className="bubble">
        <div className="typing"><span /><span /><span /></div>
      </div>
    </div>
  );
}

function ChatPanel({ messages, typing, onSend, placeholder = "Type a message…", suggestions = [] }) {
  const [text, setText] = useState("");
  const scrollRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typing]);

  const send = () => {
    const v = text.trim();
    if (!v) return;
    onSend(v);
    setText("");
    if (taRef.current) taRef.current.style.height = "auto";
  };

  return (
    <div className="chat-shell">
      <div className="chat-scroll scroll" ref={scrollRef}>
        <div className="chat-list">
          {messages.map((m, i) => (
            <ChatBubble key={i} role={m.role}>{m.text}</ChatBubble>
          ))}
          {typing && <TypingBubble />}
        </div>
      </div>
      {suggestions.length > 0 && (
        <div style={{ padding: "0 18px 10px", display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          {suggestions.map((s, i) => (
            <button key={i} className="chip" style={{ cursor: "pointer" }} onClick={() => onSend(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="chat-foot">
        <div className="composer">
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(140, e.target.scrollHeight) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={placeholder}
            rows={1}
          />
          <button className="btn-sq" title="Voice">
            <Icon.Mic size={16} />
          </button>
          <button className="btn-sq" title="Attach">
            <Icon.Plus size={16} />
          </button>
          <button
            className="btn btn-primary"
            onClick={send}
            disabled={!text.trim()}
            style={{ padding: "10px 14px", opacity: text.trim() ? 1 : 0.5 }}
            title="Send"
          >
            <Icon.ArrowU size={14} /> Send
          </button>
        </div>
      </div>
    </div>
  );
}

function Stepper({ steps, current }) {
  return (
    <div className="stepper">
      {steps.map((s, i) => {
        const cls = i < current ? "done" : i === current ? "active" : "";
        return (
          <div key={s} className={`step ${cls}`}>
            <span className="num">{i < current ? <Icon.Check size={12} /> : i + 1}</span>
            <span>{s}</span>
          </div>
        );
      })}
    </div>
  );
}

function FieldCard({ label, value, accent }) {
  return (
    <div style={{
      padding: 14, borderRadius: 14,
      background: accent ? "var(--primary-soft)" : "var(--surface)",
      border: `1px solid ${accent ? "color-mix(in oklab, var(--primary) 25%, transparent)" : "var(--line)"}`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: accent ? "var(--primary-ink)" : "var(--ink)" }}>{value}</div>
    </div>
  );
}

function HistorySidebar({ open, items, currentId, onPick, onNew }) {
  if (!open) return null;
  return (
    <aside className="side">
      <div className="side-head">
        <Logo />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Sentinel Life</div>
          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Your friendly cover</div>
        </div>
      </div>
      <div style={{ padding: "12px 12px 0" }}>
        <button className="btn btn-quiet" style={{ width: "100%", justifyContent: "flex-start" }} onClick={onNew}>
          <Icon.Plus size={14} /> New conversation
        </button>
      </div>
      <div className="side-list scroll">
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-3)", padding: "12px 12px 6px", textTransform: "uppercase", letterSpacing: ".1em" }}>Recent</div>
        {items.map((it) => (
          <button key={it.id}
            onClick={() => onPick(it.id)}
            className={`side-item ${it.id === currentId ? "active" : ""}`}>
            <div className="side-item-title">{it.title}</div>
            <div className="side-item-meta">{it.meta}</div>
          </button>
        ))}
      </div>
    </aside>
  );
}

Object.assign(window, { TopNav, PolicyPill, ChatPanel, ChatBubble, TypingBubble, Stepper, FieldCard, HistorySidebar, Logo });
