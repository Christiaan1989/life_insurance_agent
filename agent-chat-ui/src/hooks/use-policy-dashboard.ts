"use client";

import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types matching Sentinel Life API schemas
// ---------------------------------------------------------------------------
export interface Policyholder {
  policyholder_id: string;
  full_name: string;
  date_of_birth: string;
  national_id: string;
  gender: string;
  email: string;
  phone: string;
  address: string;
  employment_status: string;
}

export interface Beneficiary {
  beneficiary_id: string;
  full_name: string;
  relationship_to_policyholder: string;
  percentage_share: number;
  is_primary: boolean;
}

export interface Rider {
  rider_id: string;
  rider_type: string;
  cover_amount: number;
  monthly_premium: number;
  is_active: boolean;
}

export interface Payment {
  payment_id: string;
  payment_date: string;
  amount: number;
  payment_status: string;
}

export interface Policy {
  policy_id: string;
  policy_type: string;
  cover_types: string;
  sum_assured: number;
  disability_benefit: number;
  critical_illness_benefit: number;
  premium_amount: number;
  premium_frequency: string;
  start_date: string;
  end_date: string;
  policy_status: string;
  policyholder: Policyholder;
  beneficiaries: Beneficiary[];
  riders: Rider[];
  recent_payments: Payment[];
}

export interface ClaimSummary {
  claim_id: string;
  claim_type: string;
  status: string;
  filed_by_name: string | null;
  incident_date: string | null;
  payout_amount: number | null;
  created_at: string;
}

export interface DashboardStats {
  total_claims: number;
  approved_count: number;
  denied_count: number;
  pending_count: number;
  approval_rate: number;
  total_payout_approved: number;
  recent_claims: ClaimSummary[];
}

export interface PolicyDashboardData {
  policy: Policy;
  stats: DashboardStats;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
const API_BASE =
  process.env.NEXT_PUBLIC_INSURANCE_API_URL || "http://localhost:8001";
const API_KEY =
  process.env.NEXT_PUBLIC_INSURANCE_API_KEY || "sentinel-api-key-2025";

const headers = { "X-API-Key": API_KEY };

async function fetchPolicyDashboard(
  policyNumber: string
): Promise<PolicyDashboardData> {
  const [policyRes, statsRes] = await Promise.all([
    fetch(`${API_BASE}/policies/${policyNumber}`, {
      headers,
      cache: "no-store",
    }),
    fetch(`${API_BASE}/dashboard`, { headers, cache: "no-store" }),
  ]);

  if (!policyRes.ok) {
    throw new Error(`Policy fetch failed (${policyRes.status})`);
  }
  if (!statsRes.ok) {
    throw new Error(`Dashboard fetch failed (${statsRes.status})`);
  }

  const policy: Policy = await policyRes.json();
  const stats: DashboardStats = await statsRes.json();

  return { policy, stats };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function usePolicyDashboard(policyNumber: string) {
  const [data, setData] = useState<PolicyDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!policyNumber?.trim()) {
      setLoading(false);
      setError("No policy number provided");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const d = await fetchPolicyDashboard(policyNumber.trim());
      setData(d);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [policyNumber]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, refresh: load };
}
