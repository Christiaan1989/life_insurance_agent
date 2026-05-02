"use client";

import { motion } from "framer-motion";
import {
  Home,
  SquarePen,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  FileText,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  CircleDot,
} from "lucide-react";
import { VoiceNav } from "./shared/VoiceNav";
import { TTSToggle } from "./shared/TTSToggle";
import {
  usePolicyDashboard,
  type ClaimSummary,
} from "@/hooks/use-policy-dashboard";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Background — constellation / node network (connected data metaphor)
// ---------------------------------------------------------------------------
function ConstellationBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[#030303]" />

      {/* Central warm glow */}
      <div className="absolute top-[15%] left-[40%] h-[70%] w-[50%] bg-[radial-gradient(ellipse,rgba(197,150,26,0.04)_0%,transparent_55%)]" />

      {/* Secondary glow bottom-left */}
      <div className="absolute -bottom-[10%] -left-[5%] h-[40%] w-[30%] bg-[radial-gradient(ellipse,rgba(197,150,26,0.03)_0%,transparent_55%)]" />

      {/* Constellation SVG — nodes connected by lines */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.03]"
        viewBox="0 0 1200 800"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Primary nodes */}
        <circle cx="200" cy="150" r="4" fill="#C5961A" opacity="0.6" />
        <circle cx="450" cy="100" r="3" fill="#C5961A" opacity="0.5" />
        <circle cx="700" cy="180" r="5" fill="#C5961A" opacity="0.6" />
        <circle cx="950" cy="120" r="3.5" fill="#C5961A" opacity="0.5" />
        <circle cx="300" cy="350" r="4.5" fill="#C5961A" opacity="0.6" />
        <circle cx="600" cy="400" r="6" fill="#C5961A" opacity="0.7" />
        <circle cx="850" cy="320" r="3.5" fill="#C5961A" opacity="0.5" />
        <circle cx="1050" cy="400" r="4" fill="#C5961A" opacity="0.5" />
        <circle cx="150" cy="550" r="3" fill="#C5961A" opacity="0.4" />
        <circle cx="400" cy="600" r="4" fill="#C5961A" opacity="0.5" />
        <circle cx="650" cy="650" r="3.5" fill="#C5961A" opacity="0.5" />
        <circle cx="900" cy="580" r="4.5" fill="#C5961A" opacity="0.6" />
        <circle cx="1100" cy="650" r="3" fill="#C5961A" opacity="0.4" />

        {/* Connection lines */}
        <line x1="200" y1="150" x2="450" y2="100" stroke="#C5961A" strokeWidth="0.4" />
        <line x1="450" y1="100" x2="700" y2="180" stroke="#C5961A" strokeWidth="0.5" />
        <line x1="700" y1="180" x2="950" y2="120" stroke="#C5961A" strokeWidth="0.3" />
        <line x1="200" y1="150" x2="300" y2="350" stroke="#C5961A" strokeWidth="0.5" />
        <line x1="300" y1="350" x2="600" y2="400" stroke="#C5961A" strokeWidth="0.6" />
        <line x1="600" y1="400" x2="850" y2="320" stroke="#C5961A" strokeWidth="0.4" />
        <line x1="850" y1="320" x2="1050" y2="400" stroke="#C5961A" strokeWidth="0.5" />
        <line x1="450" y1="100" x2="600" y2="400" stroke="#C5961A" strokeWidth="0.3" />
        <line x1="700" y1="180" x2="600" y2="400" stroke="#C5961A" strokeWidth="0.4" />
        <line x1="700" y1="180" x2="850" y2="320" stroke="#C5961A" strokeWidth="0.3" />
        <line x1="150" y1="550" x2="300" y2="350" stroke="#C5961A" strokeWidth="0.3" />
        <line x1="150" y1="550" x2="400" y2="600" stroke="#C5961A" strokeWidth="0.4" />
        <line x1="400" y1="600" x2="600" y2="400" stroke="#C5961A" strokeWidth="0.3" />
        <line x1="400" y1="600" x2="650" y2="650" stroke="#C5961A" strokeWidth="0.5" />
        <line x1="650" y1="650" x2="900" y2="580" stroke="#C5961A" strokeWidth="0.4" />
        <line x1="900" y1="580" x2="1050" y2="400" stroke="#C5961A" strokeWidth="0.3" />
        <line x1="900" y1="580" x2="1100" y2="650" stroke="#C5961A" strokeWidth="0.4" />
        <line x1="950" y1="120" x2="1050" y2="400" stroke="#C5961A" strokeWidth="0.3" />

        {/* Subtle secondary connections (lighter) */}
        <line x1="200" y1="150" x2="600" y2="400" stroke="#C5961A" strokeWidth="0.15" />
        <line x1="300" y1="350" x2="650" y2="650" stroke="#C5961A" strokeWidth="0.15" />
        <line x1="850" y1="320" x2="900" y2="580" stroke="#C5961A" strokeWidth="0.2" />

        {/* Decorative small dots along lines */}
        <circle cx="325" cy="125" r="1.5" fill="#C5961A" opacity="0.25" />
        <circle cx="575" cy="140" r="1.5" fill="#C5961A" opacity="0.25" />
        <circle cx="450" cy="375" r="1.5" fill="#C5961A" opacity="0.25" />
        <circle cx="725" cy="360" r="1.5" fill="#C5961A" opacity="0.25" />
        <circle cx="525" cy="525" r="1.5" fill="#C5961A" opacity="0.2" />
        <circle cx="775" cy="615" r="1.5" fill="#C5961A" opacity="0.2" />
      </svg>

      {/* Grid */}
      <div className="absolute inset-0 bg-grid-pattern opacity-5" />

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_45%_40%,transparent_25%,rgba(0,0,0,0.8)_100%)]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function statusColor(status: string): string {
  switch (status.toLowerCase()) {
    case "active":
      return "text-emerald-400 bg-emerald-400/10 border-emerald-400/20";
    case "accepted":
      return "text-emerald-400 bg-emerald-400/10 border-emerald-400/20";
    case "denied":
      return "text-red-400 bg-red-400/10 border-red-400/20";
    case "escalated":
      return "text-amber-400 bg-amber-400/10 border-amber-400/20";
    case "needs_info":
      return "text-blue-400 bg-blue-400/10 border-blue-400/20";
    case "intake":
      return "text-white/50 bg-white/5 border-white/10";
    case "lapsed":
    case "cancelled":
      return "text-red-400 bg-red-400/10 border-red-400/20";
    default:
      return "text-white/40 bg-white/5 border-white/10";
  }
}

