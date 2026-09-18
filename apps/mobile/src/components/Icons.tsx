import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

interface IconProps {
  color?: string;
  size?: number;
  style?: ViewStyle;
}

/**
 * High-craft native vector icons built from pure React Native primitives.
 * Zero external font or native-library dependencies; renders pixel-perfect
 * across Android, iOS, and Expo Web with no clipping or layout shift.
 */

export function IconChevronRight({ color = "#9AA795", size = 16, style }: IconProps) {
  const half = size / 2;
  return (
    <View
      style={[
        styles.centerBox,
        { width: size, height: size },
        style,
      ]}
      accessibilityElementsHidden
    >
      <View
        style={{
          width: half * 0.75,
          height: half * 0.75,
          borderTopWidth: 1.75,
          borderRightWidth: 1.75,
          borderColor: color,
          transform: [{ rotate: "45deg" }],
          marginLeft: -half * 0.25,
        }}
      />
    </View>
  );
}

export function IconArrowUpRight({ color = "#9AA795", size = 16, style }: IconProps) {
  const w = size * 0.6;
  return (
    <View
      style={[
        styles.centerBox,
        { width: size, height: size },
        style,
      ]}
      accessibilityElementsHidden
    >
      {/* Corner arrow head */}
      <View
        style={{
          position: "absolute",
          top: size * 0.2,
          right: size * 0.2,
          width: w * 0.6,
          height: w * 0.6,
          borderTopWidth: 1.75,
          borderRightWidth: 1.75,
          borderColor: color,
        }}
      />
      {/* Diagonal stem */}
      <View
        style={{
          position: "absolute",
          width: 1.75,
          height: w * 0.95,
          backgroundColor: color,
          transform: [{ rotate: "45deg" }],
          top: size * 0.22,
          right: size * 0.38,
        }}
      />
    </View>
  );
}

export function IconSun({ color = "#F4F6EF", size = 20, style }: IconProps) {
  const r = size * 0.38;
  return (
    <View
      style={[
        styles.centerBox,
        { width: size, height: size },
        style,
      ]}
      accessibilityElementsHidden
    >
      {/* Central sun ring */}
      <View
        style={{
          width: r * 2,
          height: r * 2,
          borderRadius: r,
          borderWidth: 1.75,
          borderColor: color,
        }}
      />
      {/* Rays */}
      <View
        style={[
          styles.ray,
          { top: 1, width: 1.75, height: 2.5, backgroundColor: color },
        ]}
      />
      <View
        style={[
          styles.ray,
          { bottom: 1, width: 1.75, height: 2.5, backgroundColor: color },
        ]}
      />
      <View
        style={[
          styles.ray,
          { left: 1, width: 2.5, height: 1.75, backgroundColor: color },
        ]}
      />
      <View
        style={[
          styles.ray,
          { right: 1, width: 2.5, height: 1.75, backgroundColor: color },
        ]}
      />
    </View>
  );
}

export function IconMoon({ color = "#F4F6EF", size = 20, style }: IconProps) {
  const r = size * 0.42;
  return (
    <View
      style={[
        styles.centerBox,
        { width: size, height: size },
        style,
      ]}
      accessibilityElementsHidden
    >
      <View
        style={{
          width: r * 2,
          height: r * 2,
          borderRadius: r,
          borderWidth: 1.75,
          borderColor: color,
          borderRightColor: "transparent",
          borderTopColor: "transparent",
          transform: [{ rotate: "-45deg" }],
        }}
      />
    </View>
  );
}

export function IconBookmark({ color = "#9AA795", size = 16, style }: IconProps) {
  return (
    <View
      style={[
        styles.centerBox,
        { width: size, height: size },
        style,
      ]}
      accessibilityElementsHidden
    >
      <View
        style={{
          width: size * 0.65,
          height: size * 0.85,
          borderWidth: 1.5,
          borderColor: color,
          borderTopLeftRadius: 2,
          borderTopRightRadius: 2,
          borderBottomLeftRadius: 2,
          borderBottomRightRadius: 2,
        }}
      />
    </View>
  );
}

export function IconTrendingUp({ color = "#D5F478", size = 16, style }: IconProps) {
  return (
    <View
      style={[
        styles.centerBox,
        { width: size, height: size },
        style,
      ]}
      accessibilityElementsHidden
    >
      <View
        style={{
          width: size * 0.7,
          height: size * 0.4,
          borderBottomWidth: 1.75,
          borderRightWidth: 1.75,
          borderColor: color,
          transform: [{ rotate: "-45deg" }],
          marginTop: -2,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centerBox: {
    alignItems: "center",
    justifyContent: "center",
  },
  ray: {
    position: "absolute",
    borderRadius: 1,
  },
});
