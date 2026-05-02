"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Home,
  SquarePen,
  Shield,
  ArrowRight,
  CheckCircle2,
  Clock3,
  XCircle,
  AlertTriangle,
  ClipboardCheck,
  FileSearch,
} from "lucide-react";
import { ChatPanel } from "./shared/ChatPanel";
import { ChatInput, useSubmitMessage } from "./shared/ChatInput";
import { VoiceNav } from "./shared/VoiceNav";
import { TTSToggle } from "./shared/TTSToggle";
import { useStreamContext } from "@/providers/Stream";
import { useClaimState } from "@/hooks/use-claim-state";
import { ClaimMetadata } from "./shared/ClaimMetadata";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Quick upgrade prompts
// ---------------------------------------------------------------------------
const OUTCOME_PROMPTS = [
  { label: "Payout breakdown", message: "Can you explain the payout breakdown in detail?" },
  { label: "Beneficiary splits", message: "How is the payout split between the beneficiaries?" },
  { label: "Email report", message: "Please email a copy of the claim report to me." },
  { label: "What happens next?", message: "What are the next steps after the claim decision?" },
];

// ---------------------------------------------------------------------------
// Background — radial energy burst (IBM Watson–inspired)
// ---------------------------------------------------------------------------
function BurstBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[#030303]" />

      {/* Radial glow from top-right */}
      <div className="absolute -top-[20%] -right-[15%] h-[100%] w-[70%] bg-[radial-gradient(ellipse_at_80%_20%,rgba(197,150,26,0.07)_0%,transparent_55%)]" />

      {/* Secondary glow bottom-left */}
      <div className="absolute -bottom-[20%] -left-[10%] h-[50%] w-[40%] bg-[radial-gradient(ellipse,rgba(197,150,26,0.03)_0%,transparent_60%)]" />

      {/* Radial burst SVG — lines radiating from top-right */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.03]"
        viewBox="0 0 1200 800"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Burst origin at (1050, 100) */}
        <line x1="1050" y1="100" x2="0" y2="150" stroke="#C5961A" strokeWidth="1" />
        <line x1="1050" y1="100" x2="0" y2="300" stroke="#C5961A" strokeWidth="0.5" />
        <line x1="1050" y1="100" x2="0" y2="450" stroke="#C5961A" strokeWidth="1" />
        <line x1="1050" y1="100" x2="0" y2="600" stroke="#C5961A" strokeWidth="0.5" />
        <line x1="1050" y1="100" x2="0" y2="750" stroke="#C5961A" strokeWidth="0.8" />
        <line x1="1050" y1="100" x2="150" y2="800" stroke="#C5961A" strokeWidth="0.5" />
        <line x1="1050" y1="100" x2="350" y2="800" stroke="#C5961A" strokeWidth="1" />
        <line x1="1050" y1="100" x2="550" y2="800" stroke="#C5961A" strokeWidth="0.5" />
        <line x1="1050" y1="100" x2="750" y2="800" stroke="#C5961A" strokeWidth="0.8" />
        <line x1="1050" y1="100" x2="950" y2="800" stroke="#C5961A" strokeWidth="0.4" />
        <line x1="1050" y1="100" x2="1200" y2="500" stroke="#C5961A" strokeWidth="0.5" />
        <line x1="1050" y1="100" x2="1200" y2="300" stroke="#C5961A" strokeWidth="0.3" />

        {/* Concentric arcs around the burst origin */}
        <path d="M850,100 A200,200 0 0,1 1050,300" stroke="#C5961A" strokeWidth="0.4" />
        <path d="M700,100 A350,350 0 0,1 1050,450" stroke="#C5961A" strokeWidth="0.3" />
        <path d="M550,100 A500,500 0 0,1 1050,600" stroke="#C5961A" strokeWidth="0.4" />

        {/* Dots at line tips */}
        <circle cx="0" cy="150" r="2" fill="#C5961A" opacity="0.3" />
        <circle cx="0" cy="450" r="2.5" fill="#C5961A" opacity="0.3" />
        <circle cx="350" cy="800" r="2" fill="#C5961A" opacity="0.2" />
        <circle cx="750" cy="800" r="2" fill="#C5961A" opacity="0.2" />
      </svg>

      {/* Grid */}
      <div className="absolute inset-0 bg-grid-pattern opacity-8" />

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,transparent_25%,rgba(0,0,0,0.75)_100%)]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClaimOutcomeView — The Showcase
// ---------------------------------------------------------------------------
interface ClaimOutcomeViewProps {
  policyNumber: string;
  policySubmitted: boolean;
  onPolicySubmitted: () => void;
  onHome: () => void;
  onNewThread: () => void;
}

