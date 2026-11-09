import { ReactNode, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCameraPermissions } from "expo-camera";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "../theme/game";
import { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "RemoteCamera">;

/**
 * HTTPS URL of public/phone-camera.html (e.g. your Vercel deployment).
 * Browsers only allow camera access on secure origins, so plain http://<LAN-IP>
 * will not work.
 */
const PHONE_CAMERA_URL = process.env.EXPO_PUBLIC_REMOTE_CAMERA_URL ?? "";

type PageMessage = { type: string; message: string };

export function RemoteCameraScreen({ navigation }: Props) {
  // The app itself must hold camera permission before the WebView can use it.
  const [permission, requestPermission] = useCameraPermissions();
  const [pageStatus, setPageStatus] = useState<PageMessage | null>(null);

  function handleMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data) as PageMessage;
      setPageStatus(data);
      console.log("[phone-camera]", data.type, data.message);
    } catch {
      // Ignore non-JSON messages.
    }
  }

  const header = (
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
  );

  let body: ReactNode;
  if (!PHONE_CAMERA_URL) {
    body = (
      <View style={styles.centerState}>
        <Text style={styles.stateTitle}>Remote camera URL not set</Text>
        <Text style={styles.stateBody}>
          Set EXPO_PUBLIC_REMOTE_CAMERA_URL in .env to the HTTPS address of
          phone-camera.html, then restart Expo.
        </Text>
      </View>
    );
  } else if (!permission) {
    body = (
      <View style={styles.centerState}>
        <ActivityIndicator color={COLORS.accentMuted} />
      </View>
    );
  } else if (!permission.granted) {
    body = (
      <View style={styles.centerState}>
        <Text style={styles.stateTitle}>Camera access needed</Text>
        <Text style={styles.stateBody}>
          Allow the camera so this phone can stream to your laptop.
        </Text>
        <Pressable style={styles.primaryButton} onPress={() => requestPermission()}>
          <Text style={styles.primaryButtonText}>Allow camera</Text>
        </Pressable>
      </View>
    );
  } else {
    body = (
      <View style={styles.previewFrame}>
        <WebView
          source={{ uri: PHONE_CAMERA_URL }}
          style={styles.webview}
          originWhitelist={["https://*"]}
          javaScriptEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grant"
          onMessage={handleMessage}
          onError={(event) =>
            setPageStatus({ type: "error", message: event.nativeEvent.description })
          }
        />
        {pageStatus?.type === "error" ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{pageStatus.message}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screenShell}>
      {header}
      {body}
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
  previewFrame: {
    flex: 1,
    borderRadius: 26,
    overflow: "hidden",
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  webview: { flex: 1, backgroundColor: "#000" },
  errorBanner: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "rgba(127, 29, 29, 0.85)",
  },
  errorText: { color: "#FEE2E2", fontSize: 13, fontWeight: "700" },
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
    marginTop: 4,
  },
  primaryButtonText: { color: COLORS.onAccent, fontSize: 15, fontWeight: "900" },
});
