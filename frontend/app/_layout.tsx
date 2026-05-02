import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { loadServerConfig } from "../src/lib/serverConfig";
import { initLocalStore } from "../src/lib/localStore";
import { colors } from "../src/lib/theme";

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) setReady(true); // hard cutoff
    }, 3000);
    (async () => {
      try {
        await initLocalStore();
        await loadServerConfig();
      } catch {
        // ignore
      } finally {
        done = true;
        clearTimeout(timer);
        setReady(true);
      }
    })();
    return () => clearTimeout(timer);
  }, []);

  if (!ready) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="admin/login" />
        <Stack.Screen name="admin/index" />
        <Stack.Screen name="admin/create" />
        <Stack.Screen name="admin/manage" />
        <Stack.Screen name="admin/archive" />
        <Stack.Screen name="admin/settings" />
        <Stack.Screen name="admin/server" />
        <Stack.Screen name="tablet/index" />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.bgDark,
    alignItems: "center",
    justifyContent: "center",
  },
});
