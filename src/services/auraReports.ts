import { FALLBACK_REPORTS } from "../data/fallbackAuraReports";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import { AuraReport, SavedAuraReport } from "../types";

let fallbackReports = FALLBACK_REPORTS.map((report, index) =>
  toSavedReport(report, index),
);

function toSavedReport(report: AuraReport, index: number): SavedAuraReport {
  const createdAt = new Date(Date.now() - index * 86400000).toISOString();

  return {
    ...report,
    id: `fallback-${index + 1}`,
    created_at: createdAt,
    is_favorite: index === 0,
  };
}

function isSavedAuraReport(value: unknown): value is SavedAuraReport {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<SavedAuraReport>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.created_at === "string" &&
    typeof candidate.is_favorite === "boolean" &&
    typeof candidate.subject === "string" &&
    typeof candidate.aura_color === "string" &&
    typeof candidate.vibe_score === "number" &&
    typeof candidate.threat_level === "string" &&
    Array.isArray(candidate.traits) &&
    typeof candidate.verdict === "string" &&
    typeof candidate.recommendation === "string"
  );
}

function normalizeReports(payload: unknown): SavedAuraReport[] {
  if (!Array.isArray(payload)) {
    throw new Error("Saved reports response was not a list.");
  }

  return payload.filter(isSavedAuraReport);
}

export async function getReports(): Promise<SavedAuraReport[]> {
  if (!isSupabaseConfigured) {
    return fallbackReports;
  }

  try {
    const { data, error } = await supabase
      .from("aura_reports")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return normalizeReports(data);
  } catch (error) {
    console.warn("Saved reports fallback engaged:", error);
    return fallbackReports;
  }
}

export function hasSaveEndpoint(): boolean {
  return isSupabaseConfigured;
}

export async function saveAuraReport(
  report: AuraReport,
): Promise<SavedAuraReport> {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Saving is unavailable right now. Try again later.",
    );
  }

  const { subject, aura_color, vibe_score, threat_level, traits, verdict, recommendation } = report;

  const { data, error } = await supabase
    .from("aura_reports")
    .insert({ subject, aura_color, vibe_score, threat_level, traits, verdict, recommendation })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save aura report: ${error.message}`);
  }

  if (!isSavedAuraReport(data)) {
    throw new Error("Save succeeded but no report was returned.");
  }

  return data;
}

export async function deleteReport(reportId: string): Promise<void> {
  if (!isSupabaseConfigured || reportId.startsWith("fallback-")) {
    fallbackReports = fallbackReports.filter((r) => r.id !== reportId);
    return;
  }

  const { error } = await supabase
    .from("aura_reports")
    .delete()
    .eq("id", reportId);

  if (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }
}

export async function toggleFavorite(
  reportId: string,
  nextValue: boolean,
): Promise<SavedAuraReport | null> {
  if (!isSupabaseConfigured || reportId.startsWith("fallback-")) {
    fallbackReports = fallbackReports.map((report) =>
      report.id === reportId ? { ...report, is_favorite: nextValue } : report,
    );

    return fallbackReports.find((report) => report.id === reportId) ?? null;
  }

  const { data, error } = await supabase
    .from("aura_reports")
    .update({ is_favorite: nextValue })
    .eq("id", reportId)
    .select()
    .single();

  if (error) {
    throw new Error(`Favorite update failed: ${error.message}`);
  }

  return isSavedAuraReport(data) ? data : null;
}
