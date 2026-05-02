/**
 * Client for the Sentinel Life backend OTP / authentication endpoints.
 *
 * The agent triggers verification by calling `request_authentication` — which
 * already issues + emails the first OTP server-side. The frontend reads the
 * tool result (via `usePendingAuth`) and only needs to:
 *
 *   - call {@link verifyOtp} once the user submits the 6-digit code, OR
 *   - call {@link requestOtp} to resend a fresh code.
 */

const API_BASE =
  process.env.NEXT_PUBLIC_INSURANCE_API_URL || "http://localhost:8001";
const API_KEY =
  process.env.NEXT_PUBLIC_INSURANCE_API_KEY || "sentinel-api-key-2025";

export interface OtpRequestResponse {
  message: string;
  email_hint: string;
}

export interface OtpVerifyResponse {
  verified: boolean;
  full_name?: string | null;
  customer_name?: string | null;
  policyholder_id?: string | null;
  reason?: string | null;
  message?: string | null;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data?.detail) detail = data.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export function requestOtp(
  policyId: string,
  nationalId: string,
): Promise<OtpRequestResponse> {
  return postJson<OtpRequestResponse>("/auth/request-otp", {
    policy_id: policyId,
    national_id: nationalId,
  });
}

export function verifyOtp(
  policyId: string,
  code: string,
): Promise<OtpVerifyResponse> {
  return postJson<OtpVerifyResponse>("/auth/verify-otp", {
    policy_id: policyId,
    code,
  });
}
