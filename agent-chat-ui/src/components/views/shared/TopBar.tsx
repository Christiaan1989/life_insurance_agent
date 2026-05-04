"use client";

import { motion } from "framer-motion";
import { Home, SquarePen } from "lucide-react";
import { cn } from "@/lib/utils";
import { VoiceNav } from "./VoiceNav";
import { TTSToggle } from "./TTSToggle";

interface TopBarProps {
  /** Label shown in center (e.g., "Filing a claim", "Policy overview") */
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
 * Shared warm top bar for all view shells.
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
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "relative z-20 flex items-center justify-between px-6 py-3.5",
        className,
      )}
      style={{
        background: "var(--sl-bg)",
        borderBottom: "1px solid var(--sl-line)",
      }}
    >
      {/* Left: Home + voice controls */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onHome}
          className="sl-btn-sq"
          aria-label="Home"
          title="Home"
        >
          <Home className="h-4 w-4" />
        </button>
        <VoiceNav />
        <TTSToggle />
      </div>

      {/* Center: View label */}
      <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 lg:flex">
        <div
          className="inline-flex items-center gap-2"
          style={{
            background: "var(--sl-surface)",
            border: "1px solid var(--sl-line)",
            borderRadius: 999,
            padding: "5px 12px",
            fontSize: 12,
            color: "var(--sl-ink-2)",
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--sl-primary)" }}
          />
          {viewLabel}
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {rightContent}
        {onNewThread && (
          <button
            type="button"
            onClick={onNewThread}
            className="sl-btn-sq"
            title="New conversation"
            aria-label="New conversation"
          >
            <SquarePen className="h-4 w-4" />
          </button>
        )}
      </div>
    </motion.div>
  );
}
