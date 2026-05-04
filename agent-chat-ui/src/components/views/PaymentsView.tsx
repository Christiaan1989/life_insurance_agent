"use client";

import { motion } from "framer-motion";
import { ArrowRight, CalendarDays, CreditCard, Receipt, Wallet } from "lucide-react";
import { TopBar } from "./shared/TopBar";
import { ChatPanel } from "./shared/ChatPanel";
import { ChatInput, useSubmitMessage } from "./shared/ChatInput";
import { usePolicyDashboard } from "@/hooks/use-policy-dashboard";

interface PaymentsViewProps {
  policyNumber: string;
  policySubmitted: boolean;
  onPolicySubmitted: () => void;
  onHome: () => void;
  onNewThread: () => void;
}

function formatZAR(amount?: number | null): string {
  if (amount === null || amount === undefined) return "-";
  return `R${Math.round(amount).toLocaleString()}`;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function PaymentStat({
  label,
  value,
  detail,
  tone = "primary",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "primary" | "accent" | "surface";
}) {
  const background =
    tone === "primary"
      ? "var(--sl-primary-soft)"
      : tone === "accent"
        ? "var(--sl-accent-soft)"
        : "var(--sl-surface)";

  const borderColor =
    tone === "primary"
      ? "color-mix(in oklab, var(--sl-primary) 24%, transparent)"
      : tone === "accent"
        ? "color-mix(in oklab, var(--sl-accent) 32%, transparent)"
        : "var(--sl-line)";

  return (
    <div
      className="rounded-[20px] border p-5 shadow-[var(--sl-shadow-sm)]"
      style={{ background, borderColor }}
    >
      <div className="sl-section-label mb-2 text-[11px]">{label}</div>
      <p className="sl-serif text-[26px] text-[var(--sl-ink)]">{value}</p>
      <p className="mt-1 text-sm text-[var(--sl-ink-3)]">{detail}</p>
    </div>
  );
}

export function PaymentsView({
  policyNumber,
  policySubmitted,
  onPolicySubmitted,
  onHome,
  onNewThread,
}: PaymentsViewProps) {
  const { data, loading, error } = usePolicyDashboard(policyNumber);
  const submitMessage = useSubmitMessage();

  const policy = data?.policy;
  const payments = policy?.recent_payments ?? [];
  const paidCount = payments.filter((payment) => payment.payment_status === "Paid").length;
  const latestPayment = payments[0];
  const latestAmount = latestPayment?.amount ?? policy?.premium_amount;

  const ask = (message: string) => {
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
        viewLabel="Payments"
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
              <div className="sl-eyebrow mb-3">Payments</div>
              <h1 className="sl-h-display text-[34px] text-[var(--sl-ink)]">
                Recent premium activity.
              </h1>
              <p className="mt-2 text-[15px] text-[var(--sl-ink-2)]">
                This view only opens when you explicitly ask for payment history, so it stays focused on billing rather than claim flow.
              </p>
            </section>

            <div className="grid gap-4 md:grid-cols-3">
              <PaymentStat
                label="Latest premium"
                value={formatZAR(latestAmount)}
                detail={latestPayment ? formatDate(latestPayment.payment_date) : "No recent payment recorded"}
                tone="primary"
              />
              <PaymentStat
                label="Paid on record"
                value={String(paidCount)}
                detail="Recent successful payments"
                tone="surface"
              />
              <PaymentStat
                label="Billing frequency"
                value={policy?.premium_frequency || "-"}
                detail={policy?.policy_type || "Policy"}
                tone="accent"
              />
            </div>

            <section className="sl-card overflow-hidden p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-[var(--sl-ink)]">
                    Payment history
                  </h2>
                  <p className="mt-1 text-sm text-[var(--sl-ink-3)]">
                    Last recorded premium payments for this policy.
                  </p>
                </div>
                <Wallet className="h-5 w-5 text-[var(--sl-primary)]" />
              </div>

              <div className="space-y-3">
                {loading && !policy && (
                  <div className="space-y-3">
                    {[0, 1, 2].map((index) => (
                      <div
                        key={index}
                        className="h-20 animate-pulse rounded-[16px] bg-[var(--sl-surface-2)]"
                      />
                    ))}
                  </div>
                )}

                {!loading && !payments.length && (
                  <div className="rounded-[16px] border border-[var(--sl-line)] bg-[var(--sl-surface)] p-5 text-sm text-[var(--sl-ink-3)]">
                    No payment records are available for this policy yet.
                  </div>
                )}

                {payments.map((payment) => {
                  const paid = payment.payment_status === "Paid";
                  return (
                    <div
                      key={payment.payment_id}
                      className="grid gap-3 rounded-[18px] border p-4 md:grid-cols-[1.1fr_.8fr_.6fr]"
                      style={{
                        background: paid ? "var(--sl-surface)" : "var(--sl-accent-soft)",
                        borderColor: paid
                          ? "var(--sl-line)"
                          : "color-mix(in oklab, var(--sl-accent) 28%, transparent)",
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-[14px] bg-[var(--sl-surface-2)] text-[var(--sl-primary)]">
                          <Receipt className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[var(--sl-ink)]">
                            Premium payment
                          </p>
                          <p className="sl-mono mt-1 text-xs text-[var(--sl-ink-3)]">
                            {payment.payment_id}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-[var(--sl-ink-2)]">
                        <CalendarDays className="h-4 w-4 text-[var(--sl-primary)]" />
                        {formatDate(payment.payment_date)}
                      </div>

                      <div className="flex items-center justify-between gap-3 md:justify-end">
                        <div className="text-right">
                          <p className="sl-mono text-sm font-semibold text-[var(--sl-ink)]">
                            {formatZAR(payment.amount)}
                          </p>
                          <span className={`sl-badge mt-1 ${paid ? "sl-badge-good" : ""}`}>
                            <CreditCard className="h-3.5 w-3.5" />
                            {payment.payment_status}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {error && (
              <section className="sl-card-soft p-5 text-sm text-[var(--sl-ink-2)]">
                I could not refresh the latest payment history just now: {error}
              </section>
            )}
          </div>
        </motion.main>

        <aside className="flex min-h-0 flex-col bg-[color-mix(in_oklab,var(--sl-bg)_80%,var(--sl-surface))]">
          <div className="border-b border-[var(--sl-line)] px-6 py-4">
            <p className="text-sm font-medium text-[var(--sl-ink-2)]">
              Ask about missed payments, premium amounts, or how recent billing affects claim eligibility.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                "Have all my premiums been paid?",
                "What is my monthly premium?",
                "Does my payment history affect a claim?",
              ].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => ask(prompt)}
                  className="sl-chip"
                >
                  {prompt}
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
                  placeholder="Ask about premiums or payment history..."
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
