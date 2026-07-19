import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "./src/features/auth/AuthProvider";
import AccessDeniedScreen from "./src/screens/AccessDeniedScreen";
import ClockInScreen from "./src/screens/ClockInScreen";
import HomeScreen from "./src/screens/HomeScreen";
import LoginScreen from "./src/screens/LoginScreen";
import SelfieCaptureScreen from "./src/screens/SelfieCaptureScreen";

type Screen = "home" | "clockIn" | "selfie" | "clockedIn";

function LoadingScreen({ message }: { message: string }) {
  return (
    <View style={styles.centeredScreen}>
      <ActivityIndicator color="#7a3f2c" size="large" />
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  );
}

function ErrorScreen() {
  const { errorMessage, retryProfile, signOut } = useAuth();

  return (
    <View style={styles.centeredScreen}>
      <Text style={styles.errorTitle}>Unable to load account</Text>
      <Text style={styles.errorText}>
        {errorMessage ?? "An unexpected error occurred."}
      </Text>

      <Text
        style={styles.action}
        onPress={() => {
          void retryProfile();
        }}
      >
        Try again
      </Text>

      <Text
        style={styles.secondaryAction}
        onPress={() => {
          void signOut();
        }}
      >
        Log out
      </Text>
    </View>
  );
}

function AppContent() {
  const { status } = useAuth();
  const [screen, setScreen] = useState<Screen>("home");

  if (status === "initializing") {
    return <LoadingScreen message="Restoring your session…" />;
  }

  if (status === "loading_profile") {
    return <LoadingScreen message="Loading your employee profile…" />;
  }

  if (status === "signed_out") {
    return <LoginScreen />;
  }

  if (status === "access_denied") {
    return <AccessDeniedScreen />;
  }

  if (status === "error") {
    return <ErrorScreen />;
  }

  if (screen === "home") {
    return <HomeScreen onClockInPress={() => setScreen("clockIn")} />;
  }

  if (screen === "clockIn") {
    return (
      <ClockInScreen
        onBack={() => setScreen("home")}
        onClockedIn={() => setScreen("selfie")}
      />
    );
  }

  if (screen === "selfie") {
    return (
      <SelfieCaptureScreen
        onBack={() => setScreen("clockIn")}
        onConfirmed={(_photoUri) => {
          // AUTH-5 will upload the photo and create/update
          // the time_entries record.
          setScreen("clockedIn");
        }}
      />
    );
  }

  return (
    <View style={styles.centeredScreen}>
      <Text style={styles.clockedInTitle}>Clocked In</Text>
      <Text style={styles.clockedInSubtitle}>
        Time-entry persistence will be completed in AUTH-4.
      </Text>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  centeredScreen: {
    alignItems: "center",
    backgroundColor: "#f5ede1",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  loadingText: {
    color: "#8a6f53",
    fontSize: 14,
    marginTop: 14,
  },
  errorTitle: {
    color: "#4a2c1a",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 10,
  },
  errorText: {
    color: "#9f302d",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  action: {
    color: "#7a3f2c",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 24,
  },
  secondaryAction: {
    color: "#8a6f53",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 16,
  },
  clockedInTitle: {
    color: "#4a2c1a",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
  },
  clockedInSubtitle: {
    color: "#8a6f53",
    textAlign: "center",
  },
});
