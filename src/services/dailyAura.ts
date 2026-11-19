import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

import { AuraReport, DailyAuraRecord } from "../types";
import { uploadAuraPhoto } from "./auraReports";
import { supabase } from "./supabaseClient";

const REMINDER_KEY = "aura:daily:reminder-enabled";
const REMINDER_ID = "aura-daily-reminder";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function getTodayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rowToRecord(row: Record<string, unknown>): DailyAuraRecord {
  return {
    id: row.id as string,
    subject: row.subject as string,
    aura_color: row.aura_color as string,
    vibe_score: row.vibe_score as number,
    threat_level: row.threat_level as DailyAuraRecord["threat_level"],
    traits: row.traits as DailyAuraRecord["traits"],
    verdict: row.verdict as string,
    recommendation: row.recommendation as string,
    is_daily: true,
    date: row.scan_date as string,
    photo_path: typeof row.photo_path === "string" ? row.photo_path : null,
  };
}

export async function hasScannedToday(): Promise<boolean> {
  const today = getTodayKey();
  const { data } = await supabase
    .from("aura_reports")
    .select("id")
    .eq("is_daily", true)
    .eq("scan_date", today)
    .maybeSingle();
  return data !== null;
}

export async function saveDailyReport(
  report: AuraReport,
  photoUri?: string,
): Promise<DailyAuraRecord> {
  const today = getTodayKey();
  const { subject, aura_color, vibe_score, threat_level, traits, verdict, recommendation } = report;
  const { data, error } = await supabase
    .from("aura_reports")
    .insert({ subject, aura_color, vibe_score, threat_level, traits, verdict, recommendation, is_daily: true, scan_date: today })
    .select()
    .single();

  if (error) throw new Error(`Failed to save daily report: ${error.message}`);

  const saved = rowToRecord(data as Record<string, unknown>);

  if (!photoUri) {
    return saved;
  }

  try {
    const photoPath = await uploadAuraPhoto(saved.id, photoUri);
    const { error: pathError } = await supabase
      .from("aura_reports")
      .update({ photo_path: photoPath })
      .eq("id", saved.id);

    if (pathError) {
      console.warn("Daily report saved but photo path update failed:", pathError);
      return saved;
    }

    return { ...saved, photo_path: photoPath };
  } catch (photoError) {
    console.warn("Daily report saved but photo upload failed:", photoError);
    return saved;
  }
}

export async function getDailyHistory(): Promise<DailyAuraRecord[]> {
  const { data, error } = await supabase
    .from("aura_reports")
    .select("*")
    .eq("is_daily", true)
    .order("scan_date", { ascending: false });

  if (error) return [];
  return (data ?? []).map((row) => rowToRecord(row as Record<string, unknown>));
}

export async function getTodaysDailyAura(): Promise<DailyAuraRecord | null> {
  const today = getTodayKey();
  const { data } = await supabase
    .from("aura_reports")
    .select("*")
    .eq("is_daily", true)
    .eq("scan_date", today)
    .maybeSingle();

  return data ? rowToRecord(data as Record<string, unknown>) : null;
}

export async function getDailyAuraForDate(date: string): Promise<DailyAuraRecord | null> {
  const { data } = await supabase
    .from("aura_reports")
    .select("*")
    .eq("is_daily", true)
    .eq("scan_date", date)
    .maybeSingle();

  return data ? rowToRecord(data as Record<string, unknown>) : null;
}

export function computeStreak(history: DailyAuraRecord[]): number {
  const dates = new Set(history.map((entry) => entry.date));
  const today = getTodayKey();
  const cursor = new Date();

  if (!dates.has(today)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;

  while (dates.has(getTodayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export async function requestNotificationPermission(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function isDailyReminderEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(REMINDER_KEY);
  return value === "true";
}

export async function scheduleDailyReminder(hour = 9, minute = 0): Promise<boolean> {
  const granted = await requestNotificationPermission();
  if (!granted) return false;

  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => undefined);
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: "Daily aura check-in",
      body: "No aura logged today. Pull before midnight.",
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });

  await AsyncStorage.setItem(REMINDER_KEY, "true");
  return true;
}

export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => undefined);
  await AsyncStorage.setItem(REMINDER_KEY, "false");
}
