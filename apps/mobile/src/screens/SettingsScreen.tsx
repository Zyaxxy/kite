import React, { useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { Button, Chip, FilterRow } from "../components/Primitives";
import { API_BASE_URL, WEB_URL, API_CONFIGURATION_ERROR } from "../lib/config";
import { useMobileTrading } from "../state/MobileTradingProvider";
import { useTheme } from "../theme";

export function SettingsScreen({ onReset }: { onReset: () => void }) {
  const { colors, ui, mode, setMode } = useTheme();
  const wallet = useMobileTrading();
  const [showConnection, setShowConnection] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function open(path: string) {
    if (!WEB_URL) return;
    try {
      await Linking.openURL(`${WEB_URL}${path}`);
    } catch {
      setError("Kite web could not open. Check the configured web address.");
    }
  }
  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <View style={ui.stack}>
        <Text style={ui.title}>Settings</Text>
        <Text style={ui.body}>Your appearance, wallet and device data.</Text>
      </View>
      <View style={ui.card}>
        <Text style={ui.heading}>Appearance</Text>
        <Text style={ui.small}>
          Choose a theme for every screen. Your preference is saved on this
          device.
        </Text>
        <FilterRow
          options={["Light", "Dark"]}
          selected={mode === "dark" ? "Dark" : "Light"}
          onSelect={(value) => setMode(value === "Dark" ? "dark" : "light")}
        />
      </View>
      <View style={ui.card}>
        <Text style={ui.heading}>Device data & security</Text>
        <Text style={ui.body}>
          Your paper cash, holdings, orders and plans are saved on this device.
          Virtual funding is a simulation; prices come from the live mainnet
          market API.
        </Text>
        {confirmReset ? (
          <>
            <Text accessibilityRole="alert" style={ui.body}>
              Reset removes your paper holdings, orders and plans. Your
              watchlist and actual wallet stay intact.
            </Text>
            <Button
              secondary
              label="Keep paper account"
              onPress={() => setConfirmReset(false)}
            />
            <Button
              label="Confirm paper reset"
              onPress={() => {
                onReset();
                setConfirmReset(false);
              }}
            />
          </>
        ) : (
          <Button
            secondary
            label="Reset paper account"
            onPress={() => setConfirmReset(true)}
          />
        )}
      </View>
      <View style={ui.card}>
        <Text style={ui.heading}>Connected wallet</Text>
        <Text style={ui.body}>
          Every actual swap needs your approval. Your tokens stay in your
          wallet. Paper activity stays separate.
        </Text>
        {wallet.supported ? (
          <>
            <Text style={ui.label}>Solana Mobile Wallet</Text>
            <Text style={ui.small}>
              {wallet.account
                ? `${wallet.account.label || "Connected wallet"} · ${wallet.account.address.slice(0, 4)}…${wallet.account.address.slice(-4)}`
                : "Connect a compatible Android wallet, then open any asset and choose Actual to review a mainnet swap."}
            </Text>
            <Button
              label={
                wallet.account
                  ? "Reconnect mobile wallet"
                  : "Connect Android wallet"
              }
              onPress={() => {
                void wallet.connect();
              }}
              loading={wallet.busy}
              disabled={!wallet.ready}
            />
            {wallet.account ? (
              <Button
                secondary
                label="Disconnect wallet"
                disabled={wallet.busy}
                onPress={() => {
                  void wallet.disconnect();
                }}
              />
            ) : null}
          </>
        ) : (
          <Text style={ui.small}>
            Native wallet signing requires an Android development or release
            build. Expo Go, iOS and web previews can continue with Privy on Kite
            web.
          </Text>
        )}
        <Button
          secondary
          label="Continue with Privy on web"
          onPress={() => {
            void open("/settings");
          }}
          disabled={!WEB_URL || wallet.busy}
        />
        {wallet.error || error ? (
          <Text accessibilityRole="alert" style={[ui.small, ui.negative]}>
            {error || wallet.error}
          </Text>
        ) : null}
      </View>
      <View style={ui.card}>
        <Text style={ui.heading}>Network & service</Text>
        <View style={ui.between}>
          <Text style={ui.label}>Network</Text>
          <Text style={ui.body}>Mainnet · spot trades</Text>
        </View>
        <View style={ui.between}>
          <Text style={ui.label}>Market service</Text>
          <Text style={ui.body}>
            {API_BASE_URL ? "Configured" : "Needs setup"}
          </Text>
        </View>
        <View style={ui.between}>
          <Text style={ui.label}>Recurring</Text>
          <Text style={ui.body}>Devnet · test tokens</Text>
        </View>
        <Button
          secondary
          label={
            showConnection ? "Hide connection details" : "Connection details"
          }
          onPress={() => setShowConnection((value) => !value)}
        />
        {showConnection ? (
          <>
            <Text selectable style={ui.small}>
              {API_CONFIGURATION_ERROR || API_BASE_URL}
            </Text>
            <Text style={ui.small}>
              The app talks to Kite’s web API. An Expo tunnel serves the app
              bundle; a separate HTTPS API tunnel or deployment serves live
              data.
            </Text>
          </>
        ) : null}
      </View>
      <View style={ui.card}>
        <Text style={ui.heading}>About Kite</Text>
        <Button
          secondary
          label="Privacy policy"
          disabled={!WEB_URL}
          onPress={() => {
            void open("/privacy");
          }}
        />
        <Button
          secondary
          label="Terms and conditions"
          disabled={!WEB_URL}
          onPress={() => {
            void open("/terms");
          }}
        />
      </View>
    </ScrollView>
  );
}
