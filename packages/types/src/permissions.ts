import type { Database } from "./database";

export type AppRole = Database["public"]["Enums"]["app_role"];

export type AuthUser = {
  id: string;
  role: AppRole;
  region: string | null;
  is_active: boolean;
};

export const APP_ROLES = {
  DRIVER: "driver",
  TECH: "tech",
  MANAGER: "manager",
  CEO: "ceo",
} as const satisfies Record<string, AppRole>;

export function isDriver(user: AuthUser | null | undefined) {
  return user?.role === APP_ROLES.DRIVER;
}

export function isTech(user: AuthUser | null | undefined) {
  return user?.role === APP_ROLES.TECH;
}

export function isManager(user: AuthUser | null | undefined) {
  return user?.role === APP_ROLES.MANAGER;
}

export function isCEO(user: AuthUser | null | undefined) {
  return user?.role === APP_ROLES.CEO;
}

export function isStaff(user: AuthUser | null | undefined) {
  return isDriver(user) || isTech(user);
}

export function isAdmin(user: AuthUser | null | undefined) {
  return isManager(user) || isCEO(user);
}

export function canAccessAdminApp(user: AuthUser | null | undefined) {
  return Boolean(user?.is_active && isAdmin(user));
}

export function canAccessDriverApp(user: AuthUser | null | undefined) {
  return Boolean(user?.is_active && (isDriver(user) || isTech(user)));
}

export function canManageRoutes(user: AuthUser | null | undefined) {
  return Boolean(user?.is_active && isAdmin(user));
}

export function canReviewClockIns(user: AuthUser | null | undefined) {
  return Boolean(user?.is_active && isAdmin(user));
}

export function canViewAllRegions(user: AuthUser | null | undefined) {
  return Boolean(user?.is_active && isCEO(user));
}

export function canViewRegion(
  user: AuthUser | null | undefined,
  region: string | null | undefined,
) {
  if (!user?.is_active) return false;
  if (isCEO(user)) return true;
  if (isManager(user)) return Boolean(user.region && user.region === region);
  return false;
}
