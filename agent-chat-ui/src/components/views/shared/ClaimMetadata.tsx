"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ClaimState } from "@/hooks/use-claim-state";
import {
  FileText,
  AlertTriangle,
  TrendingUp,
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";

interface ClaimMetadataProps {
  claim: ClaimState;
  className?: string;
}

function MetadataCard({
  label,
  value,
  icon: Icon,
  delay,
  accent,
}: {
  label: string;
  value: string | null;
  icon: typeof FileText;
  delay: number;
  accent?: boolean;
}) {
  return (
    <AnimatePresence>
      {value && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ delay, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-[14px] border px-3 py-2.5 shadow-[var(--sl-shadow-sm)]"
          style={{
            background: accent ? "var(--sl-primary-soft)" : "var(--sl-surface)",
            borderColor: accent
              ? "color-mix(in oklab, var(--sl-primary) 25%, transparent)"
              : "var(--sl-line)",
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Icon
              className="h-3 w-3"
              style={{
                color: accent ? "var(--sl-primary)" : "var(--sl-ink-3)",
              }}
            />
            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--sl-ink-3)]">
              {label}
            </span>
          </div>
          <p className={cn(
            "text-sm font-semibold",
            accent ? "text-[var(--sl-primary-ink)]" : "text-[var(--sl-ink)]",
          )}>
            {value}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: typeof CheckCircle2; color: string; bg: string }> = {
    accepted: { icon: CheckCircle2, color: "text-[var(--sl-primary-ink)]", bg: "bg-[var(--sl-primary-soft)] border-[color-mix(in_oklab,var(--sl-primary)_25%,transparent)]" },
    approved: { icon: CheckCircle2, color: "text-[var(--sl-primary-ink)]", bg: "bg-[var(--sl-primary-soft)] border-[color-mix(in_oklab,var(--sl-primary)_25%,transparent)]" },
    denied: { icon: XCircle, color: "text-[var(--sl-danger)]", bg: "bg-[var(--sl-danger-soft)] border-[color-mix(in_oklab,var(--sl-danger)_25%,transparent)]" },
    escalated: { icon: AlertTriangle, color: "text-[#6F4810]", bg: "bg-[var(--sl-warning-soft)] border-[color-mix(in_oklab,var(--sl-warning)_30%,transparent)]" },
    needs_info: { icon: Clock, color: "text-[#6B2A11]", bg: "bg-[var(--sl-accent-soft)] border-[color-mix(in_oklab,var(--sl-accent)_30%,transparent)]" },
    pending_info: { icon: Clock, color: "text-[#6B2A11]", bg: "bg-[var(--sl-accent-soft)] border-[color-mix(in_oklab,var(--sl-accent)_30%,transparent)]" },
    documents_pending: { icon: Clock, color: "text-[#6B2A11]", bg: "bg-[var(--sl-accent-soft)] border-[color-mix(in_oklab,var(--sl-accent)_30%,transparent)]" },
    under_review: { icon: Clock, color: "text-[#6F4810]", bg: "bg-[var(--sl-warning-soft)] border-[color-mix(in_oklab,var(--sl-warning)_30%,transparent)]" },
    intake: { icon: Clock, color: "text-[var(--sl-ink-3)]", bg: "bg-[var(--sl-surface-2)] border-[var(--sl-line)]" },
  };

  const c = config[status] || config.intake;
  const Icon = c.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1", c.bg)}
    >
      <Icon className={cn("h-3.5 w-3.5", c.color)} />
      <span className={cn("text-xs font-semibold capitalize", c.color)}>
        {status.replace("_", " ")}
      </span>
    </motion.div>
  );
}

/**
 * Displays claim metadata cards populated in real-time from tool call results.
 */
export function ClaimMetadata({ claim, className }: ClaimMetadataProps) {
  const hasAnyData = claim.claimId || claim.claimType || claim.eligibility;

  if (!hasAnyData) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-8 text-center", className)}>
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--sl-line)] bg-[var(--sl-surface)]">
          <FileText className="h-5 w-5 text-[var(--sl-ink-4)]" />
        </div>
        <p className="text-sm text-[var(--sl-ink-3)]">
          Claim details will appear here as the process begins
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Status badge */}
      {claim.claimStatus && (
        <div className="flex items-center gap-3">
          <StatusBadge status={claim.claimStatus} />
          {claim.decisionReason && (
            <span className="truncate text-[11px] text-[var(--sl-ink-3)]">
              {claim.decisionReason}
            </span>
          )}
        </div>
      )}

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-2">
        <MetadataCard
          label="Claim ID"
          value={claim.claimId ? claim.claimId.slice(0, 8).toUpperCase() : null}
          icon={FileText}
          delay={0}
          accent
        />
        <MetadataCard
          label="Claim Type"
          value={claim.claimType}
          icon={AlertTriangle}
          delay={0.05}
        />
        <MetadataCard
          label="Incident Date"
          value={claim.incidentDate}
          icon={Clock}
          delay={0.1}
        />
        <MetadataCard
          label="Eligibility"
          value={claim.eligibility}
          icon={TrendingUp}
          delay={0.15}
          accent
        />
        <MetadataCard
          label="Documents"
          value={claim.documentsReceived > 0 ? String(claim.documentsReceived) : null}
          icon={Shield}
          delay={0.2}
        />
        <MetadataCard
          label="Payout"
          value={claim.payout}
          icon={Shield}
          delay={0.25}
        />
      </div>
    </div>
  );
}
