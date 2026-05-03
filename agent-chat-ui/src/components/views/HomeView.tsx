"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, ArrowUp, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useSubmitMessage } from "./shared/ChatInput";
import { VoiceNav } from "./shared/VoiceNav";
import { TTSToggle } from "./shared/TTSToggle";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { useTTS, ttsSpeak } from "@/hooks/use-tts";
import { toast } from "sonner";

// Module-level flag — greeting plays once per page session
let hasPlayedGreeting = false;

// ---------------------------------------------------------------------------
// Animated pulse rings — expand outward from the orb
// ---------------------------------------------------------------------------
function PulseRings() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border border-[#C5961A]/[0.06]"
          initial={{ width: 140, height: 140, opacity: 0 }}
          animate={{
            width: [140, 420 + i * 100],
            height: [140, 420 + i * 100],
            opacity: [0.5, 0],
          }}
          transition={{
            duration: 4,
            delay: i * 1.2,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Voice orb — the hero interactive element
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
    <motion.button
      onClick={onToggle}
      disabled={isBusy}
      className="relative flex cursor-pointer items-center justify-center outline-none"
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
    >
      {/* Outer glow */}
      <div
        className={`absolute rounded-full transition-all duration-700 ${
          isRecording
            ? "h-52 w-52 bg-red-500/10 blur-3xl"
            : "h-48 w-48 bg-[#C5961A]/10 blur-3xl"
        }`}
      />

      {/* Middle ring */}
      <motion.div
        className={`absolute h-36 w-36 rounded-full border ${
          isRecording ? "border-red-500/30" : "border-[#C5961A]/15"
        }`}
        animate={
          isRecording
            ? {
                scale: [1, 1.15, 1],
                borderColor: [
                  "rgba(239,68,68,0.3)",
                  "rgba(239,68,68,0.6)",
                  "rgba(239,68,68,0.3)",
                ],
              }
            : { scale: 1 }
        }
        transition={isRecording ? { duration: 1.5, repeat: Infinity } : {}}
      />

      {/* Inner orb */}
      <div
        className={`relative flex h-28 w-28 items-center justify-center rounded-full transition-all duration-500 ${
          isRecording
            ? "bg-gradient-to-br from-red-500/25 to-red-700/15 border border-red-500/40 shadow-[0_0_60px_rgba(239,68,68,0.2)]"
            : "bg-gradient-to-br from-[#C5961A]/20 to-[#C5961A]/5 border border-[#C5961A]/25 shadow-[0_0_60px_rgba(197,150,26,0.15)]"
        }`}
      >
        {isRecording ? (
          <div className="flex flex-col items-center gap-1.5">
            <Square className="h-6 w-6 text-red-400" />
            <span className="text-[10px] font-mono text-red-400/80">
              {formatMs(elapsedMs)}
            </span>
          </div>
        ) : (
          <Mic
            className={`h-9 w-9 ${isBusy ? "text-white/20" : "text-[#C5961A]"}`}
          />
        )}
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Background — concentric circles (radar / tech interface look)
// ---------------------------------------------------------------------------
function PortalBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Base */}
      <div className="absolute inset-0 bg-[#030303]" />

      {/* Central gold glow */}
      <div className="absolute top-[25%] left-1/2 -translate-x-1/2 h-[70%] w-[70%] bg-[radial-gradient(ellipse,rgba(197,150,26,0.06)_0%,transparent_60%)]" />

      {/* Concentric circles + crosshair SVG */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.03]"
        viewBox="0 0 1200 800"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Concentric rings */}
        <circle cx="600" cy="370" r="120" stroke="#C5961A" strokeWidth="0.8" />
        <circle cx="600" cy="370" r="190" stroke="#C5961A" strokeWidth="0.4" />
        <circle cx="600" cy="370" r="260" stroke="#C5961A" strokeWidth="0.8" />
        <circle cx="600" cy="370" r="330" stroke="#C5961A" strokeWidth="0.4" />
        <circle cx="600" cy="370" r="400" stroke="#C5961A" strokeWidth="0.8" />
        <circle cx="600" cy="370" r="500" stroke="#C5961A" strokeWidth="0.3" />

        {/* Crosshair lines */}
        <line x1="600" y1="0" x2="600" y2="800" stroke="#C5961A" strokeWidth="0.3" />
        <line x1="0" y1="370" x2="1200" y2="370" stroke="#C5961A" strokeWidth="0.3" />

        {/* Diagonal cross */}
        <line x1="200" y1="0" x2="1000" y2="740" stroke="#C5961A" strokeWidth="0.15" />
        <line x1="1000" y1="0" x2="200" y2="740" stroke="#C5961A" strokeWidth="0.15" />

        {/* Small tick marks on rings */}
        <line x1="600" y1="110" x2="600" y2="130" stroke="#C5961A" strokeWidth="0.5" />
        <line x1="600" y1="610" x2="600" y2="630" stroke="#C5961A" strokeWidth="0.5" />
        <line x1="340" y1="370" x2="360" y2="370" stroke="#C5961A" strokeWidth="0.5" />
        <line x1="840" y1="370" x2="860" y2="370" stroke="#C5961A" strokeWidth="0.5" />
      </svg>

      {/* Fine grid */}
      <div className="absolute inset-0 bg-grid-pattern opacity-10" />

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_25%,rgba(0,0,0,0.8)_100%)]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// HomeView — The Portal
// ---------------------------------------------------------------------------
interface HomeViewProps {
  policyNumber: string;
  onPolicyChange: (v: string) => void;
  onPolicySubmitted: () => void;
  policySubmitted: boolean;
  onOpenHistory?: () => void;
  historyOpen?: boolean;
}

