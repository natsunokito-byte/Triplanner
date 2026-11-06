"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Money } from "./fx";
import { Check2, ExportFrame, ExportPanel, Panel, StaticBars } from "./export-shell";
import { EXPORT_THEMES } from "@/lib/export-image";
import { PLAN_TYPES, type PlanType } from "@/lib/plan-types";
import type { ScoreEntry } from "./scoreboard";

export type DashExportData = {
  title: string; watermark: string; currency: string;
  totalCost: number; completedCost: number; todosDone: number; todosTotal: number; hangoutMin: number;
  costRows: { label: string; value: number }[];
  todoRows: { label: string; done: number; total: number }[];
  people: { id: string; name: string }[];
  entries: ScoreEntry[];
};

type Block = "kpi" | "cost" | "score" | "todos";

export function DashboardExport({ d }: { d: DashExportData }) {
  const t = useTranslations("dash");
  const te = useTranslations("export");
  const [blocks, setBlocks] = useState<Set<Block>>(new Set(["kpi", "cost", "score", "todos"]));
  const toggle = (b: Block, on: boolean) => setBlocks((s) => { const n = new Set(s); if (on) n.add(b); else n.delete(b); return n; });

  const scoreRows = d.people
    .map((p) => ({ label: p.name, value: d.entries.filter((e) => (PLAN_TYPES as readonly string[]).includes(e.type as PlanType) && e.personIds.includes(p.id)).reduce((s, e) => s + e.duration, 0) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const hrs = (m: number) => `${(m / 60).toFixed(1)} h`;

  return (
    <ExportPanel
      filename={`${d.title}-dashboard`}
      options={
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Check2 checked={blocks.has("kpi")} onChange={(v) => toggle("kpi", v)} label={te("blocks.kpi")} />
          <Check2 checked={blocks.has("cost")} onChange={(v) => toggle("cost", v)} label={t("costBy")} />
          <Check2 checked={blocks.has("score")} onChange={(v) => toggle("score", v)} label={t("scoreboard")} />
          <Check2 checked={blocks.has("todos")} onChange={(v) => toggle("todos", v)} label={t("todos")} />
        </div>
      }
    >
      {(theme, ref) => {
        const c = EXPORT_THEMES[theme];
        return (
          <div ref={ref}>
            <ExportFrame theme={theme} title={d.title} subtitle={t("title")} watermark={d.watermark}>
              {blocks.has("kpi") && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                  {[
                    { k: t("kpiCost"), v: <Money amount={d.totalCost} currency={d.currency} /> },
                    { k: t("kpiTodos"), v: `${d.todosDone}/${d.todosTotal}` },
                    { k: t("kpiHangout"), v: hrs(d.hangoutMin) },
                  ].map((x) => (
                    <div key={x.k} style={{ background: c.card, borderRadius: 16, padding: 14 }}>
                      <div style={{ fontSize: 12, color: c.muted }}>{x.k}</div>
                      <div style={{ marginTop: 4, fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{x.v}</div>
                    </div>
                  ))}
                </div>
              )}
              {blocks.has("cost") && d.costRows.length > 0 && (
                <Panel theme={theme} title={t("costBy")}>
                  <StaticBars theme={theme} rows={d.costRows.map((r) => ({ ...r, text: <Money amount={r.value} currency={d.currency} /> }))} />
                </Panel>
              )}
              {blocks.has("score") && scoreRows.length > 0 && (
                <Panel theme={theme} title={t("scoreboard")}>
                  <StaticBars theme={theme} rows={scoreRows.map((r) => ({ ...r, text: hrs(r.value) }))} />
                </Panel>
              )}
              {blocks.has("todos") && d.todoRows.length > 0 && (
                <Panel theme={theme} title={t("todos")}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {d.todoRows.map((r) => (
                      <div key={r.label} style={{ display: "grid", gridTemplateColumns: "120px 1fr 56px", alignItems: "center", gap: 10, fontSize: 13 }}>
                        <span>{r.label}</span>
                        <div style={{ height: 8, borderRadius: 4, background: c.soft }}>
                          <div style={{ height: 8, borderRadius: 4, background: c.accent, width: `${r.total ? (r.done / r.total) * 100 : 0}%` }} />
                        </div>
                        <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.done}/{r.total}</span>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}
            </ExportFrame>
          </div>
        );
      }}
    </ExportPanel>
  );
}
