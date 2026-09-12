import React, { useState } from 'react';
import { StyleSheet, View, SafeAreaView, StatusBar } from 'react-native';
import { HomeScreen } from './src/screens/HomeScreen';
import { BasketsScreen } from './src/screens/BasketsScreen';
import { SipScreen } from './src/screens/SipScreen';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'home' | 'baskets' | 'sip'>('home');

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0E14" />
      <View style={styles.container}>
        {currentScreen === 'home' && <HomeScreen onNavigate={(s) => setCurrentScreen(s as any)} />}
        {currentScreen === 'baskets' && <BasketsScreen onBack={() => setCurrentScreen('home')} />}
        {currentScreen === 'sip' && <SipScreen onBack={() => setCurrentScreen('home')} />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0B0E14' },
  container: { flex: 1, backgroundColor: '#0B0E14' },
});
