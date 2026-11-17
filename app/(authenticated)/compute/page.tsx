"use client";

import { AppGrid } from "@/components/compute/app-grid";
import { SavedRuns } from "@/components/compute/saved-runs";
import { PageHeader } from "@/components/ui/page-header";
import { Rocket } from "lucide-react";

export default function ComputePage() {
  return (
    <div className="space-y-6">
      <PageHeader icon={Rocket} title="Start a job" description="Pick an application. Its form fills in the scheduler details for you." />
      <SavedRuns />
      <AppGrid />
    </div>
  );
}
