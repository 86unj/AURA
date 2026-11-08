export const COLORS = {
  bg: "#05070C",
  surface: "rgba(10, 14, 26, 0.84)",
  surfaceRaised: "rgba(255,255,255,0.05)",
  border: "rgba(255,255,255,0.10)",
  text: "#F8FAFC",
  textSecondary: "#CBD5E1",
  textMuted: "#94A3B8",
  accent: "#E9D5FF",
  accentMuted: "#C4B5FD",
  onAccent: "#05070C",
};

export type Rarity = {
  key: "common" | "rare" | "epic" | "legendary" | "mythic";
  label: string;
  color: string;
};

const RARITIES: (Rarity & { min: number })[] = [
  { key: "mythic", label: "Mythic", color: "#F9A8D4", min: 95 },
  { key: "legendary", label: "Legendary", color: "#FDE68A", min: 85 },
  { key: "epic", label: "Epic", color: "#C4B5FD", min: 70 },
  { key: "rare", label: "Rare", color: "#93C5FD", min: 45 },
  { key: "common", label: "Common", color: "#CBD5E1", min: 0 },
];

export function getRarity(score: number): Rarity {
  const match = RARITIES.find((tier) => score >= tier.min) ?? RARITIES[RARITIES.length - 1];
  const { min: _min, ...rarity } = match;
  return rarity;
}
