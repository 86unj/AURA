import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import { GameButton } from "../components/GameButton";
import { useAuth } from "../context/AuthContext";
import { RootStackParamList } from "../navigation/types";
import { COLORS } from "../theme/game";

type Props = NativeStackScreenProps<RootStackParamList, "ProfileSettings">;

export function ProfileSettingsScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const {
    user,
    displayName,
    updateDisplayName,
    updateEmail,
    updatePassword,
    signOut,
  } = useAuth();

  const [name, setName] = useState(displayName);
  const [email, setEmail] = useState(user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setName(displayName);
  }, [displayName]);

  useEffect(() => {
    setEmail(user?.email ?? "");
  }, [user?.email]);

  async function handleSaveName() {
    if (savingName) return;

    setSavingName(true);
    try {
      const { error } = await updateDisplayName(name);
      if (error) {
        Alert.alert("Could not update name", error);
        return;
      }
      Alert.alert("Profile updated", "Your display name was saved.");
    } finally {
      setSavingName(false);
    }
  }

  async function handleSaveEmail() {
    if (savingEmail) return;

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert("Missing email", "Enter an email address.");
      return;
    }

    if (trimmed === (user?.email ?? "").toLowerCase()) {
      Alert.alert("No change", "That is already your current email.");
      return;
    }

    setSavingEmail(true);
    try {
      const { error } = await updateEmail(trimmed);
      if (error) {
        Alert.alert("Could not update email", error);
        return;
      }
      Alert.alert(
        "Confirm your email",
        "Check your inbox to confirm the new address before it becomes active.",
      );
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleChangePassword() {
    if (savingPassword) return;

    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Missing info", "Fill in all password fields.");
      return;
    }

    if (newPassword.length < 8) {
      Alert.alert(
        "Weak password",
        "Use at least 8 characters for your new password.",
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Mismatch", "New password and confirmation do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      Alert.alert(
        "No change",
        "Choose a new password that is different from the current one.",
      );
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await updatePassword(currentPassword, newPassword);
      if (error) {
        Alert.alert("Could not change password", error);
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert("Password updated", "Your password has been changed.");
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleSignOut() {
    if (signingOut) return;

    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  const busy = savingName || savingEmail || savingPassword || signingOut;

  return (
    <LinearGradient
      colors={["rgba(123, 108, 246, 0.16)", "#090D16", "#05070C"]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.background}
    >
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.column}>
              <View style={styles.header}>
                <View style={styles.headerTop}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.backButton,
                      pressed && styles.backButtonPressed,
                    ]}
                    onPress={() => navigation.goBack()}
                    disabled={busy}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                  >
                    <Ionicons
                      name="chevron-back"
                      size={22}
                      color={COLORS.text}
                    />
                  </Pressable>
                  <View style={styles.headerTitleBlock}>
                    <Text style={styles.kicker}>ACCOUNT</Text>
                    <Text
                      style={[styles.title, compact && styles.titleCompact]}
                      numberOfLines={1}
                    >
                      Profile settings
                    </Text>
                  </View>
                  <View style={styles.headerBalance} />
                </View>
              </View>

              {/* <View style={[styles.card, compact && styles.cardCompact]}>
                <Text style={styles.sectionTitle}>PROFILE</Text>
                <Text style={styles.sectionHint}>
                  Your display name around Aura.
                </Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>DISPLAY NAME</Text>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Aura explorer"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    autoCapitalize="words"
                    autoComplete="name"
                    textContentType="name"
                    returnKeyType="done"
                    editable={!busy}
                  />
                </View>

                <GameButton
                  label="Save name"
                  onPress={handleSaveName}
                  loading={savingName}
                  disabled={busy || name.trim() === displayName}
                />
              </View> */}

              {/* <View style={[styles.card, compact && styles.cardCompact]}>
                <Text style={styles.sectionTitle}>EMAIL</Text>
                <Text style={styles.sectionHint}>
                  Confirm the new address from your inbox after changing.
                </Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>EMAIL</Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    autoCapitalize="none"
                    autoComplete="email"
                    textContentType="emailAddress"
                    keyboardType="email-address"
                    returnKeyType="done"
                    editable={!busy}
                  />
                </View>

                <GameButton
                  label="Update email"
                  onPress={handleSaveEmail}
                  loading={savingEmail}
                  disabled={
                    busy ||
                    email.trim().toLowerCase() ===
                      (user?.email ?? "").toLowerCase()
                  }
                  variant="secondary"
                />
              </View> */}

              <View style={[styles.card, compact && styles.cardCompact]}>
                <Text style={styles.sectionTitle}>PASSWORD</Text>
                <Text style={styles.sectionHint}>
                  Current password, then a new one with 8+ characters.
                </Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>CURRENT</Text>
                  <TextInput
                    style={styles.input}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    placeholder="********"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="password"
                    textContentType="password"
                    returnKeyType="next"
                    editable={!busy}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>NEW</Text>
                  <TextInput
                    style={styles.input}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="********"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="password-new"
                    textContentType="newPassword"
                    returnKeyType="next"
                    editable={!busy}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>CONFIRM</Text>
                  <TextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="********"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="password-new"
                    textContentType="newPassword"
                    returnKeyType="done"
                    editable={!busy}
                  />
                </View>

                <GameButton
                  label="Change password"
                  onPress={handleChangePassword}
                  loading={savingPassword}
                  disabled={busy}
                  variant="secondary"
                />
              </View> 
              <GameButton
                label="Sign out"
                onPress={handleSignOut}
                loading={signingOut}
                disabled={busy}
                variant="danger"
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 18,
  },
  column: {
    width: "100%",
    gap: 12,
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
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonPressed: {
    opacity: 0.7,
  },
  headerTitleBlock: {
    flex: 1,
    alignItems: "center",
  },
  headerBalance: {
    width: 40,
    height: 40,
  },
  kicker: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    marginBottom: 4,
    textAlign: "center",
  },
  title: {
    color: COLORS.text,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "900",
    letterSpacing: -0.8,
    textAlign: "center",
  },
  titleCompact: {
    fontSize: 22,
    lineHeight: 28,
  },

  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    padding: 16,
    gap: 12,
  },
  cardCompact: {
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    color: COLORS.accentMuted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  sectionHint: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    marginTop: -4,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    color: "rgba(255,255,255,0.52)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  input: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 12,
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    // 16px avoids iOS Safari zooming into focused inputs.
    fontSize: 16,
    fontWeight: "600",
  },
});
