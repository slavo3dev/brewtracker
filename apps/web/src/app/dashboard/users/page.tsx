import { requireUserManager } from "@/lib/auth/require-user-manager";
import { getAppUsers } from "@/lib/users/user-service";
import { UserManagement } from "./user-management";

export default async function UsersPage() {
  await requireUserManager();

  const users = await getAppUsers();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <UserManagement users={users} />
    </main>
  );
}