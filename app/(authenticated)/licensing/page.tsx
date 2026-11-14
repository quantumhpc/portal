"use client";

import { useLicServers, useLicPool } from "@/hooks/use-cluster";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, Loader2, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

function LicensePoolCard({
  name,
  serverConfig,
}: {
  name: string;
  serverConfig: any;
}) {
  const { data, isLoading, refetch, isFetching } = useLicPool(name);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base">{name}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {serverConfig?.type || "License server"} &mdash;{" "}
            {serverConfig?.host || serverConfig?.url || ""}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !data || data.error ? (
          <p className="text-sm text-destructive">
            {data?.error || "Failed to query license server"}
          </p>
        ) : Array.isArray(data) && data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">In use</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead>Usage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((feature: any, i: number) => {
                const total = feature.total || feature.issued || 0;
                const used = feature.used || feature.inUse || 0;
                const free = total - used;
                const pct = total > 0 ? Math.round((used / total) * 100) : 0;

                return (
                  <TableRow key={feature.name || i}>
                    <TableCell className="font-medium text-sm">
                      {feature.name || feature.feature || `Feature ${i + 1}`}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {total}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {used}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {free}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              pct > 90
                                ? "bg-destructive"
                                : pct > 70
                                ? "bg-warning"
                                : "bg-success"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {pct}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : typeof data === "object" && !Array.isArray(data) ? (
          // Single feature response
          <div className="space-y-2">
            {Object.entries(data).map(([key, val]: [string, any]) => {
              if (typeof val === "object" && val !== null && "total" in val) {
                const total = val.total || val.issued || 0;
                const used = val.used || val.inUse || 0;
                const pct =
                  total > 0 ? Math.round((used / total) * 100) : 0;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{key}</span>
                      <span className="text-muted-foreground">
                        {used}/{total}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          pct > 90
                            ? "bg-destructive"
                            : pct > 70
                            ? "bg-warning"
                            : "bg-success"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              }
              return null;
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No license data</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function LicensingPage() {
  const { data: servers, isLoading } = useLicServers();

  return (
    <div className="space-y-6">
      <PageHeader icon={KeyRound} title="License usage" description="Live seat usage on the site's license servers." />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !servers || Object.keys(servers).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <KeyRound className="h-12 w-12 text-muted-foreground mb-2" />
            <p className="text-muted-foreground">
              No license servers configured
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {Object.entries(servers).map(([name, config]: [string, any]) => (
            <LicensePoolCard key={name} name={name} serverConfig={config} />
          ))}
        </div>
      )}
    </div>
  );
}
