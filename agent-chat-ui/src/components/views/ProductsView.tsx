"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseMedical,
  HeartPulse,
  ShieldCheck,
  Stethoscope,
  Users,
  WalletCards,
} from "lucide-react";
import { TopBar } from "./shared/TopBar";
import { ChatInput, useSubmitMessage } from "./shared/ChatInput";
import { ChatPanel } from "./shared/ChatPanel";

const PRODUCTS = [
  {
    name: "Life Cover",
    shortName: "Death benefit",
    description:
      "A lump-sum benefit for nominated beneficiaries when the insured person passes away.",
    icon: HeartPulse,
    tone: "primary",
    highlights: [
      "Beneficiary payout",
      "Funeral rider available",
      "Accidental death rider available",
    ],
    evidence: "Certified death certificate; post-mortem report when required.",
    prompt: "Tell me about Sentinel Life Cover.",
  },
  {
    name: "Disability Cover",
    shortName: "Total permanent disability",
    description:
      "Protection when a serious condition leaves the insured person totally and permanently unable to work.",
    icon: ShieldCheck,
    tone: "accent",
    highlights: [
      "TPD benefit",
      "Premium waiver rider",
      "Specialist assessment review",
    ],
    evidence: "Specialist medical assessment confirming total and permanent disability.",
    prompt: "Tell me about Sentinel Disability Cover.",
  },
  {
    name: "Critical Illness Cover",
    shortName: "Final diagnosis benefit",
    description:
      "A lump-sum benefit for qualifying serious illnesses supported by specialist medical evidence.",
    icon: BriefcaseMedical,
    tone: "warning",
    highlights: [
      "Cancer, heart attack, stroke",
      "Specialist report required",
      "Pathology support for cancer",
    ],
    evidence: "Specialist report with final diagnosis and ICD-10 details.",
    prompt: "Tell me about Sentinel Critical Illness Cover.",
  },
] as const;

function ProductBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="sl-chip border-transparent bg-[var(--sl-surface-2)] text-[var(--sl-ink-2)]">
      <BadgeCheck className="h-3.5 w-3.5 text-[var(--sl-primary)]" />
      {children}
    </span>
  );
}

function toneStyle(tone: (typeof PRODUCTS)[number]["tone"]) {
  if (tone === "accent") {
    return {
      bg: "var(--sl-accent-soft)",
      color: "#6B2A11",
      border: "color-mix(in oklab, var(--sl-accent) 36%, transparent)",
    };
  }
  if (tone === "warning") {
    return {
      bg: "var(--sl-warning-soft)",
      color: "#6F4810",
      border: "color-mix(in oklab, var(--sl-warning) 36%, transparent)",
    };
  }
  return {
    bg: "var(--sl-primary-soft)",
    color: "var(--sl-primary-ink)",
    border: "color-mix(in oklab, var(--sl-primary) 28%, transparent)",
  };
}

function ProductCard({
  product,
  index,
  onAsk,
}: {
  product: (typeof PRODUCTS)[number];
  index: number;
  onAsk: (message: string) => void;
}) {
  const Icon = product.icon;
  const style = toneStyle(product.tone);

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 * index, duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
      className="sl-card flex min-h-[390px] flex-col overflow-hidden p-5"
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border"
          style={{ background: style.bg, color: style.color, borderColor: style.border }}
        >
          <Icon className="h-6 w-6" />
        </div>
        <span className="sl-badge" style={{ background: style.bg, color: style.color, borderColor: style.border }}>
          {product.shortName}
        </span>
      </div>

      <h2 className="sl-serif text-[26px] leading-tight text-[var(--sl-ink)]">
        {product.name}
      </h2>
      <p className="mt-3 min-h-[72px] text-[15px] leading-6 text-[var(--sl-ink-2)]">
        {product.description}
      </p>

      <div className="mt-5 space-y-2">
        {product.highlights.map((highlight) => (
          <ProductBadge key={highlight}>{highlight}</ProductBadge>
        ))}
      </div>

      <div className="mt-5 border-t border-[var(--sl-line)] pt-4">
        <div className="sl-section-label mb-2 text-[11px]">Claim evidence</div>
        <p className="text-sm leading-6 text-[var(--sl-ink-2)]">
          {product.evidence}
        </p>
      </div>

      <button
        type="button"
        onClick={() => onAsk(product.prompt)}
        className="sl-btn sl-btn-quiet mt-auto w-full"
      >
        Ask about this cover <ArrowRight className="h-4 w-4" />
      </button>
    </motion.article>
  );
}

