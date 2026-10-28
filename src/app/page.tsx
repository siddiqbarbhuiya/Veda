import Link from "next/link";

const features = [
  {
    title: "Zero Cost Compute",
    body: "Your code runs in your browser with WebContainers and Pyodide. We pay for no servers, so you pay for none.",
  },
  {
    title: "BYOK Security",
    body: "Bring your own OpenAI, Gemini or Anthropic key. We encrypt it with AES-256-GCM before we store it.",
  },
  {
    title: "UPI Micro-Payments",
    body: "Add credits from ₹29 with UPI. No international card. No dollar conversion fees.",
  },
  {
    title: "AI Chat",
    body: "Ask the AI about your code while you write it. See the cost of each message in rupees.",
  },
];

const steps = [
  { title: "Sign in", body: "Use your Google or GitHub account." },
  { title: "Add your key and credits", body: "Save an AI API key. Top up with UPI." },
  {
    title: "Code with AI",
    body: "Write, run and debug in the browser. A circuit breaker stops runaway costs.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <span className="text-lg font-bold tracking-tight">IndicSandbox</span>
        <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
          Sign in
        </Link>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 py-20 text-center sm:py-28">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
            The AI coding playground built for{" "}
            <span className="bg-gradient-to-r from-orange-500 to-green-600 bg-clip-text text-transparent">
              Indian students
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
            Write and run code in your browser. Use your own AI keys. Pay with UPI from ₹29.
          </p>
          <Link
            href="/login"
            className="mt-10 inline-block rounded-full bg-slate-900 px-8 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-slate-700"
          >
            Get Started
          </Link>
        </section>

        <section className="bg-slate-50 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight">Why IndicSandbox</h2>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-5xl px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight">How it works</h2>
            <ol className="mt-12 grid gap-8 sm:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.title} className="text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-lg font-bold text-white">
                    {i + 1}
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        &copy; 2026 IndicSandbox. Made for students in India.
      </footer>
    </div>
  );
}
