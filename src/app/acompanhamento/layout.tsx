import type { ReactNode } from "react";
import { TrackingNavigation } from "@/modules/tracking/components/tracking-navigation";

export default function TrackingLayout({ children }: { children: ReactNode }) {
  return (
    <section className="tracking-page">
      <div className="tracking-heading">
        <h1>Acompanhamento</h1>
        <TrackingNavigation />
      </div>
      {children}
    </section>
  );
}