function outcomeConfig(status: string | null) {
  switch (status) {
    case "accepted":
    case "approved":
      return {
        label: status === "accepted" ? "Accepted" : "Approved",
        headline: status === "accepted" ? "Claim Accepted" : "Approved for Payout",
        icon: CheckCircle2,
        accent: "text-emerald-400",
        border: "border-emerald-400/20",
        bg: "bg-emerald-400/10",
        nextStep:
          status === "accepted"
            ? "The claim can move into the next review step."
            : "The claim can move into payout and reporting.",
      };
    case "denied":
      return {
        label: "Denied",
        headline: "Claim Declined",
        icon: XCircle,
        accent: "text-red-400",
        border: "border-red-400/20",
        bg: "bg-red-400/10",
        nextStep: "The case is closed unless new evidence is submitted.",
      };
    case "pending_info":
    default:
      return {
        label: "Pending Review",
        headline: "Awaiting More Evidence",
        icon: Clock3,
        accent: "text-amber-300",
        border: "border-amber-300/20",
        bg: "bg-amber-300/10",
        nextStep: "Once the missing evidence arrives, the claim can move straight back into decisioning.",
      };
  }
}

function cleanBreakdownLine(line: string) {
  return line.replace(/^(PASS|FAIL|WARNING):\s*/, "").replace(/\s+—\s+/g, ": ");
}

function hasIdentityIssue(text: string) {
  return /\b(identity|id number|national id|policyholder name|name and id|name or id)\b/.test(text);
}

function buildOutcomeSummary(
  claimState: ReturnType<typeof useClaimState>,
  fallbackNextStep: string,
) {
  const passed = claimState.decisionBreakdown
    .filter((line) => line.startsWith("PASS:"))
    .map(cleanBreakdownLine);
  const failed = claimState.decisionBreakdown
    .filter((line) => line.startsWith("FAIL:"))
    .map(cleanBreakdownLine);
  const warnings = [
    ...claimState.warnings,
    ...claimState.decisionBreakdown
      .filter((line) => line.startsWith("WARNING:"))
      .map(cleanBreakdownLine),
  ];
  const reason = claimState.decisionReason;
  const status = claimState.claimStatus;
  const reasonBlob = `${reason ?? ""} ${failed.join(" ")}`.toLowerCase();

  let nextStep = fallbackNextStep;
  if (status === "approved") {
    nextStep = "Move the claim into payout processing and generate the final claim report.";
  } else if (status === "accepted") {
    nextStep = "Continue the claim workflow using the verified claim record and evidence checks.";
  } else if (status === "denied") {
    nextStep = "Close the claim decision, unless new evidence is submitted for review.";
  } else if (reasonBlob.includes("second") || reasonBlob.includes("independent")) {
    nextStep = "Upload the completed second independent medical assessment so the claim can return to decisioning.";
  } else if (reasonBlob.includes("post-mortem") || reasonBlob.includes("post mortem")) {
    nextStep = "Upload the post-mortem report so the accidental or unnatural death review can be completed.";
  } else if (reasonBlob.includes("death certificate")) {
    nextStep = "Upload the certified death certificate so the death claim can be finalised.";
  } else if (hasIdentityIssue(reasonBlob)) {
    nextStep = "Provide clearer evidence of the policyholder name and ID number so the record can be verified.";
  } else if (reasonBlob.includes("pathology") || reasonBlob.includes("staging")) {
    nextStep = "Upload the pathology or staging report so the critical illness diagnosis can be validated.";
  }

  let decisionDetail = reason || failed[0];
  if (!decisionDetail && status === "approved") {
    decisionDetail = "All required evidence checks passed, and no payout-blocking exclusion was found.";
  } else if (!decisionDetail && status === "accepted") {
    decisionDetail = "The claim record has passed the current intake checks and is ready for the next review step.";
  } else if (!decisionDetail && status === "denied") {
    decisionDetail = "The evidence does not meet the policy requirements for this claim type.";
  } else if (!decisionDetail) {
    decisionDetail = "The claim needs one more evidence check before it can be finalised.";
  }

  return {
    confirmed: passed.slice(0, 4),
    decisionDetail,
    nextStep,
    warnings: Array.from(new Set(warnings)).slice(0, 3),
  };
}

