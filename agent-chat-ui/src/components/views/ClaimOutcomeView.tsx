"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  FileSearch,
  HeartHandshake,
  XCircle,
} from "lucide-react";
import { ChatPanel } from "./shared/ChatPanel";
import { ChatInput, useSubmitMessage } from "./shared/ChatInput";
import { TopBar } from "./shared/TopBar";
import { useStreamContext } from "@/providers/Stream";
import { useClaimState } from "@/hooks/use-claim-state";

const OUTCOME_PROMPTS = [
  { label: "Payout breakdown", message: "Can you explain the payout breakdown in detail?" },
  { label: "Beneficiary splits", message: "How is the payout split between the beneficiaries?" },
  { label: "Email report", message: "Please email a copy of the claim report to me." },
  { label: "What happens next?", message: "What are the next steps after the claim decision?" },
];

interface ClaimOutcomeViewProps {
  policyNumber: string;
  policySubmitted: boolean;
  onPolicySubmitted: () => void;
  onHome: () => void;
  onNewThread: () => void;
}

function cleanBreakdownLine(line: string) {
  return line.replace(/^(PASS|FAIL|WARNING):\s*/, "").replace(/\s+—\s+/g, ": ");
}

function outcomeCopy(status: string | null) {
  if (status === "approved") {
    return {
      eyebrow: "Claim approved",
      title: "The claim can move to payout.",
      detail: "The evidence checks have passed and the payout step can begin.",
      badge: "Approved",
      tone: "good" as const,
      Icon: CheckCircle2,
    };
  }
  if (status === "accepted") {
    return {
      eyebrow: "Claim accepted",
      title: "The claim has passed intake.",
      detail: "It is ready for the next review step with the current information.",
      badge: "Accepted",
      tone: "good" as const,
      Icon: CheckCircle2,
    };
  }
  if (status === "denied") {
    return {
      eyebrow: "Claim reviewed",
      title: "The claim was not approved.",
      detail: "The current evidence does not meet the policy requirements for payout.",
      badge: "Declined",
      tone: "danger" as const,
      Icon: XCircle,
    };
  }
  return {
    eyebrow: "Claim in review",
    title: "One more item is needed.",
    detail: "The claim is open and waiting on the next piece of evidence before a final decision.",
    badge: "In review",
    tone: "info" as const,
    Icon: Clock3,
  };
}

function nextStepFromReason(reason: string) {
  const text = reason.toLowerCase();
  if (text.includes("post-mortem") || text.includes("post mortem")) {
    return "Upload the post-mortem report so the death review can be completed.";
  }
  if (text.includes("death certificate")) {
    return "Upload the certified death certificate so the death claim can be finalised.";
  }
  if (text.includes("second") || text.includes("independent")) {
    return "Upload the second independent assessment so the claim can return to decisioning.";
  }
  if (text.includes("pathology") || text.includes("staging")) {
    return "Upload the pathology or staging report so the diagnosis can be validated.";
  }
  if (text.includes("identity") || text.includes("id number")) {
    return "Provide clearer proof of the policyholder name and ID number.";
  }
  return "The care team will continue from the current claim record and evidence checks.";
}

