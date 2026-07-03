import { requireUserManager } from "@/lib/auth/require-user-manager";
import { getAppUsers } from "@/lib/users/user-service";
import { AddUserForm } from "./add-user-form";
import { UserCard } from "./user-card";

export default async function UsersPage() {
  await requireUserManager();

  const users = await getAppUsers();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-display text-3xl text-espresso-950">
          User management
        </h1>
        <p className="mt-2 text-sm text-steam-400">
          Add drivers, update roles, and manage account access.
        </p>
      </div>

      <section className="mb-10 rounded-2xl bg-crema-0 p-6 shadow-sm ring-1 ring-espresso-950/[0.06]">
        <h2 className="mb-5 text-lg font-semibold text-espresso-950">
          Add user
        </h2>

        <AddUserForm />
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-espresso-950">Users</h2>
          <p className="text-sm text-steam-400">{users.length} total users</p>
        </div>

        <div className="grid gap-4">
          {users.map((user) => (
            <UserCard key={user.id} user={user} />
          ))}
        </div>
      </section>
    </main>
  );
}