function statusIcon(status: string) {
  switch (status.toLowerCase()) {
    case "active":
    case "accepted":
      return <CheckCircle2 className="h-3.5 w-3.5" />;
    case "denied":
    case "cancelled":
      return <XCircle className="h-3.5 w-3.5" />;
    case "escalated":
      return <AlertTriangle className="h-3.5 w-3.5" />;
    case "needs_info":
      return <Clock className="h-3.5 w-3.5" />;
    case "lapsed":
      return <ShieldAlert className="h-3.5 w-3.5" />;
    default:
      return <CircleDot className="h-3.5 w-3.5" />;
  }
}

function severityBadge(severity: string | null) {
  if (!severity) return null;
  const colors: Record<string, string> = {
    minor: "text-emerald-400/70 bg-emerald-400/5 border-emerald-400/15",
    moderate: "text-amber-400/70 bg-amber-400/5 border-amber-400/15",
    severe: "text-red-400/70 bg-red-400/5 border-red-400/15",
  };
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
        colors[severity] ?? "text-white/30 bg-white/5 border-white/10",
      )}
    >
      {severity}
    </span>
  );
}

function formatZAR(amount: number | null): string {
  if (amount === null || amount === undefined) return "—";
  return `R${Math.round(amount).toLocaleString()}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysRemaining(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
}

// ---------------------------------------------------------------------------
// Stat card component
// ---------------------------------------------------------------------------
function StatCard({
  label,
  value,
  icon,
  delay,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-2 rounded-2xl border border-white/[0.04] bg-white/[0.02] p-4"
    >
      <div className="flex items-center gap-2 text-white/30">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-[0.2em]">
          {label}
        </span>
      </div>
      <span className="text-2xl font-black tracking-tight text-white">
        {value}
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Cover type card (Sentinel Life)
// ---------------------------------------------------------------------------
function CoverTypeCard({ name, index }: { name: string; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 + index * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="group flex items-center gap-3 rounded-2xl border border-white/[0.04] bg-white/[0.02] p-4 transition-all hover:border-[#C5961A]/10 hover:bg-[#C5961A]/[0.02]"
    >
      <ShieldCheck className="h-4 w-4 shrink-0 text-[#C5961A]/40" />
      <span className="text-sm font-bold text-white/90">{name.trim()}</span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Claim row component
// ---------------------------------------------------------------------------
function ClaimRow({ claim, index }: { claim: ClaimSummary; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -15 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.6 + index * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-4 rounded-xl border border-white/[0.03] bg-white/[0.01] px-4 py-3 transition-all hover:border-white/[0.06] hover:bg-white/[0.02]"
    >
      {/* Claim ID */}
      <div className="w-28 shrink-0">
        <span className="text-xs font-mono font-semibold text-[#C5961A]/60">
          {claim.claim_id.slice(0, 8).toUpperCase()}
        </span>
      </div>

      {/* Status badge */}
      <div className="w-28 shrink-0">
        <span className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
          statusColor(claim.status),
        )}>
          {statusIcon(claim.status)}
          {claim.status.replace(/_/g, " ")}
        </span>
      </div>

      {/* Claim type */}
      <div className="w-28 shrink-0">
        <span className="text-xs text-white/45">{claim.claim_type}</span>
      </div>

      {/* Payout */}
      <div className="w-24 shrink-0 text-right">
        <span className="text-xs font-semibold text-white/55">
          {claim.payout_amount ? formatZAR(claim.payout_amount) : "—"}
        </span>
      </div>

      {/* Date */}
      <div className="flex-1 text-right">
        <span className="text-[11px] text-white/35">
          {formatDate(claim.created_at)}
        </span>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function DashboardSkeleton() {
  return (
    <div className="space-y-6 p-8">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl border border-white/[0.04] bg-white/[0.02]"
          />
        ))}
      </div>
      {/* Coverage cards */}
      <div className="h-6 w-32 animate-pulse rounded-lg bg-white/[0.03]" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl border border-white/[0.04] bg-white/[0.02]"
          />
        ))}
      </div>
      {/* Claims */}
      <div className="h-6 w-36 animate-pulse rounded-lg bg-white/[0.03]" />
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-xl border border-white/[0.03] bg-white/[0.01]"
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------
function DashboardError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <ShieldX className="h-12 w-12 text-red-400/30" />
      <p className="text-sm text-white/40">{message}</p>
      <button
        onClick={onRetry}
        className="flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/60 transition-all hover:border-[#C5961A]/20 hover:text-white/80"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Try again
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DashboardView — The Ledger
// ---------------------------------------------------------------------------
interface DashboardViewProps {
  policyNumber: string;
  onHome: () => void;
  onNewThread: () => void;
}

export function DashboardView({
  policyNumber,
  onHome,
  onNewThread,
}: DashboardViewProps) {
  const { data, loading, error, refresh } = usePolicyDashboard(policyNumber);

  const policy = data?.policy;
  const stats = data?.stats;
  const claims = stats?.recent_claims ?? [];

  // Computed stats
  const totalClaims = stats?.total_claims ?? 0;
  const coverTypes = policy?.cover_types
    ? policy.cover_types.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const totalPayouts = stats?.total_payout_approved ?? 0;
  const policyDaysLeft = policy ? daysRemaining(policy.end_date) : 0;

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <ConstellationBackground />

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
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/30">
            My Policy
          </span>
        </div>

        <button
          onClick={onNewThread}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-white/20 hover:text-white/50 hover:bg-white/5 transition-all"
        >
          <SquarePen className="h-4 w-4" />
        </button>
      </div>

      {/* ─── Header band ─── */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 border-b border-white/[0.04] px-8 pb-5 pt-1"
      >
        <div className="flex items-end gap-6">
          <div className="shrink-0">
            <h1 className="text-[clamp(2rem,5vw,4rem)] font-black leading-[0.9] tracking-tighter text-white">
              MY
            </h1>
            <h2 className="text-[clamp(2rem,5vw,4rem)] font-black leading-[0.9] tracking-tighter text-[#C5961A]/25">
              DASHBOARD.
            </h2>
          </div>

          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mb-3 h-px flex-1 max-w-xs origin-left bg-gradient-to-r from-[#C5961A]/30 to-transparent"
          />

          {policy && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.4 }}
              className="mb-2 hidden md:flex items-center gap-3"
            >
              <span className="text-xs font-mono text-[#C5961A]/50">
                {policy.policy_id}
              </span>
              <span className="text-[10px] text-white/25">•</span>
              <span className="text-xs text-white/40">
                {policy.policyholder.full_name}
              </span>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* ─── Scrollable content ─── */}
      <div className="relative z-10 flex-1 overflow-y-auto px-8 py-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-track]:bg-transparent">
        {loading && !data && <DashboardSkeleton />}

        {error && !data && (
          <DashboardError message={error} onRetry={refresh} />
        )}

        {data && policy && (
          <div className="mx-auto max-w-5xl space-y-8">
            {/* ── KPI stat cards ── */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard
                label="Policy Status"
                value={policy.policy_status.toUpperCase()}
                icon={
                  policy.policy_status === "Active" ? (
                    <ShieldCheck className="h-4 w-4" />
                  ) : (
                    <ShieldAlert className="h-4 w-4" />
                  )
                }
                delay={0.1}
              />
              <StatCard
                label="Total Claims"
                value={totalClaims}
                icon={<FileText className="h-4 w-4" />}
                delay={0.15}
              />
              <StatCard
                label="Cover Types"
                value={coverTypes.length}
                icon={<Shield className="h-4 w-4" />}
                delay={0.2}
              />
              <StatCard
                label="Total Payouts"
                value={totalPayouts > 0 ? formatZAR(totalPayouts) : "—"}
                icon={<TrendingUp className="h-4 w-4" />}
                delay={0.25}
              />
            </div>

            {/* Policy period indicator */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="flex items-center gap-4 rounded-xl border border-white/[0.03] bg-white/[0.01] px-5 py-3"
            >
              <Clock className="h-4 w-4 text-white/25" />
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs text-white/35">
                  <span>{formatDate(policy.start_date)}</span>
                  <span>{formatDate(policy.end_date)}</span>
                </div>
                <div className="mt-1.5 h-1 w-full rounded-full bg-white/[0.04] overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width: `${Math.max(
                        2,
                        Math.min(
                          100,
                          100 -
                            (policyDaysLeft /
                              Math.max(
                                1,
                                (new Date(policy.end_date).getTime() -
                                  new Date(policy.start_date).getTime()) /
                                  86400000,
                              )) *
                              100,
                        ),
                      )}%`,
                    }}
                    transition={{ delay: 0.5, duration: 0.8, ease: "easeOut" }}
                    className="h-full rounded-full bg-gradient-to-r from-[#C5961A]/40 to-[#C5961A]/20"
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-white/30">
                  {policyDaysLeft > 0
                    ? `${policyDaysLeft} days remaining`
                    : "Policy expired"}
                </p>
              </div>
            </motion.div>

            {/* ── Coverage cards ── */}
            <div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35, duration: 0.4 }}
                className="mb-3 flex items-center gap-2"
              >
                <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-white/30">
                  Cover Types
                </span>
                <div className="h-px flex-1 bg-white/[0.03]" />
              </motion.div>

              {coverTypes.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {coverTypes.map((name, i) => (
                    <CoverTypeCard key={name} name={name} index={i} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-white/30">No cover types on this policy.</p>
              )}
            </div>

            {/* ── Claims history ── */}
            <div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.4 }}
                className="mb-3 flex items-center gap-2"
              >
                <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-white/30">
                  Claims History
                </span>
                <div className="h-px flex-1 bg-white/[0.03]" />
                {claims.length > 0 && (
                  <span className="text-[10px] font-medium text-white/25">
                    {claims.length} claim{claims.length !== 1 ? "s" : ""}
                  </span>
                )}
              </motion.div>

              {claims.length > 0 ? (
                <div className="space-y-2">
                  {/* Column headers */}
                  <div className="flex items-center gap-4 px-4 py-1">
                    <span className="w-28 shrink-0 text-[9px] font-semibold uppercase tracking-wider text-white/25">
                      Claim ID
                    </span>
                    <span className="w-28 shrink-0 text-[9px] font-semibold uppercase tracking-wider text-white/25">
                      Status
                    </span>
                    <span className="w-28 shrink-0 text-[9px] font-semibold uppercase tracking-wider text-white/25">
                      Type
                    </span>
                    <span className="w-24 shrink-0 text-right text-[9px] font-semibold uppercase tracking-wider text-white/25">
                      Payout
                    </span>
                    <span className="flex-1 text-right text-[9px] font-semibold uppercase tracking-wider text-white/25">
                      Filed
                    </span>
                  </div>

                  {claims.map((claim, i) => (
                    <ClaimRow key={claim.claim_id} claim={claim} index={i} />
                  ))}
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6, duration: 0.4 }}
                  className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/[0.06] py-12"
                >
                  <FileText className="h-8 w-8 text-white/15" />
                  <p className="text-sm text-white/30">
                    No claims filed yet
                  </p>
                  <p className="text-[11px] text-white/20">
                    Claims will appear here once filed
                  </p>
                </motion.div>
              )}
            </div>

            {/* Bottom spacer */}
            <div className="h-4" />
          </div>
        )}
      </div>
    </div>
  );
}
