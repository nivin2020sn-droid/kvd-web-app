import { useEffect, useState } from "react";
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Task, SimpleItem } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";

const STATUS_LABEL: Record<string, string> = {
  pending: "NEU",
  accepted: "ANGENOMMEN",
  finished: "ERLEDIGT",
  cannot_accept: "NICHT ANNEHMBAR",
  not_finished: "NICHT BEENDBAR",
  not_done: "NICHT ERLEDIGT",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "#3B82F6",
  accepted: "#FF9500",
  finished: "#00E676",
  cannot_accept: "#991B1B",
  not_finished: "#991B1B",
  not_done: "#FF3B30",
};

export default function Archive() {
  const router = useRouter();
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [persons, setPersons] = useState<SimpleItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDates = async () => {
    setLoading(true);
    const [data, p] = await Promise.all([
      api<{ dates: string[] }>("/tasks/archive"),
      api<SimpleItem[]>("/persons"),
    ]);
    setDates(data.dates);
    setPersons(p);
    setLoading(false);
  };

  useEffect(() => {
    loadDates();
  }, []);

  const loadDate = async (date: string) => {
    setSelectedDate(date);
    setLoading(true);
    const data = await api<{ tasks: Task[] }>(`/tasks/archive?date=${date}`);
    setTasks(data.tasks);
    setLoading(false);
  };

  const personName = (id: string) =>
    persons.find((p) => p.id === id)?.name || "—";

  if (selectedDate) {
    return (
      <SafeAreaView style={styles.safe} testID="archive-detail">
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              setSelectedDate(null);
              setTasks([]);
            }}
            testID="back-btn"
          >
            <Ionicons name="chevron-back" size={28} color={colors.textDark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{selectedDate}</Text>
          <View style={{ width: 28 }} />
        </View>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.yellow} />
          </View>
        ) : (
          <FlatList
            data={tasks}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>Keine Aufgaben in diesem Archiv</Text>
            }
            renderItem={({ item }) => (
              <View style={styles.taskCard}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.taskType}>{item.task_type}</Text>
                    <Text style={styles.taskMeta}>
                      Haus {item.haus} · Station {item.station} · {item.time_from}–{item.time_to}
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
                {!!item.accepted_at && (
                  <Text style={styles.timeStamp}>
                    ✓ Angenommen: {new Date(item.accepted_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                )}
                {!!item.finished_at && (
                  <Text style={styles.timeStamp}>
                    ✓ Erledigt: {new Date(item.finished_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                )}
                {!!item.accept_reason && (
                  <Text style={styles.reason}>↳ Nicht annehmbar: {item.accept_reason}</Text>
                )}
                {!!item.not_finished_reason && (
                  <Text style={styles.reason}>↳ Nicht beendbar: {item.not_finished_reason}</Text>
                )}
                {!!item.not_done_reason && (
                  <Text style={styles.reason}>↳ Nicht erledigt: {item.not_done_reason}</Text>
                )}
              </View>
            )}
          />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} testID="archive-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="back-btn">
          <Ionicons name="chevron-back" size={28} color={colors.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ARCHIV</Text>
        <View style={{ width: 28 }} />
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.yellow} />
        </View>
      ) : (
        <FlatList
          data={dates}
          keyExtractor={(d) => d}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="archive-outline" size={48} color={colors.textMutedDark} />
              <Text style={styles.emptyText}>Noch keine archivierten Tage</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.dateRow}
              onPress={() => loadDate(item)}
              testID={`archive-date-${item}`}
            >
              <Ionicons name="calendar-outline" size={20} color={colors.yellow} />
              <Text style={styles.dateText}>{item}</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textMutedDark} />
            </TouchableOpacity>
          )}
        />
      )}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyBox: { alignItems: "center", padding: 40, gap: 12 },
  emptyText: { color: colors.textMutedDark, textAlign: "center" },
  dateRow: {
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 12,
  },
  dateText: { color: colors.textDark, fontSize: 16, fontWeight: "700", flex: 1 },
  taskCard: {
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: 14,
    gap: 6,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  taskType: { color: colors.textDark, fontSize: 16, fontWeight: "800" },
  taskMeta: { color: colors.textMutedDark, fontSize: 12, marginTop: 2 },
  taskDesc: { color: colors.textDark, fontSize: 13 },
  taskPersons: { color: colors.textMutedDark, fontSize: 13, fontStyle: "italic" },
  badge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  reason: { color: colors.orange, fontSize: 12, fontStyle: "italic" },
  timeStamp: { color: colors.green, fontSize: 12, fontWeight: "600" },
});
