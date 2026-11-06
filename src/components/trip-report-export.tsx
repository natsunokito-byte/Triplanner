"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check2, ExportFrame, ExportPanel, Panel } from "./export-shell";
import { EXPORT_THEMES, inlineImage } from "@/lib/export-image";

export type ReportPlan = {
  id: string; day: string; time: string; title: string; typeLabel: string; location: string | null;
  people: string[]; private: boolean; photoUrls: string[];
};
export type TripReportData = { title: string; subtitle: string; watermark: string; dayLabels: Record<string, string>; plans: ReportPlan[] };

export function TripReportExport({ d }: { d: TripReportData }) {
  const te = useTranslations("export");
  const [priv, setPriv] = useState(false);
  const [people, setPeople] = useState(true);
  const [photos, setPhotos] = useState(true);
  const [map, setMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    const urls = d.plans.flatMap((p) => p.photoUrls);
    Promise.all(urls.map(async (u) => [u, await inlineImage(u)] as const)).then((r) => { if (alive) setMap(Object.fromEntries(r)); });
    return () => { alive = false; };
  }, [d.plans]);

  const plans = d.plans.filter((p) => priv || !p.private);
  const days = [...new Set(plans.map((p) => p.day))].sort();

  return (
    <ExportPanel
      filename={`${d.title}-trip-report`}
      options={
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Check2 checked={people} onChange={setPeople} label={te("blocks.people")} />
          <Check2 checked={photos} onChange={setPhotos} label={te("blocks.photos")} />
          <Check2 checked={priv} onChange={setPriv} label={te("blocks.private")} />
        </div>
      }
    >
      {(theme, ref) => {
        const c = EXPORT_THEMES[theme];
        return (
          <div ref={ref}>
            <ExportFrame theme={theme} title={d.title} subtitle={d.subtitle} watermark={d.watermark}>
              {days.length === 0 && <Panel theme={theme}><div style={{ color: c.muted, fontSize: 14 }}>{te("noCompleted")}</div></Panel>}
              {days.map((day) => (
                <Panel key={day} theme={theme} title={d.dayLabels[day] ?? day}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {plans.filter((p) => p.day === day).map((p) => (
                      <div key={p.id}>
                        <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                          <span style={{ fontSize: 12, color: c.muted, fontVariantNumeric: "tabular-nums" }}>{p.time}</span>
                          <span style={{ fontWeight: 700 }}>{p.title}</span>
                          <span style={{ background: c.soft, borderRadius: 999, padding: "0 8px", fontSize: 11 }}>{p.typeLabel}</span>
                        </div>
                        {(p.location || (people && p.people.length > 0)) && (
                          <div style={{ marginTop: 2, fontSize: 12, color: c.muted }}>{[p.location, people ? p.people.join(", ") : null].filter(Boolean).join(" · ")}</div>
                        )}
                        {photos && p.photoUrls.length > 0 && (
                          <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                            {p.photoUrls.map((u) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={u} src={map[u] ?? u} alt="" style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 10 }} />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Panel>
              ))}
            </ExportFrame>
          </div>
        );
      }}
    </ExportPanel>
  );
}
