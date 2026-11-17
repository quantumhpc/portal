"use client";

import { Circle, CheckCircle, Clock, Play, XCircle } from "lucide-react";

const stages = ["New", "Queued", "Running", "Completed"];

const stageIcons: Record<string, typeof Circle> = {
  New: Circle,
  Queued: Clock,
  Running: Play,
  Completed: CheckCircle,
  Error: XCircle,
};

export function StatusTimeline({ currentStatus }: { currentStatus: string }) {
  // Archive: the job has left the queue, so every stage is behind it.
  const finished = currentStatus === "Archive";
  const currentIndex = finished ? stages.length - 1 : stages.indexOf(currentStatus);
  const isError = currentStatus === "Error";

  return (
    <div className="flex items-center gap-0">
      {stages.map((stage, i) => {
        const Icon = stageIcons[stage] || Circle;
        const isActive = i <= currentIndex || (isError && i === 0);
        const isCurrent = stage === currentStatus || (finished && i === currentIndex);

        return (
          <div key={stage} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`rounded-full p-1.5 ${
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : isActive
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span className={`text-xs mt-1 ${isCurrent ? "font-medium" : "text-muted-foreground"}`}>
                {finished && i === currentIndex ? "Finished" : stage}
              </span>
            </div>
            {i < stages.length - 1 && (
              <div
                className={`w-8 h-0.5 mx-1 ${
                  i < currentIndex ? "bg-primary" : "bg-muted"
                }`}
              />
            )}
          </div>
        );
      })}
      {isError && (
        <div className="flex items-center ml-2">
          <div className="rounded-full p-1.5 bg-destructive text-destructive-foreground">
            <XCircle className="h-4 w-4" />
          </div>
          <span className="text-xs mt-1 ml-1 font-medium text-destructive">Error</span>
        </div>
      )}
    </div>
  );
}
