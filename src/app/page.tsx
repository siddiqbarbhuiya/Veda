import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">
        IndicSandbox — AI Playground for Indian Students
      </h1>
      <Link
        href="/login"
        className="rounded-full bg-foreground px-6 py-3 font-medium text-background"
      >
        Get Started
      </Link>
    </main>
  );
}
