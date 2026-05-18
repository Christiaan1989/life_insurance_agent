"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  Square,
  ArrowUp,
  PanelRightClose,
  PanelRightOpen,
  Shield,
  Heart,
  Wallet,
  LayoutDashboard,
  Phone,
  WalletCards,
} from "lucide-react";
import { useSubmitMessage } from "./shared/ChatInput";
import { TTSToggle } from "./shared/TTSToggle";
import { VoiceNav } from "./shared/VoiceNav";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { useTTS, ttsSpeak } from "@/hooks/use-tts";
import { toast } from "sonner";

// Module-level flag — greeting plays once per page session
let hasPlayedGreeting = false;

// ---------------------------------------------------------------------------
// Voice orb (sage gradient, soft pulse rings)
// ---------------------------------------------------------------------------
function VoiceOrb({
  isRecording,
  isBusy,
  elapsedMs,
  onToggle,
}: {
  isRecording: boolean;
  isBusy: boolean;
  elapsedMs: number;
  onToggle: () => void;
}) {
  const formatMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  return (
    <div className="sl-orb-wrap">
      <div className="sl-orb-ring" />
      <div className="sl-orb-ring sl-orb-ring-2" />
      <div className="sl-orb-ring sl-orb-ring-3" />
      <button
        type="button"
        onClick={onToggle}
        disabled={isBusy}
        aria-label={isRecording ? "Stop recording" : "Talk to Sentinel"}
        className={`sl-orb ${isRecording ? "sl-orb-recording" : ""}`}
        style={{ opacity: isBusy ? 0.7 : 1 }}
      >
        {isRecording ? (
          <div className="flex flex-col items-center gap-1">
            <Square className="h-7 w-7" strokeWidth={1.8} />
            <span className="text-[11px] font-medium tabular-nums">
              {formatMs(elapsedMs)}
            </span>
          </div>
        ) : (
          <Mic size={42} strokeWidth={1.6} />
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suggestion chip
// ---------------------------------------------------------------------------
function SuggestChip({
  icon,
  label,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: "accent";
}) {
  const accent = tone === "accent";
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-2 transition-all hover:-translate-y-px"
      style={{
        padding: "10px 16px",
        borderRadius: 999,
        background: accent ? "var(--sl-accent-soft)" : "var(--sl-surface)",
        border: `1px solid ${
          accent
            ? "color-mix(in oklab, var(--sl-accent) 35%, transparent)"
            : "var(--sl-line)"
        }`,
        color: accent ? "#6B2A11" : "var(--sl-ink)",
        fontWeight: 500,
        fontSize: 14,
        boxShadow: "var(--sl-shadow-sm)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// HomeView
// ---------------------------------------------------------------------------
interface HomeViewProps {
  policyNumber: string;
  onPolicyChange: (v: string) => void;
  onPolicySubmitted: () => void;
  policySubmitted: boolean;
  onOpenHistory?: () => void;
  historyOpen?: boolean;
  onOpenProducts?: () => void;
}

export function HomeView({
  policyNumber,
  onPolicyChange,
  onPolicySubmitted,
  policySubmitted,
  onOpenHistory,
  historyOpen,
  onOpenProducts,
}: HomeViewProps) {
  const submitMessage = useSubmitMessage();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { toggle, isRecording, isBusy, elapsedMs, error } = useVoiceRecorder({
    onTranscript: (text) => {
      if (!text) return;
      submitMessage(
        text,
        undefined,
        !policySubmitted ? policyNumber : undefined,
      );
      if (!policySubmitted) onPolicySubmitted();
    },
  });

  useEffect(() => {
    if (!error) return;
    toast.error("Voice input error", { description: error });
  }, [error]);

  // Auto-greeting after first user gesture
  const { enabled: ttsEnabled } = useTTS();
  useEffect(() => {
    if (!ttsEnabled || hasPlayedGreeting) return;

    const onFirstInteraction = () => {
      if (hasPlayedGreeting) return;
      hasPlayedGreeting = true;
      document.removeEventListener("click", onFirstInteraction);
      document.removeEventListener("touchstart", onFirstInteraction);
      setTimeout(() => {
        ttsSpeak(
          "Hi, I'm your Sentinel Life assistant. How can I help you today?",
        );
      }, 600);
    };

    document.addEventListener("click", onFirstInteraction);
    document.addEventListener("touchstart", onFirstInteraction);
    return () => {
      document.removeEventListener("click", onFirstInteraction);
      document.removeEventListener("touchstart", onFirstInteraction);
    };
  }, [ttsEnabled]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    submitMessage(
      input,
      undefined,
      !policySubmitted ? policyNumber : undefined,
    );
    if (!policySubmitted) onPolicySubmitted();
    setInput("");
  };

  const handleSuggestion = (text: string) => {
    submitMessage(
      text,
      undefined,
      !policySubmitted ? policyNumber : undefined,
    );
    if (!policySubmitted) onPolicySubmitted();
  };

  return (
    <div
      className="sl-view-fade-in relative flex h-full flex-col overflow-hidden"
      style={{ background: "var(--sl-bg)" }}
    >
      {/* Soft blobs */}
      <div className="sl-blob" style={{ top: -260, right: -180 }} />
      <div className="sl-blob sl-blob-2" style={{ bottom: -200, left: -120 }} />
      <div className="sl-dots" />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          {onOpenHistory && (
            <button
              type="button"
              onClick={onOpenHistory}
              className="sl-btn-sq"
              aria-label="Toggle history"
            >
              {historyOpen ? (
                <PanelRightOpen className="h-4 w-4" />
              ) : (
                <PanelRightClose className="h-4 w-4" />
              )}
            </button>
          )}
          <VoiceNav />
          <TTSToggle />
        </div>

        {/* Policy pill */}
        <div
          className="inline-flex items-center gap-2"
          style={{
            background: "var(--sl-surface)",
            border: "1px solid var(--sl-line)",
            borderRadius: 999,
            padding: "6px 14px",
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: ".1em",
              textTransform: "uppercase",
              color: "var(--sl-ink-3)",
            }}
          >
            Policy
          </span>
          <input
            type="text"
            value={policyNumber}
            onChange={(e) => onPolicyChange(e.target.value)}
            className="sl-mono"
            style={{
              border: "none",
              outline: "none",
              background: "transparent",
              width: 110,
              fontSize: 12,
              fontWeight: 600,
              color: "var(--sl-primary-ink)",
            }}
            placeholder="POL-..."
          />
        </div>
      </div>

      {/* Hero: orb + headline + chips */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-0 px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{ marginBottom: 36 }}
        >
          <VoiceOrb
            isRecording={isRecording}
            isBusy={isBusy}
            elapsedMs={elapsedMs}
            onToggle={toggle}
          />
        </motion.div>

        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-4 flex items-center gap-2"
              style={{ marginTop: -16 }}
            >
              <div
                className="h-1.5 w-1.5 animate-pulse rounded-full"
                style={{ background: "var(--sl-accent)" }}
              />
              <span
                className="text-[11px]"
                style={{ color: "var(--sl-accent)" }}
              >
                Listening...
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="sl-eyebrow" style={{ marginBottom: 14 }}>
          Sentinel · Life cover assistant
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="sl-h-display"
          style={{
            fontSize: 56,
            margin: "0 0 14px",
            textAlign: "center",
            maxWidth: 720,
            color: "var(--sl-ink)",
          }}
        >
          How can I help today?
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          style={{
            fontSize: 17,
            color: "var(--sl-ink-2)",
            maxWidth: 520,
            textAlign: "center",
            margin: "0 0 36px",
          }}
        >
          Ask me anything about your cover, beneficiaries, or a recent event.
          I&apos;m here to help — gently and at your pace.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="flex flex-wrap justify-center gap-2.5"
          style={{ maxWidth: 760 }}
        >
          <SuggestChip
            icon={<Heart size={14} />}
            label="File a claim"
            tone="accent"
            onClick={() => handleSuggestion("I would like to file a claim")}
          />
          <SuggestChip
            icon={<Shield size={14} />}
            label="See my policy"
            onClick={() => handleSuggestion("Show me my policy details")}
          />
          {onOpenProducts && (
            <SuggestChip
              icon={<WalletCards size={14} />}
              label="View products"
              onClick={onOpenProducts}
            />
          )}
          <SuggestChip
            icon={<Wallet size={14} />}
            label="View payments"
            onClick={() => handleSuggestion("Show me my recent payments")}
          />
          <SuggestChip
            icon={<LayoutDashboard size={14} />}
            label="Open dashboard"
            onClick={() => handleSuggestion("Show me my dashboard")}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.6 }}
          className="mt-14 flex items-center gap-2"
          style={{ color: "var(--sl-ink-3)", fontSize: 13 }}
        >
          <Phone size={14} />
          <span>
            Prefer a person? Call{" "}
            <strong style={{ color: "var(--sl-ink)" }}>0800 SENTINEL</strong> —
            Mon–Fri, 8am–8pm
          </span>
        </motion.div>
      </div>

      {/* Composer */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.6 }}
        className="relative z-10 flex justify-center px-6 pb-10"
      >
        <form
          onSubmit={handleSubmit}
          className="sl-composer"
          style={{ width: "100%", maxWidth: 720, padding: "10px 10px 10px 18px" }}
        >
          <textarea
            ref={inputRef as unknown as React.RefObject<HTMLTextAreaElement>}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (input.trim()) handleSubmit(e as unknown as FormEvent);
              }
            }}
            placeholder="Type, or tap the orb above to talk…"
            className="flex-1 resize-none border-none bg-transparent outline-none"
            style={{
              fontSize: 15,
              lineHeight: 1.5,
              padding: "8px 0",
              minHeight: 24,
              maxHeight: 120,
              color: "var(--sl-ink)",
              fontFamily: "inherit",
            }}
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="sl-btn sl-btn-primary"
            style={{
              opacity: input.trim() ? 1 : 0.5,
              cursor: input.trim() ? "pointer" : "not-allowed",
            }}
          >
            Ask <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </form>
      </motion.div>
    </div>
  );
}
