"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Clock, MapPin } from "lucide-react";
import { Check2, ExportFrame, ExportPanel, Panel } from "./export-shell";
import { EXPORT_THEMES, inlineImage } from "@/lib/export-image";

export type PlanReportData = {
  title: string; typeLabel: string; when: string; location: string | null; people: string[]; note: string | null;
  costText: string | null; photoUrls: string[]; watermark: string; completed: boolean;
};

export function PlanReportExport({ d }: { d: PlanReportData }) {
  const te = useTranslations("export");
  const [cost, setCost] = useState(false);
  const [people, setPeople] = useState(true);
  const [note, setNote] = useState(true);
  const [photos, setPhotos] = useState(true);
  const [imgs, setImgs] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all(d.photoUrls.map(inlineImage)).then((r) => { if (alive) setImgs(r); });
    return () => { alive = false; };
  }, [d.photoUrls]);

  return (
    <ExportPanel
      filename={`${d.title}-report`}
      options={
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Check2 checked={people} onChange={setPeople} label={te("blocks.people")} />
          <Check2 checked={note} onChange={setNote} label={te("blocks.note")} />
          {d.costText && <Check2 checked={cost} onChange={setCost} label={te("blocks.cost")} />}
          {d.photoUrls.length > 0 && <Check2 checked={photos} onChange={setPhotos} label={te("blocks.photos")} />}
        </div>
      }
    >
      {(theme, ref) => {
        const c = EXPORT_THEMES[theme];
        return (
          <div ref={ref}>
            <ExportFrame theme={theme} title={d.title} subtitle={d.typeLabel} watermark={d.watermark}>
              <Panel theme={theme}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Clock size={16} color={c.accent} /> {d.when}</div>
                  {d.location && <div style={{ display: "flex", alignItems: "center", gap: 8 }}><MapPin size={16} color={c.accent} /> {d.location}</div>}
                  {people && d.people.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {d.people.map((p) => <span key={p} style={{ background: c.soft, borderRadius: 999, padding: "2px 10px", fontSize: 12 }}>{p}</span>)}
                    </div>
                  )}
                  {cost && d.costText && <div style={{ fontVariantNumeric: "tabular-nums" }}>{d.costText}</div>}
                  {note && d.note && <div style={{ whiteSpace: "pre-line", color: c.muted }}>{d.note}</div>}
                </div>
              </Panel>
              {photos && imgs.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: imgs.length === 1 ? "1fr" : "repeat(3, 1fr)", gap: 8 }}>
                  {imgs.map((u, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={u} alt="" style={{ width: "100%", aspectRatio: imgs.length === 1 ? "4 / 3" : "1 / 1", objectFit: "cover", borderRadius: 12 }} />
                  ))}
                </div>
              )}
            </ExportFrame>
          </div>
        );
      }}
    </ExportPanel>
  );
}
