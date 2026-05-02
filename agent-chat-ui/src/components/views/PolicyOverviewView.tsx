"use client";

import { motion } from "framer-motion";
import { Home, SquarePen, ArrowRight } from "lucide-react";
import { ChatPanel } from "./shared/ChatPanel";
import { ChatInput, useSubmitMessage } from "./shared/ChatInput";
import { VoiceNav } from "./shared/VoiceNav";
import { TTSToggle } from "./shared/TTSToggle";

// ---------------------------------------------------------------------------
// Claim-type chips with messages
// ---------------------------------------------------------------------------
const TOPICS = [
  { label: "Death Claim", message: "I need to file a Death claim." },
  { label: "Disability Claim", message: "I need to file a Disability claim." },
  { label: "Critical Illness", message: "I need to file a Critical Illness claim." },
  { label: "Beneficiaries", message: "Before we continue, who are the beneficiaries on my policy?" },
  { label: "Benefit Amounts", message: "Before we continue, what are the benefit amounts on my policy?" },
];

// ---------------------------------------------------------------------------
// Background — flowing horizontal wave curves
// ---------------------------------------------------------------------------
function WaveBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[#030303]" />

      {/* Warm glow from left side */}
      <div className="absolute -left-[15%] top-[5%] h-[90%] w-[55%] bg-[radial-gradient(ellipse_at_30%_50%,rgba(197,150,26,0.05)_0%,transparent_60%)]" />

      {/* Subtle glow from right */}
      <div className="absolute -right-[10%] bottom-[10%] h-[50%] w-[40%] bg-[radial-gradient(ellipse,rgba(197,150,26,0.02)_0%,transparent_60%)]" />

      {/* Flowing wave SVG */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.035]"
        viewBox="0 0 1200 800"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Organic flowing curves — horizontal, calm, editorial */}
        <path d="M-100,120 Q200,80 450,130 T900,100 T1300,140" stroke="#C5961A" strokeWidth="1.2" />
        <path d="M-100,180 Q250,150 500,190 T950,160 T1300,200" stroke="#C5961A" strokeWidth="0.5" />

        <path d="M-100,320 Q200,280 500,330 T950,300 T1300,340" stroke="#C5961A" strokeWidth="1" />
        <path d="M-100,380 Q300,350 550,390 T1000,360 T1300,400" stroke="#C5961A" strokeWidth="0.4" />

        <path d="M-100,520 Q250,490 500,530 T900,500 T1300,540" stroke="#C5961A" strokeWidth="0.8" />
        <path d="M-100,580 Q200,550 450,580 T950,560 T1300,590" stroke="#C5961A" strokeWidth="0.4" />

        <path d="M-100,700 Q300,670 550,710 T1000,680 T1300,720" stroke="#C5961A" strokeWidth="0.6" />
      </svg>

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_50%,transparent_30%,rgba(0,0,0,0.7)_100%)]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// PolicyOverviewView — The Editorial
// ---------------------------------------------------------------------------
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

  const handleTopicClick = (message: string) => {
    submitMessage(
      message,
      undefined,
      !policySubmitted ? policyNumber : undefined,
    );
    if (!policySubmitted) onPolicySubmitted();
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <WaveBackground />

      {/* ─── Minimal top nav ─── */}
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
            Policy Overview
          </span>
        </div>

        <button
          onClick={onNewThread}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-white/20 hover:text-white/50 hover:bg-white/5 transition-all"
        >
          <SquarePen className="h-4 w-4" />
        </button>
      </div>

      {/* ─── Main: Editorial split ─── */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
        {/* LEFT PANEL — Massive typography (hidden on small screens) */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="hidden lg:flex w-[38%] xl:w-[35%] flex-col justify-between px-10 xl:px-14 py-8"
        >
          {/* Heading */}
          <div>
            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="text-[clamp(3.5rem,7vw,7rem)] font-black leading-[0.85] tracking-tighter text-white"
            >
              POLICY
            </motion.h1>
            <motion.h2
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="text-[clamp(3.5rem,7vw,7rem)] font-black leading-[0.85] tracking-tighter text-[#C5961A]/25"
            >
              DETAILS.
            </motion.h2>

            {/* Accent line */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="mt-8 h-px w-16 origin-left bg-gradient-to-r from-[#C5961A]/50 to-transparent"
            />

            {/* Description */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="mt-6 max-w-xs text-sm leading-relaxed text-white/20"
            >
              Review your policy, then choose the type of life insurance
              claim you need to file.
            </motion.p>
          </div>

          {/* Topic chips — bottom of left panel */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="flex flex-col gap-2"
          >
            <span className="mb-2 text-[9px] font-semibold uppercase tracking-[0.25em] text-white/10">
              Claim Type
            </span>
            <div className="flex flex-wrap gap-2">
              {TOPICS.map((topic, i) => (
                <motion.button
                  key={topic.label}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.9 + i * 0.06, duration: 0.3 }}
                  whileHover={{ x: 4 }}
                  onClick={() => handleTopicClick(topic.message)}
                  className="group flex cursor-pointer items-center gap-2 rounded-full border border-white/[0.05] bg-white/[0.02] px-3.5 py-1.5 transition-all hover:border-[#C5961A]/20 hover:bg-[#C5961A]/5"
                >
                  <span className="text-[11px] font-medium text-white/25 transition-colors group-hover:text-[#C5961A]/70">
                    {topic.label}
                  </span>
                  <ArrowRight className="h-3 w-3 text-white/0 transition-all group-hover:text-[#C5961A]/50" />
                </motion.button>
              ))}
            </div>
          </motion.div>
        </motion.div>

        {/* Vertical separator (desktop) */}
        <div className="hidden lg:block w-px bg-gradient-to-b from-transparent via-white/[0.04] to-transparent" />

        {/* RIGHT PANEL — Chat */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
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
                  placeholder="Choose a claim type, or ask about this policy..."
                  showFileUpload={false}
                  showToolCallsToggle={true}
                />
              </div>
            }
          />
        </motion.div>
      </div>
    </div>
  );
}
