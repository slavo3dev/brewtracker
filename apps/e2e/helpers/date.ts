// The app computes "today" from local Y/M/D components (see getTodayDate() in
// route-builder.tsx), not from toISOString() (UTC). Near a UTC day boundary, those two
// disagree by one day in any timezone ahead of UTC — this mirrors the app's logic so tests
// stay in sync with what the UI actually shows as "today".
export function todayLocalIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
