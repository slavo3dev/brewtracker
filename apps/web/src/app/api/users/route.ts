import { NextResponse } from "next/server";
import type { AppRole } from "@brewtracker/types";
import { requireUserManager } from "@/lib/auth/require-user-manager";
import {
  createAppUser,
  getAppUsers,
  sendAppUserPasswordReset,
} from "@/lib/users/user-service";

function parseRole(value: unknown): AppRole {
  if (
    value === "driver" ||
    value === "tech" ||
    value === "manager" ||
    value === "ceo"
  ) {
    return value;
  }

  return "driver";
}

export async function GET() {
  await requireUserManager();

  const users = await getAppUsers();

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  await requireUserManager();

  const body = await request.json();

  const email = String(body.email ?? "").trim();
  const fullName = String(body.fullName ?? "").trim();

  if (!email || !fullName) {
    return NextResponse.json(
      { error: "Full name and email are required." },
      { status: 400 },
    );
  }

  const user = await createAppUser({
    fullName,
    email,
    phone: body.phone ?? null,
    address: body.address ?? null,
    region: body.region ?? null,
    role: parseRole(body.role),
  });

  await sendAppUserPasswordReset(email, new URL(request.url).origin);

  return NextResponse.json({ userId: user.id }, { status: 201 });
}
