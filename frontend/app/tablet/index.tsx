import { useEffect, useState, useCallback } from "react";
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ImageBackground,
  Image,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Task, SimpleItem, AppSettings, TaskStatus } from "../../src/lib/api";
import { useWebSocket } from "../../src/lib/useWebSocket";
import { colors, presetBackgrounds, isDarkBg } from "../../src/lib/theme";

const STATUS_BG: Record<string, string> = {
  pending: "transparent",
  accepted: colors.yellow,
  finished: colors.green,
  cannot_accept: colors.orange,
  not_finished: colors.orange,
  not_done: colors.red,
};

const STATUS_TEXT_DARK: Record<string, string> = {
  accepted: "#0A0A0A",
  finished: "#0A0A0A",
  cannot_accept: "#0A0A0A",
  not_finished: "#0A0A0A",
  not_done: "#FFFFFF",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "OFFEN",
  accepted: "ANGENOMMEN",
  finished: "BEENDET",
  cannot_accept: "NICHT ANNEHMBAR",
  not_finished: "NICHT BEENDET",
  not_done: "NICHT ERLEDIGT",
};

export default function TabletView() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [persons, setPersons] = useState<SimpleItem[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  // Reason modal
  const [reasonModal, setReasonModal] = useState<{
    taskId: string;
    status: TaskStatus;
    title: string;
  } | null>(null);
  const [reasonText, setReasonText] = useState("");

  const load = useCallback(async () => {
    try {
      const [t, p, s] = await Promise.all([
        api<Task[]>("/tasks/today"),
        api<SimpleItem[]>("/persons"),
        api<AppSettings>("/settings"),
      ]);
      setTasks(t);
      setPersons(p);
      setSettings(s);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, [load]);

  useWebSocket((msg) => {
    if (
      msg?.type === "tasks_updated" ||
      msg?.type === "settings_updated" ||
      msg?.type === "persons_updated"
    ) {
      load();
    }
  });

  const personName = (id: string) => persons.find((p) => p.id === id)?.name || "—";

  const updateStatus = async (taskId: string, status: TaskStatus, reason?: string) => {
    try {
      await api(`/tasks/${taskId}/status`, {
        method: "PATCH",
        body: { status, reason },
      });
      await load();
    } catch (e) {
      // ignore
    }
  };

  const handleAction = (task: Task, status: TaskStatus, label: string) => {
    if (
      status === "cannot_accept" ||
      status === "not_finished" ||
      status === "not_done"
    ) {
      setReasonModal({ taskId: task.id, status, title: label });
      setReasonText("");
    } else {
      updateStatus(task.id, status);
    }
  };

  const submitReason = () => {
    if (!reasonModal) return;
    updateStatus(reasonModal.taskId, reasonModal.status, reasonText.trim());
    setReasonModal(null);
  };

  // Background config
  const bgType = settings?.background_type || "preset";
  const bgValue = settings?.background_value || "dark";
  const bgColor =
    bgType === "preset"
      ? presetBackgrounds[bgValue] || colors.bgDark
      : bgType === "color"
      ? bgValue
      : colors.bgDark;
  const bgImage = bgType === "image" ? bgValue : null;
  const dark = isDarkBg(bgColor);
  const surface = dark ? "rgba(20,20,20,0.85)" : "rgba(255,255,255,0.9)";
  const textColor = dark ? "#FFFFFF" : "#0A0A0A";
  const textMuted = dark ? "#A1A1AA" : "#52525B";
  const border = dark ? "#2A2A2A" : "#E5E7EB";

  const dateStr = now.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  const Content = (
    <View style={styles.container} testID="tablet-screen">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: border }]}>
        <View style={styles.headerLeft}>
          {settings?.logo_base64 ? (
            <Image source={{ uri: settings.logo_base64 }} style={styles.logo} />
          ) : (
            <View style={[styles.logoFallback, { borderColor: textColor }]}>
              <Text style={[styles.logoFallbackText, { color: textColor }]}>R</Text>
            </View>
          )}
          <View>
            <Text style={[styles.headerTitle, { color: textColor }]}>REINIGUNG HEUTE</Text>
            <Text style={[styles.headerSub, { color: textMuted }]}>{dateStr}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text style={[styles.clock, { color: textColor }]}>{timeStr}</Text>
          <TouchableOpacity
            onPress={() => router.replace("/")}
            style={styles.exitBtn}
            testID="tablet-exit-btn"
          >
            <Ionicons name="exit-outline" size={20} color={textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={textColor} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {tasks.length === 0 && (
            <View style={[styles.emptyBox, { borderColor: border }]}>
              <Ionicons name="checkmark-done-outline" size={64} color={textMuted} />
              <Text style={[styles.emptyTitle, { color: textColor }]}>
                Keine Aufgaben heute
              </Text>
              <Text style={[styles.emptySub, { color: textMuted }]}>
                Warten auf neue Aufgaben vom Admin
              </Text>
            </View>
          )}
          {tasks.map((task) => {
            const sBg = STATUS_BG[task.status];
            const isColored = task.status !== "pending";
            const cardBg = isColored ? sBg : surface;
            const cardText = isColored ? STATUS_TEXT_DARK[task.status] : textColor;
            const cardMuted = isColored ? cardText : textMuted;

            return (
              <View
                key={task.id}
                style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}
                testID={`tablet-task-${task.id}`}
              >
                <View style={styles.cardLeft}>
                  <Text style={[styles.timeText, { color: cardText }]}>
                    {task.time_from}
                  </Text>
                  <Text style={[styles.timeDash, { color: cardMuted }]}>—</Text>
                  <Text style={[styles.timeText, { color: cardText }]}>
                    {task.time_to}
                  </Text>
                </View>

                <View style={[styles.cardCenter, { borderLeftColor: cardMuted + "55" }]}>
                  <Text style={[styles.taskType, { color: cardText }]}>
                    {task.task_type}
                  </Text>
                  <Text style={[styles.taskMeta, { color: cardMuted }]}>
                    HAUS {task.haus} · STATION {task.station}
                  </Text>
                  {!!task.description && (
                    <Text style={[styles.taskDesc, { color: cardText }]}>
                      {task.description}
                    </Text>
                  )}
                  <Text style={[styles.taskPersons, { color: cardMuted }]}>
                    {task.person_ids.map(personName).join(", ") || "—"}
                  </Text>
                  {!!task.accept_reason && (
                    <Text style={[styles.reason, { color: cardText }]}>
                      ↳ {task.accept_reason}
                    </Text>
                  )}
                  {!!task.not_finished_reason && (
                    <Text style={[styles.reason, { color: cardText }]}>
                      ↳ {task.not_finished_reason}
                    </Text>
                  )}
                  {!!task.not_done_reason && (
                    <Text style={[styles.reason, { color: cardText }]}>
                      ↳ {task.not_done_reason}
                    </Text>
                  )}
                  {isColored && (
                    <Text style={[styles.statusLabel, { color: cardText }]}>
                      {STATUS_LABEL[task.status]}
                    </Text>
                  )}
                </View>

                <View style={styles.cardRight}>
                  <ActionButton
                    label="ANNEHMEN"
                    color={colors.yellow}
                    textColor="#0A0A0A"
                    onPress={() => handleAction(task, "accepted", "Annehmen")}
                    testID={`btn-accept-${task.id}`}
                  />
                  <ActionButton
                    label="NICHT ANNEHMBAR"
                    color="transparent"
                    textColor={cardText}
                    border
                    onPress={() => handleAction(task, "cannot_accept", "Nicht annehmbar")}
                    testID={`btn-cannot-${task.id}`}
                  />
                  <ActionButton
                    label="NICHT BEENDET"
                    color="transparent"
                    textColor={cardText}
                    border
                    onPress={() => handleAction(task, "not_finished", "Nicht beendet")}
                    testID={`btn-notfinished-${task.id}`}
                  />
                  <ActionButton
                    label="BEENDEN"
                    color={colors.green}
                    textColor="#0A0A0A"
                    onPress={() => handleAction(task, "finished", "Beenden")}
                    testID={`btn-finish-${task.id}`}
                  />
                  <ActionButton
                    label="NICHT ERLEDIGT"
                    color={colors.red}
                    textColor="#FFFFFF"
                    onPress={() => handleAction(task, "not_done", "Nicht erledigt")}
                    testID={`btn-notdone-${task.id}`}
                  />
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Reason Modal */}
      <Modal
        visible={!!reasonModal}
        transparent
        animationType="fade"
        onRequestClose={() => setReasonModal(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{reasonModal?.title}</Text>
            <Text style={styles.modalSub}>Bitte Grund eingeben:</Text>
            <TextInput
              autoFocus
              value={reasonText}
              onChangeText={setReasonText}
              placeholder="Grund..."
              placeholderTextColor="#A1A1AA"
              multiline
              numberOfLines={3}
              style={styles.modalInput}
              testID="reason-input"
            />
            <View style={styles.modalRow}>
              <TouchableOpacity
                onPress={() => setReasonModal(null)}
                style={styles.modalCancel}
                testID="reason-cancel-btn"
              >
                <Text style={styles.modalCancelText}>ABBRECHEN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitReason}
                style={styles.modalConfirm}
                testID="reason-submit-btn"
              >
                <Text style={styles.modalConfirmText}>BESTÄTIGEN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: bgColor }]}>
      {bgImage ? (
        <ImageBackground source={{ uri: bgImage }} style={{ flex: 1 }} resizeMode="cover">
          {Content}
        </ImageBackground>
      ) : (
        Content
      )}
    </View>
  );
}

