import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {
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
        <Stack.Screen name="tablet/index" />
      </Stack>
    </GestureHandlerRootView>
  );
}
