import { canManageUsers } from "@brewtracker/types";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "./get-current-user";

export async function requireUserManager() {
  const profile = await getCurrentUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!canManageUsers(profile)) {
    redirect("/dashboard");
  }

  return profile;
}