function ActionButton({
  label,
  color,
  textColor,
  onPress,
  testID,
  border,
}: {
  label: string;
  color: string;
  textColor: string;
  onPress: () => void;
  testID?: string;
  border?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.actionBtn,
        {
          backgroundColor: color,
          borderColor: border ? textColor + "55" : color,
          borderWidth: border ? 2 : 0,
        },
      ]}
      testID={testID}
      activeOpacity={0.7}
    >
      <Text style={[styles.actionText, { color: textColor }]} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 16 },
  logo: { width: 56, height: 56, resizeMode: "contain" },
  logoFallback: {
    width: 56,
    height: 56,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  logoFallbackText: { fontSize: 28, fontWeight: "900" },
  headerTitle: { fontSize: 24, fontWeight: "900", letterSpacing: 3 },
  headerSub: { fontSize: 13, letterSpacing: 1, marginTop: 2 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 16 },
  clock: { fontSize: 36, fontWeight: "900", letterSpacing: 2 },
  exitBtn: { padding: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyBox: {
    alignItems: "center",
    padding: 60,
    borderWidth: 2,
    borderStyle: "dashed",
    gap: 12,
  },
  emptyTitle: { fontSize: 22, fontWeight: "800", letterSpacing: 2 },
  emptySub: { fontSize: 14, letterSpacing: 1 },
  card: {
    flexDirection: "row",
    borderWidth: 1,
    minHeight: 140,
  },
  cardLeft: {
    width: 130,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  timeText: { fontSize: 28, fontWeight: "900", letterSpacing: 1 },
  timeDash: { fontSize: 18, marginVertical: 2 },
  cardCenter: {
    flex: 1,
    padding: 16,
    borderLeftWidth: 1,
    gap: 4,
    justifyContent: "center",
  },
  taskType: { fontSize: 22, fontWeight: "900", letterSpacing: 1 },
  taskMeta: { fontSize: 12, letterSpacing: 2, fontWeight: "700" },
  taskDesc: { fontSize: 15, marginTop: 4 },
  taskPersons: { fontSize: 14, fontStyle: "italic", marginTop: 4 },
  reason: { fontSize: 13, fontStyle: "italic", marginTop: 2 },
  statusLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 3, marginTop: 6 },
  cardRight: { flexDirection: "column", width: 160 },
  actionBtn: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 600,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    padding: 24,
    gap: 14,
  },
  modalTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "900", letterSpacing: 2 },
  modalSub: { color: "#A1A1AA", fontSize: 14 },
  modalInput: {
    backgroundColor: "#0F0F0F",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    color: "#FFFFFF",
    padding: 14,
    fontSize: 16,
    height: 100,
    textAlignVertical: "top",
  },
  modalRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  modalCancel: {
    flex: 1,
    height: 56,
    borderWidth: 2,
    borderColor: "#2A2A2A",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: { color: "#FFFFFF", fontWeight: "900", letterSpacing: 2 },
  modalConfirm: {
    flex: 1,
    height: 56,
    backgroundColor: colors.yellow,
    alignItems: "center",
    justifyContent: "center",
  },
  modalConfirmText: { color: "#0A0A0A", fontWeight: "900", letterSpacing: 2 },
});
