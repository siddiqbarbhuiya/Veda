"use client";

import { createBrowserClient } from "@/lib/supabase/client";

type Provider = "google" | "github";

export default function LoginPage() {
  async function signIn(provider: Provider) {
    const supabase = createBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Sign in to Veda</h1>
      <button
        type="button"
        onClick={() => signIn("google")}
        className="rounded border px-4 py-2"
      >
        Sign in with Google
      </button>
      <button
        type="button"
        onClick={() => signIn("github")}
        className="rounded border px-4 py-2"
      >
        Sign in with GitHub
      </button>
    </main>
  );
}
