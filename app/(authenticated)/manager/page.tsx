import { redirect } from "next/navigation";

// Nodes and queues now live on the Cluster page.
export default function ManagerPage() {
  redirect("/cluster?tab=queues");
}