function outcomeIntro(status: string | null) {
  if (status === "approved") {
    return "The claim has enough verified evidence to proceed from review into payout.";
  }
  if (status === "accepted") {
    return "The claim has passed the current intake checks and is ready for the next workflow step.";
  }
  if (status === "denied") {
    return "The claim review is complete, and the evidence does not meet the policy requirements for payout.";
  }
  return "The claim has been reviewed and is waiting on one specific item before a final payout decision can be made.";
}

function decisionCardConfig(status: string | null) {
  if (status === "approved") {
    return { title: "Approval Basis", icon: CheckCircle2, tone: "good" as const };
  }
  if (status === "accepted") {
    return { title: "Acceptance Basis", icon: CheckCircle2, tone: "good" as const };
  }
  if (status === "denied") {
    return { title: "Reason For Decline", icon: XCircle, tone: "danger" as const };
  }
  return { title: "Blocking Issue", icon: AlertTriangle, tone: "warning" as const };
}

function SummaryCard({
  title,
  icon: Icon,
  children,
  tone = "neutral",
}: {
  title: string;
  icon: typeof CheckCircle2;
  children: ReactNode;
  tone?: "neutral" | "good" | "warning" | "danger";
}) {
  const toneClass = {
    neutral: "border-white/[0.06] bg-white/[0.02] text-white/25",
    good: "border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300",
    warning: "border-amber-300/15 bg-amber-300/[0.06] text-amber-200",
    danger: "border-red-400/15 bg-red-400/[0.06] text-red-300",
  }[tone];

  return (
    <div className={cn("rounded-xl border p-4", toneClass)}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em]">
          {title}
        </p>
      </div>
      {children}
    </div>
  );
}