export function HomeView({
  policyNumber,
  onPolicyChange,
  onPolicySubmitted,
  policySubmitted,
  onOpenHistory,
  historyOpen,
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

  // ── TTS auto-greeting — plays once, AFTER the user's first click ──
  // Browsers block audio.play() until a user gesture has occurred on the page.
  // We listen for the first click/touch, then play the greeting after a brief pause.
  const { enabled: ttsEnabled } = useTTS();
  useEffect(() => {
    if (!ttsEnabled || hasPlayedGreeting) return;

    const onFirstInteraction = () => {
      if (hasPlayedGreeting) return;
      hasPlayedGreeting = true;
      document.removeEventListener("click", onFirstInteraction);
      document.removeEventListener("touchstart", onFirstInteraction);
      // Brief pause so the greeting doesn't overlap with whatever the user clicked
      setTimeout(() => {
        ttsSpeak(
          "Hello, this is your Sentinel life insurance agent. How can I help you today?",
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

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <PortalBackground />

      {/* ─── Top bar ─── */}
      <div className="relative z-10 flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          {onOpenHistory && (
            <button
              onClick={onOpenHistory}
              className="rounded-lg p-2 text-white/15 hover:text-white/40 hover:bg-white/5 transition-all"
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

        <div className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-white/20">
            Policy
          </span>
          <input
            type="text"
            value={policyNumber}
            onChange={(e) => onPolicyChange(e.target.value)}
            className="w-32 bg-transparent text-xs font-mono text-[#C5961A]/70 outline-none placeholder:text-white/10"
            placeholder="POL-..."
          />
        </div>
      </div>

      {/* ─── Center: Orb + question ─── */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-0">
        {/* Pulse rings (positioned behind orb) */}
        <div className="relative">
          <PulseRings />

          {/* Voice orb */}
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          >
            <VoiceOrb
              isRecording={isRecording}
              isBusy={isBusy}
              elapsedMs={elapsedMs}
              onToggle={toggle}
            />
          </motion.div>
        </div>

        {/* Recording indicator */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-5 flex items-center gap-2"
            >
              <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[11px] font-mono text-red-400/60">
                Listening...
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sentinel Life brand */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="mt-10 text-center"
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-[#C5961A]/30">
            Sentinel Life
          </span>
        </motion.div>

        {/* Bold heading */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 text-center text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl"
        >
          How can I help you?
        </motion.h1>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="mt-4 max-w-md text-center text-sm leading-relaxed text-white/15"
        >
          Life insurance claims processing for Death, Disability, and Critical Illness.
          Tap the orb to speak, or type below.
        </motion.p>
      </div>

      {/* ─── Bottom: Input bar ─── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="relative z-10 flex justify-center px-6 pb-10"
      >
        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-xl items-center gap-3 rounded-full border border-white/[0.06] bg-white/[0.03] px-5 py-3 backdrop-blur-sm transition-all focus-within:border-[#C5961A]/20 focus-within:shadow-[0_0_40px_rgba(197,150,26,0.06)]"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-transparent text-sm text-white/80 outline-none placeholder:text-white/15"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#C5961A]/80 text-black transition-all hover:bg-[#C5961A] disabled:opacity-20"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </form>
      </motion.div>
    </div>
  );
}
