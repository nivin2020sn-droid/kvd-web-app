import { useState, useEffect } from "react";
import {
  Text,
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, SimpleItem } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";

interface PickerProps {
  label: string;
  options: SimpleItem[];
  value: string;
  onChange: (val: string) => void;
  onAdd: (name: string) => Promise<void>;
  testIDPrefix: string;
}

function PickerField({ label, options, value, onChange, onAdd, testIDPrefix }: PickerProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");

  const submitAdd = async () => {
    const n = newName.trim();
    if (!n) return;
    try {
      await onAdd(n);
      setNewName("");
      setShowAdd(false);
      onChange(n);
    } catch (e: any) {
      Alert.alert("Fehler", e?.message || "Fehler");
    }
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map((opt) => {
          const selected = value === opt.name;
          return (
            <TouchableOpacity
              key={opt.id}
              onPress={() => onChange(opt.name)}
              style={[styles.chip, selected && styles.chipSel]}
              testID={`${testIDPrefix}-chip-${opt.name}`}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSel]}>{opt.name}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          onPress={() => setShowAdd(true)}
          style={styles.chipAdd}
          testID={`${testIDPrefix}-add-btn`}
        >
          <Ionicons name="add" size={16} color={colors.yellow} />
          <Text style={styles.chipAddText}>Add</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showAdd} transparent animationType="fade" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{label} hinzufügen</Text>
            <TextInput
              autoFocus
              value={newName}
              onChangeText={setNewName}
              placeholder="Name"
              placeholderTextColor={colors.textMutedDark}
              style={styles.input}
              testID={`${testIDPrefix}-add-input`}
              onSubmitEditing={submitAdd}
            />
            <View style={styles.modalRow}>
              <TouchableOpacity onPress={() => setShowAdd(false)} style={styles.modalBtnGhost}>
                <Text style={styles.modalBtnGhostText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitAdd}
                style={styles.modalBtnPrimary}
                testID={`${testIDPrefix}-add-submit`}
              >
                <Text style={styles.modalBtnPrimaryText}>Hinzufügen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function CreateTask() {
  const router = useRouter();
  const [taskTypes, setTaskTypes] = useState<SimpleItem[]>([]);
  const [houses, setHouses] = useState<SimpleItem[]>([]);
  const [stations, setStations] = useState<SimpleItem[]>([]);
  const [persons, setPersons] = useState<SimpleItem[]>([]);

  const [taskType, setTaskType] = useState("");
  const [haus, setHaus] = useState("");
  const [station, setStation] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const [timeFrom, setTimeFrom] = useState("08:00");
  const [timeTo, setTimeTo] = useState("12:00");

  const [showAddPerson, setShowAddPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [tt, h, s, p] = await Promise.all([
      api<SimpleItem[]>("/task-types"),
      api<SimpleItem[]>("/houses"),
      api<SimpleItem[]>("/stations"),
      api<SimpleItem[]>("/persons"),
    ]);
    setTaskTypes(tt);
    setHouses(h);
    setStations(s);
    setPersons(p);
  };

  useEffect(() => {
    load();
  }, []);

  const addItem = (kind: string, setter: any) => async (name: string) => {
    const item = await api<SimpleItem>(`/${kind}`, {
      method: "POST",
      body: { name },
      auth: true,
    });
    setter((prev: SimpleItem[]) => [...prev, item]);
  };

  const togglePerson = (id: string) => {
    setSelectedPersonIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const submitAddPerson = async () => {
    const n = newPersonName.trim();
    if (!n) return;
    try {
      const item = await api<SimpleItem>("/persons", {
        method: "POST",
        body: { name: n },
        auth: true,
      });
      setPersons((prev) => [...prev, item]);
      setSelectedPersonIds((prev) => [...prev, item.id]);
      setNewPersonName("");
      setShowAddPerson(false);
    } catch (e: any) {
      Alert.alert("Fehler", e?.message || "Fehler");
    }
  };

  const submit = async () => {
    if (!taskType || !haus || !station || !timeFrom || !timeTo) {
      Alert.alert("Fehler", "Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    setSaving(true);
    try {
      await api("/tasks", {
        method: "POST",
        auth: true,
        body: {
          task_type: taskType,
          haus,
          station,
          description,
          person_ids: selectedPersonIds,
          time_from: timeFrom,
          time_to: timeTo,
        },
      });
      router.replace("/admin");
    } catch (e: any) {
      Alert.alert("Fehler", e?.message || "Fehler");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} testID="admin-create-screen">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="back-btn">
            <Ionicons name="chevron-back" size={28} color={colors.textDark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>NEUE AUFGABE</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
          <PickerField
            label="AUFGABENTYP"
            options={taskTypes}
            value={taskType}
            onChange={setTaskType}
            onAdd={addItem("task-types", setTaskTypes)}
            testIDPrefix="task-type"
          />
          <PickerField
            label="HAUS"
            options={houses}
            value={haus}
            onChange={setHaus}
            onAdd={addItem("houses", setHouses)}
            testIDPrefix="haus"
          />
          <PickerField
            label="STATION"
            options={stations}
            value={station}
            onChange={setStation}
            onAdd={addItem("stations", setStations)}
            testIDPrefix="station"
          />

          <View style={styles.field}>
            <Text style={styles.label}>BESCHREIBUNG</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              placeholder="Optionale Beschreibung der Aufgabe"
              placeholderTextColor={colors.textMutedDark}
              style={[styles.input, { height: 80, textAlignVertical: "top", paddingTop: 12 }]}
              testID="task-description-input"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>PERSONEN</Text>
            <View style={styles.chipRow}>
              {persons.map((p) => {
                const sel = selectedPersonIds.includes(p.id);
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => togglePerson(p.id)}
                    style={[styles.chip, sel && styles.chipSel]}
                    testID={`person-chip-${p.name}`}
                  >
                    <Text style={[styles.chipText, sel && styles.chipTextSel]}>{p.name}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                onPress={() => setShowAddPerson(true)}
                style={styles.chipAdd}
                testID="person-add-btn"
              >
                <Ionicons name="add" size={16} color={colors.yellow} />
                <Text style={styles.chipAddText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.timeRow}>
            <View style={styles.timeField}>
              <Text style={styles.label}>VON</Text>
              <TextInput
                value={timeFrom}
                onChangeText={setTimeFrom}
                placeholder="08:00"
                placeholderTextColor={colors.textMutedDark}
                style={styles.input}
                testID="time-from-input"
              />
            </View>
            <View style={styles.timeField}>
              <Text style={styles.label}>BIS</Text>
              <TextInput
                value={timeTo}
                onChangeText={setTimeTo}
                placeholder="12:00"
                placeholderTextColor={colors.textMutedDark}
                style={styles.input}
                testID="time-to-input"
              />
            </View>
          </View>
        </ScrollView>

        <TouchableOpacity
          style={[styles.submitBtn, saving && { opacity: 0.6 }]}
          onPress={submit}
          disabled={saving}
          testID="submit-task-btn"
        >
          <Text style={styles.submitText}>{saving ? "..." : "AUFGABE ERSTELLEN"}</Text>
        </TouchableOpacity>

        <Modal
          visible={showAddPerson}
          transparent
          animationType="fade"
          onRequestClose={() => setShowAddPerson(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Person hinzufügen</Text>
              <TextInput
                autoFocus
                value={newPersonName}
                onChangeText={setNewPersonName}
                placeholder="Name"
                placeholderTextColor={colors.textMutedDark}
                style={styles.input}
                testID="person-add-input"
                onSubmitEditing={submitAddPerson}
              />
              <View style={styles.modalRow}>
                <TouchableOpacity
                  onPress={() => setShowAddPerson(false)}
                  style={styles.modalBtnGhost}
                >
                  <Text style={styles.modalBtnGhostText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={submitAddPerson}
                  style={styles.modalBtnPrimary}
                  testID="person-add-submit"
                >
                  <Text style={styles.modalBtnPrimaryText}>Hinzufügen</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
  headerTitle: { color: colors.textDark, fontWeight: "900", letterSpacing: 3, fontSize: 14 },
  field: { marginBottom: 20 },
  label: {
    color: colors.textMutedDark,
    fontSize: 11,
    letterSpacing: 3,
    fontWeight: "700",
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    color: colors.textDark,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 15,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipSel: {
    backgroundColor: colors.yellow,
    borderColor: colors.yellow,
  },
  chipText: { color: colors.textDark, fontSize: 14, fontWeight: "600" },
  chipTextSel: { color: "#0A0A0A", fontWeight: "800" },
  chipAdd: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.yellow,
    borderStyle: "dashed",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipAddText: { color: colors.yellow, fontWeight: "700", fontSize: 13 },
  timeRow: { flexDirection: "row", gap: 12 },
  timeField: { flex: 1 },
  submitBtn: {
    backgroundColor: colors.yellow,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    margin: 16,
    marginTop: 0,
  },
  submitText: { color: "#0A0A0A", fontWeight: "900", letterSpacing: 2, fontSize: 15 },
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
  modalRow: { flexDirection: "row", gap: 12 },
  modalBtnGhost: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: colors.borderDark,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnGhostText: { color: colors.textDark, fontWeight: "700", letterSpacing: 1 },
  modalBtnPrimary: {
    flex: 1,
    height: 48,
    backgroundColor: colors.yellow,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnPrimaryText: { color: "#0A0A0A", fontWeight: "900", letterSpacing: 1 },
});
