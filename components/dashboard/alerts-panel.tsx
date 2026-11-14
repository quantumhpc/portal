"use client";

import { useAlerts } from "@/hooks/use-cluster";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

export function AlertsPanel() {
  const { data: alerts, isLoading, error } = useAlerts();
  const queryClient = useQueryClient();

  const dismissAlert = useMutation({
    mutationFn: async (alertId: string) => {
      const res = await fetch(`/api/alerts?action=delete&alertId=${alertId}`);
      if (!res.ok) throw new Error("Failed to dismiss alert");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  const alertTypeIcon: Record<string, string> = {
    success: "text-success",
    warning: "text-warning-text",
    error: "text-destructive",
    info: "text-info",
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">
          <Bell className="inline-block w-4 h-4 mr-2" />
          Notifications
          {alerts && alerts.length > 0 && (
            <Badge variant="secondary" className="ml-2">{alerts.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-2">
            {[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive">Failed to load notifications</p>
        )}
        {alerts && alerts.length === 0 && (
          <p className="text-sm text-muted-foreground">No notifications</p>
        )}
        {alerts && alerts.length > 0 && (
          <div className="space-y-2 max-h-[200px] overflow-auto">
            {alerts.slice(0, 10).map((alert: any) => (
              <div
                key={alert._id}
                className="flex items-start justify-between gap-2 text-sm border-b pb-2 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium ${alertTypeIcon[alert.type] || ""}`}>
                    {alert.type || "info"}
                  </p>
                  <p className="text-sm line-clamp-2" title={alert.message}>{alert.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {alert.date ? new Date(alert.date).toLocaleString() : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  aria-label="Dismiss alert"
                  onClick={() => dismissAlert.mutate(alert._id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
