import { Skeleton } from "@/components/ui/skeleton";

export default function StorageLoading() {
  return (
    <div className="grid grid-cols-12 gap-4" aria-busy="true">
      <Skeleton className="col-span-3 h-[28rem]" />
      <Skeleton className="col-span-9 h-[28rem]" />
    </div>
  );
}
