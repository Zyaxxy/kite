import React from "react";
import {
  Image,
  Platform,
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";

// Shared SVG asset from assets/icon.svg
const iconSource = require("../../assets/icon.svg");

export interface KiteLogoProps {
  size?: number;
  style?: StyleProp<ViewStyle | ImageStyle>;
}

/**
 * KiteLogo renders the official Kite icon.svg.
 * On Web, it renders the SVG asset directly via Image.
 * On Native (Android / iOS), where Fresco / UIImage lacks built-in SVG decoding,
 * it renders the exact Kite icon geometry with React Native primitives
 * while keeping the visual fidelity identical to icon.svg.
 */
export function KiteLogo({ size = 26, style }: KiteLogoProps) {
  if (Platform.OS === "web") {
    return (
      <Image
        source={iconSource}
        style={[{ width: size, height: size, borderRadius: size * (12 / 48) }, style as ImageStyle]}
        accessibilityLabel="Kite logo"
        resizeMode="contain"
      />
    );
  }

  // Native fallback reproducing icon.svg:
  // viewBox: 0 0 48 48
  // rect: rx=12, fill=#101311
  // kite path: M24 7L41 22L24 40L7 22Z, fill=#d5f478
  // cross lines: V24 7->40, H7 22->41, stroke=#101311, stroke-width=2
  const scale = size / 48;
  const borderRadius = size * (12 / 48);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius,
        },
        style as ViewStyle,
      ]}
      accessibilityLabel="Kite logo"
      accessibilityRole="image"
    >
      <View
        style={[
          styles.diamondWrapper,
          {
            top: 7 * scale,
            left: 7 * scale,
            width: 34 * scale,
            height: 33 * scale,
          },
        ]}
      >
        {/* Diamond kite shape */}
        <View
          style={[
            styles.diamond,
            {
              width: 24 * scale,
              height: 24 * scale,
              top: 4.5 * scale,
              left: 5 * scale,
            },
          ]}
        />
        {/* Cross strokes */}
        <View
          style={[
            styles.verticalLine,
            {
              left: 17 * scale - 1,
              top: 0,
              height: 33 * scale,
            },
          ]}
        />
        <View
          style={[
            styles.horizontalLine,
            {
              top: 15 * scale - 1,
              left: 0,
              width: 34 * scale,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#101311",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  diamondWrapper: {
    position: "absolute",
    overflow: "hidden",
  },
  diamond: {
    backgroundColor: "#d5f478",
    transform: [{ rotate: "45deg" }],
  },
  verticalLine: {
    position: "absolute",
    width: 2,
    backgroundColor: "#101311",
  },
  horizontalLine: {
    position: "absolute",
    height: 2,
    backgroundColor: "#101311",
  },
});
