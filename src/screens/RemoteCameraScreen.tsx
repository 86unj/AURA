import { ComponentRef, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCameraPermissions } from "expo-camera";
import * as ScreenOrientation from "expo-screen-orientation";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "../theme/game";
import { RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import {
  getIceServers,
  joinSignalingChannel,
  SignalingChannel,
  SignalMessage,
} from "../services/remoteSignaling";

type Props = NativeStackScreenProps<RootStackParamList, "RemoteCamera">;

/**
 * HTTPS URL of public/phone-camera.html (e.g. your Vercel deployment).
 * Browsers only allow camera access on secure origins, so plain http://<LAN-IP>
 * will not work.
 */
const PHONE_CAMERA_URL = process.env.EXPO_PUBLIC_REMOTE_CAMERA_URL ?? "";

type LinkState = "waiting" | "connecting" | "connected" | "failed";

type PageMessage =
  | { type: "page-ready" }
  | { type: "signal"; kind: SignalMessage["kind"]; data?: unknown }
  | { type: "status"; state: LinkState; message: string }
  | { type: "error"; message: string };

const LINK_LABEL: Record<LinkState, string> = {
  waiting: "WAITING",
  connecting: "CONNECTING",
  connected: "LIVE",
  failed: "RETRYING",
};

const LINK_COLOR: Record<LinkState, string> = {
  waiting: "#94A3B8",
  connecting: "#FBBF24",
  connected: "#4ADE80",
  failed: "#F87171",
};

export function RemoteCameraScreen({ navigation }: Props) {
  // The app itself must hold camera permission before the WebView can use it.
  const [permission, requestPermission] = useCameraPermissions();
  const { user } = useAuth();
  const webviewRef = useRef<ComponentRef<typeof WebView> | null>(null);
  const channelRef = useRef<SignalingChannel | null>(null);
  const reportShownRef = useRef(false);
  const [linkState, setLinkState] = useState<LinkState>("waiting");
  const [errorText, setErrorText] = useState<string | null>(null);

  // ICE config is handed to the page before it loads.
  const injectedConfig = useMemo(
    () => `window.AURA_CONFIG = ${JSON.stringify({ iceServers: getIceServers() })}; true;`,
    [],
  );

  // Allow the phone to rotate while remoting; lock portrait again on leave.
  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.unlockAsync().catch(() => {});
      return () => {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      };
    }, []),
  );

  // Relay signaling between the Supabase channel and the page.
  useEffect(() => {
    if (!user) return;
    const channel = joinSignalingChannel(user.id, "phone", (message) => {
      if (message.kind === "report") {
        // Laptop finished analyzing: show the normal report screen here.
        if (message.data?.report) {
          reportShownRef.current = true;
          navigation.navigate("AuraReport", { report: message.data.report, mode: "scan" });
        }
        return;
      }
      const script = `window.auraOnSignal && window.auraOnSignal(${JSON.stringify(message)}); true;`;
      webviewRef.current?.injectJavaScript(script);
    });
    channelRef.current = channel;
    channel.ready.catch((error) =>
      setErrorText(error instanceof Error ? error.message : "Could not reach the signaling server."),
    );
    return () => {
      channelRef.current = null;
      channel.leave().catch(() => {});
    };
  }, [user, navigation]);

  // Back from the report: ask the laptop to reset to its idle screen.
  useFocusEffect(
    useCallback(() => {
      if (reportShownRef.current) {
        reportShownRef.current = false;
        channelRef.current?.send("control", { action: "retake" });
      }
    }, []),
  );

  function handleMessage(event: WebViewMessageEvent) {
    let data: PageMessage;
    try {
      data = JSON.parse(event.nativeEvent.data) as PageMessage;
    } catch {
      return; // Ignore non-JSON messages.
    }
    switch (data.type) {
      case "page-ready":
        setErrorText(null);
        channelRef.current?.send("phone-hello");
        break;
      case "signal":
        channelRef.current?.send(data.kind, data.data);
        break;
      case "status":
        setLinkState(data.state);
        break;
      case "error":
        setErrorText(data.message);
        break;
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
          ref={webviewRef}
          source={{ uri: PHONE_CAMERA_URL }}
          injectedJavaScriptBeforeContentLoaded={injectedConfig}
          style={styles.webview}
          originWhitelist={["https://*"]}
          javaScriptEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grant"
          onMessage={handleMessage}
          onError={(event) => setErrorText(event.nativeEvent.description)}
        />
        <View style={styles.liveBadge} accessibilityRole="text">
          <View style={[styles.liveDot, { backgroundColor: LINK_COLOR[linkState] }]} />
          <Text style={styles.liveText}>{LINK_LABEL[linkState]}</Text>
        </View>
        {errorText ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorText}</Text>
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
  liveBadge: {
    position: "absolute",
    top: 14,
    left: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(15, 17, 26, 0.55)",
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { color: COLORS.text, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  errorBanner: {
    position: "absolute",
    top: 52,
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
