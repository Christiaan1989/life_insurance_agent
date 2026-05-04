import { useMemo } from "react";
import { Message } from "@langchain/langgraph-sdk";

export type ViewType =
  | "home"
  | "policy_overview"
  | "payments"
  | "claims"
  | "claim_outcome"
  | "dashboard"
  | "auth";

/**
 * Auth payload extracted from the most recent `request_authentication` tool
 * result that hasn't yet been resolved with a `[VERIFIED] ...` user message.
 */
export interface PendingAuth {
  action: "request_auth" | "collect_auth_details";
  policy_id: string;
  national_id?: string;
  masked_email?: string;
  expires_in_seconds: number;
  reason: string;
  intended_view: string;
  dev_mode?: boolean;
}

/** Convert any LangGraph message content (string | block[]) to plain text. */
function messageText(msg: Message): string {
  const c = (msg as any).content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((b) => (typeof b === "string" ? b : (b?.text ?? "")))
      .join("");
  }
  return "";
}

function parseToolJson(msg: Message): any | null {
  const text = messageText(msg);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeView(view: unknown): ViewType | null {
  if (view === "document_upload") return "claims";
  if (
    view === "home" ||
    view === "policy_overview" ||
    view === "payments" ||
    view === "claims" ||
    view === "claim_outcome" ||
    view === "dashboard" ||
    view === "auth"
  ) {
    return view;
  }
  return null;
}

function isTerminalClaimStatus(status: unknown): boolean {
  return status === "accepted" || status === "approved" || status === "denied" || status === "pending_info";
}

/**
 * Walks the conversation backwards looking for an unresolved
 * `request_authentication` tool result. "Unresolved" means: no `[VERIFIED]`
 * marker appears anywhere AFTER the auth tool message.
 */
export function usePendingAuth(messages: Message[]): PendingAuth | null {
  return useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.type !== "tool") continue;
      if ((msg as any).name !== "request_authentication") continue;

      const data = parseToolJson(msg);
      const isAuthAction =
        data?.action === "request_auth" ||
        data?.action === "collect_auth_details";
      if (!isAuthAction || !data.policy_id) continue;

      // Has any later message resolved this with [VERIFIED]?
      let resolved = false;
      for (let j = i + 1; j < messages.length; j++) {
        if (messageText(messages[j]).includes("[VERIFIED]")) {
          resolved = true;
          break;
        }
      }
      if (resolved) return null;

      return {
        action: data.action,
        policy_id: data.policy_id,
        national_id: data.national_id,
        masked_email: data.masked_email,
        expires_in_seconds: data.expires_in_seconds ?? 600,
        reason: data.reason ?? "to access your account",
        intended_view: data.intended_view ?? "home",
        dev_mode: Boolean(data.dev_mode),
      } as PendingAuth;
    }
    return null;
  }, [messages]);
}

/**
 * Scans the message stream for the active view. Auth has highest priority:
 * if there's an unresolved `request_authentication` tool result, the view is
 * always "auth". Otherwise we fall back to the most recent `set_active_view`
 * tool result. If messages exist but no set_active_view has fired yet, stay on
 * "home" so the UI does not jump into claim intake before auth/triage gates.
 */
export function useActiveView(messages: Message[]): ViewType {
  const pendingAuth = usePendingAuth(messages);

  return useMemo(() => {
    if (pendingAuth) return "auth";

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.type === "tool" && (msg as any).name === "set_active_view") {
        const content = parseToolJson(msg);
        if (content?.active_view) {
          const normalized = normalizeView(content.active_view);
          if (normalized) return normalized;
        }
      }
      if (msg.type === "tool" && (msg as any).name === "update_claim") {
        const content = parseToolJson(msg);
        const claim = content?.claim ?? content;
        if (isTerminalClaimStatus(claim?.status)) {
          return "claim_outcome";
        }
      }
      if (msg.type === "tool" && (msg as any).name === "evaluate_claim_evidence") {
        const content = parseToolJson(msg);
        if (isTerminalClaimStatus(content?.recommended_status)) {
          return "claim_outcome";
        }
      }
    }
    return "home";
  }, [messages, pendingAuth]);
}
