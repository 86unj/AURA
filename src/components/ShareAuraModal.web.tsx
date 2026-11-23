import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import QRCode from "qrcode";

import { GameButton } from "./GameButton";
import { CreatedAuraShare } from "../services/auraShares";
import { COLORS } from "../theme/game";

type Props = {
  visible: boolean;
  share: CreatedAuraShare | null;
  creating?: boolean;
  errorText?: string | null;
  onClose: () => void;
  onDestroy: () => void;
  destroying?: boolean;
};

export function ShareAuraModal({
  visible,
  share,
  creating = false,
  errorText,
  onClose,
  onDestroy,
  destroying = false,
}: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl(null);
    setCopied(false);

    if (!share?.url) {
      return;
    }

    QRCode.toDataURL(share.url, {
      width: 240,
      margin: 2,
      color: { dark: "#05070C", light: "#FFFFFF" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch((error) => {
        console.warn("QR generate failed:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [share?.url]);

  async function handleCopy() {
    if (!share?.url || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(share.url);
      setCopied(true);
    } catch (error) {
      console.warn("Copy failed:", error);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Share card</Text>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.closeText}>x</Text>
            </Pressable>
          </View>

          {creating ? (
            <View style={styles.centerBlock}>
              <ActivityIndicator color={COLORS.accent} size="large" />
              <Text style={styles.hint}>Preparing your card…</Text>
            </View>
          ) : errorText ? (
            <View style={styles.centerBlock}>
              <Text style={styles.errorText}>{errorText}</Text>
              <GameButton label="Close" onPress={onClose} variant="secondary" />
            </View>
          ) : share ? (
            <>
              <View style={styles.qrWrap}>
                {qrDataUrl ? (
                  <Image source={{ uri: qrDataUrl }} style={styles.qr} />
                ) : (
                  <ActivityIndicator color={COLORS.accent} />
                )}
              </View>

              <Text style={styles.expiry}>Expires in 24 hours</Text>

              {/* <Pressable
                onPress={handleCopy}
                style={({ pressed }) => [styles.linkBox, pressed && styles.linkBoxPressed]}
              >
                <Text style={styles.linkText} numberOfLines={2}>
                  {share.url}
                </Text>
                <Text style={styles.copyHint}>{copied ? "Copied" : "Tap to copy"}</Text>
              </Pressable> */}

              <View style={styles.actions}>
                <GameButton
                  label={destroying ? "Destroying…" : "Destroy link"}
                  onPress={onDestroy}
                  variant="danger"
                  loading={destroying}
                  disabled={destroying}
                  style={styles.actionBtn}
                />
                <GameButton
                  label="Done"
                  onPress={onClose}
                  variant="secondary"
                  style={styles.actionBtn}
                />
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 24,
    padding: 20,
    gap: 14,
    backgroundColor: "#0B0F1A",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  close: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  closePressed: {
    opacity: 0.75,
  },
  closeText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  centerBlock: {
    alignItems: "center",
    gap: 16,
    paddingVertical: 28,
  },
  hint: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  errorText: {
    color: "#FCA5A5",
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
  },
  qrWrap: {
    alignSelf: "center",
    width: 248,
    height: 248,
    borderRadius: 16,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  qr: {
    width: 240,
    height: 240,
  },
  expiry: {
    textAlign: "center",
    color: COLORS.accentMuted,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  linkBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceRaised,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  linkBoxPressed: {
    opacity: 0.85,
  },
  linkText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  copyHint: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
  },
});
