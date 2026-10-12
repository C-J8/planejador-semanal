import type { Metadata } from "next";
import { StatusDashboard } from "@/modules/system-status/components/status-dashboard";
import { getSystemStatus } from "@/modules/system-status/services/system-status";
import "@/modules/system-status/components/status-dashboard.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Status | Planner" };

export default async function StatusPage() {
  return (
    <StatusDashboard
      initial={await getSystemStatus()}
      showAcademia={Boolean(process.env.GYM_TRACKER_PATH?.trim())}
    />
  );
}
