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
      <div className="absolute inset-0 bg-[var(--sl-bg)]" />
      <div className="sl-blob -right-24 top-12 h-80 w-80 bg-[color-mix(in_oklab,var(--sl-primary)_18%,transparent)]" />
      <div className="sl-blob -left-28 bottom-8 h-72 w-72 bg-[color-mix(in_oklab,var(--sl-accent)_16%,transparent)]" />
      <div className="sl-dots absolute inset-0" />
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
          style={{ borderColor: color }}
          initial={{ width: 110, height: 110, opacity: 0 }}
          animate={{
            width: [110, 320 + i * 80],
            height: [110, 320 + i * 80],
            opacity: [0.16, 0],
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

      // Include the national ID in the [VERIFIED] message so the graph's
      // _extract_credentials / _subject_id_after_verified can find it without
      // asking the customer again mid-claim.
      const idPart = nationalId ? ` SA-ID:${nationalId}` : "";
      const continuation: Message = {
        id: `do-not-render-${uuidv4()}`,
        type: "human",
        content: `[VERIFIED] Customer ${customerName ?? ""} (policy ${pendingAuth.policy_id})${idPart} has completed identity verification.`,
      };

      const toolMessages = ensureToolCallsHaveResponses(stream.messages);

      stream.submit(
        { messages: [...toolMessages, continuation], customer_verified: true } as any,
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
    [nationalId, pendingAuth.policy_id, stream],
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
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden px-4">
      <AuthBackground />

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Sentinel Life wordmark */}
        <div className="sl-eyebrow mb-8 flex items-center justify-center gap-2">
          <span className="h-px w-6 bg-[var(--sl-line-2)]" />
          Sentinel Life
          <span className="h-px w-6 bg-[var(--sl-line-2)]" />
        </div>

        <div className="sl-card relative rounded-[var(--sl-r-xl)] p-8">
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
                  <PulseRings color="#1F8E64" />
                  <div className="absolute h-28 w-28 rounded-full bg-[var(--sl-primary-soft)] blur-3xl" />
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--sl-primary)_22%,transparent)] bg-[var(--sl-primary-soft)] shadow-[var(--sl-shadow-md)]">
                    <ShieldCheck className="h-9 w-9 text-[var(--sl-primary)]" />
                  </div>
                </div>

                <h1 className="sl-serif text-3xl font-semibold tracking-[-0.01em] text-[var(--sl-ink)]">
                  Verify it's really you
                </h1>
                <p className="mt-3 px-2 text-sm leading-relaxed text-[var(--sl-ink-2)]">
                  For your security, enter the South African ID number linked to{" "}
                  <span className="sl-mono text-[var(--sl-ink)]">
                    {pendingAuth.policy_id}
                  </span>
                  .
                </p>

                <div className="mt-7 w-full text-left">
                  <label className="sl-section-label">
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
                    className="sl-input sl-mono mt-2 h-12 w-full px-4 text-sm"
                  />
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="mt-4 flex w-full items-center gap-2 rounded-[var(--sl-r-md)] border border-[color-mix(in_oklab,var(--sl-danger)_24%,transparent)] bg-[var(--sl-danger-soft)] px-3 py-2.5 text-sm text-[var(--sl-danger)]"
                    >
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span className="text-left">{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  disabled={busy || nationalId.length !== 13}
                  className="sl-btn sl-btn-primary mt-7 flex w-full items-center justify-center gap-2 px-5 py-3.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
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
                  <PulseRings color="#1F8E64" />
                  <div className="absolute h-28 w-28 rounded-full bg-[var(--sl-primary-soft)] blur-3xl" />
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--sl-primary)_22%,transparent)] bg-[var(--sl-primary-soft)] shadow-[var(--sl-shadow-md)]">
                    <ShieldCheck className="h-9 w-9 text-[var(--sl-primary)]" />
                  </div>
                </div>

                <h1 className="sl-serif text-3xl font-semibold tracking-[-0.01em] text-[var(--sl-ink)]">
                  Verify it's really you
                </h1>
                <p className="mt-3 px-2 text-sm leading-relaxed text-[var(--sl-ink-2)]">
                  For your security, we need to confirm your identity{" "}
                  <span className="font-semibold text-[var(--sl-ink)]">{pendingAuth.reason}</span>.
                </p>

                <div className="mt-7 flex w-full items-center gap-3 rounded-[var(--sl-r-lg)] border border-[var(--sl-line)] bg-[var(--sl-surface-2)] p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sl-primary-soft)] ring-1 ring-[color-mix(in_oklab,var(--sl-primary)_18%,transparent)]">
                    <Mail className="h-5 w-5 text-[var(--sl-primary)]" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="sl-section-label">
                      Code sent to
                    </div>
                    <div className="sl-mono mt-0.5 text-sm text-[var(--sl-ink)]">
                      {maskedEmail}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setStage("code")}
                  className="sl-btn sl-btn-primary mt-7 flex w-full items-center justify-center gap-2 px-5 py-3.5 text-sm"
                >
                  Enter the code
                  <ArrowRight className="h-4 w-4" />
                </button>

                <p className="sl-section-label mt-5">
                  Policy{" "}
                  <span className="sl-mono text-[var(--sl-ink-2)]">
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
                  <div className="absolute h-20 w-20 rounded-full bg-[var(--sl-primary-soft)] blur-2xl" />
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--sl-primary)_22%,transparent)] bg-[var(--sl-primary-soft)]">
                    <Mail className="h-6 w-6 text-[var(--sl-primary)]" />
                  </div>
                </div>

                <h2 className="sl-serif text-3xl font-semibold tracking-[-0.01em] text-[var(--sl-ink)]">
                  Enter your code
                </h2>
                <p className="mt-3 text-sm text-[var(--sl-ink-2)]">
                  We sent a 6-digit code to{" "}
                  <span className="sl-mono text-[var(--sl-ink)]">{maskedEmail}</span>.
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
                      className="sl-input h-14 w-full text-center text-2xl font-semibold disabled:opacity-50"
                    />
                  ))}
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="mt-4 flex w-full items-center gap-2 rounded-[var(--sl-r-md)] border border-[color-mix(in_oklab,var(--sl-danger)_24%,transparent)] bg-[var(--sl-danger-soft)] px-3 py-2.5 text-sm text-[var(--sl-danger)]"
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
                  className="sl-btn sl-btn-primary mt-6 flex w-full items-center justify-center gap-2 px-5 py-3.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
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

                <div className="sl-mono mt-4 flex w-full items-center justify-between text-[11px] uppercase tracking-[0.16em] text-[var(--sl-ink-3)]">
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
                      className="text-[var(--sl-primary)] transition hover:text-[var(--sl-primary-2)] disabled:opacity-50"
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
                  <PulseRings color="#1F8E64" />
                  <div className="absolute h-28 w-28 rounded-full bg-[var(--sl-primary-soft)] blur-3xl" />
                  <motion.div
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 200, damping: 14 }}
                    className="relative flex h-20 w-20 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--sl-primary)_24%,transparent)] bg-[var(--sl-primary-soft)] shadow-[var(--sl-shadow-md)]"
                  >
                    <CheckCircle2 className="h-10 w-10 text-[var(--sl-primary)]" />
                  </motion.div>
                </div>
                <h2 className="sl-serif text-3xl font-semibold text-[var(--sl-ink)]">Verified</h2>
                <p className="mt-2 text-sm text-[var(--sl-ink-2)]">
                  Picking up where you left off…
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </motion.div>
    </div>
  );
}
