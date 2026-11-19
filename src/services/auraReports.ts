import { FALLBACK_REPORTS } from "../data/fallbackAuraReports";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import { AuraReport, SavedAuraReport } from "../types";

export const AURA_PHOTOS_BUCKET = "aura-photos";
/** Short-lived signed URL TTL for History + report screen photos. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

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
    photo_path: null,
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

async function requireUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("You must be signed in to save photos.");
  }

  return user.id;
}

/** Upload a local 640px JPEG to `<user_id>/<report_id>.jpg` and return the path. */
export async function uploadAuraPhoto(
  reportId: string,
  photoUri: string,
): Promise<string> {
  const userId = await requireUserId();
  const path = `${userId}/${reportId}.jpg`;

  const response = await fetch(photoUri);
  if (!response.ok) {
    throw new Error("Could not read the photo file for upload.");
  }

  const blob = await response.blob();
  const { error } = await supabase.storage
    .from(AURA_PHOTOS_BUCKET)
    .upload(path, blob, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (error) {
    throw new Error(`Photo upload failed: ${error.message}`);
  }

  return path;
}

async function attachPhotoPath(
  reportId: string,
  photoPath: string,
): Promise<void> {
  const { error } = await supabase
    .from("aura_reports")
    .update({ photo_path: photoPath })
    .eq("id", reportId);

  if (error) {
    throw new Error(`Failed to store photo path: ${error.message}`);
  }
}

/**
 * Batch-create short-lived signed URLs for History (and similar lists).
 * Returns a map of storage path → signed URL.
 */
export async function getSignedPhotoUrls(
  photoPaths: Array<string | null | undefined>,
): Promise<Record<string, string>> {
  if (!isSupabaseConfigured) {
    return {};
  }

  const unique = [
    ...new Set(
      photoPaths.filter((path): path is string => typeof path === "string" && path.length > 0),
    ),
  ];

  if (unique.length === 0) {
    return {};
  }

  const { data, error } = await supabase.storage
    .from(AURA_PHOTOS_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.warn("Signed photo URLs failed:", error);
    return {};
  }

  const urls: Record<string, string> = {};
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl && !entry.error) {
      urls[entry.path] = entry.signedUrl;
    }
  }
  return urls;
}

export async function getSignedPhotoUrl(
  photoPath: string,
): Promise<string | null> {
  const urls = await getSignedPhotoUrls([photoPath]);
  return urls[photoPath] ?? null;
}

async function removeAuraPhoto(photoPath: string): Promise<void> {
  const { error } = await supabase.storage
    .from(AURA_PHOTOS_BUCKET)
    .remove([photoPath]);

  if (error) {
    console.warn("Photo delete failed:", error);
  }
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
  photoUri?: string,
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

  if (!photoUri) {
    return data;
  }

  try {
    const photoPath = await uploadAuraPhoto(data.id, photoUri);
    await attachPhotoPath(data.id, photoPath);
    return { ...data, photo_path: photoPath };
  } catch (photoError) {
    console.warn("Report saved but photo upload failed:", photoError);
    return data;
  }
}

export async function deleteReport(reportId: string): Promise<void> {
  if (!isSupabaseConfigured || reportId.startsWith("fallback-")) {
    fallbackReports = fallbackReports.filter((r) => r.id !== reportId);
    return;
  }

  const { data: existing } = await supabase
    .from("aura_reports")
    .select("photo_path")
    .eq("id", reportId)
    .maybeSingle();

  const { error } = await supabase
    .from("aura_reports")
    .delete()
    .eq("id", reportId);

  if (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }

  const photoPath =
    existing && typeof existing.photo_path === "string"
      ? existing.photo_path
      : null;

  if (photoPath) {
    await removeAuraPhoto(photoPath);
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
