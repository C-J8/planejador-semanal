import { redirect } from "next/navigation";
import { TrackingDashboard } from "@/components/tracking/tracking-dashboard";
import { currentCalendarDate } from "@/lib/calendar-values";
import {
  TrackingPeriodError,
  trackingSearchParams,
  type RawTrackingFilters,
} from "@/lib/tracking-values";
import { getTrackingDashboard } from "@/services/tracking-dashboard";

export default async function TrackingPage({
  searchParams,
}: PageProps<"/acompanhamento">) {
  const params = await searchParams;
  const raw: RawTrackingFilters = {
    from: stringParam(params.from),
    to: stringParam(params.to),
    activity: params.activity,
    status: params.status,
  };
  let dashboard: Awaited<ReturnType<typeof getTrackingDashboard>>;
  try {
    dashboard = await getTrackingDashboard(raw, currentCalendarDate());
  } catch (error) {
    if (error instanceof TrackingPeriodError)
      return (
        <section className="tracking-page">
          <div className="empty-state" role="alert">
            <h1>Período inválido</h1>
            <p>{error.message}</p>
            <a className="button primary" href="/acompanhamento">
              Usar período padrão
            </a>
          </div>
        </section>
      );
    throw error;
  }
  const limited = params.limited === "1" || dashboard.period.toWasLimited;
  const canonicalQuery = trackingSearchParams(dashboard.filters);
  const isCanonical =
    raw.from === dashboard.filters.from &&
    raw.to === dashboard.filters.to &&
    sameValues(raw.activity, dashboard.filters.activities) &&
    sameValues(raw.status, dashboard.filters.statuses);
  if (!isCanonical) {
    redirect(`/acompanhamento?${canonicalQuery}${limited ? "&limited=1" : ""}`);
  }

  return (
    <section className="tracking-page">
      <div className="tracking-heading">
        <h1>Acompanhamento</h1>
      </div>
      <TrackingDashboard dashboard={dashboard} toWasLimited={limited} />
    </section>
  );
}

function stringParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function sameValues(raw: string | string[] | undefined, normalized: string[]) {
  const values = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  return (
    values.length === normalized.length &&
    [...values].sort().every((value, index) => value === normalized[index])
  );
}
