import { FALLBACK_REPORTS } from "../data/fallbackAuraReports";
import { AuraReport } from "../types";
import { supabase } from "./supabaseClient";

const ANALYZE_TIMEOUT_MS = 30000;
const DEMO_MODE = false;
const ANALYZE_URL = process.env.EXPO_PUBLIC_AURA_ANALYZE_URL ?? "";
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function hasAuraAnalysisEndpoint() {
  return ANALYZE_URL.length > 0;
}

function isAuraTrait(value: unknown): value is AuraReport["traits"][number] {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { label?: unknown }).label === "string" &&
    typeof (value as { value?: unknown }).value === "number"
  );
}

function isAuraReport(value: unknown): value is AuraReport {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<AuraReport>;

  return (
    typeof candidate.subject === "string" &&
    typeof candidate.aura_color === "string" &&
    typeof candidate.vibe_score === "number" &&
    typeof candidate.threat_level === "string" &&
    Array.isArray(candidate.traits) &&
    candidate.traits.every(isAuraTrait) &&
    typeof candidate.verdict === "string" &&
    typeof candidate.recommendation === "string"
  );
}

function pickFallbackReport(): AuraReport {
  const index = Math.floor(Math.random() * FALLBACK_REPORTS.length);
  return FALLBACK_REPORTS[index] ?? FALLBACK_REPORTS[0];
}

function normalizeAuraReport(payload: unknown): AuraReport {
  if (isAuraReport(payload)) {
    return payload;
  }

  if (typeof payload === "object" && payload !== null) {
    const nested =
      (payload as { report?: unknown; data?: { report?: unknown } }).report ??
      (payload as { data?: { report?: unknown } }).data?.report;

    if (isAuraReport(nested)) {
      return nested;
    }
  }

  throw new Error("Aura analysis returned an unexpected payload.");
}

async function fetchWithTimeout(base64: string): Promise<AuraReport> {
  if (!ANALYZE_URL) {
    throw new Error("Aura analysis URL is not configured.");
  }

  if (!ANON_KEY) {
    throw new Error("Supabase anon key is not configured.");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Sign in required to analyze an aura.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

  try {
    const response = await fetch(ANALYZE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: ANON_KEY,
      },
      body: JSON.stringify({ imageBase64: base64 }),
      signal: controller.signal,
    });

    if (response.status === 401) {
      throw new Error("Sign in required to analyze an aura.");
    }

    if (!response.ok) {
      throw new Error(`Aura analysis failed with status ${response.status}.`);
    }

    const json = await response.json();
    return normalizeAuraReport(json);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function analyzeAura(base64: string): Promise<AuraReport> {
  try {
    if (DEMO_MODE) {
      return pickFallbackReport();
    }

    return await fetchWithTimeout(base64);
  } catch (error) {
    console.warn("Aura analysis fallback engaged:", error);
    return pickFallbackReport();
  }
}
