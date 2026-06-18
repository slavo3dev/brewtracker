import Link from "next/link";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;

  return (
    <div className="pour-glow flex min-h-[calc(100vh-3rem)] items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link href="/" className="mb-5 flex items-center gap-2 text-espresso-950">
            <BrewMark />
          </Link>
          <h1 className="text-display text-2xl text-espresso-950">
            Sign in to BrewTracker
          </h1>
          <p className="mt-1.5 text-[14px] text-steam-400">
            Reliant field operations
          </p>
        </div>

        <div className="rounded-2xl bg-crema-0 p-7 shadow-[0_2px_8px_rgba(61,43,31,0.07)] ring-1 ring-espresso-950/[0.06]">
          <LoginForm redirectTo={redirectTo ?? "/"} />
        </div>

        <p className="mt-6 text-center text-[13px] text-steam-400">
          Trouble signing in?{" "}
          <a href="#" className="font-medium text-espresso-800 hover:text-copper-600">
            Contact your manager
          </a>
        </p>
      </div>
    </div>
  );
}

function BrewMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 8h14v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M18 9.5h1.5a2.5 2.5 0 0 1 0 5H18"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8 5c0-.7.5-1 .8-1.6M12 5c0-.7.5-1 .8-1.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
