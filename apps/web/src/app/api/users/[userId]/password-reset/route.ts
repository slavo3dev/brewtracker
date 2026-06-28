import { NextResponse } from "next/server";
import { requireUserManager } from "@/lib/auth/require-user-manager";
import {
  getAppUsers,
  sendAppUserPasswordReset,
} from "@/lib/users/user-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  await requireUserManager();

  const { userId } = await params;
  const users = await getAppUsers();
  const targetUser = users.find((user) => user.id === userId);

  if (!targetUser?.email) {
    return NextResponse.json(
      { error: "User email not found." },
      { status: 404 },
    );
  }

  await sendAppUserPasswordReset(targetUser.email, new URL(request.url).origin);

  return NextResponse.json({ ok: true });
}
