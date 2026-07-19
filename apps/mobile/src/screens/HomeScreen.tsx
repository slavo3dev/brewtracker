import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../features/auth/AuthProvider";

type Props = {
  onClockInPress: () => void;
};

export default function HomeScreen({ onClockInPress }: Props) {
  const { profile, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good morning ☕</Text>
          <Text style={styles.accountType}>
            Signed in as {profile?.role ?? "staff"}
          </Text>
        </View>

        <Pressable
          onPress={() => {
            void signOut();
          }}
        >
          <Text style={styles.logout}>Log out</Text>
        </Pressable>
      </View>

      <Pressable style={styles.card} onPress={onClockInPress}>
        <Text style={styles.cardTitle}>Clock In</Text>
        <Text style={styles.cardSubtitle}>Start your shift</Text>
      </Pressable>

      <View style={[styles.card, styles.cardDisabled]}>
        <Text style={styles.cardTitle}>Today&apos;s Route</Text>
        <Text style={styles.cardSubtitle}>Coming soon — ROUTE-3</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#f5ede1",
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  greeting: {
    color: "#4a2c1a",
    fontSize: 22,
    fontWeight: "700",
  },
  accountType: {
    color: "#8a6f53",
    fontSize: 12,
    marginTop: 3,
    textTransform: "capitalize",
  },
  logout: {
    color: "#b3413e",
    fontSize: 14,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e3d4c0",
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    padding: 20,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  cardTitle: {
    color: "#2e1d12",
    fontSize: 17,
    fontWeight: "600",
  },
  cardSubtitle: {
    color: "#8a6f53",
    fontSize: 13,
    marginTop: 4,
  },
});
