import { useEffect, useState } from "react";
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  loadServerConfig,
  saveServerConfig,
  clearServerConfig,
  notifyServerConfigChanged,
  getServerConfigSync,
} from "../../src/lib/serverConfig";
import { colors } from "../../src/lib/theme";

type TestStatus = "idle" | "testing" | "success" | "failure";

export default function ServerSettings() {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [derivedApi, setDerivedApi] = useState("");
  const [derivedWs, setDerivedWs] = useState("");
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const cfg = await loadServerConfig();
      if (cfg) {
        setBaseUrl(cfg.baseUrl);
        setApiKey(cfg.apiKey || "");
        setDerivedApi(cfg.apiBaseUrl);
        setDerivedWs(cfg.wsUrl);
      }
    })();
  }, []);

  const recomputeDerived = (url: string) => {
    setBaseUrl(url);
    const trimmed = url.trim().replace(/\/+$/, "");
    if (!trimmed) {
      setDerivedApi("");
      setDerivedWs("");
      return;
    }
    const api = `${trimmed}/api`;
    const ws = api.replace(/^http/, "ws") + "/ws";
    setDerivedApi(api);
    setDerivedWs(ws);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveServerConfig(baseUrl, apiKey);
      notifyServerConfigChanged();
      Alert.alert(
        "Gespeichert",
        baseUrl.trim() ? "Server-Einstellungen gespeichert." : "Offline-Modus aktiviert."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    Alert.alert(
      "Zurücksetzen",
      "Server-Einstellungen löschen und in den Offline-Modus wechseln?",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Zurücksetzen",
          style: "destructive",
          onPress: async () => {
            await clearServerConfig();
            notifyServerConfigChanged();
            setBaseUrl("");
            setApiKey("");
            setDerivedApi("");
            setDerivedWs("");
            setTestStatus("idle");
            Alert.alert("Erledigt", "Offline-Modus aktiviert.");
          },
        },
      ]
    );
  };

  const handleTest = async () => {
    const url = baseUrl.trim().replace(/\/+$/, "");
    if (!url) {
      Alert.alert("Fehler", "Bitte Server-URL eingeben.");
      return;
    }
    setTestStatus("testing");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const headers: Record<string, string> = {};
      if (apiKey.trim()) headers["X-API-Key"] = apiKey.trim();
      const res = await fetch(`${url}/api/update-info`, {
        method: "GET",
        headers,
        signal: ctrl.signal,
      });
      if (res.ok) {
        setTestStatus("success");
      } else {
        setTestStatus("failure");
      }
    } catch {
      setTestStatus("failure");
    } finally {
      clearTimeout(timer);
    }
  };

  const current = getServerConfigSync();
  const isOffline = !current;

  return (
    <SafeAreaView style={styles.safe} testID="server-settings-screen">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="back-btn">
            <Ionicons name="chevron-back" size={28} color={colors.textDark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>SERVER-EINSTELLUNGEN</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
          <View
            style={[
              styles.statusBanner,
              { borderColor: isOffline ? colors.orange : colors.green },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isOffline ? colors.orange : colors.green },
              ]}
            />
            <Text style={styles.statusText}>
              {isOffline ? "Offline-Modus aktiv" : "Online – Verbunden mit Server"}
            </Text>
          </View>

          <View>
            <Text style={styles.label}>SERVER URL</Text>
            <TextInput
              value={baseUrl}
              onChangeText={recomputeDerived}
              placeholder="https://api.example.com"
              placeholderTextColor={colors.textMutedDark}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.input}
              testID="server-url-input"
            />
            <Text style={styles.hint}>Basis-URL Ihres Servers (ohne /api)</Text>
          </View>

          <View>
            <Text style={styles.label}>API BASE URL (automatisch)</Text>
            <View style={styles.readonly}>
              <Text style={styles.readonlyText} testID="api-base-url">
                {derivedApi || "—"}
              </Text>
            </View>
          </View>

          <View>
            <Text style={styles.label}>WEBSOCKET URL (automatisch)</Text>
            <View style={styles.readonly}>
              <Text style={styles.readonlyText} testID="ws-url">
                {derivedWs || "—"}
              </Text>
            </View>
          </View>

          <View>
            <Text style={styles.label}>API KEY (optional)</Text>
            <TextInput
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="Optional – nur falls Server einen Schlüssel verlangt"
              placeholderTextColor={colors.textMutedDark}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={styles.input}
              testID="api-key-input"
            />
          </View>

          {testStatus !== "idle" && (
            <View
              style={[
                styles.testBox,
                {
                  borderColor:
                    testStatus === "success"
                      ? colors.green
                      : testStatus === "failure"
                      ? colors.red
                      : colors.borderDark,
                },
              ]}
            >
              {testStatus === "testing" && (
                <>
                  <ActivityIndicator color={colors.yellow} />
                  <Text style={styles.testText}>Teste Verbindung…</Text>
                </>
              )}
              {testStatus === "success" && (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={colors.green} />
                  <Text style={[styles.testText, { color: colors.green }]}>
                    Verbunden
                  </Text>
                </>
              )}
              {testStatus === "failure" && (
                <>
                  <Ionicons name="close-circle" size={20} color={colors.red} />
                  <Text style={[styles.testText, { color: colors.red }]}>
                    Keine Verbindung
                  </Text>
                </>
              )}
            </View>
          )}

          <TouchableOpacity
            style={styles.btnGhost}
            onPress={handleTest}
            testID="test-connection-btn"
            disabled={testStatus === "testing"}
          >
            <Ionicons name="pulse-outline" size={18} color={colors.textDark} />
            <Text style={styles.btnGhostText}>Verbindung testen</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnPrimary, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            testID="save-server-btn"
          >
            {saving ? (
              <ActivityIndicator color="#0A0A0A" />
            ) : (
              <Text style={styles.btnPrimaryText}>SPEICHERN</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btnDanger}
            onPress={handleReset}
            testID="reset-server-btn"
          >
            <Ionicons name="trash-outline" size={16} color={colors.red} />
            <Text style={styles.btnDangerText}>Zurücksetzen (Offline-Modus)</Text>
          </TouchableOpacity>

          <Text style={styles.footerHint}>
            Wenn die Felder leer sind, arbeitet die App im Offline-Modus — alle Daten
            werden lokal auf dem Gerät gespeichert und bleiben auch nach einem Update
            oder Neustart erhalten.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgDark },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  headerTitle: { color: colors.textDark, fontWeight: "900", letterSpacing: 2, fontSize: 13 },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surfaceDark,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: colors.textDark, fontSize: 14, fontWeight: "700" },
  label: {
    color: colors.textMutedDark,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "700",
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    color: colors.textDark,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 15,
    borderRadius: 10,
  },
  readonly: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderStyle: "dashed",
    paddingHorizontal: 14,
    minHeight: 48,
    borderRadius: 10,
    justifyContent: "center",
  },
  readonlyText: { color: colors.textMutedDark, fontSize: 13, fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }) },
  hint: { color: colors.textMutedDark, fontSize: 11, marginTop: 6, fontStyle: "italic" },
  testBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: colors.surfaceDark,
  },
  testText: { color: colors.textDark, fontSize: 14, fontWeight: "600" },
  btnGhost: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 10,
  },
  btnGhostText: { color: colors.textDark, fontWeight: "700", letterSpacing: 1 },
  btnPrimary: {
    backgroundColor: colors.yellow,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  btnPrimaryText: { color: "#0A0A0A", fontWeight: "900", letterSpacing: 2 },
  btnDanger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderWidth: 1,
    borderColor: colors.red,
    borderRadius: 10,
  },
  btnDangerText: { color: colors.red, fontWeight: "700", letterSpacing: 1, fontSize: 13 },
  footerHint: {
    color: colors.textMutedDark,
    fontSize: 11,
    lineHeight: 16,
    fontStyle: "italic",
    marginTop: 4,
  },
});
