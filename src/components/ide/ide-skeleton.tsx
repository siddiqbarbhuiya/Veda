import { Skeleton } from "@/components/ui/skeleton";

const treeRows = ["w-24", "w-32", "w-20", "w-28", "w-16", "w-24"];
const codeLines = ["w-1/3", "w-1/2", "w-2/5", "w-3/5", "w-1/4", "w-1/2", "w-1/3", "w-2/3"];

/** Full-shell placeholder shown while the IDE bundle loads. Same bar sizes as the real shell. */
export function IdeSkeleton() {
  return (
    <div className="flex h-full w-full flex-col bg-app" role="status" aria-label="Loading IDE">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
        <Skeleton className="size-6" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="ml-4 h-7 w-20" />
        <Skeleton className="h-7 w-24" />
        <div className="ml-auto flex items-center gap-3">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="size-7 rounded-full" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-12 shrink-0 flex-col items-center gap-3 border-r border-line bg-app py-3">
          <Skeleton className="size-6" />
          <Skeleton className="size-6" />
          <Skeleton className="size-6" />
        </div>
        <div className="hidden w-60 shrink-0 flex-col gap-3 border-r border-line bg-panel p-3 md:flex">
          {treeRows.map((w, i) => (
            <Skeleton key={i} className={`h-4 ${w}`} />
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-3 bg-editor p-4">
            {codeLines.map((w, i) => (
              <Skeleton key={i} className={`h-3.5 ${w}`} />
            ))}
          </div>
          <div className="h-60 shrink-0 border-t border-line bg-panel p-3">
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="hidden w-[360px] shrink-0 border-l border-line bg-panel p-3 lg:block">
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <div className="h-6 shrink-0 border-t border-line bg-app" />
    </div>
  );
}
