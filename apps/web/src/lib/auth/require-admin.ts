import { canAccessAdminApp } from "@brewtracker/types";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "./get-current-user";

export async function requireAdmin() {
  const profile = await getCurrentUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!canAccessAdminApp(profile)) {
    redirect("/login");
  }

  return profile;
}