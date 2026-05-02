import { useRouter } from "expo-router";
import { Text, View, StyleSheet, TouchableOpacity, SafeAreaView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../src/lib/theme";

export default function Landing() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} testID="landing-screen">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.brand}>REINIGUNG</Text>
          <Text style={styles.brandSub}>Aufgabenverwaltung</Text>
        </View>

        <View style={styles.cards}>
          <TouchableOpacity
            style={[styles.card, { borderColor: colors.yellow }]}
            onPress={() => router.push("/admin/login")}
            testID="open-admin-button"
            activeOpacity={0.85}
          >
            <Ionicons name="phone-portrait-outline" size={48} color={colors.yellow} />
            <Text style={styles.cardTitle}>ADMIN</Text>
            <Text style={styles.cardSub}>Telefon · Aufgaben verwalten</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.card, { borderColor: colors.green }]}
            onPress={() => router.push("/tablet")}
            testID="open-tablet-button"
            activeOpacity={0.85}
          >
            <Ionicons name="tablet-landscape-outline" size={48} color={colors.green} />
            <Text style={styles.cardTitle}>TABLET</Text>
            <Text style={styles.cardSub}>Wandanzeige · Aufgaben heute</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>Wählen Sie das Gerät</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgDark },
  container: { flex: 1, padding: 24, justifyContent: "space-between" },
  header: { marginTop: 40, alignItems: "flex-start" },
  brand: {
    color: colors.textDark,
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: 2,
  },
  brandSub: {
    color: colors.textMutedDark,
    fontSize: 14,
    letterSpacing: 4,
    marginTop: 8,
    textTransform: "uppercase",
  },
  cards: { gap: 20 },
  card: {
    backgroundColor: colors.surfaceDark,
    borderWidth: 2,
    padding: 28,
    gap: 8,
  },
  cardTitle: {
    color: colors.textDark,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 3,
    marginTop: 12,
  },
  cardSub: { color: colors.textMutedDark, fontSize: 13, letterSpacing: 1 },
  footer: {
    color: colors.textMutedDark,
    textAlign: "center",
    letterSpacing: 3,
    fontSize: 11,
    textTransform: "uppercase",
  },
});
