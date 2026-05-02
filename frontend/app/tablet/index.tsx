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

const STATUS_LABEL: Record<string, string> = {
  pending: "Offen",
  accepted: "Angenommen",
  finished: "Erledigt",
  cannot_accept: "Nicht annehmbar",
  not_finished: "Nicht beendbar",
  not_done: "Nicht erledigt",
};

const STATUS_DOT: Record<string, string> = {
  pending: "#9CA3AF",
  accepted: colors.yellow,
  finished: colors.green,
  cannot_accept: colors.orange,
  not_finished: colors.orange,
  not_done: colors.red,
};

export default function TabletView() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [persons, setPersons] = useState<SimpleItem[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

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
    } catch {
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

  const personName = (id: string) =>
    persons.find((p) => p.id === id)?.name || "—";

  const updateStatus = async (taskId: string, status: TaskStatus, reason?: string) => {
    try {
      await api(`/tasks/${taskId}/status`, {
        method: "PATCH",
        body: { status, reason },
      });
      await load();
    } catch {
      // ignore
    }
  };

  const handleAction = (task: Task, status: TaskStatus, label: string) => {
    if (status === "cannot_accept" || status === "not_finished" || status === "not_done") {
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

  // Glass surface config
  const cardBg = dark ? "rgba(20,20,22,0.55)" : "rgba(255,255,255,0.55)";
  const cardBorder = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
  const textColor = dark ? "#FFFFFF" : "#0A0A0A";
  const textMuted = dark ? "rgba(255,255,255,0.65)" : "rgba(10,10,10,0.6)";
  const btnBg = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)";
  const btnBorder = dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)";

  const dateStr = now.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const Content = (
    <View style={styles.container} testID="tablet-screen">
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: cardBg, borderColor: cardBorder },
        ]}
      >
        <View style={styles.headerLeft}>
          {settings?.logo_base64 ? (
            <Image
              source={{ uri: settings.logo_base64 }}
              style={styles.logo}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.logoFallback, { borderColor: textColor }]}>
              <Text style={[styles.logoFallbackText, { color: textColor }]}>R</Text>
            </View>
          )}
          <View>
            <Text style={[styles.headerTitle, { color: textColor }]}>
              REINIGUNG HEUTE
            </Text>
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
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
          {tasks.length === 0 && (
            <View
              style={[
                styles.emptyBox,
                { backgroundColor: cardBg, borderColor: cardBorder },
              ]}
            >
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
            const dotColor = STATUS_DOT[task.status];
            const statusLabel = STATUS_LABEL[task.status];

            return (
              <View
                key={task.id}
                style={[
                  styles.card,
                  { backgroundColor: cardBg, borderColor: cardBorder },
                ]}
                testID={`tablet-task-${task.id}`}
              >
                {/* Top row: time + title + status dot */}
                <View style={styles.cardTopRow}>
                  <View style={styles.timeBox}>
                    <Text style={[styles.timeText, { color: textColor }]}>
                      {task.time_from}
                    </Text>
                    <Text style={[styles.timeDash, { color: textMuted }]}>—</Text>
                    <Text style={[styles.timeText, { color: textColor }]}>
                      {task.time_to}
                    </Text>
                  </View>

                  <View style={styles.titleBox}>
                    <Text style={[styles.taskType, { color: textColor }]}>
                      {task.task_type}
                    </Text>
                    <Text style={[styles.taskMeta, { color: textMuted }]}>
                      HAUS {task.haus} · STATION {task.station}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusPill,
                      { borderColor: dotColor + "55", backgroundColor: dotColor + "15" },
                    ]}
                  >
                    <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
                    <Text style={[styles.statusText, { color: textColor }]}>
                      {statusLabel}
                    </Text>
                  </View>
                </View>

                {/* Description + persons */}
                {!!task.description && (
                  <Text style={[styles.taskDesc, { color: textColor }]}>
                    {task.description}
                  </Text>
                )}
                <Text style={[styles.taskPersons, { color: textMuted }]}>
                  {task.person_ids.map(personName).join(" · ") || "—"}
                </Text>

                {/* Reasons */}
                {!!task.accept_reason && (
                  <View style={[styles.reasonBox, { borderColor: btnBorder }]}>
                    <Text style={[styles.reasonLabel, { color: textMuted }]}>
                      Nicht annehmbar
                    </Text>
                    <Text style={[styles.reasonText, { color: textColor }]}>
                      {task.accept_reason}
                    </Text>
                  </View>
                )}
                {!!task.not_finished_reason && (
                  <View style={[styles.reasonBox, { borderColor: btnBorder }]}>
                    <Text style={[styles.reasonLabel, { color: textMuted }]}>
                      Nicht beendbar
                    </Text>
                    <Text style={[styles.reasonText, { color: textColor }]}>
                      {task.not_finished_reason}
                    </Text>
                  </View>
                )}
                {!!task.not_done_reason && (
                  <View style={[styles.reasonBox, { borderColor: btnBorder }]}>
                    <Text style={[styles.reasonLabel, { color: textMuted }]}>
                      Nicht erledigt
                    </Text>
                    <Text style={[styles.reasonText, { color: textColor }]}>
                      {task.not_done_reason}
                    </Text>
                  </View>
                )}

                {/* Glass buttons row */}
                <View style={styles.btnRow}>
                  <GlassBtn
                    label="Annehmen"
                    dotColor={colors.yellow}
                    bg={btnBg}
                    border={btnBorder}
                    textColor={textColor}
                    onPress={() => handleAction(task, "accepted", "Annehmen")}
                    testID={`btn-accept-${task.id}`}
                  />
                  <GlassBtn
                    label="Beenden"
                    dotColor={colors.green}
                    bg={btnBg}
                    border={btnBorder}
                    textColor={textColor}
                    onPress={() => handleAction(task, "finished", "Beenden")}
                    testID={`btn-finish-${task.id}`}
                  />
                  <GlassBtn
                    label="Nicht annehmbar"
                    dotColor={colors.orange}
                    bg={btnBg}
                    border={btnBorder}
                    textColor={textColor}
                    onPress={() => handleAction(task, "cannot_accept", "Nicht annehmbar")}
                    testID={`btn-cannot-${task.id}`}
                  />
                  <GlassBtn
                    label="Nicht beendbar"
                    dotColor={colors.orange}
                    bg={btnBg}
                    border={btnBorder}
                    textColor={textColor}
                    onPress={() => handleAction(task, "not_finished", "Nicht beendbar")}
                    testID={`btn-notfinished-${task.id}`}
                  />
                  <GlassBtn
                    label="Nicht erledigt"
                    dotColor={colors.red}
                    bg={btnBg}
                    border={btnBorder}
                    textColor={textColor}
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
              placeholderTextColor="rgba(255,255,255,0.4)"
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
                <Text style={styles.modalCancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitReason}
                style={styles.modalConfirm}
                testID="reason-submit-btn"
              >
                <Text style={styles.modalConfirmText}>Bestätigen</Text>
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
        <ImageBackground
          source={{ uri: bgImage }}
          style={{ flex: 1 }}
          resizeMode="cover"
        >
          {Content}
        </ImageBackground>
      ) : (
        Content
      )}
    </View>
  );
}

