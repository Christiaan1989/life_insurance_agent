"use client";

/**
 * AuthView — full-screen email-OTP identity verification for Sentinel Life.
 *
 * Mounted by the ViewRouter whenever the agent's last unresolved tool call is
 * `request_authentication`. The agent has already issued + emailed the first
 * OTP server-side, so `pendingAuth` carries `policy_id`, `masked_email`,
 * `reason`, and the `intended_view` to restore afterwards.
 *
 * Flow:
 *   1. Intro card — confirms which inbox the code went to, primary CTA reveals
 *      the digit inputs.
 *   2. Digit entry — six individual inputs with auto-advance + paste support.
 *      Posts to /auth/verify-otp on submit.
 *   3. Success — animated checkmark, then we drop a hidden `[VERIFIED]`
 *      message into the conversation so the agent resumes.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  KeyboardEvent,
  ClipboardEvent,
  FormEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  Mail,
  Loader2,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { Message } from "@langchain/langgraph-sdk";

import { useStreamContext } from "@/providers/Stream";
import { ensureToolCallsHaveResponses } from "@/lib/ensure-tool-responses";
import { requestOtp, verifyOtp } from "@/lib/auth-api";
import type { PendingAuth } from "@/hooks/use-active-view";

const CODE_LENGTH = 6;

function AuthBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[#030303]" />
      <div className="absolute top-[10%] left-1/2 -translate-x-1/2 h-[80%] w-[80%] bg-[radial-gradient(ellipse,rgba(197,150,26,0.08)_0%,transparent_60%)]" />
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.04]"
        viewBox="0 0 1200 800"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        <circle cx="600" cy="400" r="120" stroke="#C5961A" strokeWidth="0.8" />
        <circle cx="600" cy="400" r="200" stroke="#C5961A" strokeWidth="0.4" />
        <circle cx="600" cy="400" r="290" stroke="#C5961A" strokeWidth="0.8" />
        <circle cx="600" cy="400" r="380" stroke="#C5961A" strokeWidth="0.3" />
        <circle cx="600" cy="400" r="480" stroke="#C5961A" strokeWidth="0.5" />
        <line x1="600" y1="0" x2="600" y2="800" stroke="#C5961A" strokeWidth="0.3" />
        <line x1="0" y1="400" x2="1200" y2="400" stroke="#C5961A" strokeWidth="0.3" />
      </svg>
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.06]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.85)_100%)]" />
    </div>
  );
}

function PulseRings({ color }: { color: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border"
          style={{ borderColor: `${color}10` }}
          initial={{ width: 110, height: 110, opacity: 0 }}
          animate={{
            width: [110, 320 + i * 80],
            height: [110, 320 + i * 80],
            opacity: [0.5, 0],
          }}
          transition={{
            duration: 4,
            delay: i * 1.2,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}

interface AuthViewProps {
  pendingAuth: PendingAuth;
}

type Stage = "details" | "intro" | "code" | "success";

function initialStageFor(auth: PendingAuth): Stage {
  return auth.action === "collect_auth_details" ? "details" : "intro";
}

export function AuthView({ pendingAuth }: AuthViewProps) {
  const stream = useStreamContext();

  const [stage, setStage] = useState<Stage>(() => initialStageFor(pendingAuth));
  const [maskedEmail, setMaskedEmail] = useState(pendingAuth.masked_email ?? "");
  const [nationalId, setNationalId] = useState(pendingAuth.national_id ?? "");
  const [secondsLeft, setSecondsLeft] = useState(pendingAuth.expires_in_seconds);
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const submittedRef = useRef(false);

  useEffect(() => {
    setMaskedEmail(pendingAuth.masked_email ?? "");
    setNationalId(pendingAuth.national_id ?? "");
    setSecondsLeft(pendingAuth.expires_in_seconds);
    setDigits(Array(CODE_LENGTH).fill(""));
    setError(null);
    setStage(initialStageFor(pendingAuth));
    submittedRef.current = false;
  }, [pendingAuth]);

  useEffect(() => {
    if (stage !== "code") return;
    const interval = setInterval(
      () => setSecondsLeft((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(interval);
  }, [stage]);

  useEffect(() => {
    if (stage === "code") {
      const t = setTimeout(() => inputsRef.current[0]?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [stage]);

  // Auto-skip when backend is running in dev mode (no email sent)
  const isDevMode =
    pendingAuth.dev_mode || pendingAuth.masked_email === "dev***@localhost";
  useEffect(() => {
    if (!isDevMode) return;
    const t = setTimeout(() => {
      setStage("success");
      setTimeout(() => sendVerifiedMessage(null), 800);
    }, 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDevMode]);

  const code = useMemo(() => digits.join(""), [digits]);
  const codeComplete = code.length === CODE_LENGTH && !digits.includes("");

  const setDigit = (idx: number, value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 1);
    setDigits((prev) => {
      const next = [...prev];
      next[idx] = cleaned;
      return next;
    });
    if (cleaned && idx < CODE_LENGTH - 1) {
      inputsRef.current[idx + 1]?.focus();
    }
    if (error) setError(null);
  };

  const handleKeyDown = (idx: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    } else if (e.key === "ArrowLeft" && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    } else if (e.key === "ArrowRight" && idx < CODE_LENGTH - 1) {
      inputsRef.current[idx + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    e.preventDefault();
    const next = Array(CODE_LENGTH).fill("");
    for (let i = 0; i < Math.min(CODE_LENGTH, pasted.length); i++) {
      next[i] = pasted[i];
    }
    setDigits(next);
    const focusIdx = Math.min(CODE_LENGTH - 1, pasted.length);
    inputsRef.current[focusIdx]?.focus();
  };

  const sendVerifiedMessage = useCallback(
    (customerName: string | null) => {
      if (submittedRef.current) return;
      submittedRef.current = true;

      const continuation: Message = {
        id: `do-not-render-${uuidv4()}`,
        type: "human",
        content: `[VERIFIED] Customer ${customerName ?? ""} (policy ${pendingAuth.policy_id}) has completed identity verification.`,
      };

      const toolMessages = ensureToolCallsHaveResponses(stream.messages);

      stream.submit(
        { messages: [...toolMessages, continuation] },
        {
          streamMode: ["values"],
          streamSubgraphs: true,
          streamResumable: true,
          optimisticValues: (prev) => ({
            ...prev,
            messages: [...(prev.messages ?? []), ...toolMessages, continuation],
          }),
        },
      );
    },
    [pendingAuth.policy_id, stream],
  );

  const doVerify = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await verifyOtp(pendingAuth.policy_id, code);
      if (!result.verified) {
        setError(result.reason || "Incorrect code. Try again.");
        setDigits(Array(CODE_LENGTH).fill(""));
        setTimeout(() => inputsRef.current[0]?.focus(), 50);
        return;
      }
      setStage("success");
      setTimeout(
        () => sendVerifiedMessage(result.full_name ?? result.customer_name ?? null),
        1000,
      );
    } catch (e: any) {
      setError(e?.message || "Verification failed.");
    } finally {
      setBusy(false);
    }
  }, [busy, code, pendingAuth.policy_id, sendVerifiedMessage]);

  useEffect(() => {
    if (codeComplete && !busy && stage === "code") {
      void doVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeComplete]);

  const doResend = useCallback(async () => {
    const idForOtp = nationalId || pendingAuth.national_id;
    if (resending || !idForOtp) return;
    setResending(true);
    setError(null);
    try {
      const result = await requestOtp(pendingAuth.policy_id, idForOtp);
      setMaskedEmail(result.email_hint);
      setSecondsLeft(600);
      setDigits(Array(CODE_LENGTH).fill(""));
      setStage("code");
      setTimeout(() => inputsRef.current[0]?.focus(), 50);
    } catch (e: any) {
      setError(e?.message || "Couldn't send a new code.");
    } finally {
      setResending(false);
    }
  }, [nationalId, pendingAuth.policy_id, pendingAuth.national_id, resending]);

  const doRequestCode = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      const cleaned = nationalId.replace(/\D/g, "");
      if (cleaned.length !== 13) {
        setError("Enter the 13-digit South African ID number on the policy.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const result = await requestOtp(pendingAuth.policy_id, cleaned);
        setNationalId(cleaned);
        setMaskedEmail(result.email_hint);
        setSecondsLeft(600);
        setDigits(Array(CODE_LENGTH).fill(""));
        setStage("code");
        setTimeout(() => inputsRef.current[0]?.focus(), 80);
      } catch (e: any) {
        setError(e?.message || "Couldn't send the verification code.");
      } finally {
        setBusy(false);
      }
    },
    [nationalId, pendingAuth.policy_id],
  );

  const formatCountdown = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <AuthBackground />

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md px-6"
      >
        {/* Sentinel Life wordmark */}
        <div className="mb-8 flex items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-[0.4em] text-[#C5961A]/70">
          <span className="h-px w-6 bg-[#C5961A]/30" />
          Sentinel Life
          <span className="h-px w-6 bg-[#C5961A]/30" />
        </div>

        <div className="relative rounded-3xl border border-white/[0.08] bg-white/[0.02] p-8 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
          <AnimatePresence mode="wait">
            {stage === "details" && (
              <motion.form
                key="details"
                onSubmit={doRequestCode}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center text-center"
              >
                <div className="relative mb-6 flex h-28 w-28 items-center justify-center">
                  <PulseRings color="#C5961A" />
                  <div className="absolute h-28 w-28 rounded-full bg-[#C5961A]/10 blur-3xl" />
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-[#C5961A]/30 bg-gradient-to-br from-[#C5961A]/25 to-[#C5961A]/5 shadow-[0_0_60px_rgba(197,150,26,0.18)]">
                    <ShieldCheck className="h-9 w-9 text-[#C5961A]" />
                  </div>
                </div>

                <h1 className="text-2xl font-semibold tracking-tight text-white">
                  Verify it's really you
                </h1>
                <p className="mt-2 px-2 text-sm leading-relaxed text-white/55">
                  For your security, enter the South African ID number linked to{" "}
                  <span className="font-mono text-white/85">
                    {pendingAuth.policy_id}
                  </span>
                  .
                </p>

                <div className="mt-7 w-full text-left">
                  <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/35">
                    SA ID number
                  </label>
                  <input
                    value={nationalId}
                    onChange={(e) =>
                      setNationalId(e.target.value.replace(/\D/g, "").slice(0, 13))
                    }
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="13 digits"
                    className="mt-2 h-12 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 font-mono text-sm text-white outline-none transition placeholder:text-white/15 focus:border-[#C5961A]/50 focus:bg-white/[0.06] focus:shadow-[0_0_0_3px_rgba(197,150,26,0.15)]"
                  />
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="mt-4 flex w-full items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-3 py-2.5 text-sm text-red-300"
                    >
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span className="text-left">{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  disabled={busy || nationalId.length !== 13}
                  className="mt-7 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#C5961A] px-5 py-3.5 text-sm font-medium text-black shadow-lg transition hover:bg-[#d4a520] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending code...
                    </>
                  ) : (
                    <>
                      Send code
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </motion.form>
            )}

            {stage === "intro" && (
              <motion.div
                key="intro"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center text-center"
              >
                <div className="relative mb-6 flex h-28 w-28 items-center justify-center">
                  <PulseRings color="#C5961A" />
                  <div className="absolute h-28 w-28 rounded-full bg-[#C5961A]/10 blur-3xl" />
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-[#C5961A]/30 bg-gradient-to-br from-[#C5961A]/25 to-[#C5961A]/5 shadow-[0_0_60px_rgba(197,150,26,0.18)]">
                    <ShieldCheck className="h-9 w-9 text-[#C5961A]" />
                  </div>
                </div>

                <h1 className="text-2xl font-semibold tracking-tight text-white">
                  Verify it's really you
                </h1>
                <p className="mt-2 px-2 text-sm leading-relaxed text-white/55">
                  For your security, we need to confirm your identity{" "}
                  <span className="text-white/85">{pendingAuth.reason}</span>.
                </p>

                <div className="mt-7 flex w-full items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#C5961A]/10 ring-1 ring-[#C5961A]/20">
                    <Mail className="h-5 w-5 text-[#C5961A]" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40">
                      Code sent to
                    </div>
                    <div className="mt-0.5 font-mono text-sm text-white/90">
                      {maskedEmail}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setStage("code")}
                  className="mt-7 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#C5961A] px-5 py-3.5 text-sm font-medium text-black shadow-lg transition hover:bg-[#d4a520] hover:shadow-[0_0_30px_rgba(197,150,26,0.3)]"
                >
                  Enter the code
                  <ArrowRight className="h-4 w-4" />
                </button>

                <p className="mt-5 text-[10px] font-mono uppercase tracking-[0.3em] text-white/30">
                  Policy{" "}
                  <span className="text-white/60">
                    {pendingAuth.policy_id}
                  </span>
                </p>
              </motion.div>
            )}

            {stage === "code" && (
              <motion.div
                key="code"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center text-center"
              >
                <div className="relative mb-5 flex h-20 w-20 items-center justify-center">
                  <div className="absolute h-20 w-20 rounded-full bg-[#C5961A]/8 blur-2xl" />
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-[#C5961A]/30 bg-gradient-to-br from-[#C5961A]/20 to-[#C5961A]/5">
                    <Mail className="h-6 w-6 text-[#C5961A]" />
                  </div>
                </div>

                <h2 className="text-2xl font-semibold tracking-tight text-white">
                  Enter your code
                </h2>
                <p className="mt-2 text-sm text-white/55">
                  We sent a 6-digit code to{" "}
                  <span className="font-mono text-white/85">{maskedEmail}</span>.
                </p>

                <div className="mt-7 grid w-full grid-cols-6 gap-2">
                  {digits.map((d, i) => (
                    <input
                      key={i}
                      ref={(el) => { inputsRef.current[i] = el; }}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={1}
                      value={d}
                      onChange={(e) => setDigit(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      onPaste={handlePaste}
                      disabled={busy}
                      className="h-14 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] text-center text-2xl font-semibold text-white shadow-inner outline-none transition focus:border-[#C5961A]/50 focus:bg-white/[0.06] focus:shadow-[0_0_0_3px_rgba(197,150,26,0.15)] disabled:opacity-50"
                    />
                  ))}
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="mt-4 flex w-full items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-3 py-2.5 text-sm text-red-300"
                    >
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span className="text-left">{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="button"
                  disabled={!codeComplete || busy}
                  onClick={doVerify}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#C5961A] px-5 py-3.5 text-sm font-medium text-black shadow-lg transition hover:bg-[#d4a520] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verifying…
                    </>
                  ) : (
                    <>
                      Verify
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>

                <div className="mt-4 flex w-full items-center justify-between text-[11px] font-mono uppercase tracking-[0.2em] text-white/35">
                  <span>
                    {secondsLeft > 0
                      ? `Expires ${formatCountdown(secondsLeft)}`
                      : "Code expired"}
                  </span>
                  {(nationalId || pendingAuth.national_id) && (
                    <button
                      type="button"
                      onClick={doResend}
                      disabled={resending}
                      className="text-[#C5961A] transition hover:text-[#d4a520] disabled:opacity-50"
                    >
                      {resending ? "Sending…" : "Resend code"}
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {stage === "success" && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ duration: 0.35 }}
                className="flex flex-col items-center py-6 text-center"
              >
                <div className="relative mb-6 flex h-28 w-28 items-center justify-center">
                  <PulseRings color="#34d399" />
                  <div className="absolute h-28 w-28 rounded-full bg-emerald-400/15 blur-3xl" />
                  <motion.div
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 200, damping: 14 }}
                    className="relative flex h-20 w-20 items-center justify-center rounded-full border border-emerald-400/40 bg-gradient-to-br from-emerald-400/30 to-emerald-500/10 shadow-[0_0_60px_rgba(52,211,153,0.25)]"
                  >
                    <CheckCircle2 className="h-10 w-10 text-emerald-300" />
                  </motion.div>
                </div>
                <h2 className="text-2xl font-semibold text-white">Verified</h2>
                <p className="mt-2 text-sm text-white/55">
                  Picking up where you left off…
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Dev-mode skip — always shown, auto-fires when backend is in dev mode ── */}
        {stage !== "success" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.4 }}
            className="mt-6 flex justify-center"
          >
            <button
              onClick={() => {
                setStage("success");
                setTimeout(() => sendVerifiedMessage(null), 800);
              }}
              className="rounded-full border border-white/[0.06] bg-white/[0.02] px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest text-white/20 transition-all hover:border-amber-400/20 hover:text-amber-400/50 cursor-pointer"
            >
              ⚡ dev: skip verification
            </button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
