import { Skeleton } from "@/components/ui/skeleton";

export default function ClusterLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    </div>
  );
}
