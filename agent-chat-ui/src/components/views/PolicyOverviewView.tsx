"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  Heart,
  Shield,
  Users,
  Wallet,
} from "lucide-react";
import { ChatPanel } from "./shared/ChatPanel";
import { ChatInput, useSubmitMessage } from "./shared/ChatInput";
import { TopBar } from "./shared/TopBar";
import { usePolicyDashboard } from "@/hooks/use-policy-dashboard";

const TOPICS: Array<{
  label: string;
  message: string;
  icon: typeof Heart;
  tone?: "accent";
}> = [
  { label: "Death claim", message: "I need to file a Death claim.", icon: Heart, tone: "accent" },
  { label: "Disability claim", message: "I need to file a Disability claim.", icon: Shield },
  { label: "Critical illness", message: "I need to file a Critical Illness claim.", icon: Shield },
  { label: "Beneficiaries", message: "Before we continue, who are the beneficiaries on my policy?", icon: Users },
  { label: "Benefit amounts", message: "Before we continue, what are the benefit amounts on my policy?", icon: Wallet },
] as const;

function PolicyPill({ policyNumber }: { policyNumber: string }) {
  return (
    <div className="sl-pill">
      <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--sl-ink-3)]">
        Policy
      </span>
      <span className="sl-mono font-semibold text-[var(--sl-primary-ink)]">
        {policyNumber}
      </span>
    </div>
  );
}

function FieldCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-[14px] border p-4"
      style={{
        background: accent ? "var(--sl-primary-soft)" : "var(--sl-surface)",
        borderColor: accent
          ? "color-mix(in oklab, var(--sl-primary) 25%, transparent)"
          : "var(--sl-line)",
      }}
    >
      <div className="sl-section-label mb-1.5 text-[11px]">{label}</div>
      <div
        className="text-base font-semibold"
        style={{ color: accent ? "var(--sl-primary-ink)" : "var(--sl-ink)" }}
      >
        {value}
      </div>
    </div>
  );
}

interface PolicyOverviewViewProps {
  policyNumber: string;
  policySubmitted: boolean;
  onPolicySubmitted: () => void;
  onHome: () => void;
  onNewThread: () => void;
}

