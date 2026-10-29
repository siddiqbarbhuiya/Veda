import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div role="status" className="space-y-8">
      <span className="sr-only">Loading dashboard...</span>
      <Skeleton className="h-9 w-40" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="space-y-6 p-6">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-12 w-48" />
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
      </Card>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
