export function getAuthenticationErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unable to sign in. Please try again.";
  }

  const message = error.message.toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "The email or password is incorrect.";
  }

  if (message.includes("email not confirmed")) {
    return "Your email address has not been confirmed.";
  }

  if (message.includes("network request failed")) {
    return "Unable to connect. Check your internet connection.";
  }

  if (message.includes("user profile")) {
    return "Your employee profile could not be loaded. Contact your manager.";
  }

  return error.message;
}
