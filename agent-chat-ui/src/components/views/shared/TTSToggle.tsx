"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useTTS } from "@/hooks/use-tts";
import { cn } from "@/lib/utils";

/**
 * Compact speaker toggle button — warm sage style.
 */
export function TTSToggle({ className }: { className?: string }) {
  const { enabled, speaking, toggle } = useTTS();

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "relative inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-all duration-300 outline-none",
        className,
      )}
      style={{
        border: enabled
          ? "1px solid color-mix(in oklab, var(--sl-primary) 30%, transparent)"
          : "1px solid var(--sl-line)",
        background: enabled
          ? "var(--sl-primary-soft)"
          : "var(--sl-surface)",
        color: enabled ? "var(--sl-primary-ink)" : "var(--sl-ink-3)",
      }}
    >
      {enabled ? (
        <Volume2 className={cn("h-3 w-3", speaking && "animate-pulse")} />
      ) : (
        <VolumeX className="h-3 w-3" />
      )}
      <span>
        {enabled ? (speaking ? "Speaking..." : "Voice on") : "Voice off"}
      </span>
    </button>
  );
}
