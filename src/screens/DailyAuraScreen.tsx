import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { AuraGauge } from "../components/AuraGauge";
import { ThreatBadge } from "../components/ThreatBadge";
import { RootStackParamList } from "../navigation/types";
import {
  cancelDailyReminder,
  computeStreak,
  getDailyHistory,
  getTodayKey,
  getTodaysDailyAura,
  hasScannedToday,
  isDailyReminderEnabled,
  scheduleDailyReminder,
} from "../services/dailyAura";
import { DailyAuraRecord } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "DailyAura">;

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function formatDisplayDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function buildMonthGrid(
  year: number,
  month: number,
  historyByDate: Map<string, DailyAuraRecord>,
  todayKey: string,
) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = firstDay.getDay();
  const cells: Array<
    | { kind: "blank" }
    | {
        kind: "day";
        day: number;
        dateKey: string;
        record: DailyAuraRecord | null;
        isToday: boolean;
      }
  > = [];

  for (let i = 0; i < leadingBlanks; i += 1) {
    cells.push({ kind: "blank" });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({
      kind: "day",
      day,
      dateKey,
      record: historyByDate.get(dateKey) ?? null,
      isToday: dateKey === todayKey,
    });
  }

  return cells;
}

export function DailyAuraScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<DailyAuraRecord[]>([]);
  const [todayRecord, setTodayRecord] = useState<DailyAuraRecord | null>(null);
  const [scannedToday, setScannedToday] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);

  const todayKey = useMemo(() => getTodayKey(), []);

  const streak = useMemo(() => computeStreak(history), [history]);

  const historyByDate = useMemo(
    () => new Map(history.map((entry) => [entry.date, entry])),
    [history],
  );

  const calendarCells = useMemo(() => {
    const now = new Date();
    return buildMonthGrid(
      now.getFullYear(),
      now.getMonth(),
      historyByDate,
      todayKey,
    );
  }, [historyByDate, todayKey]);

  const monthLabel = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, []);

  const selectedRecord =
    selectedDate !== null ? (historyByDate.get(selectedDate) ?? null) : null;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [entries, today, alreadyScanned, reminderOn] = await Promise.all([
        getDailyHistory(),
        getTodaysDailyAura(),
        hasScannedToday(),
        isDailyReminderEnabled(),
      ]);
      setHistory(entries);
      setTodayRecord(today);
      setScannedToday(alreadyScanned);
      setReminderEnabled(reminderOn);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, [refresh]),
  );

  async function handleReminderToggle(nextValue: boolean) {
    setReminderBusy(true);
    try {
      if (nextValue) {
        const scheduled = await scheduleDailyReminder(9, 0);
        setReminderEnabled(scheduled);
        if (!scheduled) {
          await Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Warning,
          );
        }
      } else {
        await cancelDailyReminder();
        setReminderEnabled(false);
      }
    } finally {
      setReminderBusy(false);
    }
  }

  function handleScanToday() {
    if (scannedToday) {
      return;
    }

    navigation.navigate("Camera", { dailyMode: true });
  }

  function handleViewReport(report: DailyAuraRecord) {
    navigation.navigate("AuraReport", { report, mode: "saved" });
  }

  if (loading) {
    return (
      <View style={styles.loadingShell}>
        <ActivityIndicator color="#C4B5FD" />
        <Text style={styles.loadingText}>Loading the lore...</Text>
      </View>
    );
  }

  return (
    <LinearGradient
      colors={["#141826", "#090D16", "#05070C"]}
      style={styles.background}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Pressable
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.backButtonPressed,
              ]}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
            <View style={styles.headerTitleBlock}>
              <Text style={styles.kicker}>DAILY AURA</Text>
              <Text style={styles.title}>One pull daily.</Text>
            </View>
            <View style={styles.headerBalance} />
          </View>
        </View>

        <View style={styles.streakCard}>
          <Text style={styles.streakLabel}>CURRENT STREAK</Text>
          <Text style={styles.streakValue}>{streak}</Text>
          <Text style={styles.streakCaption}>
            {streak === 1 ? "day on main" : "days on main"}
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>TODAY</Text>
            <Text style={styles.sectionNote}>{formatDisplayDate(todayKey)}</Text>
          </View>

          <Text style={styles.statusLine}>
            {scannedToday
              ? "You're locked in today."
              : "Daily aura is up for grabs."}
          </Text>

          {todayRecord ? (
            <Pressable
              style={styles.todayPreview}
              onPress={() => handleViewReport(todayRecord)}
            >
              <View style={styles.todayPreviewTop}>
                {/* <ThreatBadge level={todayRecord.threat_level} /> */}
                <Text style={styles.todayPreviewLink}>More</Text>
              </View>
              <Text style={styles.todaySubject}>{todayRecord.subject}</Text>
              <View style={styles.todayRow}>
                <AuraGauge
                  value={todayRecord.vibe_score}
                  color={todayRecord.aura_color}
                />
                <View style={styles.todayColorBlock}>
                  <View
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: todayRecord.aura_color },
                    ]}
                  />
                  <Text style={styles.colorHex}>
                    {todayRecord.aura_color.toUpperCase()}
                  </Text>
                </View>
              </View>
            </Pressable>
          ) : (
            <View style={styles.emptyToday}>
              <Pressable
                style={({ pressed }) => [
                  styles.scanButton,
                  pressed && styles.scanButtonPressed,
                ]}
                onPress={handleScanToday}
              >
                <Text style={styles.scanButtonText}>Scan today's aura</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>CALENDAR</Text>
            <Text style={styles.sectionNote}>{monthLabel}</Text>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, index) => (
              <Text key={`${label}-${index}`} style={styles.weekdayLabel}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {calendarCells.map((cell, index) => {
              if (cell.kind === "blank") {
                return <View key={`blank-${index}`} style={styles.dayCell} />;
              }

              const isSelected = selectedDate === cell.dateKey;
              const hasRecord = cell.record !== null;

              return (
                <Pressable
                  key={cell.dateKey}
                  style={[
                    styles.dayCell,
                    cell.isToday && styles.dayCellToday,
                    isSelected && styles.dayCellSelected,
                  ]}
                  onPress={() =>
                    setSelectedDate((current) =>
                      current === cell.dateKey ? null : cell.dateKey,
                    )
                  }
                >
                  <Text style={styles.dayNumber}>{cell.day}</Text>
                  <View
                    style={[
                      styles.dayDot,
                      hasRecord
                        ? { backgroundColor: cell.record!.aura_color }
                        : styles.dayDotEmpty,
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>

          {selectedRecord ? (
            <Pressable
              style={styles.selectedDayCard}
              onPress={() => handleViewReport(selectedRecord)}
            >
              <Text style={styles.selectedDayLabel}>
                {formatDisplayDate(selectedRecord.date)}
              </Text>
              <Text style={styles.selectedDaySubject}>
                {selectedRecord.subject}
              </Text>
              <Text style={styles.selectedDayMeta}>
                Vibe {selectedRecord.vibe_score} ·{" "}
                {selectedRecord.aura_color.toUpperCase()}
              </Text>
            </Pressable>
          ) : selectedDate ? (
            <Text style={styles.selectedEmpty}>
              Side quest skipped.
            </Text>
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.reminderRow}>
            <View style={styles.reminderCopy}>
              <Text style={styles.sectionTitle}>DAILY REMINDER</Text>
              <Text style={styles.sectionNote}>
                9 AM tap if you ghosted today.
              </Text>
            </View>
            <Switch
              value={reminderEnabled}
              onValueChange={handleReminderToggle}
              disabled={reminderBusy}
              trackColor={{ false: "#334155", true: "#7C3AED" }}
              thumbColor={reminderEnabled ? "#E9D5FF" : "#CBD5E1"}
            />
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  loadingShell: {
    flex: 1,
    backgroundColor: "#05070c",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "700",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 40,
    gap: 16,
  },
  header: {
    marginBottom: 4,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  backButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  backButtonPressed: {
    opacity: 0.7,
  },
  backButtonText: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  headerTitleBlock: {
    flex: 1,
    alignItems: "center",
  },
  headerBalance: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 48,
  },
  kicker: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    marginBottom: 4,
  },
  title: {
    color: "#F8FAFC",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    textAlign: "center",
  },
  streakCard: {
    backgroundColor: "rgba(124, 58, 237, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(196, 181, 253, 0.28)",
    borderRadius: 24,
    padding: 20,
    alignItems: "center",
    gap: 4,
  },
  streakLabel: {
    color: "#DDD6FE",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.8,
  },
  streakValue: {
    color: "#F8FAFC",
    fontSize: 56,
    lineHeight: 60,
    fontWeight: "900",
    letterSpacing: -2,
  },
  streakCaption: {
    color: "#C4B5FD",
    fontSize: 14,
    fontWeight: "700",
  },
  sectionCard: {
    backgroundColor: "rgba(10, 14, 26, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 24,
    padding: 18,
    gap: 14,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  sectionNote: {
    color: "rgba(255,255,255,0.52)",
    fontSize: 12,
    fontWeight: "600",
  },
  statusLine: {
    color: "#94A3B8",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
  },
  todayPreview: {
    gap: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  todayPreviewTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  todayPreviewLink: {
    color: "#C4B5FD",
    fontSize: 12,
    fontWeight: "800",
  },
  todaySubject: {
    color: "#F8FAFC",
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  todayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  todayColorBlock: {
    alignItems: "center",
    gap: 8,
  },
  colorSwatch: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  colorHex: {
    color: "#E5E7EB",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.9,
  },
  emptyToday: {
    gap: 14,
  },
  scanButton: {
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E9D5FF",
  },
  scanButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  scanButtonText: {
    color: "#05070C",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1,
  },
  weekdayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  weekdayLabel: {
    width: `${100 / 7}%`,
    textAlign: "center",
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontWeight: "800",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 12,
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: "rgba(196, 181, 253, 0.55)",
    backgroundColor: "rgba(124, 58, 237, 0.10)",
  },
  dayCellSelected: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  dayNumber: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "800",
  },
  dayDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  dayDotEmpty: {
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  selectedDayCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 6,
  },
  selectedDayLabel: {
    color: "#C4B5FD",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  selectedDaySubject: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "800",
  },
  selectedDayMeta: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
  },
  selectedEmpty: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  reminderCopy: {
    flex: 1,
    gap: 4,
  },
});
