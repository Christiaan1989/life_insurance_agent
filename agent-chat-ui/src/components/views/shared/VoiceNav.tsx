"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Loader2 } from "lucide-react";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { useSubmitMessage } from "./ChatInput";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Prefix added to every voice-navigation message so the frontend
 * can filter them from the chat display and the agent recognises
 * them as pure navigation commands.
 */
export const VOICE_NAV_PREFIX = "[VOICE_NAV]";

type NavState = "idle" | "listening" | "processing" | "navigating";

/**
 * Compact inline voice-navigation control.
 *
 * Sits in the top nav bar of every view, next to the Home button.
 * Records the user's voice → transcribes → sends [VOICE_NAV] command
 * to the agent → agent calls set_active_view silently.
 *
 * Separate from the chat-bar mic (which does voice-to-text).
 */
export function VoiceNav({ className }: { className?: string }) {
  const submitMessage = useSubmitMessage();
  const [navState, setNavState] = useState<NavState>("idle");

  const { toggle, isRecording, isBusy, error } = useVoiceRecorder({
    onTranscript: (text) => {
      if (!text) {
        setNavState("idle");
        return;
      }
      setNavState("navigating");
      submitMessage(`${VOICE_NAV_PREFIX} ${text}`);
      setTimeout(() => setNavState("idle"), 3000);
    },
  });

  useEffect(() => {
    if (!error) return;
    toast.error("Voice navigation error", { description: error });
    setNavState("idle");
  }, [error]);

  useEffect(() => {
    if (isRecording) setNavState("listening");
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording && isBusy && navState === "listening") {
      setNavState("processing");
    }
  }, [isRecording, isBusy, navState]);

  const handleClick = useCallback(() => {
    if (navState === "navigating" || navState === "processing") return;
    toggle();
  }, [navState, toggle]);

  const isActive = navState !== "idle";

  return (
    <div className={cn("relative", className)}>
      {/* Subtle pulse ring when listening */}
      <AnimatePresence>
        {navState === "listening" && (
          <motion.div
            className="pointer-events-none absolute -inset-1.5 rounded-full"
            style={{
              border:
                "1px solid color-mix(in oklab, var(--sl-accent) 30%, transparent)",
            }}
            initial={{ scale: 1, opacity: 0.4 }}
            animate={{ scale: [1, 1.5], opacity: [0.4, 0] }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      <motion.button
        onClick={handleClick}
        whileHover={!isActive ? { scale: 1.04 } : {}}
        whileTap={!isActive ? { scale: 0.96 } : {}}
        className="relative inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-all duration-300 outline-none"
        style={{
          border:
            navState === "listening"
              ? "1px solid color-mix(in oklab, var(--sl-accent) 50%, transparent)"
              : navState === "navigating" || navState === "processing"
                ? "1px solid color-mix(in oklab, var(--sl-primary) 30%, transparent)"
                : "1px solid var(--sl-line)",
          background:
            navState === "listening"
              ? "var(--sl-accent-soft)"
              : navState === "navigating" || navState === "processing"
                ? "var(--sl-primary-soft)"
                : "var(--sl-surface)",
          color:
            navState === "listening"
              ? "#6B2A11"
              : navState === "navigating" || navState === "processing"
                ? "var(--sl-primary-ink)"
                : "var(--sl-ink-3)",
        }}
      >
        {navState === "navigating" || navState === "processing" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : navState === "listening" ? (
          <motion.div
            animate={{ scale: [1, 1.25, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          >
            <Mic className="h-3 w-3" />
          </motion.div>
        ) : (
          <Mic className="h-3 w-3" />
        )}
        <span>
          {navState === "listening"
            ? "Listening..."
            : navState === "processing"
              ? "Processing..."
              : navState === "navigating"
                ? "Navigating..."
                : "Voice nav"}
        </span>
      </motion.button>
    </div>
  );
}
