import type { Metadata } from "next";
import PlanPage from "@/components/plan/PlanPage";

export const metadata: Metadata = { title: "Rencana" };

export default function Page() {
  return <PlanPage />;
}
