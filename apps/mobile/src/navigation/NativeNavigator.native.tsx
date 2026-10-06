import React from "react";
import { Platform, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme,
  useNavigation,
  useRoute,
  type NavigatorScreenParams,
  type RouteProp,
} from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from "@react-navigation/native-stack";
import { createNativeBottomTabNavigator } from "@bottom-tabs/react-navigation";
import type { MarketAsset, MarketBasket } from "@kite/sdk";
import { Header, type Screen } from "../components/Navigation";
import { HomeScreen } from "../screens/HomeScreen";
import { ExploreScreen } from "../screens/ExploreScreen";
import { BasketsScreen } from "../screens/BasketsScreen";
import { PortfolioScreen } from "../screens/PortfolioScreen";
import { SipScreen, type PlanTarget } from "../screens/SipScreen";
import { AssetScreen } from "../screens/AssetScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { ActivityScreen } from "../screens/ActivityScreen";
import { WelcomeScreen } from "../screens/WelcomeScreen";
import { useKite } from "../state/KiteProvider";
import { useTheme } from "../theme";

type Tabs = {
  Explore: undefined;
  Subscriptions: { target?: PlanTarget } | undefined;
  Portfolio: undefined;
  Activity: undefined;
};
type Routes = {
  Welcome: undefined;
  Main: NavigatorScreenParams<Tabs>;
  Stocks: { watchlist?: boolean };
  Baskets: undefined;
  Asset: { asset: MarketAsset };
  Settings: undefined;
};
type Navigation = NativeStackNavigationProp<Routes>;
const Stack = createNativeStackNavigator<Routes>();
const Tab = createNativeBottomTabNavigator<Tabs>();
const icons = {
  Explore:
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAZUlEQVR4nO2VQQoAIAgE+/+n6x5kKuoW7kCnYBtI3DEI+ZSJevR0YA+ni2jD0yQsoeECnsBQid4C3qEKHcbeX/CEgDUwdRHBNuEerumCtHLSllBZQ0p3JRISlKAEJW4SUOACb7EAQFZyjgMW4esAAAAASUVORK5CYII=",
  Subscriptions:
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAQklEQVR4nO3UwQkAMAgEQftv2lSQj0bOcLvgV+YhRhAtLYcGQAnQDcD/APkRAugGwAdwOzgAPoCnu1YB5K/YE0A+HXTcKObZMe9AAAAAAElFTkSuQmCC",
  Portfolio:
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAPElEQVR4nO3SQQoAIAhFQe9/6Vq3DH5kNANu5SFWATQ1Do6A7YAEAX8FXH9CAZF9T19AQGRfq4D0CIDFBCpk9QtEA5RaAAAAAElFTkSuQmCC",
  Activity:
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAfklEQVR4nO2VwQ3AMAgDs//S7QIpwvhQGglLeRXb90joWqNRTU9wjhW3gijFOIgaikI4QTZEJkD5LkNkjNRM2UTP/QNAGW6ZHYBrAbCLWHm36D4gVq+dS0O0LaKst3UdR14rx/qTbfyVDCvALv8KUt67XR6FZg+qY8UKyOguvUBU7hItrMF9AAAAAElFTkSuQmCC",
};
const symbols = {
  Explore: "safari",
  Subscriptions: "calendar",
  Portfolio: "wallet.pass",
  Activity: "clock.arrow.circlepath",
};
function navigateScreen(navigation: Navigation, screen: Screen) {
  if (screen === "explore" || screen === "watchlist")
    navigation.navigate("Stocks", { watchlist: screen === "watchlist" });
  else if (screen === "baskets") navigation.navigate("Baskets");
  else if (screen === "settings") navigation.navigate("Settings");
  else
    navigation.navigate("Main", {
      screen:
        screen === "plans"
          ? "Subscriptions"
          : screen === "portfolio"
            ? "Portfolio"
            : screen === "activity"
              ? "Activity"
              : "Explore",
    });
}
function toAsset(navigation: Navigation) {
  return (asset: MarketAsset) => navigation.navigate("Asset", { asset });
}
function toPlan(
  navigation: Navigation,
  type: "asset" | "basket",
  target: MarketAsset | MarketBasket,
  mode: "Paper" | "Actual",
) {
  navigation.navigate("Main", {
    screen: "Subscriptions",
    params: {
      target: {
        targetType: type,
        targetId: "mint" in target ? target.mint : target.id,
        name: target.name,
        mode,
      },
    },
  });
}
function Landing() {
  const navigation = useNavigation<Navigation>();
  const { colors } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <WelcomeScreen
        onExplore={() => navigation.replace("Main", { screen: "Explore" })}
        onSubscribe={() =>
          navigation.replace("Main", { screen: "Subscriptions" })
        }
      />
    </SafeAreaView>
  );
}
function Discovery() {
  const navigation = useNavigation<Navigation>();
  return (
    <HomeScreen
      onNavigate={(screen) => navigateScreen(navigation, screen)}
      onAsset={toAsset(navigation)}
    />
  );
}
function Subscriptions() {
  const route = useRoute<RouteProp<Tabs, "Subscriptions">>();
  const target = route.params?.target ?? null;
  return (
    <SipScreen
      key={`${target?.targetId ?? "subscriptions"}:${target?.mode ?? "default"}`}
      initialTarget={target}
    />
  );
}
function Portfolio() {
  const navigation = useNavigation<Navigation>();
  return (
    <PortfolioScreen
      onAsset={toAsset(navigation)}
      onExplore={() => navigation.navigate("Stocks", {})}
    />
  );
}
function Stocks() {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<RouteProp<Routes, "Stocks">>();
  return (
    <ExploreScreen
      onAsset={toAsset(navigation)}
      onBaskets={() => navigation.navigate("Baskets")}
      watchlistOnly={route.params.watchlist}
    />
  );
}
function Baskets() {
  const navigation = useNavigation<Navigation>();
  return (
    <BasketsScreen
      onPlan={(basket, mode = "Paper") =>
        toPlan(navigation, "basket", basket, mode)
      }
    />
  );
}
function Asset() {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<RouteProp<Routes, "Asset">>();
  const { market } = useKite();
  const asset = market?.assets.find(
    (item) => item.mint === route.params.asset.mint,
  ) ?? { ...route.params.asset, priceUsd: null, priceObservedAt: null };
  const { colors } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <AssetScreen
        asset={asset}
        onClose={() => navigation.goBack()}
        onPlan={(target, mode = "Paper") =>
          toPlan(navigation, "asset", target, mode)
        }
      />
    </SafeAreaView>
  );
}
function Settings() {
  const { resetAccount } = useKite();
  return <SettingsScreen onReset={resetAccount} />;
}
function MainTabs() {
  const navigation = useNavigation<Navigation>();
  const { colors } = useTheme();
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <Header
        current="home"
        onNavigate={(screen) => navigateScreen(navigation, screen)}
      />
      <Tab.Navigator
        labeled
        barTintColor={colors.surface}
        tabBarInactiveTintColor={colors.muted}
        activeIndicatorColor={colors.raised}
        screenOptions={({ route }) => ({
          tabBarActiveTintColor: colors.accent,
          tabBarIcon: () =>
            Platform.OS === "ios"
              ? { sfSymbol: symbols[route.name] }
              : { uri: `data:image/png;base64,${icons[route.name]}` },
        })}
      >
        <Tab.Screen name="Explore" component={Discovery} />
        <Tab.Screen name="Subscriptions" component={Subscriptions} />
        <Tab.Screen name="Portfolio" component={Portfolio} />
        <Tab.Screen name="Activity" component={ActivityScreen} />
      </Tab.Navigator>
    </SafeAreaView>
  );
}

export function NativeNavigator() {
  const { colors, mode } = useTheme();
  const base = mode === "dark" ? DarkTheme : DefaultTheme;
  return (
    <NavigationContainer
      theme={{
        ...base,
        colors: {
          ...base.colors,
          primary: colors.accent,
          background: colors.background,
          card: colors.surface,
          text: colors.ink,
          border: colors.line,
        },
      }}
    >
      <StatusBar
        barStyle={mode === "dark" ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />
      <Stack.Navigator
        screenOptions={{
          headerTintColor: colors.ink,
          headerStyle: { backgroundColor: colors.background },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen
          name="Welcome"
          component={Landing}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Main"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Stocks"
          component={Stocks}
          options={({ route }) => ({
            title: route.params.watchlist ? "Watchlist" : "Stocks",
          })}
        />
        <Stack.Screen
          name="Baskets"
          component={Baskets}
          options={{ title: "Theme baskets" }}
        />
        <Stack.Screen
          name="Asset"
          component={Asset}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Settings"
          component={Settings}
          options={{ title: "Settings" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