interface ProductsViewProps {
  policyNumber: string;
  policySubmitted: boolean;
  onPolicySubmitted: () => void;
  onProductPromptSubmitted?: () => void;
  onHome: () => void;
  onNewThread: () => void;
}

export function ProductsView({
  policyNumber,
  policySubmitted,
  onPolicySubmitted,
  onProductPromptSubmitted,
  onHome,
  onNewThread,
}: ProductsViewProps) {
  const submitMessage = useSubmitMessage();

  const askAboutProduct = (message: string) => {
    onProductPromptSubmitted?.();
    submitMessage(
      `[PRODUCT_INFO] ${message}`,
      undefined,
      !policySubmitted ? policyNumber : undefined,
    );
    if (!policySubmitted) onPolicySubmitted();
  };

  return (
    <div className="sl-view-fade-in flex h-full flex-col overflow-hidden bg-[var(--sl-bg)]">
      <TopBar
        viewLabel="Products"
        onHome={onHome}
        onNewThread={onNewThread}
        rightContent={
          <div className="sl-pill">
            <WalletCards className="h-3.5 w-3.5 text-[var(--sl-primary)]" />
            Sentinel cover
          </div>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1.15fr_.85fr]">
        <motion.main
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
          className="sl-scroll min-h-0 overflow-y-auto border-r border-[var(--sl-line)] px-6 py-8 lg:px-10"
        >
          <div className="mx-auto max-w-6xl space-y-7">
            <section className="max-w-3xl">
              <div className="sl-eyebrow mb-3">Product information</div>
              <h1 className="sl-h-display text-[40px] leading-tight text-[var(--sl-ink)] lg:text-[48px]">
                Three ways Sentinel protects a life policy.
              </h1>
              <p className="mt-4 text-[16px] leading-7 text-[var(--sl-ink-2)]">
                The demo policy supports death, disability, and critical illness cover. Each product has its own evidence path and payout rules.
              </p>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
              {PRODUCTS.map((product, index) => (
                <ProductCard
                  key={product.name}
                  product={product}
                  index={index}
                  onAsk={askAboutProduct}
                />
              ))}
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              {[
                ["Policy fit", "Cover types are read from the active policy record before a claim can proceed."],
                ["Evidence led", "Every product asks for the document evidence needed for that claim type."],
                ["Decision ready", "Eligibility, exclusions, and payout calculations happen through the claim workflow."],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[14px] border border-[var(--sl-line)] bg-[var(--sl-surface-2)] p-4">
                  <div className="sl-section-label mb-2 text-[11px]">{label}</div>
                  <p className="text-sm leading-6 text-[var(--sl-ink-2)]">{value}</p>
                </div>
              ))}
            </section>
          </div>
        </motion.main>

        <aside className="flex min-h-0 flex-col bg-[color-mix(in_oklab,var(--sl-bg)_82%,var(--sl-surface))]">
          <div className="border-b border-[var(--sl-line)] px-5 py-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[var(--sl-primary-soft)] text-[var(--sl-primary-ink)]">
                <Stethoscope className="h-4 w-4" />
              </div>
              <div>
                <div className="sl-section-label text-[11px]">Coverage guide</div>
                <p className="text-sm font-semibold text-[var(--sl-ink)]">
                  Ask how cover applies to a real claim.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                "Which products are on my policy?",
                "What documents do I need for each product?",
                "How is payout calculated?",
              ].map((prompt) => (
                <button
                  key={prompt}
                  className="sl-chip"
                  onClick={() => askAboutProduct(prompt)}
                  type="button"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-[12px] bg-[var(--sl-surface)] px-3 py-2">
                <Users className="mb-1.5 h-4 w-4 text-[var(--sl-primary)]" />
                <div className="text-xs font-semibold text-[var(--sl-ink)]">
                  Beneficiaries
                </div>
              </div>
              <div className="rounded-[12px] bg-[var(--sl-surface)] px-3 py-2">
                <ShieldCheck className="mb-1.5 h-4 w-4 text-[var(--sl-primary)]" />
                <div className="text-xs font-semibold text-[var(--sl-ink)]">
                  Eligibility
                </div>
              </div>
              <div className="rounded-[12px] bg-[var(--sl-surface)] px-3 py-2">
                <WalletCards className="mb-1.5 h-4 w-4 text-[var(--sl-primary)]" />
                <div className="text-xs font-semibold text-[var(--sl-ink)]">
                  Payout
                </div>
              </div>
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
                  placeholder="Ask about a product..."
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
