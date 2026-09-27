import React from "react";
import { ScrollView, Text, View } from "react-native";
import { Button } from "../components/Primitives";
import { KiteLogo } from "../components/KiteLogo";
import { useTheme } from "../theme";

export function WelcomeScreen({
  onExplore,
  onSubscribe,
}: {
  onExplore(): void;
  onSubscribe(): void;
}) {
  const { colors, ui } = useTheme();
  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={[
        ui.content,
        { flexGrow: 1, justifyContent: "space-between" },
      ]}
    >
      <View style={[ui.row, { paddingTop: 24 }]}>
        <KiteLogo size={34} />
        <Text style={[ui.title, { fontSize: 34 }]}>kite</Text>
      </View>
      <View style={{ gap: 24, paddingVertical: 40 }}>
        <Text style={[ui.small, { color: colors.accent }]}>
          YOUR IDEAS. YOUR WALLET.
        </Text>
        <Text
          accessibilityRole="header"
          style={[ui.title, { fontSize: 44, lineHeight: 48 }]}
        >
          Make investing{"\n"}a habit.
        </Text>
        <Text style={ui.body}>
          Discover a basket you believe in. Choose an amount and a rhythm. Keep
          every asset in your own wallet.
        </Text>
        <View
          style={{
            borderLeftWidth: 2,
            borderColor: colors.accent,
            paddingLeft: 18,
            gap: 12,
          }}
        >
          <Text style={ui.label}>Daily · Weekly · Every 30 days</Text>
          <Text style={ui.small}>
            Recurring wallet plans currently use devnet test tokens. Mainnet
            spot purchases and paper investing are separate modes.
          </Text>
        </View>
      </View>
      <View style={ui.stack}>
        <Button label="Explore investments" onPress={onExplore} />
        <Button secondary label="Try a recurring plan" onPress={onSubscribe} />
        <Text style={[ui.small, { textAlign: "center", paddingVertical: 6 }]}>
          Browse first. Connect your wallet when you’re ready.
        </Text>
      </View>
    </ScrollView>
  );
}
