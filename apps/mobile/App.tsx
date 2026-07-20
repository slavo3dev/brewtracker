import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "./src/features/auth/AuthProvider";
import AccessDeniedScreen from "./src/screens/AccessDeniedScreen";
import ClockedInScreen from "./src/screens/ClockedInScreen";
import ClockInScreen from "./src/screens/ClockInScreen";
import HomeScreen from "./src/screens/HomeScreen";
import LoginScreen from "./src/screens/LoginScreen";
import SelfieCaptureScreen from "./src/screens/SelfieCaptureScreen";
import type { TodayRouteStop } from "./src/features/routes/route.types";
import StopDetailsScreen from "./src/screens/StopDetailsScreen";

type Screen = "home" | "clockIn" | "selfie" | "clockedIn" | "stopDetails";

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
  const [currentTimeEntryId, setCurrentTimeEntryId] = useState<string | null>(
    null,
  );
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);
  const [selectedStop, setSelectedStop] = useState<TodayRouteStop | null>(null);

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
    return (
      <HomeScreen
        refreshKey={homeRefreshKey}
        onClockInPress={() => {
          setScreen("clockIn");
        }}
        onStopPress={(stop) => {
          setSelectedStop(stop);
          setScreen("stopDetails");
        }}
      />
    );
  }

  if (screen === "stopDetails") {
    if (!selectedStop) {
      return (
        <View style={styles.centeredScreen}>
          <Text style={styles.errorTitle}>Stop unavailable</Text>

          <Text style={styles.errorText}>
            The selected route stop could not be loaded.
          </Text>

          <Text
            style={styles.action}
            onPress={() => {
              setScreen("home");
            }}
          >
            Return Home
          </Text>
        </View>
      );
    }

    return (
      <StopDetailsScreen
        stop={selectedStop}
        onBack={() => {
          setSelectedStop(null);
          setScreen("home");
        }}
      />
    );
  }

  if (screen === "clockIn") {
    return (
      <ClockInScreen
        onBack={() => {
          setScreen("home");
        }}
        onClockedIn={(timeEntryId) => {
          setCurrentTimeEntryId(timeEntryId);

          // The time_entries row now exists.
          // AUTH-5 will upload the selfie and attach it to this row.
          setScreen("selfie");
        }}
      />
    );
  }

  if (screen === "selfie") {
    if (!currentTimeEntryId) {
      return (
        <View style={styles.centeredScreen}>
          <Text style={styles.errorTitle}>Clock-in record unavailable</Text>

          <Text style={styles.errorText}>
            The active time entry could not be identified. Return home and try
            again.
          </Text>

          <Text
            style={styles.action}
            onPress={() => {
              setScreen("home");
            }}
          >
            Return Home
          </Text>
        </View>
      );
    }

    return (
      <SelfieCaptureScreen
        timeEntryId={currentTimeEntryId}
        onCompleted={() => {
          setScreen("clockedIn");
        }}
      />
    );
  }

  return (
    <ClockedInScreen
      onContinue={() => {
        setHomeRefreshKey((currentValue) => currentValue + 1);
        setCurrentTimeEntryId(null);
        setScreen("home");
      }}
    />
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
});