function GlassBtn({
  label,
  dotColor,
  bg,
  border,
  textColor,
  onPress,
  testID,
}: {
  label: string;
  dotColor: string;
  bg: string;
  border: string;
  textColor: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.glassBtn, { backgroundColor: bg, borderColor: border }]}
      testID={testID}
      activeOpacity={0.6}
    >
      <View style={[styles.glassDot, { backgroundColor: dotColor }]} />
      <Text style={[styles.glassBtnText, { color: textColor }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1 },
  header: {
    margin: 16,
    marginBottom: 4,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  logo: { width: 48, height: 48 },
  logoFallback: {
    width: 48,
    height: 48,
    borderWidth: 1.5,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  logoFallbackText: { fontSize: 22, fontWeight: "900" },
  headerTitle: { fontSize: 20, fontWeight: "900", letterSpacing: 2 },
  headerSub: { fontSize: 12, letterSpacing: 1, marginTop: 2 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  clock: { fontSize: 28, fontWeight: "800", letterSpacing: 1 },
  exitBtn: { padding: 6 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyBox: {
    alignItems: "center",
    padding: 60,
    borderWidth: 1,
    borderRadius: 20,
    gap: 12,
  },
  emptyTitle: { fontSize: 20, fontWeight: "800", letterSpacing: 1.5 },
  emptySub: { fontSize: 14, letterSpacing: 0.5 },
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    overflow: "hidden",
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  timeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  timeText: { fontSize: 15, fontWeight: "800", letterSpacing: 0.5 },
  timeDash: { fontSize: 13 },
  titleBox: { flex: 1, minWidth: 120 },
  taskType: { fontSize: 18, fontWeight: "800", letterSpacing: 0.5 },
  taskMeta: {
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "700",
    marginTop: 2,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  taskDesc: { fontSize: 14, lineHeight: 20 },
  taskPersons: { fontSize: 13, fontStyle: "italic" },
  reasonBox: {
    borderLeftWidth: 2,
    paddingLeft: 10,
    paddingVertical: 2,
    gap: 2,
  },
  reasonLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  reasonText: { fontSize: 13, fontStyle: "italic" },
  btnRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  glassBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 38,
  },
  glassDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  glassBtnText: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "rgba(24,24,28,0.95)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
    padding: 22,
    gap: 14,
  },
  modalTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "800", letterSpacing: 0.5 },
  modalSub: { color: "rgba(255,255,255,0.6)", fontSize: 13 },
  modalInput: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    color: "#FFFFFF",
    padding: 14,
    fontSize: 15,
    height: 100,
    textAlignVertical: "top",
    borderRadius: 14,
  },
  modalRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalCancel: {
    flex: 1,
    height: 50,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  modalCancelText: { color: "#FFFFFF", fontWeight: "700", letterSpacing: 0.5 },
  modalConfirm: {
    flex: 1,
    height: 50,
    backgroundColor: "rgba(255,214,0,0.9)",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  modalConfirmText: { color: "#0A0A0A", fontWeight: "900", letterSpacing: 0.5 },
});
