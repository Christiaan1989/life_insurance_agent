import { useMemo } from "react";
import { Message } from "@langchain/langgraph-sdk";

export interface ClaimState {
  claimId: string | null;
  claimType: string | null;
  claimStatus: string | null;
  incidentDate: string | null;
  diagnosis: string | null;
  eligibility: string | null;
  payout: string | null;
  documentsReceived: number;
  decisionReason: string | null;
  warnings: string[];
  decisionBreakdown: string[];
  /** Which steps have been completed */
  steps: {
    created: boolean;
    assessed: boolean;
    documents: boolean;
    payout: boolean;
    decided: boolean;
    reported: boolean;
  };
}

const INITIAL_STATE: ClaimState = {
  claimId: null,
  claimType: null,
  claimStatus: null,
  incidentDate: null,
  diagnosis: null,
  eligibility: null,
  payout: null,
  documentsReceived: 0,
  decisionReason: null,
  warnings: [],
  decisionBreakdown: [],
  steps: {
    created: false,
    assessed: false,
    documents: false,
    payout: false,
    decided: false,
    reported: false,
  },
};

function safeParse(content: unknown): Record<string, unknown> | null {
  try {
    if (typeof content === "string") return JSON.parse(content);
    if (typeof content === "object" && content !== null)
      return content as Record<string, unknown>;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Parses claim-related tool messages from the stream to build
 * a real-time claim state object for display in the ClaimsView.
 */
export function useClaimState(messages: Message[]): ClaimState {
  return useMemo(() => {
    const state: ClaimState = { ...INITIAL_STATE, steps: { ...INITIAL_STATE.steps } };

    for (const msg of messages) {
      if (msg.type !== "tool") continue;
      const name = (msg as any).name as string | undefined;
      const data = safeParse(msg.content);
      if (!name || !data) continue;

      switch (name) {
        case "create_claim": {
          const claim = (data.claim ?? data) as Record<string, unknown>;
          if (claim.claim_id) state.claimId = String(claim.claim_id);
          if (claim.claim_type) state.claimType = String(claim.claim_type);
          if (claim.status) state.claimStatus = String(claim.status);
          if (claim.incident_date) state.incidentDate = String(claim.incident_date);
          state.steps.created = true;
          break;
        }
        case "check_eligibility": {
          if (data.overall_eligible !== undefined) {
            state.eligibility = data.overall_eligible ? "Eligible" : "Not eligible";
          }
          if (data.claim_type) state.claimType = String(data.claim_type);
          if (data.denial_reason) state.decisionReason = String(data.denial_reason);
          state.steps.assessed = true;
          break;
        }
        case "record_document": {
          state.documentsReceived += 1;
          state.steps.documents = true;
          break;
        }
        case "evaluate_claim_evidence": {
          if (data.recommended_status) {
            state.claimStatus = String(data.recommended_status);
          }
          if (data.reason) {
            state.decisionReason = String(data.reason);
          }
          if (Array.isArray(data.decision_breakdown)) {
            state.decisionBreakdown = data.decision_breakdown.map(String);
          }
          if (Array.isArray(data.warnings)) {
            state.warnings = data.warnings.map(String);
          }
          state.steps.documents = true;
          state.steps.decided = true;
          break;
        }
        case "calculate_payout": {
          if (data.payout_formatted) state.payout = String(data.payout_formatted);
          state.steps.payout = true;
          break;
        }
        case "update_claim": {
          const claim = (data.claim ?? data) as Record<string, unknown>;
          if (claim.status) state.claimStatus = String(claim.status);
          if (claim.decision_reason) state.decisionReason = String(claim.decision_reason);
          if (claim.claim_type) state.claimType = String(claim.claim_type);
          if (claim.incident_date) state.incidentDate = String(claim.incident_date);
          if (claim.diagnosis_description) state.diagnosis = String(claim.diagnosis_description);
          if (claim.payout_amount) {
            state.payout = `R${Number(claim.payout_amount).toLocaleString()}`;
          }
          state.steps.decided = true;
          break;
        }
        case "generate_claim_report": {
          state.steps.reported = true;
          break;
        }
      }
    }

    return state;
  }, [messages]);
}
