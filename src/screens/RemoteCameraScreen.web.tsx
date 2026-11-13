import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "../theme/game";
import { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "RemoteCamera">;

/**
 * Remote camera needs a native WebView (Expo Go / device). On web this route
 * only explains the two-device setup so the laptop browser is not mistaken
 * for the phone side.
 */
export function RemoteCameraScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.screenShell}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.title}>AURA</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.centerState}>
        <Text style={styles.stateTitle}>Open this on your phone</Text>
        <Text style={styles.stateBody}>
          Remote camera uses a native WebView, so it only runs in Expo Go on
          your phone — not in this browser.
        </Text>
        <Text style={styles.stateBody}>
          Keep Aura Lab open here on the laptop (same account), then on your
          phone open the menu → Remote camera.
        </Text>
        <Pressable
          style={styles.primaryButton}
          onPress={() => navigation.navigate("AuraLab")}
        >
          <Text style={styles.primaryButtonText}>Go to Aura Lab</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screenShell: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 18,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  backButton: { width: 44, height: 44, justifyContent: "center" },
  title: { color: COLORS.text, fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  pressed: { opacity: 0.6 },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  stateTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800" },
  stateBody: { color: COLORS.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  primaryButton: {
    height: 50,
    paddingHorizontal: 28,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent,
    marginTop: 8,
  },
  primaryButtonText: { color: COLORS.onAccent, fontSize: 15, fontWeight: "900" },
});
