"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  label: string;
  key: string;
  completed: boolean;
}

interface ClaimStepperProps {
  steps: Step[];
  className?: string;
}

/**
 * Horizontal claim progress stepper.
 * Uses the warm Sentinel design tokens so claim progress feels calm and clear.
 */
export function ClaimStepper({ steps, className }: ClaimStepperProps) {
  // Find the first incomplete step (that's the "active" one)
  const activeIndex = steps.findIndex((s) => !s.completed);

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {steps.map((step, i) => {
        const isCompleted = step.completed;
        const isActive = i === activeIndex;
        const isPending = i > activeIndex && activeIndex !== -1;

        return (
          <div key={step.key} className="flex items-center gap-1">
            {/* Step circle */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.1, duration: 0.3 }}
              className={cn(
                "relative flex items-center justify-center rounded-full transition-all duration-300",
                isCompleted &&
                  "h-7 w-7 border border-[color-mix(in_oklab,var(--sl-primary)_28%,transparent)] bg-[var(--sl-primary-soft)]",
                isActive &&
                  "h-7 w-7 border border-[color-mix(in_oklab,var(--sl-accent)_32%,transparent)] bg-[var(--sl-accent-soft)] shadow-[var(--sl-shadow-sm)]",
                isPending && "h-6 w-6 border border-[var(--sl-line)] bg-[var(--sl-surface)]",
                !isCompleted &&
                  !isActive &&
                  !isPending &&
                  "h-6 w-6 border border-[var(--sl-line)] bg-[var(--sl-surface)]",
              )}
            >
              {isCompleted ? (
                <Check className="h-3.5 w-3.5 text-[var(--sl-primary)]" />
              ) : isActive ? (
                <div className="h-2 w-2 animate-pulse rounded-full bg-[var(--sl-accent)]" />
              ) : (
                <div className="h-1.5 w-1.5 rounded-full bg-[var(--sl-line-2)]" />
              )}
            </motion.div>

            {/* Step label (below circle) */}
            <span
              className={cn(
                "text-[10px] font-medium mr-2",
                isCompleted && "text-[var(--sl-primary)]",
                isActive && "text-[var(--sl-ink-2)]",
                isPending && "text-[var(--sl-ink-4)]",
                !isCompleted && !isActive && !isPending && "text-[var(--sl-ink-4)]",
              )}
            >
              {step.label}
            </span>

            {/* Connector line (not after last) */}
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "h-px w-6 mr-1 transition-colors duration-300",
                  isCompleted
                    ? "bg-[color-mix(in_oklab,var(--sl-primary)_32%,transparent)]"
                    : "bg-[var(--sl-line)]",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
