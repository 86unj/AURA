import { Image, ImageStyle, StyleProp } from "react-native";

type AppLogoProps = {
  size?: number;
  style?: StyleProp<ImageStyle>;
};

export function AppLogo({ size = 72, style }: AppLogoProps) {
  return (
    <Image
      accessibilityLabel="Aura logo"
      source={require("../../assets/logo.png")}
      style={[{ width: size, height: size }, style]}
    />
  );
}