function TimelineItem({
  title,
  detail,
  state,
}: {
  title: string;
  detail: string;
  state: "done" | "active" | "soon";
}) {
  return (
    <div className="grid grid-cols-[28px_1fr] gap-3">
      <div className="flex flex-col items-center">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full border-2"
          style={{
            background:
              state === "done" ? "var(--sl-primary)" : "var(--sl-surface)",
            borderColor:
              state === "soon" ? "var(--sl-line-2)" : "var(--sl-primary)",
            color: state === "done" ? "#fff" : "var(--sl-primary)",
            boxShadow:
              state === "active"
                ? "0 0 0 4px color-mix(in oklab, var(--sl-primary) 15%, transparent)"
                : "none",
          }}
        >
          {state === "done" ? <Check className="h-3.5 w-3.5" /> : null}
        </div>
        <div className="h-10 w-px bg-[var(--sl-line)] last:hidden" />
      </div>
      <div className="pb-4">
        <p className="text-sm font-semibold text-[var(--sl-ink)]">{title}</p>
        <p className="mt-0.5 text-xs text-[var(--sl-ink-3)]">{detail}</p>
      </div>
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
  const outcome = outcomeCopy(claimState.claimStatus);
  const reason =
    claimState.decisionReason ||
    claimState.decisionBreakdown.find((line) => line.startsWith("FAIL:")) ||
    "";
  const nextStep = nextStepFromReason(reason);
  const confirmed = claimState.decisionBreakdown
    .filter((line) => line.startsWith("PASS:"))
    .map(cleanBreakdownLine)
    .slice(0, 4);

  const handlePromptClick = (message: string) => {
    submitMessage(
      message,
      undefined,
      !policySubmitted ? policyNumber : undefined,
    );
    if (!policySubmitted) onPolicySubmitted();
  };

  const OutcomeIcon = outcome.Icon;

  return (
    <div className="sl-view-fade-in flex h-full flex-col overflow-hidden bg-[var(--sl-bg)]">
      <TopBar
        viewLabel="Claim outcome"
        onHome={onHome}
        onNewThread={onNewThread}
        rightContent={
          <div className="sl-pill">
            <span className="sl-mono font-semibold text-[var(--sl-primary-ink)]">
              {policyNumber}
            </span>
          </div>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_.9fr]">
        <motion.main
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
          className="sl-scroll relative min-h-0 overflow-y-auto border-r border-[var(--sl-line)] px-6 py-8 lg:px-10"
        >
          <div className="pointer-events-none absolute -right-28 top-12 h-64 w-64 rounded-full bg-[color-mix(in_oklab,var(--sl-primary)_6%,transparent)] blur-2xl" />
          <div className="relative mx-auto max-w-3xl space-y-6">
            <section>
              <div className="sl-eyebrow mb-3">{outcome.eyebrow}</div>
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[var(--sl-primary-soft)] text-[var(--sl-primary-ink)]">
                  <HeartHandshake className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="sl-h-display text-[38px] text-[var(--sl-ink)]">
                    {outcome.title}
                  </h1>
                  <p className="mt-2 text-[15px] leading-6 text-[var(--sl-ink-2)]">
                    {outcome.detail}
                  </p>
                </div>
              </div>
            </section>

            <section className="sl-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="sl-section-label">Reference</div>
                  <p className="sl-mono mt-1 text-lg font-semibold text-[var(--sl-ink)]">
                    {claimState.claimId
                      ? claimState.claimId.slice(0, 12).toUpperCase()
                      : "Claim pending"}
                  </p>
                </div>
                <span
                  className={
                    outcome.tone === "danger"
                      ? "sl-badge bg-[var(--sl-danger-soft)] text-[var(--sl-danger)]"
                      : outcome.tone === "good"
                        ? "sl-badge sl-badge-good"
                        : "sl-badge sl-badge-info"
                  }
                >
                  <OutcomeIcon className="h-3.5 w-3.5" />
                  {outcome.badge}
                </span>
              </div>

              <div className="mt-6">
                <TimelineItem
                  title="Claim submitted"
                  detail="The claim record is open"
                  state="done"
                />
                <TimelineItem
                  title="Initial review"
                  detail={claimState.steps.assessed ? "Eligibility checked" : "In progress"}
                  state={claimState.steps.assessed ? "done" : "active"}
                />
                <TimelineItem
                  title="Documents verified"
                  detail={
                    claimState.documentsReceived > 0
                      ? `${claimState.documentsReceived} document(s) recorded`
                      : "Waiting for documents"
                  }
                  state={
                    claimState.steps.documents
                      ? "done"
                      : claimState.steps.assessed
                        ? "active"
                        : "soon"
                  }
                />
                <TimelineItem
                  title="Decision and payout"
                  detail={claimState.payout ?? "After evidence review"}
                  state={claimState.steps.payout ? "done" : "soon"}
                />
              </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-2">
              <section
                className="sl-card relative overflow-hidden p-5"
                style={{
                  background:
                    "linear-gradient(180deg, color-mix(in oklab, var(--sl-primary) 3%, var(--sl-surface)) 0%, var(--sl-surface) 100%)",
                }}
              >
                <div className="pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full bg-[color-mix(in_oklab,var(--sl-primary)_6%,transparent)] blur-2xl" />
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[var(--sl-primary)]" />
                  <h2 className="text-sm font-semibold text-[var(--sl-ink)]">
                    What we confirmed
                  </h2>
                </div>
                {confirmed.length > 0 ? (
                  <ul className="space-y-2">
                    {confirmed.map((line) => (
                      <li
                        key={line}
                        className="text-sm leading-6 text-[var(--sl-ink-2)]"
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm leading-6 text-[var(--sl-ink-3)]">
                    The claim is ready for the next evidence review.
                  </p>
                )}
              </section>

              <section
                className="sl-card-soft relative overflow-hidden p-5"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in oklab, var(--sl-accent) 4%, var(--sl-surface-2)) 0%, var(--sl-surface-2) 100%)",
                }}
              >
                <div className="pointer-events-none absolute -left-14 -bottom-14 h-36 w-36 rounded-full bg-[color-mix(in_oklab,var(--sl-accent)_6%,transparent)] blur-2xl" />
                <div className="mb-3 flex items-center gap-2">
                  {outcome.tone === "danger" ? (
                    <XCircle className="h-4 w-4 text-[var(--sl-danger)]" />
                  ) : reason ? (
                    <AlertTriangle className="h-4 w-4 text-[#6F4810]" />
                  ) : (
                    <FileSearch className="h-4 w-4 text-[var(--sl-primary)]" />
                  )}
                  <h2 className="text-sm font-semibold text-[var(--sl-ink)]">
                    Next step
                  </h2>
                </div>
                <p className="text-sm leading-6 text-[var(--sl-ink-2)]">
                  {nextStep}
                </p>
              </section>
            </div>

            {!!claimState.decisionBreakdown.length && (
              <section className="sl-card p-5">
                <div className="sl-section-label mb-3">Decision breakdown</div>
                <div className="space-y-2">
                  {claimState.decisionBreakdown.slice(0, 6).map((line) => (
                    <p
                      key={line}
                      className="text-sm leading-6 text-[var(--sl-ink-2)]"
                    >
                      {cleanBreakdownLine(line)}
                    </p>
                  ))}
                </div>
              </section>
            )}
          </div>
        </motion.main>

        <aside className="flex min-h-0 flex-col bg-[color-mix(in_oklab,var(--sl-bg)_80%,var(--sl-surface))]">
          <div className="border-b border-[var(--sl-line)] px-6 py-4">
            <p className="text-sm font-medium text-[var(--sl-ink-2)]">
              You can ask about the decision, payout, or what happens next.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {OUTCOME_PROMPTS.slice(0, 3).map((prompt) => (
                <button
                  key={prompt.label}
                  type="button"
                  onClick={() => handlePromptClick(prompt.message)}
                  className="sl-chip"
                >
                  {prompt.label}
                  <ArrowRight className="h-3 w-3" />
                </button>
              ))}
            </div>
          </div>
          <ChatPanel
            className="min-h-0 flex-1"
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
        </aside>
      </div>
    </div>
  );
}
