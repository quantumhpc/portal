"use client";

import { JobsPanel } from "@/components/dashboard/jobs-panel";
import { NodesPanel } from "@/components/dashboard/nodes-panel";
import { LicensesPanel } from "@/components/dashboard/licenses-panel";
import { AlertsPanel } from "@/components/dashboard/alerts-panel";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Rocket } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description="Your jobs, the cluster and licenses at a glance."
        actions={
          <Button asChild>
            <Link href="/compute"><Rocket className="mr-2 h-4 w-4" aria-hidden /> Start a job</Link>
          </Button>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <JobsPanel />
        <NodesPanel />
        <LicensesPanel />
        <AlertsPanel />
      </div>
    </div>
  );
}
