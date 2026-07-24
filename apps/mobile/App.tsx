import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "./src/features/auth/AuthProvider";
import {
  ServiceVisitProvider,
  useServiceVisit,
} from "./src/features/service-visit/ServiceVisitProvider";
import AccessDeniedScreen from "./src/screens/AccessDeniedScreen";
import ClockedInScreen from "./src/screens/ClockedInScreen";
import ClockInScreen from "./src/screens/ClockInScreen";
import HomeScreen from "./src/screens/HomeScreen";
import LoginScreen from "./src/screens/LoginScreen";
import SelfieCaptureScreen from "./src/screens/SelfieCaptureScreen";
import type { TodayRouteStop } from "./src/features/routes/route.types";
import ServiceVisitScreen from "./src/screens/ServiceVisitScreen";
import StopDetailsScreen from "./src/screens/StopDetailsScreen";

type Screen = "home" | "clockIn" | "selfie" | "clockedIn" | "stopDetails" | "serviceVisit";

type SelectedStop = {
  routeId: string;
  stop: TodayRouteStop;
};

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

  const {
    activeVisit,
    restoringVisit,
    errorMessage: serviceVisitError,
    retryRestore,
    clearLocalVisit,
  } = useServiceVisit();

  const [screen, setScreen] = useState<Screen>("home");
  const [currentTimeEntryId, setCurrentTimeEntryId] = useState<string | null>(
    null,
  );
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);
  const [selectedStop, setSelectedStop] = useState<SelectedStop  | null>(null);
  const [serviceVisitRecoveryAction, setServiceVisitRecoveryAction] =
  useState<"retry" | "discard" | null>(null);

  useEffect(() => {
    if (status === "signed_out") {
      setScreen("home");
      setCurrentTimeEntryId(null);
      setSelectedStop(null);
      setHomeRefreshKey(0);
    }
  }, [status]);

  useEffect(() => {
    if (
      status === "authenticated" &&
      !restoringVisit &&
      activeVisit?.status === "in_progress"
    ) {
      setScreen("serviceVisit");
    }
  }, [activeVisit, restoringVisit, status]);
  
  async function handleRetryServiceVisitRestore(): Promise<void> {
  if (serviceVisitRecoveryAction) {
    return;
  }

  setServiceVisitRecoveryAction("retry");

  try {
    await retryRestore();
  } finally {
    setServiceVisitRecoveryAction(null);
  }
}

async function handleDiscardLocalServiceVisit(): Promise<void> {
  if (serviceVisitRecoveryAction) {
    return;
  }

  setServiceVisitRecoveryAction("discard");

  try {
    await clearLocalVisit();

    setSelectedStop(null);
    setScreen("home");
  } finally {
    setServiceVisitRecoveryAction(null);
  }
}

function confirmDiscardLocalServiceVisit(): void {
  if (serviceVisitRecoveryAction) {
    return;
  }

  Alert.alert(
    "Discard saved visit?",
    "This removes the locally saved service visit from this device. This action cannot be undone.",
    [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          void handleDiscardLocalServiceVisit();
        },
      },
    ],
  );
}

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

  if (restoringVisit) {
    return (
      <LoadingScreen message="Restoring service visit…" />
    );
  }

  if (serviceVisitError) {
    const recoveryPending =
      serviceVisitRecoveryAction !== null;

    return (
      <View style={styles.centeredScreen}>
        <Text style={styles.errorTitle}>
          Unable to restore service visit
        </Text>

        <Text style={styles.errorText}>
          {serviceVisitError}
        </Text>

        <Text style={styles.recoveryDescription}>
          You can try loading the saved visit again or discard the local
          copy and continue to the app.
        </Text>

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.recoveryPrimaryButton,
            pressed &&
              !recoveryPending &&
              styles.recoveryButtonPressed,
            recoveryPending && styles.recoveryButtonDisabled,
          ]}
          disabled={recoveryPending}
          onPress={() => {
            void handleRetryServiceVisitRestore();
          }}
        >
          {serviceVisitRecoveryAction === "retry" ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.recoveryPrimaryButtonText}>
              Try Again
            </Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.recoverySecondaryButton,
            pressed &&
              !recoveryPending &&
              styles.recoveryButtonPressed,
            recoveryPending && styles.recoveryButtonDisabled,
          ]}
          disabled={recoveryPending}
          onPress={() => {confirmDiscardLocalServiceVisit}}
        >
          {serviceVisitRecoveryAction === "discard" ? (
            <ActivityIndicator color="#7a3f2c" />
          ) : (
            <Text style={styles.recoverySecondaryButtonText}>
              Discard Saved Visit
            </Text>
          )}
        </Pressable>

        <Text style={styles.recoveryWarning}>
          Discarding removes the saved visit only from this device.
        </Text>
      </View>
    );
  }

  if (screen === "home") {
    return (
      <HomeScreen
        refreshKey={homeRefreshKey}
        onClockInPress={() => {
          setScreen("clockIn");
        }}
        onResumeSelfie={(timeEntryId) => {
          setCurrentTimeEntryId(timeEntryId);
          setScreen("selfie");
        }}
         onStopPress={(routeId, stop) => {
          setSelectedStop({
            routeId,
            stop,
          });

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
              setSelectedStop(null);
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
        routeId={selectedStop.routeId}
        stop={selectedStop.stop}
        onBack={() => {
          setSelectedStop(null);
          setScreen("home");
        }}
        onServiceStarted={() => {
          setScreen("serviceVisit");
        }}
      />
    );
  }

  if (screen === "serviceVisit") {
    return (
      <ServiceVisitScreen
        onBack={() => {
          if (
            selectedStop &&
            activeVisit?.stopId === selectedStop.stop.id
          ) {
            setScreen("stopDetails");
            return;
          }

          setScreen("home");
        }}
        onVisitCompleted={() => {
          setSelectedStop(null);
          setHomeRefreshKey((currentValue) => currentValue + 1);
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

          // The time entry now exists with selfie_status = "required".
          //Continue to selfie capture using the same record.
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
              setCurrentTimeEntryId(null);
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
        <ServiceVisitProvider>
          <StatusBar style="dark" />
          <AppContent />
        </ServiceVisitProvider>
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
  recoveryDescription: {
  color: "#8a6f53",
  fontSize: 14,
  lineHeight: 20,
  marginTop: 12,
  maxWidth: 360,
  textAlign: "center",
},
  recoveryPrimaryButton: {
    alignItems: "center",
    backgroundColor: "#7a3f2c",
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 24,
    minHeight: 50,
    paddingHorizontal: 28,
    width: "100%",
  },
  recoveryPrimaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  recoverySecondaryButton: {
    alignItems: "center",
    borderColor: "#cfae8e",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 50,
    paddingHorizontal: 28,
    width: "100%",
  },
  recoverySecondaryButtonText: {
    color: "#7a3f2c",
    fontSize: 15,
    fontWeight: "700",
  },
  recoveryButtonPressed: {
    opacity: 0.82,
  },
  recoveryButtonDisabled: {
    opacity: 0.55,
  },
  recoveryWarning: {
    color: "#a89c8f",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 12,
    textAlign: "center",
  },
});
