"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { AlertCircle, CreditCard, Globe, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme";
import { GitHubGlyph, GoogleGlyph } from "@/components/dashboard/provider-icons";
import { createBrowserClient } from "@/lib/supabase/client";
import { LOGIN_ERROR_MESSAGES, loginErrorCode, safeNextPath } from "@/lib/auth/redirect";

type Provider = "google" | "github";

const TRUST_POINTS = [
  { icon: KeyRound, title: "Encrypted keys", text: "Your API keys are encrypted before they are stored." },
  { icon: CreditCard, title: "Pay for what you use", text: "Add credits in rupees. Each AI request uses only its real cost." },
  { icon: Globe, title: "Runs in your browser", text: "Write and run code with nothing to install." },
];

function LoginCard() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const nextParam = searchParams.get("next");
  const [pending, setPending] = useState<Provider | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const error = failure ?? (errorParam ? LOGIN_ERROR_MESSAGES[loginErrorCode(errorParam)] : null);

  // The browser can restore this page from the back/forward cache with the pending state still set.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(null);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  async function signIn(provider: Provider) {
    setPending(provider);
    setFailure(null);
    try {
      const supabase = createBrowserClient();
      const next = safeNextPath(nextParam, window.location.origin);
      const redirectTo =
        `${window.location.origin}/auth/callback` + (next ? `?next=${encodeURIComponent(next)}` : "");
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (authError) {
        setFailure(LOGIN_ERROR_MESSAGES.failed);
        setPending(null);
      }
      // On success the browser redirects to the provider, so the loading state stays.
    } catch {
      setFailure(LOGIN_ERROR_MESSAGES.failed);
      setPending(null);
    }
  }

  const providerButton = (provider: Provider, glyph: ReactNode, label: string) => (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      className="w-full min-h-12"
      loading={pending === provider}
      disabled={pending !== null}
      leadingIcon={glyph}
      onClick={() => signIn(provider)}
    >
      {label}
    </Button>
  );

  return (
    <div className="rounded-xl border border-line-strong bg-panel p-6 shadow-e1 sm:p-8">
      <h1 className="font-display text-2xl font-semibold tracking-[-0.015em]">Sign in to Veda</h1>
      <p className="mt-1.5 text-sm text-fg-2">Choose an account to continue.</p>

      <div className="mt-6 flex flex-col gap-3">
        {providerButton("google", <GoogleGlyph />, "Sign in with Google")}
        {providerButton("github", <GitHubGlyph />, "Sign in with GitHub")}
      </div>

      <p className="sr-only" role="status">
        {pending ? "Redirecting to the sign-in page of your provider." : ""}
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-md bg-danger-subtle p-3 text-sm text-danger"
        >
          <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}

      <p className="mt-6 text-caption text-fg-3">We only read your name and email.</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-dvh bg-app text-fg lg:grid lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between border-r border-line bg-panel p-12 lg:flex">
        <Logo size={32} />
        <div className="max-w-md">
          <p className="font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em]">
            Code with AI in your browser. Bring your own key.
          </p>
          <ul className="mt-10 space-y-6">
            {TRUST_POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent-text">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-medium text-fg">{title}</p>
                  <p className="text-sm text-fg-2">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-caption text-fg-3">Built for students in India.</p>
      </aside>

      <main className="relative flex min-h-dvh items-center justify-center px-4 py-16 lg:min-h-0">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm animate-slide-up">
          <Logo size={32} className="mb-8 lg:hidden" />
          <Suspense fallback={<div className="h-72 rounded-xl border border-line-strong bg-panel" aria-busy="true" />}>
            <LoginCard />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
