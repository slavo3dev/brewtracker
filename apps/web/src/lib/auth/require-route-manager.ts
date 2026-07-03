import { canManageRoutes } from "@brewtracker/types";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "./get-current-user";

export async function requireRouteManager() {
  const profile = await getCurrentUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!canManageRoutes(profile)) {
    redirect("/dashboard");
  }

  return profile;
}
