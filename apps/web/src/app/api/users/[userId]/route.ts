import { NextResponse } from "next/server";
import { requireUserManager } from "@/lib/auth/require-user-manager";
import { updateAppUser } from "@/lib/users/user-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  await requireUserManager();

  const { userId } = await params;
  const body = await request.json();

  await updateAppUser({
    userId,
    fullName: body.fullName,
    phone: body.phone,
    address: body.address,
    region: body.region,
    role: body.role,
    isActive: body.isActive,
  });

  return NextResponse.json({ ok: true });
}
