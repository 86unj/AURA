import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "../theme/game";

export type MenuItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

type Props = {
  items: MenuItem[];
  disabled?: boolean;
};

/** Hamburger button that opens a right-side menu. Add new entries (e.g. Profile) via `items`. */
export function MenuButton({ items, disabled }: Props) {
  const [open, setOpen] = useState(false);

  function handleSelect(item: MenuItem) {
    setOpen(false);
    item.onPress();
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        hitSlop={10}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
      >
        <Ionicons name="menu-outline" size={26} color={COLORS.text} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
          />
          <SafeAreaView style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Menu</Text>
              <Pressable
                onPress={() => setOpen(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close menu"
              >
                <Ionicons name="close" size={24} color={COLORS.text} />
              </Pressable>
            </View>
            {items.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => handleSelect(item)}
                style={({ pressed }) => [styles.item, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <Ionicons
                  name={item.icon}
                  size={22}
                  color={COLORS.accentMuted}
                />
                <Text style={styles.itemText}>{item.label}</Text>
              </Pressable>
            ))}
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.45 },
  backdrop: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  panel: {
    width: 280,
    maxWidth: "80%",
    backgroundColor: "#0B0F1A",
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  panelTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  itemText: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "700",
  },
});
