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
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, SimpleItem } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";

const KINDS = [
  { key: "task-types", label: "AUFGABENTYPEN" },
  { key: "houses", label: "HÄUSER" },
  { key: "stations", label: "STATIONEN" },
  { key: "persons", label: "PERSONEN" },
];

export default function Manage() {
  const router = useRouter();
  const [data, setData] = useState<Record<string, SimpleItem[]>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const load = async () => {
    const result: Record<string, SimpleItem[]> = {};
    for (const k of KINDS) {
      result[k.key] = await api<SimpleItem[]>(`/${k.key}`);
    }
    setData(result);
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async () => {
    if (!adding) return;
    const n = newName.trim();
    if (!n) return;
    try {
      await api(`/${adding}`, { method: "POST", body: { name: n }, auth: true });
      setNewName("");
      setAdding(null);
      await load();
    } catch (e: any) {
      Alert.alert("Fehler", e?.message || "Fehler");
    }
  };

  const handleDelete = (kind: string, item: SimpleItem) => {
    Alert.alert("Eintrag löschen?", `"${item.name}" wirklich löschen?`, [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/${kind}/${item.id}`, { method: "DELETE", auth: true });
            await load();
          } catch (e: any) {
            Alert.alert("Fehler", e?.message || "Fehler");
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} testID="admin-manage-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="back-btn">
          <Ionicons name="chevron-back" size={28} color={colors.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>LISTEN VERWALTEN</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 24 }}>
        {KINDS.map((k) => (
          <View key={k.key}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{k.label}</Text>
              <TouchableOpacity
                onPress={() => setAdding(k.key)}
                style={styles.addBtn}
                testID={`add-${k.key}-btn`}
              >
                <Ionicons name="add" size={16} color={colors.yellow} />
                <Text style={styles.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.list}>
              {(data[k.key] || []).length === 0 && (
                <Text style={styles.emptyText}>Keine Einträge</Text>
              )}
              {(data[k.key] || []).map((item) => (
                <View key={item.id} style={styles.row}>
                  <Text style={styles.rowText}>{item.name}</Text>
                  <TouchableOpacity
                    onPress={() => handleDelete(k.key, item)}
                    testID={`delete-${k.key}-${item.name}`}
                  >
                    <Ionicons name="close" size={20} color={colors.textMutedDark} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={!!adding} transparent animationType="fade" onRequestClose={() => setAdding(null)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Hinzufügen</Text>
            <TextInput
              autoFocus
              value={newName}
              onChangeText={setNewName}
              placeholder="Name"
              placeholderTextColor={colors.textMutedDark}
              style={styles.input}
              testID="manage-add-input"
              onSubmitEditing={handleAdd}
            />
            <View style={styles.modalRow}>
              <TouchableOpacity onPress={() => setAdding(null)} style={styles.btnGhost}>
                <Text style={styles.btnGhostText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAdd} style={styles.btnPrimary} testID="manage-add-submit">
                <Text style={styles.btnPrimaryText}>Hinzufügen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: { color: colors.textMutedDark, fontWeight: "700", letterSpacing: 3, fontSize: 11 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.yellow,
    borderStyle: "dashed",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addBtnText: { color: colors.yellow, fontWeight: "700", fontSize: 12 },
  list: { gap: 1 },
  row: {
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowText: { color: colors.textDark, fontSize: 15, fontWeight: "600" },
  emptyText: { color: colors.textMutedDark, fontStyle: "italic", padding: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: 20,
    gap: 14,
  },
  modalTitle: { color: colors.textDark, fontSize: 16, fontWeight: "800", letterSpacing: 1 },
  input: {
    backgroundColor: colors.bgDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    color: colors.textDark,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 15,
  },
  modalRow: { flexDirection: "row", gap: 12 },
  btnGhost: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: colors.borderDark,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhostText: { color: colors.textDark, fontWeight: "700" },
  btnPrimary: {
    flex: 1,
    height: 48,
    backgroundColor: colors.yellow,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: { color: "#0A0A0A", fontWeight: "900" },
});
