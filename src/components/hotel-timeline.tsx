import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { dayDiff, eachDay, localDate } from "@/lib/tz";
import type { Hotel, Trip } from "@/lib/types";

const COL = 96; // px per day
const LANE_H = 44;

type TL = Pick<Trip, "id" | "start_date" | "end_date" | "timezone">;
type HL = Pick<Hotel, "id" | "name" | "booking_status" | "check_in" | "check_out">;

export async function HotelTimeline({ trip, hotels, readOnly = false }: { trip: TL; hotels: HL[]; readOnly?: boolean }) {
  const t = await getTranslations("hotel");
  const locale = await getLocale();
  const days = eachDay(trip.start_date, trip.end_date);
  const n = days.length;
  const width = n * COL;

  const items = hotels
    .map((h) => {
      const ci = dayDiff(trip.start_date, localDate(h.check_in, trip.timezone));
      const co = dayDiff(trip.start_date, localDate(h.check_out, trip.timezone));
      return { h, ci, co };
    })
    .sort((a, b) => a.ci - b.ci || a.co - b.co);

  // Greedy lane assignment so overlapping stays stack instead of overlapping.
  const laneEnds: number[] = [];
  const placed = items.map((it) => {
    let lane = laneEnds.findIndex((end) => end <= it.ci);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = it.co;
    return { ...it, lane };
  });
  const lanes = Math.max(1, laneEnds.length);

  // A night = the night starting on day d (d = 0 .. n-2); covered when ci <= d < co.
  const gaps: number[] = [];
  for (let d = 0; d < n - 1; d++) if (!items.some((it) => it.ci <= d && d < it.co)) gaps.push(d);

  const fmt = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", timeZone: "UTC" });
  const wd = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <div className="flex items-center gap-3">
          {n > 1 && (
            <span className={`flex items-center gap-1 text-xs ${gaps.length ? "text-danger" : "text-success"}`}>
              {gaps.length ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
              {gaps.length ? t("gapNights", { n: gaps.length }) : t("allCovered")}
            </span>
          )}
          {!readOnly && <Link href={`/t/${trip.id}/hotels/new`} className="btn btn-sm btn-primary">{t("add")}</Link>}
        </div>
      </div>

      {hotels.length === 0 && !readOnly && <p className="text-xs text-muted">{t("noHotels")}</p>}
      <div className="card overflow-x-auto">
        <div style={{ width }} className="relative">
          <div className="flex border-b border-border">
            {days.map((d) => (
              <div key={d} style={{ width: COL }} className="shrink-0 py-2 text-center text-xs text-muted">
                <div className="font-medium text-text">{fmt.format(new Date(d))}</div>
                <div>{wd.format(new Date(d))}</div>
              </div>
            ))}
          </div>

          <div className="relative" style={{ height: lanes * LANE_H + 16 }}>
            {days.map((d, i) => (
              <div key={d} className="absolute inset-y-0 border-r border-border/60" style={{ left: (i + 1) * COL - 1, width: 1 }} />
            ))}

            {gaps.map((d) => (
              <div
                key={`gap-${d}`}
                aria-label={t("gapNights", { n: 1 })}
                className="absolute inset-y-2 rounded-md"
                style={{
                  left: (d + 0.5) * COL + 2,
                  width: COL - 4,
                  background: "repeating-linear-gradient(135deg, rgb(220 38 38 / .16) 0 6px, transparent 6px 12px)",
                  border: "1px dashed var(--danger)",
                }}
              />
            ))}

            {placed.map(({ h, ci, co, lane }) => {
              const left = Math.max(0, (ci + 0.5) * COL);
              const right = Math.min(width, (co + 0.5) * COL);
              if (right <= left) return null; // entirely outside the trip dates
              const booked = h.booking_status === "confirmed";
              const Bar = readOnly ? "div" : Link;
              const barProps = readOnly ? {} : { href: `/t/${trip.id}/hotels/${h.id}` };
              return (
                <Bar
                  key={h.id}
                  {...(barProps as { href: string })}
                  className={`absolute flex items-center gap-1 overflow-hidden rounded-md px-2 text-xs font-medium transition-colors hover:brightness-95 ${
                    booked ? "bg-primary-soft text-primary border border-primary" : "bg-surface-2 text-text border border-dashed border-warning"
                  }`}
                  style={{ left: left + 2, width: right - left - 4, top: 8 + lane * LANE_H, height: LANE_H - 8 }}
                  title={h.name}
                >
                  {booked ? <CheckCircle2 size={14} className="shrink-0" /> : <AlertTriangle size={14} className="shrink-0 text-warning" />}
                  <span className="truncate">{h.name}</span>
                  <span className="ml-auto shrink-0 text-muted">{t("nights", { n: co - ci })}</span>
                </Bar>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
