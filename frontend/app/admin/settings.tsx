import { useEffect, useState } from "react";
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  Image,
  Alert,
  Linking,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api, AppSettings } from "../../src/lib/api";
import { colors, presetBackgrounds } from "../../src/lib/theme";
import { APP_VERSION } from "../../src/lib/version";

interface UpdateInfo {
  latest_version: string;
  download_url: string;
  changelog?: string;
  mandatory?: boolean;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

export default function Settings() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "checked-latest" | "available"
  >("idle");

  const load = async () => {
    const s = await api<AppSettings>("/settings");
    setSettings(s);
  };

  useEffect(() => {
    load();
  }, []);

  const update = async (patch: Partial<AppSettings & { password?: string }>) => {
    setSaving(true);
    try {
      const s = await api<AppSettings>("/settings", {
        method: "PUT",
        auth: true,
        body: patch,
      });
      setSettings(s);
    } catch (e: any) {
      Alert.alert("Fehler", e?.message || "Fehler");
    } finally {
      setSaving(false);
    }
  };

  const pickImage = async (kind: "logo" | "background") => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Zugriff verweigert", "Bitte Galerie-Zugriff erlauben.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
      allowsEditing: true,
      aspect: kind === "logo" ? [1, 1] : [16, 9],
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset.base64) return;
    const dataUrl = `data:image/jpeg;base64,${asset.base64}`;
    if (kind === "logo") {
      await update({ logo_base64: dataUrl });
    } else {
      await update({ background_type: "image", background_value: dataUrl });
    }
  };

  const updatePassword = async () => {
    const p = newPassword.trim();
    if (p.length < 3) {
      Alert.alert("Fehler", "Mindestens 3 Zeichen");
      return;
    }
    await update({ password: p } as any);
    setNewPassword("");
    Alert.alert("Gespeichert", "Passwort wurde geändert.");
  };

  const checkForUpdates = async () => {
    setChecking(true);
    try {
      const info = await api<UpdateInfo>("/update-info");
      setUpdateInfo(info);
      const cmp = compareVersions(info.latest_version, APP_VERSION);
      if (cmp > 0) {
        setUpdateStatus("available");
      } else {
        setUpdateStatus("checked-latest");
      }
    } catch (e: any) {
      Alert.alert("Fehler", "Update-Prüfung fehlgeschlagen");
    } finally {
      setChecking(false);
    }
  };

  const downloadUpdate = async () => {
    if (!updateInfo?.download_url) {
      Alert.alert("Keine URL", "Download-Link wurde noch nicht konfiguriert.");
      return;
    }
    Alert.alert(
      "Update herunterladen",
      "Ihre Daten (Aufgaben, Archiv, Listen, Einstellungen) bleiben erhalten. Download starten?",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Download",
          onPress: async () => {
            try {
              await Linking.openURL(updateInfo.download_url);
            } catch {
              Alert.alert("Fehler", "Link kann nicht geöffnet werden");
            }
          },
        },
      ]
    );
  };

  if (!settings) return null;

  return (
    <SafeAreaView style={styles.safe} testID="admin-settings-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="back-btn">
          <Ionicons name="chevron-back" size={28} color={colors.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>EINSTELLUNGEN</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 28 }}>
        {/* Logo */}
        <View>
          <Text style={styles.sectionTitle}>LOGO</Text>
          <View style={styles.logoBox}>
            {settings.logo_base64 ? (
              <Image source={{ uri: settings.logo_base64 }} style={styles.logoPreview} />
            ) : (
              <Ionicons name="image-outline" size={48} color={colors.textMutedDark} />
            )}
          </View>
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={styles.btn}
              onPress={() => pickImage("logo")}
              testID="pick-logo-btn"
            >
              <Ionicons name="image-outline" size={16} color={colors.textDark} />
              <Text style={styles.btnText}>Bild wählen</Text>
            </TouchableOpacity>
            {settings.logo_base64 && (
              <TouchableOpacity
                style={styles.btnGhost}
                onPress={() => update({ logo_base64: null })}
                testID="clear-logo-btn"
              >
                <Text style={styles.btnGhostText}>Entfernen</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Background */}
        <View>
          <Text style={styles.sectionTitle}>HINTERGRUND (TABLET)</Text>
          <View style={styles.colorRow}>
            {Object.entries(presetBackgrounds).map(([key, hex]) => {
              const sel =
                settings.background_type === "preset" &&
                settings.background_value === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() =>
                    update({ background_type: "preset", background_value: key })
                  }
                  style={[
                    styles.colorChip,
                    { backgroundColor: hex },
                    sel && styles.colorChipSel,
                  ]}
                  testID={`bg-preset-${key}`}
                />
              );
            })}
          </View>
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={styles.btn}
              onPress={() => pickImage("background")}
              testID="pick-bg-btn"
            >
              <Ionicons name="image-outline" size={16} color={colors.textDark} />
              <Text style={styles.btnText}>Bild als Hintergrund</Text>
            </TouchableOpacity>
          </View>
          {settings.background_type === "image" && (
            <View style={styles.bgPreviewBox}>
              <Image source={{ uri: settings.background_value }} style={styles.bgPreview} />
            </View>
          )}
        </View>

        {/* Password */}
        <View>
          <Text style={styles.sectionTitle}>PASSWORT ÄNDERN</Text>
          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="Neues Passwort"
            placeholderTextColor={colors.textMutedDark}
            secureTextEntry
            style={styles.input}
            testID="new-password-input"
          />
          <TouchableOpacity
            style={[styles.btnPrimary, saving && { opacity: 0.6 }]}
            onPress={updatePassword}
            disabled={saving}
            testID="save-password-btn"
          >
            <Text style={styles.btnPrimaryText}>SPEICHERN</Text>
          </TouchableOpacity>
        </View>

        {/* Update Section */}
        <View>
          <Text style={styles.sectionTitle}>APP-UPDATE</Text>
          <View style={styles.versionRow}>
            <View>
              <Text style={styles.versionLabel}>Aktuelle Version</Text>
              <Text style={styles.versionValue} testID="current-version">
                v{APP_VERSION}
              </Text>
            </View>
            {updateInfo && (
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.versionLabel}>Neueste Version</Text>
                <Text
                  style={[
                    styles.versionValue,
                    updateStatus === "available" && { color: colors.yellow },
                  ]}
                  testID="latest-version"
                >
                  v{updateInfo.latest_version}
                </Text>
              </View>
            )}
          </View>

          {updateStatus === "checked-latest" && (
            <View style={styles.statusInfo}>
              <Ionicons name="checkmark-circle" size={16} color={colors.green} />
              <Text style={styles.statusInfoText}>
                Sie haben die neueste Version
              </Text>
            </View>
          )}

          {updateStatus === "available" && !!updateInfo?.changelog && (
            <View style={styles.changelogBox}>
              <Text style={styles.changelogLabel}>Änderungen:</Text>
              <Text style={styles.changelogText}>{updateInfo.changelog}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.btn, checking && { opacity: 0.6 }]}
            onPress={checkForUpdates}
            disabled={checking}
            testID="check-updates-btn"
          >
            {checking ? (
              <ActivityIndicator color={colors.textDark} />
            ) : (
              <>
                <Ionicons name="cloud-download-outline" size={16} color={colors.textDark} />
                <Text style={styles.btnText}>Nach Updates suchen</Text>
              </>
            )}
          </TouchableOpacity>

          {updateStatus === "available" && (
            <TouchableOpacity
              style={[styles.btnPrimary, { marginTop: 10 }]}
              onPress={downloadUpdate}
              testID="download-update-btn"
            >
              <Text style={styles.btnPrimaryText}>UPDATE HERUNTERLADEN</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.dataHint}>
            Hinweis: Ihre Daten (Aufgaben, Archiv, Listen, Einstellungen) bleiben bei
            Updates immer erhalten — sie werden auf dem Server gespeichert.
          </Text>
        </View>
      </ScrollView>
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
  headerTitle: { color: colors.textDark, fontWeight: "900", letterSpacing: 3, fontSize: 14 },
  sectionTitle: {
    color: colors.textMutedDark,
    fontSize: 11,
    letterSpacing: 3,
    fontWeight: "700",
    marginBottom: 12,
  },
  logoBox: {
    height: 140,
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  logoPreview: { width: "100%", height: "100%", resizeMode: "contain" },
  btnRow: { flexDirection: "row", gap: 8 },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    height: 48,
  },
  btnText: { color: colors.textDark, fontWeight: "700", fontSize: 13 },
  btnGhost: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhostText: { color: colors.red, fontWeight: "700" },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  colorChip: {
    width: 56,
    height: 56,
    borderWidth: 2,
    borderColor: colors.borderDark,
  },
  colorChipSel: { borderColor: colors.yellow, borderWidth: 3 },
  bgPreviewBox: {
    height: 100,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  bgPreview: { width: "100%", height: "100%", resizeMode: "cover" },
  input: {
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    color: colors.textDark,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 15,
    marginBottom: 12,
  },
  btnPrimary: {
    backgroundColor: colors.yellow,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: { color: "#0A0A0A", fontWeight: "900", letterSpacing: 2 },
});
