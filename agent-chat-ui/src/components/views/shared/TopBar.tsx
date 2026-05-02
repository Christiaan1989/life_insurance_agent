"use client";

import { motion } from "framer-motion";
import { Home, SquarePen } from "lucide-react";
import { cn } from "@/lib/utils";

interface TopBarProps {
  /** Label shown in center (e.g., "Policy Q&A", "Claims Filing") */
  viewLabel: string;
  /** Callback to navigate home / reset thread */
  onHome: () => void;
  /** Callback to start a new thread */
  onNewThread?: () => void;
  /** Extra classes */
  className?: string;
  /** Optional right-side content */
  rightContent?: React.ReactNode;
}

/**
 * Shared dark top bar for Policy Q&A and Claims views.
 * Glassmorphism style with logo, view label, and navigation.
 */
export function TopBar({
  viewLabel,
  onHome,
  onNewThread,
  className,
  rightContent,
}: TopBarProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "relative z-20 flex items-center justify-between px-5 py-3",
        "bg-black/40 backdrop-blur-xl border-b border-white/[0.06]",
        className,
      )}
    >
      {/* Left: Logo + title */}
      <button
        onClick={onHome}
        className="flex cursor-pointer items-center gap-3 group"
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#C5961A]/10 group-hover:bg-[#C5961A]/20 transition-colors">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            className="text-[#C5961A]"
          >
            <path
              d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span className="text-sm font-semibold text-white/80 group-hover:text-white transition-colors">
          Sentinel
        </span>
      </button>

      {/* Center: View label */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
        <div className="h-1.5 w-1.5 rounded-full bg-[#C5961A] animate-pulse" />
        <span className="text-xs font-medium tracking-wider uppercase text-white/40">
          {viewLabel}
        </span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {rightContent}
        {onNewThread && (
          <button
            onClick={onNewThread}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
            title="New conversation"
          >
            <SquarePen className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={onHome}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
          title="Home"
        >
          <Home className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}
