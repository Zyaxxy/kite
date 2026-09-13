import React, { type ReactNode } from "react";
import { SafeAreaView, Text } from "react-native";
import { Button } from "./Primitives";
import { ui } from "../theme";

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
        <SafeAreaView
          style={[ui.screen, ui.content, { justifyContent: "center" }]}
        >
          <Text style={ui.eyebrow}>KITE</Text>
          <Text style={ui.title}>Let’s get you back.</Text>
          <Text style={ui.body}>
            This screen could not open. Your saved paper account stays on this
            device. Reopen the app if retrying does not help.
          </Text>
          <Button
            label="Try again"
            onPress={() =>
              this.setState((state) => ({
                failed: false,
                revision: state.revision + 1,
              }))
            }
          />
        </SafeAreaView>
      );
    return (
      <React.Fragment key={this.state.revision}>
        {this.props.children}
      </React.Fragment>
    );
  }
}
