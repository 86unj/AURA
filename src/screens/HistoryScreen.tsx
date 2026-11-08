import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

import { AuraGauge } from "../components/AuraGauge";
import { ThreatBadge } from "../components/ThreatBadge";
import { RootStackParamList } from "../navigation/types";
import { deleteReport, getReports, toggleFavorite } from "../services/auraReports";
import { SavedAuraReport } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "History">;
type ViewMode = "list" | "grid";

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Saved report";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function HistoryScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const [reports, setReports] = useState<SavedAuraReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showFavorites, setShowFavorites] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const isGrid = viewMode === "grid";
  const horizontalPadding = 18;
  const gridGap = 12;
  const contentWidth = Math.min(width - horizontalPadding * 2, 430);
  const cardWidth = isGrid
    ? Math.min((contentWidth - gridGap) / 2, 172)
    : contentWidth;
  const useStackedControls = width < 380;
  const filteredReports = useMemo(
    () =>
      showFavorites
        ? reports.filter((report) => report.is_favorite)
        : reports,
    [reports, showFavorites],
  );

  const loadReports = useCallback(async () => {
    setIsLoading(true);

    try {
      setReports(await getReports());
    } catch (error) {
      console.error("History load failed:", error);
      Alert.alert("History unavailable", "Saved aura reports could not load.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadReports();
    }, [loadReports]),
  );

  async function handleToggleFavorite(report: SavedAuraReport) {
    const nextValue = !report.is_favorite;
    const previousReports = reports;

    setUpdatingId(report.id);
    setReports((currentReports) =>
      currentReports.map((currentReport) =>
        currentReport.id === report.id
          ? { ...currentReport, is_favorite: nextValue }
          : currentReport,
      ),
    );

    try {
      const updatedReport = await toggleFavorite(report.id, nextValue);

      if (updatedReport) {
        setReports((currentReports) =>
          currentReports.map((currentReport) =>
            currentReport.id === report.id ? updatedReport : currentReport,
          ),
        );
      }
    } catch (error) {
      console.error("Favorite toggle failed:", error);
      setReports(previousReports);
      Alert.alert("Favorite unavailable", "That report could not be updated.");
    } finally {
      setUpdatingId(null);
    }
  }

  function handleDelete(item: SavedAuraReport) {
    Alert.alert(
      "Delete report?",
      `Remove "${item.subject}"? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setReports((prev) => prev.filter((r) => r.id !== item.id));
            try {
              await deleteReport(item.id);
            } catch (error) {
              console.error("Delete failed:", error);
              setReports((prev) => [...prev, item].sort((a, b) => b.created_at.localeCompare(a.created_at)));
              Alert.alert("Delete failed", "That report could not be removed. Try again.");
            }
          },
        },
      ],
    );
  }

  function renderReport({ item }: { item: SavedAuraReport }) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.reportCard,
          isGrid && styles.gridCard,
          { width: cardWidth, borderColor: `${item.aura_color}55` },
          pressed && styles.cardPressed,
        ]}
        onPress={() =>
          navigation.navigate("AuraReport", { report: item, mode: "saved" })
        }
        onLongPress={() => handleDelete(item)}
        delayLongPress={500}
      >
        <View style={styles.cardTopRow}>
          <View style={styles.subjectBlock}>
            <Text style={styles.savedDate}>{formatDate(item.created_at)}</Text>
            <Text
              style={[styles.subjectText, isGrid && styles.gridSubjectText]}
              numberOfLines={isGrid ? 3 : 2}
            >
              {item.subject}
            </Text>
          </View>
          <Pressable
            hitSlop={10}
            style={[
              styles.favoriteButton,
              item.is_favorite && styles.favoriteButtonActive,
            ]}
            onPress={(event) => {
              event.stopPropagation();
              handleToggleFavorite(item);
            }}
            disabled={updatingId === item.id}
          >
            <Text
              style={[
                styles.favoriteText,
                item.is_favorite && styles.favoriteTextActive,
              ]}
            >
              {item.is_favorite ? "★" : "☆"}
            </Text>
          </Pressable>
        </View>

        <View style={[styles.metricRow, isGrid && styles.gridMetricRow]}>
          <AuraGauge
            value={item.vibe_score}
            color={item.aura_color}
            size={isGrid ? 118 : 138}
          />
          <View style={styles.metaColumn}>
            <ThreatBadge level={item.threat_level} />
            <View style={styles.colorRow}>
              <View
                style={[
                  styles.colorSwatch,
                  { backgroundColor: item.aura_color },
                ]}
              />
              <Text style={styles.colorText}>
                {item.aura_color.toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.verdictText} numberOfLines={isGrid ? 3 : 2}>
          {item.verdict}
        </Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.screenShell}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.kicker}>AURA ARCHIVE</Text>
            <Text style={styles.title}>Saved reports</Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.dailyButton,
              pressed && styles.dailyButtonPressed,
            ]}
            onPress={() => navigation.navigate("DailyAura")}
          >
            <Text style={styles.dailyButtonText}>Daily</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.toolbar, useStackedControls && styles.toolbarStacked]}>
        <View
          style={[
            styles.segmentGroup,
            useStackedControls && styles.segmentGroupStacked,
          ]}
        >
          <Pressable
            style={[
              styles.segmentButton,
              !showFavorites && styles.segmentButtonActive,
            ]}
            onPress={() => setShowFavorites(false)}
          >
            <Text
              style={[
                styles.segmentText,
                !showFavorites && styles.segmentTextActive,
              ]}
            >
              All
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.segmentButton,
              showFavorites && styles.segmentButtonActive,
            ]}
            onPress={() => setShowFavorites(true)}
          >
            <Text
              style={[
                styles.segmentText,
                showFavorites && styles.segmentTextActive,
              ]}
            >
              Favorites
            </Text>
          </Pressable>
        </View>

        <View
          style={[
            styles.viewGroup,
            useStackedControls && styles.viewGroupStacked,
          ]}
        >
          <Pressable
            style={[
              styles.viewSegmentButton,
              !isGrid && styles.segmentButtonActive,
            ]}
            accessibilityRole="button"
            accessibilityLabel="List view"
            accessibilityState={{ selected: !isGrid }}
            onPress={() => setViewMode("list")}
          >
            <Ionicons
              name={isGrid ? "list-outline" : "list"}
              size={18}
              color={isGrid ? "#CBD5E1" : "#05070C"}
            />
          </Pressable>
          <Pressable
            style={[
              styles.viewSegmentButton,
              isGrid && styles.segmentButtonActive,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Grid view"
            accessibilityState={{ selected: isGrid }}
            onPress={() => setViewMode("grid")}
          >
            <Ionicons
              name={isGrid ? "grid" : "grid-outline"}
              size={18}
              color={isGrid ? "#05070C" : "#CBD5E1"}
            />
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color="#C4B5FD" />
          <Text style={styles.stateTitle}>Loading saved auras</Text>
        </View>
      ) : (
        <FlatList
          key={viewMode}
          data={filteredReports}
          keyExtractor={(item) => item.id}
          renderItem={renderReport}
          numColumns={isGrid ? 2 : 1}
          columnWrapperStyle={
            isGrid ? [styles.gridRow, { width: contentWidth }] : undefined
          }
          contentContainerStyle={[
            styles.listContent,
            filteredReports.length === 0 && styles.emptyListContent,
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.stateTitle}>
                {showFavorites ? "No favorites yet" : "No saved reports yet"}
              </Text>
              <Text style={styles.stateBody}>
                {showFavorites
                  ? "Tap the star on a saved aura to keep it close."
                  : "Saved scan results will appear here when history is connected."}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screenShell: {
    flex: 1,
    backgroundColor: "#05070c",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 18,
  },
  header: {
    gap: 12,
    marginBottom: 14,
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
  backButtonText: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  dailyButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(124, 58, 237, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(196, 181, 253, 0.35)",
  },
  dailyButtonPressed: {
    opacity: 0.7,
  },
  dailyButtonText: {
    color: "#DDD6FE",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  headerTitleBlock: {
    flex: 1,
    alignItems: "center",
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
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 14,
  },
  toolbarStacked: {
    flexDirection: "column",
    alignItems: "center",
  },
  segmentGroup: {
    width: 178,
    height: 46,
    flexDirection: "row",
    padding: 4,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  segmentGroupStacked: {
    width: 178,
  },
  viewGroup: {
    width: 116,
    height: 46,
    flexDirection: "row",
    padding: 4,
    borderRadius: 16,
    backgroundColor: "rgba(196, 181, 253, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(196, 181, 253, 0.20)",
  },
  viewGroupStacked: {
    width: 116,
  },
  segmentButton: {
    flex: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  viewSegmentButton: {
    flex: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentButtonActive: {
    backgroundColor: "#E9D5FF",
  },
  segmentText: {
    color: "#CBD5E1",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  segmentTextActive: {
    color: "#05070C",
  },
  listContent: {
    paddingBottom: 28,
    gap: 12,
    alignItems: "center",
  },
  gridRow: {
    justifyContent: "center",
    gap: 12,
    marginBottom: 12,
    alignSelf: "center",
  },
  reportCard: {
    borderRadius: 24,
    padding: 14,
    backgroundColor: "rgba(10, 14, 26, 0.84)",
    borderWidth: 1,
    gap: 14,
  },
  gridCard: {
    minHeight: 304,
    padding: 12,
  },
  cardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  subjectBlock: {
    flex: 1,
    gap: 5,
  },
  savedDate: {
    color: "#A5B4FC",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  subjectText: {
    color: "#F8FAFC",
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
  },
  gridSubjectText: {
    fontSize: 15,
    lineHeight: 20,
  },
  favoriteButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  favoriteButtonActive: {
    backgroundColor: "rgba(250, 204, 21, 0.14)",
    borderColor: "rgba(250, 204, 21, 0.32)",
  },
  favoriteText: {
    color: "#CBD5E1",
    fontSize: 20,
    lineHeight: 22,
  },
  favoriteTextActive: {
    color: "#FACC15",
  },
  metricRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  gridMetricRow: {
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
  },
  metaColumn: {
    flex: 1,
    alignItems: "flex-start",
    gap: 12,
  },
  colorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  colorSwatch: {
    width: 22,
    height: 22,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  colorText: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  verdictText: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  stateTitle: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
  },
  stateBody: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
