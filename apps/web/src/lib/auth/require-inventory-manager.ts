import { requireAdmin } from "./require-admin";

export async function requireInventoryManager() {
  const profile = await requireAdmin();

  if (
    profile.role !== "ceo" &&
    profile.role !== "manager"
  ) {
    throw new Error(
      "You do not have permission to manage inventory products.",
    );
  }

  return profile;
}