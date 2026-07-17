import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useState } from "react";

import { useAuth } from "../features/auth/AuthProvider";

export default function AccessDeniedScreen() {
  const { profile, signOut } = useAuth();
  const [loading, setLoading] = useState(false);

  async function handleSignOut(): Promise<void> {
    setLoading(true);

    try {
      await signOut();
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Mobile Access Unavailable</Text>

        <Text style={styles.message}>
          This app is available only to active drivers and technicians.
        </Text>

        {profile ? (
          <Text style={styles.role}>Current account role: {profile.role}</Text>
        ) : null}

        <Pressable
          style={styles.button}
          disabled={loading}
          onPress={() => {
            void handleSignOut();
          }}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Sign in with another account</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#f5ede1",
    flex: 1,
  },
  content: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  title: {
    color: "#4a2c1a",
    fontSize: 23,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  message: {
    color: "#725b48",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  role: {
    color: "#8a6f53",
    fontSize: 13,
    marginTop: 12,
  },
  button: {
    alignItems: "center",
    backgroundColor: "#7a3f2c",
    borderRadius: 12,
    marginTop: 28,
    minHeight: 50,
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
});
