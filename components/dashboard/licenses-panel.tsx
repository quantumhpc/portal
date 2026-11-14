"use client";

import { useLicServers, useLicPool } from "@/hooks/use-cluster";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound } from "lucide-react";
import Link from "next/link";
import { licenseBarColor } from "./panel-rules";

function LicenseBar({ name, total, used, freePerc }: { name: string; total: number; used: number; freePerc: number }) {
  const usedPerc = 100 - freePerc;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="truncate max-w-[140px]">{name}</span>
        <span className="text-muted-foreground">{used}/{total}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${licenseBarColor(usedPerc)}`}
          style={{ width: `${usedPerc}%` }}
        />
      </div>
    </div>
  );
}

function LicenseFeatureList({ feature }: { feature: string }) {
  const { data, isLoading } = useLicPool(feature);

  if (isLoading) return <Skeleton className="h-6 w-full" />;
  if (!data || data.error) return null;

  return (
    <div className="space-y-2">
      {Object.entries(data).slice(0, 4).map(([name, pool]: [string, any]) => (
        <LicenseBar
          key={name}
          name={name}
          total={Number(pool.total) || 0}
          used={Number(pool.used) || 0}
          freePerc={pool.freePerc ?? 100}
        />
      ))}
    </div>
  );
}

export function LicensesPanel() {
  const { data: licServers, isLoading, error } = useLicServers();
  const features = licServers ? Object.keys(licServers) : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">
          <KeyRound className="inline-block w-4 h-4 mr-2" />
          License usage
        </CardTitle>
        <Link href="/licensing" className="text-xs text-muted-foreground hover:underline">
          View all
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-6 w-full" />)}
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive">Failed to load licenses</p>
        )}
        {features.length === 0 && !isLoading && !error && (
          <p className="text-sm text-muted-foreground">No license servers configured</p>
        )}
        {features.length > 0 && (
          <div className="space-y-3">
            {features.slice(0, 3).map((feature) => (
              <div key={feature}>
                <p className="text-xs font-medium mb-1">{feature}</p>
                <LicenseFeatureList feature={feature} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
