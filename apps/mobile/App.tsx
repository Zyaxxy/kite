import React, { useEffect, useState } from 'react';
import { BackHandler, Modal, SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import type { MarketAsset, MarketBasket } from '@kite/sdk';
import { Header, BottomNav, type Screen } from './src/components/Navigation';
import { KiteProvider, useKite } from './src/state/KiteProvider';
import { HomeScreen } from './src/screens/HomeScreen';
import { ExploreScreen } from './src/screens/ExploreScreen';
import { BasketsScreen } from './src/screens/BasketsScreen';
import { PortfolioScreen } from './src/screens/PortfolioScreen';
import { SipScreen, type PlanTarget } from './src/screens/SipScreen';
import { AssetScreen } from './src/screens/AssetScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { colors } from './src/theme';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { MobileTradingProvider } from './src/state/MobileTradingProvider';

function KiteApp() {
  const { market, resetAccount } = useKite();
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedAsset, setSelectedAsset] = useState<MarketAsset | null>(null);
  const [planTarget, setPlanTarget] = useState<PlanTarget | null>(null);
  const currentAsset = selectedAsset ? market?.assets.find(asset => asset.mint === selectedAsset.mint) ?? { ...selectedAsset, priceUsd: null, priceObservedAt: null } : null;

  function navigate(next: Screen) {
    if (next !== 'plans') setPlanTarget(null);
    setScreen(next);
  }
  function planAsset(asset: MarketAsset) { setPlanTarget({ targetId: asset.mint, targetType: 'asset', name: asset.name }); setSelectedAsset(null); setScreen('plans'); }
  function planBasket(basket: MarketBasket) { setPlanTarget({ targetId: basket.id, targetType: 'basket', name: basket.name }); setScreen('plans'); }

  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selectedAsset) { setSelectedAsset(null); return true; }
      if (screen !== 'home') { setScreen('home'); return true; }
      return false;
    });
    return () => listener.remove();
  }, [screen, selectedAsset]);

  return <SafeAreaView style={styles.safeArea}>
    <StatusBar barStyle="light-content" backgroundColor={colors.background} />
    <Header current={screen} onNavigate={navigate} />
    <View style={styles.container}>
      {screen === 'home' ? <HomeScreen onNavigate={navigate} onAsset={setSelectedAsset} /> : null}
      {screen === 'explore' || screen === 'watchlist' ? <ExploreScreen key={screen} onAsset={setSelectedAsset} onBaskets={() => navigate('baskets')} watchlistOnly={screen === 'watchlist'} /> : null}
      {screen === 'baskets' ? <BasketsScreen onPlan={planBasket} /> : null}
      {screen === 'portfolio' ? <PortfolioScreen onAsset={setSelectedAsset} onExplore={() => navigate('explore')} /> : null}
      {screen === 'plans' ? <SipScreen key={planTarget?.targetId ?? 'plans'} initialTarget={planTarget} /> : null}
      {screen === 'settings' ? <SettingsScreen onReset={resetAccount} /> : null}
    </View>
    <BottomNav current={screen} onNavigate={navigate} />
    <Modal visible={Boolean(currentAsset)} animationType="slide" onRequestClose={() => setSelectedAsset(null)}>
      <SafeAreaView style={styles.safeArea}>{currentAsset ? <AssetScreen asset={currentAsset} onClose={() => setSelectedAsset(null)} onPlan={planAsset} /> : null}</SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

export default function App() { return <AppErrorBoundary><KiteProvider><MobileTradingProvider><KiteApp /></MobileTradingProvider></KiteProvider></AppErrorBoundary>; }

const styles = StyleSheet.create({ safeArea: { flex: 1, minHeight: 0, width: '100%', maxWidth: 920, alignSelf: 'center', backgroundColor: colors.background }, container: { flex: 1, minHeight: 0, backgroundColor: colors.background } });
