import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = {
  onContinue: () => void;
};

export default function ClockedInScreen({ onContinue }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.icon}>
          <Text style={styles.iconText}>✓</Text>
        </View>

        <Text style={styles.title}>You’re clocked in</Text>

        <Text style={styles.message}>
          Your shift has started and your location was recorded.
        </Text>

        <Pressable style={styles.button} onPress={onContinue}>
          <Text style={styles.buttonText}>Go to Home</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5ede1",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#e3efe0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  iconText: {
    color: "#3a6b3e",
    fontSize: 36,
    fontWeight: "700",
  },
  title: {
    color: "#4a2c1a",
    fontSize: 26,
    fontWeight: "700",
    textAlign: "center",
  },
  message: {
    color: "#725b48",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 28,
  },
  button: {
    backgroundColor: "#7a3f2c",
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 32,
    minWidth: 180,
    alignItems: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
