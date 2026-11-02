import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  const response = NextResponse.redirect(
    new URL("/reset-password/update", request.url),
  );

  // Clear any previous recovery attempt.
  response.cookies.delete("password-recovery-token");

  if (type === "recovery" && tokenHash && tokenHash.length <= 512) {
    response.cookies.set("password-recovery-token", tokenHash, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/reset-password/update",
      maxAge: 15 * 60,
    });
  }

  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");

  return response;
}
