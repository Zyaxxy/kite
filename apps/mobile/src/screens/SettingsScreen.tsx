import React, { useState } from 'react';
import { Alert, Linking, Platform, ScrollView, Text, View } from 'react-native';
import { Button, Chip } from '../components/Primitives';
import { API_BASE_URL, WEB_URL } from '../lib/config';
import { connectMobileWallet, type MobileWalletAccount } from '../lib/mobile-wallet';
import { ui } from '../theme';

export function SettingsScreen({ onReset }: { onReset: () => void }) {
  const [account, setAccount] = useState<MobileWalletAccount | null>(null);
  const [connecting, setConnecting] = useState(false);

  async function connect() {
    setConnecting(true);
    try { setAccount(await connectMobileWallet()); }
    catch (error) { Alert.alert('Wallet connection', error instanceof Error ? error.message : 'Connection could not be completed. Try again from a supported Android wallet.'); }
    finally { setConnecting(false); }
  }

  async function openTrading() {
    if (!WEB_URL) return;
    try { await Linking.openURL(`${WEB_URL}/settings`); }
    catch { Alert.alert('Unable to open Kite', 'Check your configured web URL and try again.'); }
  }

  return <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
    <View style={ui.stack}><Text style={ui.eyebrow}>YOUR SPACE</Text><Text style={ui.title}>Make it yours.</Text><Text style={ui.body}>Practice on your terms. Connect when you are ready.</Text></View>
    <View style={ui.card}>
      <Chip label="Paper trading" selected />
      <Text style={ui.heading}>A little room to explore.</Text>
      <Text style={ui.body}>Your paper cash, holdings, orders and plans are saved on this device. Virtual funding is a simulation; prices come from the live mainnet market API.</Text>
      <Button secondary label="Reset paper account" onPress={() => Alert.alert('Reset your paper account?', 'This removes paper holdings, orders and plans from this device. Your watchlist is kept.', [
        { text: 'Keep account', style: 'cancel' }, { text: 'Reset account', style: 'destructive', onPress: onReset },
      ])} />
    </View>
    <View style={ui.card}>
      <Text style={ui.eyebrow}>REAL TRADING</Text><Text style={ui.heading}>Your keys. Your next move.</Text>
      <Text style={ui.body}>Use Privy sign-in on Kite web to access actual trading. Every real transaction requires your approval. Paper activity stays separate from your wallet.</Text>
      <Button label="Continue with Privy on web" onPress={openTrading} disabled={!WEB_URL} />
      {!WEB_URL ? <Text style={ui.small}>A Kite web address has not been configured for this app.</Text> : null}
      {Platform.OS === 'android' ? <>
        <View style={ui.divider} /><Text style={ui.label}>Solana Mobile Wallet</Text>
        <Text style={ui.small}>{account ? `Connected to ${account.label || 'your wallet'} on Solana mainnet. No transaction has been signed.` : 'Connect a compatible Android wallet to authorize your account on mainnet.'}</Text>
        <Button secondary label={account ? 'Reconnect mobile wallet' : 'Connect mobile wallet'} onPress={connect} loading={connecting} />
      </> : null}
    </View>
    <View style={ui.card}><Text style={ui.eyebrow}>CONNECTION</Text>
      <View style={ui.between}><Text style={ui.label}>Network</Text><Text style={ui.body}>Solana mainnet</Text></View>
      <View style={ui.between}><Text style={ui.label}>Market service</Text><Text style={ui.body}>{API_BASE_URL ? 'Configured' : 'Not configured'}</Text></View>
      <Text style={ui.small}>Quotes can be delayed or unavailable. Paper fills use available market prices and are not a guarantee of real execution.</Text>
    </View>
  </ScrollView>;
}
