import { useEffect, useState, useCallback } from "react";
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, setToken, Task, SimpleItem } from "../../src/lib/api";
import { useWebSocket } from "../../src/lib/useWebSocket";
import { colors } from "../../src/lib/theme";

const STATUS_LABEL: Record<string, string> = {
  pending: "OFFEN",
  accepted: "ANGENOMMEN",
  finished: "ERLEDIGT",
  cannot_accept: "NICHT ANNEHMBAR",
  not_finished: "NICHT BEENDBAR",
  not_done: "NICHT ERLEDIGT",
};

const STATUS_COLOR: Record<string, string> = {
  pending: colors.textMutedDark,
  accepted: colors.yellow,
  finished: colors.green,
  cannot_accept: colors.orange,
  not_finished: colors.orange,
  not_done: colors.red,
};

export default function AdminHome() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [persons, setPersons] = useState<SimpleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, p] = await Promise.all([
        api<Task[]>("/tasks/today"),
        api<SimpleItem[]>("/persons"),
      ]);
      setTasks(t);
      setPersons(p);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useWebSocket((msg) => {
    if (msg?.type === "tasks_updated" || msg?.type === "persons_updated") {
      load();
    }
  });

  const personName = (id: string) =>
    persons.find((p) => p.id === id)?.name || "—";

  const handleArchiveAll = () => {
    Alert.alert(
      "Alle archivieren?",
      "Alle aktuellen Aufgaben werden archiviert und vom Tablet entfernt.",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Archivieren",
          style: "destructive",
          onPress: async () => {
            try {
              await api("/tasks/archive-now", { method: "POST", auth: true });
              await load();
            } catch (e: any) {
              Alert.alert("Fehler", e?.message || "Archivierung fehlgeschlagen");
            }
          },
        },
      ]
    );
  };

  const handleLogout = async () => {
    await setToken(null);
    router.replace("/");
  };

  const handleDelete = (id: string) => {
    Alert.alert("Aufgabe entfernen?", "Die Aufgabe wird sofort archiviert.", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Entfernen",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/tasks/${id}`, { method: "DELETE", auth: true });
            await load();
          } catch (e: any) {
            Alert.alert("Fehler", e?.message || "Fehler");
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} testID="admin-home-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>ADMIN</Text>
          <Text style={styles.brandSub}>Aufgaben heute · {tasks.length}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} testID="admin-logout-btn" style={styles.iconBtn}>
          <Ionicons name="log-out-outline" size={22} color={colors.textDark} />
        </TouchableOpacity>
      </View>

      <View style={styles.toolbar}>
        <ToolBtn
          icon="add"
          label="Neu"
          onPress={() => router.push("/admin/create")}
          testID="admin-new-task-btn"
          color={colors.yellow}
          primary
        />
        <ToolBtn
          icon="list"
          label="Listen"
          onPress={() => router.push("/admin/manage")}
          testID="admin-manage-btn"
        />
        <ToolBtn
          icon="archive"
          label="Archiv"
          onPress={() => router.push("/admin/archive")}
          testID="admin-archive-btn"
        />
        <ToolBtn
          icon="settings-sharp"
          label="Einstell."
          onPress={() => router.push("/admin/settings")}
          testID="admin-settings-btn"
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.yellow} />
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.yellow}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="clipboard-outline" size={48} color={colors.textMutedDark} />
              <Text style={styles.emptyTitle}>Keine Aufgaben heute</Text>
              <Text style={styles.emptySub}>Tippen Sie auf NEU, um eine Aufgabe hinzuzufügen.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.taskCard} testID={`admin-task-${item.id}`}>
              <View style={styles.taskTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.taskType}>{item.task_type}</Text>
                  <Text style={styles.taskMeta}>
                    Haus {item.haus} · Station {item.station}
                  </Text>
                </View>
                <View style={[styles.badge, { borderColor: STATUS_COLOR[item.status] }]}>
                  <Text style={[styles.badgeText, { color: STATUS_COLOR[item.status] }]}>
                    {STATUS_LABEL[item.status]}
                  </Text>
                </View>
              </View>
              {!!item.description && <Text style={styles.taskDesc}>{item.description}</Text>}
              <Text style={styles.taskPersons}>
                {item.person_ids.map(personName).join(", ") || "Keine Personen"}
              </Text>
              <View style={styles.taskBottom}>
                <Text style={styles.taskTime}>
                  {item.time_from} – {item.time_to}
                </Text>
                <TouchableOpacity onPress={() => handleDelete(item.id)} testID={`admin-delete-${item.id}`}>
                  <Ionicons name="trash-outline" size={20} color={colors.red} />
                </TouchableOpacity>
              </View>
              {!!item.accept_reason && (
                <Text style={styles.reasonText}>↳ Nicht annehmbar: {item.accept_reason}</Text>
              )}
              {!!item.not_finished_reason && (
                <Text style={styles.reasonText}>↳ Nicht beendbar: {item.not_finished_reason}</Text>
              )}
              {!!item.not_done_reason && (
                <Text style={styles.reasonText}>↳ Nicht erledigt: {item.not_done_reason}</Text>
              )}
            </View>
          )}
        />
      )}

      {tasks.length > 0 && (
        <TouchableOpacity
          style={styles.archiveAllBtn}
          onPress={handleArchiveAll}
          testID="admin-archive-all-btn"
        >
          <Ionicons name="archive-outline" size={18} color="#0A0A0A" />
          <Text style={styles.archiveAllText}>HEUTE JETZT ARCHIVIEREN</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

function ToolBtn({
  icon,
  label,
  onPress,
  testID,
  color,
  primary,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  testID?: string;
  color?: string;
  primary?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.toolBtn,
        primary && { backgroundColor: color, borderColor: color },
      ]}
      testID={testID}
      activeOpacity={0.85}
    >
      <Ionicons
        name={icon}
        size={18}
        color={primary ? "#0A0A0A" : colors.textDark}
      />
      <Text style={[styles.toolBtnText, primary && { color: "#0A0A0A" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgDark },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: { color: colors.textDark, fontSize: 24, fontWeight: "900", letterSpacing: 2 },
  brandSub: { color: colors.textMutedDark, fontSize: 12, letterSpacing: 1, marginTop: 2 },
  iconBtn: { padding: 8 },
  toolbar: {
    flexDirection: "row",
    paddingHorizontal: 12,
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  toolBtn: {
    flex: 1,
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    paddingVertical: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  toolBtnText: {
    color: colors.textDark,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyBox: { alignItems: "center", padding: 40, gap: 8 },
  emptyTitle: { color: colors.textDark, fontSize: 18, fontWeight: "700" },
  emptySub: { color: colors.textMutedDark, fontSize: 13, textAlign: "center" },
  taskCard: {
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: 14,
    gap: 6,
  },
  taskTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  taskType: { color: colors.textDark, fontSize: 17, fontWeight: "800" },
  taskMeta: { color: colors.textMutedDark, fontSize: 12, marginTop: 2, letterSpacing: 1 },
  badge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  taskDesc: { color: colors.textDark, fontSize: 13, marginTop: 4 },
  taskPersons: { color: colors.textMutedDark, fontSize: 13, fontStyle: "italic" },
  taskBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  taskTime: { color: colors.yellow, fontSize: 14, fontWeight: "800" },
  reasonText: { color: colors.orange, fontSize: 12, marginTop: 2, fontStyle: "italic" },
  archiveAllBtn: {
    backgroundColor: colors.yellow,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    margin: 16,
    marginTop: 0,
  },
  archiveAllText: { color: "#0A0A0A", fontWeight: "900", letterSpacing: 2, fontSize: 13 },
});
