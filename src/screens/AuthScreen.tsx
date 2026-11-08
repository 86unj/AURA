import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { AppLogo } from "../components/AppLogo";
import { useAuth } from "../context/AuthContext";

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isSignUp = mode === "signUp";

  async function handleSubmit() {
    if (submitting) {
      return;
    }

    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      Alert.alert("Missing info", "Enter both an email and a password.");
      return;
    }

    setSubmitting(true);

    try {
      const { error } = isSignUp
        ? await signUp(trimmedEmail, password)
        : await signIn(trimmedEmail, password);

      if (error) {
        Alert.alert(isSignUp ? "Sign up failed" : "Sign in failed", error);
        return;
      }

      if (isSignUp) {
        Alert.alert("Check your email", "Confirm your address, then sign in.");
        setMode("signIn");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <LinearGradient
      colors={["rgba(123, 108, 246, 0.18)", "#090D16", "#05070C"]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.background}
    >
      <SafeAreaView style={styles.screenShell}>
        <KeyboardAvoidingView
          style={styles.keyboardShell}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.card}>
            <View style={styles.brandLockup}>
              <AppLogo size={88} />
              <Text style={styles.brand}>AURA</Text>
            </View>
            <Text style={styles.title}>
              {isSignUp ? "Create your account" : "Welcome back"}
            </Text>
            <Text style={styles.subtitle}>
              {isSignUp
                ? "Sign up to start saving your aura scans."
                : "Sign in to view your saved aura scans."}
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
                keyboardType="email-address"
                editable={!submitting}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>PASSWORD</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="********"
                placeholderTextColor="rgba(255,255,255,0.35)"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password"
                editable={!submitting}
              />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
                submitting && styles.primaryButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#05070C" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isSignUp ? "Sign up" : "Sign in"}
                </Text>
              )}
            </Pressable>

            <Pressable
              style={styles.switchModeButton}
              onPress={() => setMode(isSignUp ? "signIn" : "signUp")}
              disabled={submitting}
            >
              <Text style={styles.switchModeText}>
                {isSignUp
                  ? "Already have an account? Sign in"
                  : "Need an account? Sign up"}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  screenShell: {
    flex: 1,
    paddingHorizontal: 20,
  },
  keyboardShell: {
    flex: 1,
    justifyContent: "center",
  },
  card: {
    backgroundColor: "rgba(10, 14, 26, 0.84)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 28,
    padding: 22,
    gap: 14,
  },
  brandLockup: {
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  brand: {
    color: "#C4B5FD",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 3,
  },
  title: {
    color: "#F8FAFC",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  subtitle: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    marginBottom: 4,
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
    height: 50,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "600",
  },
  primaryButton: {
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E9D5FF",
    marginTop: 6,
  },
  primaryButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: "#05070C",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  switchModeButton: {
    alignItems: "center",
    paddingVertical: 10,
  },
  switchModeText: {
    color: "#E9D5FF",
    fontSize: 13,
    fontWeight: "800",
  },
});
