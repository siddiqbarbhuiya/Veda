import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the real page: h1, wallet + billing, top-up packs, API keys, transactions.
export default function DashboardLoading() {
  return (
    <div role="status" aria-busy="true" className="space-y-8">
      <span className="sr-only">Loading dashboard...</span>
      <Skeleton className="h-9 w-40" />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="flex flex-col justify-between gap-6 p-6">
          <div className="space-y-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-10 w-44 sm:h-12" />
          </div>
          <Skeleton className="h-11 w-36 sm:h-9" />
        </Card>
        <Card className="space-y-4 p-6">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </Card>
      </div>

      <Card className="p-6">
        <Skeleton className="mb-4 h-3 w-24" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <div className="mt-4 flex justify-end">
          <Skeleton className="h-11 w-full sm:h-9 sm:w-44" />
        </div>
      </Card>

      <section className="space-y-3">
        <Skeleton className="h-7 w-28" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </section>

      <section className="space-y-3">
        <Skeleton className="h-7 w-48" />
        <Card className="divide-y divide-line">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4 p-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
