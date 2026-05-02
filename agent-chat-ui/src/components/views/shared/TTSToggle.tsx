"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useTTS } from "@/hooks/use-tts";
import { cn } from "@/lib/utils";

/**
 * Compact speaker toggle button — matches VoiceNav styling.
 * Sits in the top nav bar of every view, next to VoiceNav.
 */
export function TTSToggle({ className }: { className?: string }) {
  const { enabled, speaking, toggle } = useTTS();

  return (
    <button
      onClick={toggle}
      className={cn(
        "relative flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-medium transition-all duration-300 outline-none border",
        enabled
          ? "border-[#C5961A]/20 bg-[#C5961A]/5 text-[#C5961A]/60"
          : "border-white/[0.06] bg-white/[0.02] text-white/20 hover:border-[#C5961A]/15 hover:text-white/40",
        className,
      )}
    >
      {enabled ? (
        <Volume2 className={cn("h-3 w-3", speaking && "animate-pulse")} />
      ) : (
        <VolumeX className="h-3 w-3" />
      )}
      <span>
        {enabled ? (speaking ? "Speaking..." : "Voice On") : "Voice Off"}
      </span>
    </button>
  );
}
