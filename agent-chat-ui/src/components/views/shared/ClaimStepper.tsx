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
 * Steps glow gold when active, show checkmark when completed.
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
                isCompleted && "h-7 w-7 bg-[#C5961A]/20 border border-[#C5961A]/40",
                isActive && "h-7 w-7 bg-[#C5961A]/10 border border-[#C5961A]/30 glow-gold-sm",
                isPending && "h-6 w-6 bg-white/[0.03] border border-white/[0.08]",
                !isCompleted && !isActive && !isPending && "h-6 w-6 bg-white/[0.03] border border-white/[0.08]",
              )}
            >
              {isCompleted ? (
                <Check className="h-3.5 w-3.5 text-[#C5961A]" />
              ) : isActive ? (
                <div className="h-2 w-2 rounded-full bg-[#C5961A] animate-pulse" />
              ) : (
                <div className="h-1.5 w-1.5 rounded-full bg-white/10" />
              )}
            </motion.div>

            {/* Step label (below circle) */}
            <span
              className={cn(
                "text-[10px] font-medium mr-2",
                isCompleted && "text-[#C5961A]/70",
                isActive && "text-white/60",
                isPending && "text-white/15",
                !isCompleted && !isActive && !isPending && "text-white/15",
              )}
            >
              {step.label}
            </span>

            {/* Connector line (not after last) */}
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "h-px w-6 mr-1 transition-colors duration-300",
                  isCompleted ? "bg-[#C5961A]/30" : "bg-white/[0.06]",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
