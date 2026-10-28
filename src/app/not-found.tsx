import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-5xl font-bold">404</h1>
      <p className="text-slate-600">This page does not exist.</p>
      <Link href="/" className="rounded-full bg-slate-900 px-6 py-2 font-medium text-white">
        Back to home
      </Link>
    </main>
  );
}
