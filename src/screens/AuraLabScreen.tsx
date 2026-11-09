import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { COLORS } from "../theme/game";
import { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "AuraLab">;

/** Native placeholder. The real prototype lives in AuraLabScreen.web.tsx. */
export function AuraLabScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.shell}>
      <View style={styles.center}>
        <Text style={styles.title}>Aura lab is web only</Text>
        <Text style={styles.body}>
          Open this app in a laptop browser (npm run web) to try the live aura
          effect.
        </Text>
        <Pressable style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: COLORS.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  title: { color: COLORS.text, fontSize: 18, fontWeight: "800" },
  body: { color: COLORS.textMuted, fontSize: 14, textAlign: "center" },
  button: {
    height: 48,
    paddingHorizontal: 28,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent,
  },
  buttonText: { color: COLORS.onAccent, fontSize: 15, fontWeight: "900" },
});
