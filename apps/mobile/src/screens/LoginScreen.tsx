import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getAuthenticationErrorMessage } from "../features/auth/auth-errors";
import { useAuth } from "../features/auth/AuthProvider";

export default function LoginScreen() {
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const normalizedEmail = email.trim().toLowerCase();
  const canSubmit =
    normalizedEmail.length > 0 && password.length > 0 && !loading;

  async function handleLogin(): Promise<void> {
    if (!canSubmit) {
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      await signIn({
        email: normalizedEmail,
        password,
      });
    } catch (error) {
      setErrorMessage(getAuthenticationErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
        <Text style={styles.logo}>☕ CupCount</Text>
        <Text style={styles.subtitle}>Driver & Tech Login</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>

          <TextInput
            style={styles.input}
            placeholder="driver@example.com"
            placeholderTextColor="#9a8a7a"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            returnKeyType="next"
            editable={!loading}
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>Password</Text>

          <TextInput
            style={styles.input}
            placeholder="Enter your password"
            placeholderTextColor="#9a8a7a"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="password"
            textContentType="password"
            secureTextEntry
            returnKeyType="done"
            editable={!loading}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => {
              void handleLogin();
            }}
          />

          {errorMessage ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              !canSubmit && styles.buttonDisabled,
              pressed && canSubmit && styles.buttonPressed,
            ]}
            disabled={!canSubmit}
            onPress={() => {
              void handleLogin();
            }}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.helpText}>
          Contact your manager if you cannot access your account.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5ede1",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  logo: {
    color: "#4a2c1a",
    fontSize: 32,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    color: "#8a6f53",
    fontSize: 14,
    marginBottom: 36,
    marginTop: 4,
    textAlign: "center",
  },
  form: {
    width: "100%",
  },
  label: {
    color: "#4a2c1a",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#e3d4c0",
    borderRadius: 12,
    borderWidth: 1,
    color: "#2e1d12",
    fontSize: 16,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  errorContainer: {
    backgroundColor: "#f8e4e1",
    borderColor: "#e6bab4",
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
    padding: 12,
  },
  errorText: {
    color: "#9f302d",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  button: {
    alignItems: "center",
    backgroundColor: "#7a3f2c",
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 4,
    minHeight: 52,
    paddingVertical: 15,
  },
  buttonDisabled: {
    backgroundColor: "#c9b8a8",
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  helpText: {
    color: "#8a6f53",
    fontSize: 12,
    marginTop: 24,
    textAlign: "center",
  },
});
