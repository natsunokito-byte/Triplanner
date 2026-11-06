"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { EXPORT_THEMES, exportPng, type ExportTheme } from "@/lib/export-image";

/** Themed 720px-wide card. Watermark = trip name + dates (decided with the user). */
export function ExportFrame({
  theme, title, subtitle, watermark, children,
}: { theme: ExportTheme; title: string; subtitle?: string; watermark: string; children: React.ReactNode }) {
  const c = EXPORT_THEMES[theme];
  return (
    <div style={{ width: 720, background: c.bg, color: c.ink, padding: 32, fontFamily: '"Zen Maru Gothic","Inter Variable","Noto Sans TC",sans-serif' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.25 }}>{title}</div>
        {subtitle && <div style={{ marginTop: 4, fontSize: 14, color: c.muted }}>{subtitle}</div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>
      <div style={{ marginTop: 24, paddingTop: 12, borderTop: `1px solid ${c.soft}`, fontSize: 12, color: c.muted, textAlign: "right" }}>{watermark}</div>
    </div>
  );
}

export function ExportPanel({
  filename, options, children,
}: {
  filename: string;
  options?: React.ReactNode;
  children: (theme: ExportTheme, ref: React.RefObject<HTMLDivElement | null>) => React.ReactNode;
}) {
  const t = useTranslations("export");
  const [theme, setTheme] = useState<ExportTheme>("paper");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function run() {
    if (!ref.current) return;
    setBusy(true); setErr(false);
    try { await exportPng(ref.current, filename); } catch { setErr(true); } finally { setBusy(false); }
  }

  return (
    <div className="card space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <div className="mb-1 text-xs text-muted">{t("theme")}</div>
          <div className="flex gap-2" role="radiogroup" aria-label={t("theme")}>
            {(Object.keys(EXPORT_THEMES) as ExportTheme[]).map((k) => (
              <button
                key={k} type="button" role="radio" aria-checked={theme === k} aria-label={t(`themes.${k}`)} title={t(`themes.${k}`)}
                onClick={() => setTheme(k)}
                className={`h-8 w-8 rounded-full border-2 ${theme === k ? "border-text" : "border-border"}`}
                style={{ background: `linear-gradient(135deg, ${EXPORT_THEMES[k].bg} 50%, ${EXPORT_THEMES[k].accent} 50%)` }}
              />
            ))}
          </div>
        </div>
        {options}
        <button type="button" className="btn btn-primary ml-auto" onClick={run} disabled={busy}>
          <Download size={14} /> {busy ? t("exporting") : t("download")}
        </button>
      </div>
      {err && <p role="alert" className="text-xs text-danger">{t("failed")}</p>}
      <div className="overflow-auto rounded-md border border-border bg-surface-2 p-3">
        <div className="w-fit">{children(theme, ref)}</div>
      </div>
    </div>
  );
}

export function Check2({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

export function Panel({ theme, title, children }: { theme: ExportTheme; title?: string; children: React.ReactNode }) {
  const c = EXPORT_THEMES[theme];
  return (
    <div style={{ background: c.card, borderRadius: 16, padding: 16, boxShadow: "0 1px 3px rgb(0 0 0 / .06)" }}>
      {title && <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{title}</div>}
      {children}
    </div>
  );
}

/** Static ranked bars for exported images (one hue, value at bar tip). */
export function StaticBars({ theme, rows }: { theme: ExportTheme; rows: { label: string; value: number; text: React.ReactNode }[] }) {
  const c = EXPORT_THEMES[theme];
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 10, fontSize: 13 }}>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ height: 18, width: `${Math.max(2, (r.value / max) * 78)}%`, background: c.accent, borderRadius: "0 4px 4px 0" }} />
            <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{r.text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
