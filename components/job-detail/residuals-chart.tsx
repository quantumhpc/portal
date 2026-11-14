"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useJobResiduals } from "@/hooks/use-jobs";
import { Loader2, LineChart as LineChartIcon } from "lucide-react";
import { ParserResultView } from "./parser-result-view";

interface ResidualsChartProps {
  jobId: string;
  appName?: string;
  appDomain?: string;
}

export function ResidualsChart({ jobId, appName, appDomain }: ResidualsChartProps) {
  const { data, isLoading, error } = useJobResiduals(jobId, { appName, appDomain });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <LineChartIcon className="h-5 w-5 text-muted-foreground" aria-hidden /> Progress
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-[300px]">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : data?.noParser ? (
          <p className="text-sm text-muted-foreground">This application has no progress parser.</p>
        ) : (
          <ParserResultView result={data} />
        )}
      </CardContent>
    </Card>
  );
}
