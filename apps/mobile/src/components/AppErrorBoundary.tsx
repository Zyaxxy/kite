import React, { type ReactNode } from "react";
import { SafeAreaView, Text } from "react-native";
import { Button } from "./Primitives";
import { KiteLogo } from "./KiteLogo";
import { useTheme } from "../theme";

/** A render error must leave a usable recovery screen on web and native. */
export class AppErrorBoundary extends React.Component<
  { children: ReactNode },
  { failed: boolean; revision: number }
> {
  state = { failed: false, revision: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <RecoveryScreen
          onRetry={() =>
            this.setState((state) => ({
              failed: false,
              revision: state.revision + 1,
            }))
          }
        />
      );
    return (
      <React.Fragment key={this.state.revision}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

function RecoveryScreen({ onRetry }: { onRetry: () => void }) {
  const { ui } = useTheme();
  return (
    <SafeAreaView style={[ui.screen, ui.content, { justifyContent: "center" }]}>
      <KiteLogo size={32} />
      <Text style={ui.title}>Let’s get you back.</Text>
      <Text style={ui.body}>
        This screen could not open. Your saved paper account stays on this
        device. Reopen the app if retrying does not help.
      </Text>
      <Button label="Try again" onPress={onRetry} />
    </SafeAreaView>
  );
}