export function PolicyOverviewView({
  policyNumber,
  policySubmitted,
  onPolicySubmitted,
  onHome,
  onNewThread,
}: PolicyOverviewViewProps) {
  const submitMessage = useSubmitMessage();
  const { data, loading, error } = usePolicyDashboard(policyNumber);
  const policy = data?.policy;

  const formatZAR = (amount?: number | null) =>
    amount === null || amount === undefined
      ? "-"
      : `R${Math.round(amount).toLocaleString()}`;

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-ZA", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const handleTopicClick = (message: string) => {
    submitMessage(
      message,
      undefined,
      !policySubmitted ? policyNumber : undefined,
    );
    if (!policySubmitted) onPolicySubmitted();
  };

  return (
    <div className="sl-view-fade-in flex h-full flex-col overflow-hidden bg-[var(--sl-bg)]">
      <TopBar
        viewLabel="Policy overview"
        onHome={onHome}
        onNewThread={onNewThread}
        rightContent={<PolicyPill policyNumber={policyNumber} />}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1.05fr_.95fr]">
        <motion.main
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
          className="sl-scroll min-h-0 overflow-y-auto border-r border-[var(--sl-line)] px-6 py-8 lg:px-10"
        >
          <div className="mx-auto max-w-3xl space-y-6">
            <section className="relative">
              <div className="sl-eyebrow mb-3">Your cover</div>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h1 className="sl-h-display text-[38px] leading-tight text-[var(--sl-ink)]">
                    {policy?.policy_type || "Policy details"}
                  </h1>
                  {policy?.cover_types && (
                    <p className="mt-2 text-[18px] font-medium leading-snug text-[var(--sl-primary-ink)]">
                      {policy.cover_types}
                    </p>
                  )}
                  <p className="mt-3 text-[15px] text-[var(--sl-ink-2)]">
                    Policy{" "}
                    <span className="sl-mono text-[var(--sl-primary-ink)]">
                      {policyNumber}
                    </span>
                    {policy?.start_date ? ` · Active since ${formatDate(policy.start_date)}` : ""}
                  </p>
                </div>
                <span className="sl-badge sl-badge-good shrink-0">
                  {policy?.policy_status || "Active"}
                </span>
              </div>
            </section>

            <section className="sl-card relative overflow-hidden p-5">
              <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-[color-mix(in_oklab,var(--sl-primary)_12%,transparent)] blur-2xl" />
              <div className="relative grid gap-3 sm:grid-cols-3">
                <FieldCard
                  label="Sum assured"
                  value={formatZAR(policy?.sum_assured)}
                  accent
                />
                <FieldCard
                  label="Monthly premium"
                  value={formatZAR(policy?.premium_amount)}
                />
                <FieldCard
                  label="Latest payment"
                  value={formatDate(policy?.recent_payments?.[0]?.payment_date)}
                />
              </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-2">
              <section className="sl-card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="sl-serif text-[22px] text-[var(--sl-ink)]">
                    Beneficiaries
                  </h2>
                  <Users className="h-5 w-5 text-[var(--sl-primary)]" />
                </div>
                {(policy?.beneficiaries ?? []).map((beneficiary) => (
                  <div
                    key={beneficiary.beneficiary_id}
                    className="flex items-center gap-3 border-t border-[var(--sl-line)] py-3 first:border-t-0"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--sl-surface-2)] text-xs font-semibold text-[var(--sl-ink-2)]">
                      {beneficiary.full_name.slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--sl-ink)]">
                        {beneficiary.full_name}
                      </p>
                      <p className="text-xs text-[var(--sl-ink-3)]">
                        {beneficiary.relationship_to_policyholder}
                      </p>
                    </div>
                    <span className="sl-mono text-xs font-semibold text-[var(--sl-primary-ink)]">
                      {beneficiary.percentage_share}%
                    </span>
                  </div>
                ))}
                {!loading && !policy?.beneficiaries?.length && (
                  <p className="text-sm text-[var(--sl-ink-3)]">
                    No beneficiaries are listed on this policy yet.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() =>
                    handleTopicClick("Who are the beneficiaries on my policy?")
                  }
                  className="sl-btn sl-btn-quiet mt-3"
                >
                  See beneficiaries
                </button>
              </section>

              <section className="sl-card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="sl-serif text-[22px] text-[var(--sl-ink)]">
                    What is covered
                  </h2>
                  <Shield className="h-5 w-5 text-[var(--sl-primary)]" />
                </div>
                {[
                  ["Policy type", policy?.policy_type || "-"],
                  ["Cover types", policy?.cover_types || "-"],
                  ["Disability benefit", formatZAR(policy?.disability_benefit)],
                  ["Critical illness benefit", formatZAR(policy?.critical_illness_benefit)],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-4 border-t border-[var(--sl-line)] py-3 first:border-t-0"
                  >
                    <span className="text-sm text-[var(--sl-ink-3)]">
                      {label}
                    </span>
                    <span className="text-right text-sm font-semibold text-[var(--sl-ink)]">
                      {value}
                    </span>
                  </div>
                ))}
              </section>
            </div>

            <section className="sl-card-soft flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-[var(--sl-ink)]">
                  Need to file something?
                </h2>
                <p className="mt-1 text-sm text-[var(--sl-ink-2)]">
                  I will walk you through it gently, one step at a time.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleTopicClick("I would like to file a claim")}
                className="sl-btn sl-btn-primary shrink-0"
              >
                File a claim <ArrowRight className="h-4 w-4" />
              </button>
            </section>

            <section>
              <div className="sl-section-label mb-3">Common next steps</div>
              <div className="flex flex-wrap gap-2">
                {TOPICS.map((topic) => {
                  const Icon = topic.icon;
                  return (
                    <button
                      key={topic.label}
                      type="button"
                      onClick={() => handleTopicClick(topic.message)}
                      className="sl-chip px-3 py-2"
                      style={{
                        background:
                          topic.tone === "accent"
                            ? "var(--sl-accent-soft)"
                            : "var(--sl-surface)",
                        borderColor:
                          topic.tone === "accent"
                            ? "color-mix(in oklab, var(--sl-accent) 35%, transparent)"
                            : "var(--sl-line)",
                      }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {topic.label}
                    </button>
                  );
                })}
              </div>
            </section>

            {error && (
              <section className="sl-card-soft p-5 text-sm text-[var(--sl-ink-2)]">
                I could not refresh the latest policy details just now: {error}
              </section>
            )}
          </div>
        </motion.main>

        <aside className="flex min-h-0 flex-col bg-[color-mix(in_oklab,var(--sl-bg)_80%,var(--sl-surface))]">
          <div className="border-b border-[var(--sl-line)] px-6 py-4">
            <p className="text-sm font-medium text-[var(--sl-ink-2)]">
              Here is your cover at a glance. Ask me about cover, premiums,
              beneficiaries, or payments.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["What is covered?", "Who are my beneficiaries?", "Show my recent payments"].map(
                (prompt) => (
                  <button
                    key={prompt}
                    className="sl-chip"
                    onClick={() => handleTopicClick(prompt)}
                    type="button"
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
                  policySubmitted={policySubmitted}
                  onPolicySubmitted={onPolicySubmitted}
                  placeholder="Choose a claim type, or ask about this policy..."
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