export function ClaimOutcomeView({
  policyNumber,
  policySubmitted,
  onPolicySubmitted,
  onHome,
  onNewThread,
}: ClaimOutcomeViewProps) {
  const stream = useStreamContext();
  const claimState = useClaimState(stream.messages);
  const submitMessage = useSubmitMessage();
  const outcome = outcomeConfig(claimState.claimStatus);
  const OutcomeIcon = outcome.icon;
  const summary = buildOutcomeSummary(claimState, outcome.nextStep);
  const decisionCard = decisionCardConfig(claimState.claimStatus);

  const handlePromptClick = (message: string) => {
    submitMessage(
      message,
      undefined,
      !policySubmitted ? policyNumber : undefined,
    );
    if (!policySubmitted) onPolicySubmitted();
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <BurstBackground />

      {/* ─── Top nav ─── */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onHome}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-white/20 hover:text-white/50 hover:bg-white/5 transition-all"
          >
            <Home className="h-4 w-4" />
            <span className="text-xs font-medium">Home</span>
          </button>
          <VoiceNav />
          <TTSToggle />
        </div>

        <div className="flex items-center gap-1">
          <div className="h-1.5 w-1.5 rounded-full bg-[#C5961A]/40 animate-pulse" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/15">
            Claim Outcome
          </span>
        </div>

        <button
          onClick={onNewThread}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-white/20 hover:text-white/50 hover:bg-white/5 transition-all"
        >
          <SquarePen className="h-4 w-4" />
        </button>
      </div>

      {/* ─── Main: Reverse editorial split — chat LEFT, upgrade panel RIGHT ─── */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
        {/* LEFT: Chat panel */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-1 flex-col"
        >
          <ChatPanel
            className="flex-1"
            footer={
              <div className="w-full px-4 pb-4">
                <ChatInput
                  policyNumber={policyNumber}
                  policySubmitted={policySubmitted}
                  onPolicySubmitted={onPolicySubmitted}
                  placeholder="Ask about the decision, payout, or next steps..."
                  showFileUpload={false}
                  showToolCallsToggle={true}
                />
              </div>
            }
          />
        </motion.div>

        {/* Vertical separator */}
        <div className="hidden lg:block w-px bg-gradient-to-b from-transparent via-white/[0.04] to-transparent" />

        {/* RIGHT: Upgrade panel — bold heading + quick prompts (hidden on small) */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="hidden lg:flex w-[38%] xl:w-[35%] flex-col gap-8 overflow-y-auto px-10 xl:px-14 py-8"
        >
          {/* Heading */}
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <Shield className="h-8 w-8 text-[#C5961A]/20 mb-4" />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="text-[clamp(2.5rem,5vw,5rem)] font-black leading-[0.85] tracking-tighter text-white"
            >
              CLAIM
            </motion.h1>
            <motion.h2
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="text-[clamp(2.5rem,5vw,5rem)] font-black leading-[0.85] tracking-tighter text-[#C5961A]/25"
            >
              DECISION
            </motion.h2>
            <motion.h2
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="text-[clamp(2.5rem,5vw,5rem)] font-black leading-[0.85] tracking-tighter text-[#C5961A]/25"
            >
              &amp; PAYOUT.
            </motion.h2>

            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="mt-6 h-px w-16 origin-left bg-gradient-to-r from-[#C5961A]/50 to-transparent"
            />

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.72, duration: 0.45 }}
              className={cn("rounded-2xl border p-5", outcome.border, outcome.bg)}
            >
              <div className="flex items-start gap-3">
                <div className={cn("mt-0.5 flex h-9 w-9 items-center justify-center rounded-full", outcome.bg)}>
                  <OutcomeIcon className={cn("h-5 w-5", outcome.accent)} />
                </div>
                <div>
                  <p className={cn("text-xs font-semibold uppercase tracking-[0.18em]", outcome.accent)}>
                    {outcome.label}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-white">
                    {outcome.headline}
                  </h3>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-white/75">
                {outcomeIntro(claimState.claimStatus)}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.82, duration: 0.45 }}
              className="space-y-3"
            >
              <ClaimMetadata claim={claimState} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.45 }}
              className="grid gap-3"
            >
              <SummaryCard title="What We Confirmed" icon={ClipboardCheck} tone="good">
                {summary.confirmed.length > 0 ? (
                  <ul className="space-y-2">
                    {summary.confirmed.map((line) => (
                      <li key={line} className="flex gap-2 text-sm leading-relaxed text-white/70">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm leading-relaxed text-white/55">
                    The claim record has been opened and is ready for evidence review.
                  </p>
                )}
              </SummaryCard>

              <SummaryCard
                title={decisionCard.title}
                icon={decisionCard.icon}
                tone={decisionCard.tone}
              >
                <p className="text-sm leading-relaxed text-white/75">
                  {summary.decisionDetail}
                </p>
              </SummaryCard>

              <SummaryCard title="Next Step" icon={FileSearch}>
                <p className="text-sm leading-relaxed text-white/70">
                  {summary.nextStep}
                </p>
              </SummaryCard>
            </motion.div>

            {!!claimState.decisionBreakdown.length && (
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.0, duration: 0.45 }}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"
              >
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/20">
                  Decision Breakdown
                </p>
                <div className="space-y-2">
                  {claimState.decisionBreakdown.slice(0, 4).map((line) => (
                    <div key={line} className="text-sm leading-relaxed text-white/70">
                      {line.startsWith("PASS:") && (
                        <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </span>
                      )}
                      {line.startsWith("FAIL:") && (
                        <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-400/10 text-red-400">
                          <XCircle className="h-3.5 w-3.5" />
                        </span>
                      )}
                      {line.startsWith("WARNING:") && (
                        <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-300/10 text-amber-300">
                          <AlertTriangle className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <span>{line.replace(/^(PASS|FAIL|WARNING):\s*/, "")}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {!!summary.warnings.length && (
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.08, duration: 0.45 }}
                className="rounded-2xl border border-amber-300/10 bg-amber-300/[0.04] p-4"
              >
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-200/60">
                  Warnings
                </p>
                <div className="space-y-2">
                  {summary.warnings.map((warning) => (
                    <div key={warning} className="flex gap-2 text-sm leading-relaxed text-white/65">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200/70" />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>

          {/* Quick prompts */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="flex flex-col gap-2"
          >
            <span className="mb-2 text-[9px] font-semibold uppercase tracking-[0.25em] text-white/10">
              Quick Actions
            </span>
            {OUTCOME_PROMPTS.map((p, i) => (
              <motion.button
                key={p.label}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.9 + i * 0.06, duration: 0.3 }}
                whileHover={{ x: -4 }}
                onClick={() => handlePromptClick(p.message)}
                className="group flex cursor-pointer items-center justify-end gap-2 rounded-full border border-white/[0.05] bg-white/[0.02] px-3.5 py-1.5 transition-all hover:border-[#C5961A]/20 hover:bg-[#C5961A]/5"
              >
                <span className="text-[11px] font-medium text-white/25 transition-colors group-hover:text-[#C5961A]/70">
                  {p.label}
                </span>
                <ArrowRight className="h-3 w-3 text-white/0 transition-all group-hover:text-[#C5961A]/50" />
              </motion.button>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
