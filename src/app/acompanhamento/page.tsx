import { redirect } from "next/navigation";
import { TrackingDashboard } from "@/modules/tracking/components/tracking-dashboard";
import { currentCalendarDate } from "@/shared/lib/calendar-values";
import {
  TrackingPeriodError,
  trackingSearchParams,
  type RawTrackingFilters,
} from "@/modules/tracking/lib/tracking-values";
import { getTrackingDashboard } from "@/modules/tracking/services/tracking-dashboard";

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
        <div className="empty-state" role="alert">
          <h2>Período inválido</h2>
          <p>{error.message}</p>
          <a className="button primary" href="/acompanhamento">
            Usar período padrão
          </a>
        </div>
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

  return <TrackingDashboard dashboard={dashboard} toWasLimited={limited} />;
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
