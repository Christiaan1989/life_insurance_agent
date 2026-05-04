"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  Clock,
  FileText,
  Heart,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { TopBar } from "./shared/TopBar";
import { ChatPanel } from "./shared/ChatPanel";
import { ChatInput, useSubmitMessage } from "./shared/ChatInput";
import {
  usePolicyDashboard,
  type ClaimSummary,
} from "@/hooks/use-policy-dashboard";

interface DashboardViewProps {
  policyNumber: string;
  onHome: () => void;
  onNewThread: () => void;
}

function formatZAR(amount: number | null): string {
  if (amount === null || amount === undefined) return "-";
  return `R${Math.round(amount).toLocaleString()}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StatCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: "primary" | "coral";
}) {
  return (
    <div
      className="rounded-[20px] border p-5 shadow-[var(--sl-shadow-sm)]"
      style={{
        background:
          accent === "primary"
            ? "var(--sl-primary-soft)"
            : accent === "coral"
              ? "var(--sl-accent-soft)"
              : "var(--sl-surface)",
        borderColor:
          accent === "primary"
            ? "color-mix(in oklab, var(--sl-primary) 25%, transparent)"
            : accent === "coral"
              ? "color-mix(in oklab, var(--sl-accent) 35%, transparent)"
              : "var(--sl-line)",
      }}
    >
      <div className="sl-section-label mb-2 text-[11px]">{label}</div>
      <p className="sl-serif text-[26px] text-[var(--sl-ink)]">{value}</p>
      <p className="mt-1 text-sm text-[var(--sl-ink-3)]">{detail}</p>
    </div>
  );
}

function ClaimSummaryCard({ claim }: { claim?: ClaimSummary }) {
  return (
    <section className="sl-card p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-[var(--sl-accent-soft)] text-[#6B2A11]">
          <Heart className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-[var(--sl-ink)]">
            {claim
              ? `${claim.claim_type} claim · ${claim.claim_id.slice(0, 8).toUpperCase()}`
              : "No open claim yet"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--sl-ink-2)]">
            {claim
              ? `Current status: ${claim.status.replace(/_/g, " ")}. Filed ${formatDate(claim.created_at)}.`
              : "When you file a claim, progress and next steps will appear here."}
          </p>
        </div>
        <span className="sl-badge sl-badge-info shrink-0">
          {claim ? claim.status.replace(/_/g, " ") : "Calm"}
        </span>
      </div>
      <div className="mt-5 flex gap-2">
        {(() => {
          // Map claim status -> how many of the 5 bars are filled.
          // Statuses come from sentinel_backend: intake | documents_pending |
          // under_review | pending_info | approved | denied
          const STATUS_STEPS: Record<string, number> = {
            intake: 1,
            documents_pending: 2,
            under_review: 3,
            pending_info: 3,
            approved: 5,
            denied: 5,
          };
          const filled = claim ? STATUS_STEPS[claim.status] ?? 1 : 0;
          const isTerminal =
            claim?.status === "approved" || claim?.status === "denied";
          const isAttention = claim?.status === "pending_info";
          const accent = isTerminal
            ? claim?.status === "approved"
              ? "var(--sl-primary)"
              : "var(--sl-accent)"
            : isAttention
              ? "var(--sl-accent)"
              : "var(--sl-primary)";
          return [0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-1.5 flex-1 rounded-full transition-colors"
              style={{
                background:
                  i < filled - 1
                    ? accent
                    : i === filled - 1
                      ? isTerminal
                        ? accent
                        : "var(--sl-primary-2)"
                      : "var(--sl-surface-2)",
              }}
            />
          ));
        })()}
      </div>
    </section>
  );
}

export function DashboardView({
  policyNumber,
  onHome,
  onNewThread,
}: DashboardViewProps) {
  const { data, loading, error, refresh } = usePolicyDashboard(policyNumber);
  const submitMessage = useSubmitMessage();

  const policy = data?.policy;
  const stats = data?.stats;
  const claims = stats?.recent_claims ?? [];
  const openClaim = claims[0];
  const coverAmount = policy?.sum_assured
    ? formatZAR(policy.sum_assured)
    : "R0";
  const premium = policy?.premium_amount
    ? formatZAR(policy.premium_amount)
    : "-";

  const quickAction = (message: string) => submitMessage(message, undefined, policyNumber);

  return (
    <div className="sl-view-fade-in flex h-full flex-col overflow-hidden bg-[var(--sl-bg)]">
      <TopBar
        viewLabel="Your dashboard"
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

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1.05fr_.95fr]">
        <motion.main
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
          className="sl-scroll min-h-0 overflow-y-auto border-r border-[var(--sl-line)] px-6 py-8 lg:px-10"
        >
          <div className="mx-auto max-w-4xl space-y-6">
            <section>
              <div className="sl-eyebrow mb-3">Your space</div>
              <h1 className="sl-h-display text-[34px] text-[var(--sl-ink)]">
                Welcome back.
              </h1>
              <p className="mt-2 text-[15px] text-[var(--sl-ink-2)]">
                {openClaim
                  ? "One claim is in progress, and your cover is still visible here."
                  : "Everything looks calm. Your cover and recent activity are below."}
              </p>
            </section>

            {loading && !data && (
              <div className="grid gap-4 md:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-32 animate-pulse rounded-[20px] bg-[var(--sl-surface-2)]"
                  />
                ))}
              </div>
            )}

            {error && !data && (
              <section className="sl-card-soft flex flex-col items-center gap-3 p-8 text-center">
                <ShieldAlert className="h-10 w-10 text-[var(--sl-danger)]" />
                <p className="text-sm text-[var(--sl-ink-2)]">{error}</p>
                <button className="sl-btn sl-btn-quiet" onClick={refresh}>
                  <RefreshCw className="h-4 w-4" />
                  Try again
                </button>
              </section>
            )}

            {data && policy && (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <StatCard
                    label="Active cover"
                    value={coverAmount}
                    detail={policy.policy_type}
                    accent="primary"
                  />
                  <StatCard
                    label="Open claim"
                    value={openClaim ? openClaim.claim_id.slice(0, 8).toUpperCase() : "None"}
                    detail={openClaim ? openClaim.status.replace(/_/g, " ") : "No active claim"}
                    accent={openClaim ? "coral" : undefined}
                  />
                  <StatCard
                    label="Next premium"
                    value={premium}
                    detail={policy.premium_frequency}
                  />
                </div>

                <ClaimSummaryCard claim={openClaim} />

                <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
                  <section className="sl-card p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-base font-semibold text-[var(--sl-ink)]">
                        Recent payments
                      </h2>
                      <Wallet className="h-5 w-5 text-[var(--sl-primary)]" />
                    </div>
                    {(policy.recent_payments ?? []).slice(0, 3).map((payment) => (
                      <div
                        key={payment.payment_id}
                        className="flex items-center justify-between gap-4 border-t border-[var(--sl-line)] py-3 first:border-t-0"
                      >
                        <div>
                          <p className="text-sm font-semibold text-[var(--sl-ink)]">
                            Premium · {formatDate(payment.payment_date)}
                          </p>
                          <p className="text-xs text-[var(--sl-ink-3)]">
                            {payment.payment_status}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="sl-mono text-sm font-semibold text-[var(--sl-ink)]">
                            {formatZAR(payment.amount)}
                          </p>
                          <span className="sl-badge sl-badge-good mt-1">
                            Paid
                          </span>
                        </div>
                      </div>
                    ))}
                  </section>

                  <section className="sl-card-soft p-5">
                    <h2 className="mb-3 text-base font-semibold text-[var(--sl-ink)]">
                      Quick actions
                    </h2>
                    {[
                      ["View policy", "Show me my policy details", ShieldCheck],
                      ["File a claim", "I would like to file a claim", FileText],
                      ["Update beneficiaries", "I would like to update my beneficiaries", Heart],
                      ["Status of my claim", "What is the status of my claim?", Clock],
                    ].map(([label, message, Icon]) => {
                      const ActionIcon = Icon as typeof ShieldCheck;
                      return (
                        <button
                          key={label as string}
                          type="button"
                          onClick={() => quickAction(message as string)}
                          className="mb-2 flex w-full items-center justify-between rounded-[14px] border border-[var(--sl-line)] bg-[var(--sl-surface)] px-3 py-2.5 text-left text-sm font-medium text-[var(--sl-ink-2)] transition-colors hover:border-[var(--sl-primary)] hover:text-[var(--sl-ink)]"
                        >
                          <span className="flex items-center gap-2">
                            <ActionIcon className="h-4 w-4" />
                            {label as string}
                          </span>
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      );
                    })}
                  </section>
                </div>
              </>
            )}
          </div>
        </motion.main>

        <aside className="flex min-h-0 flex-col bg-[color-mix(in_oklab,var(--sl-bg)_80%,var(--sl-surface))]">
          <div className="border-b border-[var(--sl-line)] px-6 py-4">
            <p className="text-sm font-medium text-[var(--sl-ink-2)]">
              Welcome back. I can summarise your policy, claim status, or recent
              payments.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["Show my policy", "Status of my claim", "Update my card"].map(
                (prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => quickAction(prompt)}
                    className="sl-chip"
                  >
                    {prompt}
                  </button>
                ),
              )}
            </div>
          </div>
          <ChatPanel
            className="min-h-0 flex-1"
            footer={
              <div className="w-full px-4 pb-4">
                <ChatInput
                  policyNumber={policyNumber}
                  placeholder="Ask about your dashboard..."
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
