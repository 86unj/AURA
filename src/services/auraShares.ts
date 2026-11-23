import { isSupabaseConfigured, supabase } from "./supabaseClient";
import { AuraReport } from "../types";

export const AURA_SHARES_BUCKET = "aura-shares";
export const SHARE_TTL_MS = 24 * 60 * 60 * 1000;

export type CreatedAuraShare = {
  id: string;
  url: string;
  expiresAt: string;
  publicImageUrl: string;
};

function requireConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }
}

async function requireUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("You must be signed in to share.");
  }

  return user.id;
}

/**
 * Public share page URL for QR / copy-link.
 * Prefer EXPO_PUBLIC_SHARE_PAGE_URL (e.g. https://your-deploy.vercel.app/share.html)
 * so links work for other people even when the app itself is on localhost.
 * Separate from EXPO_PUBLIC_REMOTE_CAMERA_URL — that page is only for you.
 */
const SHARE_PAGE_URL = (process.env.EXPO_PUBLIC_SHARE_PAGE_URL ?? "").trim();

export function buildSharePageUrl(shareId: string): string {
  const id = encodeURIComponent(shareId);

  if (SHARE_PAGE_URL) {
    try {
      const url = new URL(SHARE_PAGE_URL);
      url.searchParams.set("id", shareId);
      return url.toString();
    } catch {
      const joiner = SHARE_PAGE_URL.includes("?") ? "&" : "?";
      return `${SHARE_PAGE_URL}${joiner}id=${id}`;
    }
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/share.html?id=${id}`;
  }
  return `/share.html?id=${id}`;
}

export function getSharePublicImageUrl(imagePath: string): string {
  const { data } = supabase.storage.from(AURA_SHARES_BUCKET).getPublicUrl(imagePath);
  return data.publicUrl;
}

/**
 * Upload a card PNG and insert an aura_shares row that expires in 24 hours.
 */
export async function createAuraShare(input: {
  report: AuraReport;
  imageBlob: Blob;
}): Promise<CreatedAuraShare> {
  requireConfigured();
  const ownerId = await requireUserId();
  const shareId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const imagePath = `${ownerId}/${shareId}.png`;
  const expiresAt = new Date(Date.now() + SHARE_TTL_MS).toISOString();

  const { error: uploadError } = await supabase.storage
    .from(AURA_SHARES_BUCKET)
    .upload(imagePath, input.imageBlob, {
      contentType: "image/png",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Share upload failed: ${uploadError.message}`);
  }

  const { error: insertError } = await supabase.from("aura_shares").insert({
    id: shareId,
    owner_id: ownerId,
    report_json: input.report,
    image_path: imagePath,
    expires_at: expiresAt,
  });

  if (insertError) {
    await supabase.storage.from(AURA_SHARES_BUCKET).remove([imagePath]);
    throw new Error(`Share create failed: ${insertError.message}`);
  }

  return {
    id: shareId,
    url: buildSharePageUrl(shareId),
    expiresAt,
    publicImageUrl: getSharePublicImageUrl(imagePath),
  };
}

/** Delete the storage object and the row so the link dies immediately. */
export async function revokeAuraShare(shareId: string): Promise<void> {
  requireConfigured();
  await requireUserId();

  const { data: row, error: readError } = await supabase
    .from("aura_shares")
    .select("image_path")
    .eq("id", shareId)
    .maybeSingle();

  if (readError) {
    throw new Error(`Could not load share: ${readError.message}`);
  }

  if (row?.image_path) {
    const { error: storageError } = await supabase.storage
      .from(AURA_SHARES_BUCKET)
      .remove([row.image_path]);
    if (storageError) {
      console.warn("Share image delete failed:", storageError.message);
    }
  }

  const { error: deleteError } = await supabase
    .from("aura_shares")
    .delete()
    .eq("id", shareId);

  if (deleteError) {
    // Fallback: mark revoked so anon RLS hides it even if delete fails.
    const { error: revokeError } = await supabase
      .from("aura_shares")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", shareId);
    if (revokeError) {
      throw new Error(`Share revoke failed: ${deleteError.message}`);
    }
  }
}
