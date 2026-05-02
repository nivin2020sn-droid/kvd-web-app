import { useState } from "react";
import {
  Text,
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, setToken } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";

export default function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!password) return;
    setLoading(true);
    try {
      const res = await api<{ token: string }>("/admin/login", {
        method: "POST",
        body: { password },
      });
      await setToken(res.token);
      router.replace("/admin");
    } catch (e: any) {
      Alert.alert("Fehler", "Falsches Passwort");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} testID="admin-login-screen">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.container}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back} testID="back-btn">
            <Ionicons name="chevron-back" size={28} color={colors.textDark} />
          </TouchableOpacity>

          <View style={styles.header}>
            <Ionicons name="lock-closed-outline" size={48} color={colors.yellow} />
            <Text style={styles.title}>ADMIN BEREICH</Text>
            <Text style={styles.subtitle}>Bitte Passwort eingeben</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>PASSWORT</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••"
              placeholderTextColor={colors.textMutedDark}
              autoFocus
              testID="admin-password-input"
              onSubmitEditing={handleLogin}
            />

            <TouchableOpacity
              style={[styles.button, loading && { opacity: 0.6 }]}
              onPress={handleLogin}
              disabled={loading}
              testID="admin-login-submit-button"
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#0A0A0A" />
              ) : (
                <Text style={styles.buttonText}>ANMELDEN</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.hint}>Standardpasswort: admin123</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgDark },
  flex: { flex: 1 },
  container: { flex: 1, padding: 24 },
  back: { marginTop: 8, padding: 4, alignSelf: "flex-start" },
  header: { alignItems: "flex-start", marginTop: 40, gap: 12 },
  title: {
    color: colors.textDark,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 8,
  },
  subtitle: { color: colors.textMutedDark, fontSize: 14, letterSpacing: 1 },
  form: { marginTop: 48, gap: 12 },
  label: {
    color: colors.textMutedDark,
    fontSize: 11,
    letterSpacing: 3,
    fontWeight: "700",
  },
  input: {
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    color: colors.textDark,
    paddingHorizontal: 16,
    height: 56,
    fontSize: 18,
  },
  button: {
    backgroundColor: colors.yellow,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  buttonText: {
    color: "#0A0A0A",
    fontWeight: "900",
    letterSpacing: 3,
    fontSize: 16,
  },
  hint: {
    color: colors.textMutedDark,
    fontSize: 12,
    textAlign: "center",
    marginTop: 16,
  },
});
