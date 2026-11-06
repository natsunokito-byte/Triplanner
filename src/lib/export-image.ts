import { toPng } from "html-to-image";

export const EXPORT_THEMES = {
  paper: { bg: "#fffaf3", card: "#ffffff", accent: "#e07a5f", soft: "#fdeee8", ink: "#3d2c2e", muted: "#8a7a78" },
  mint: { bg: "#f2fbf7", card: "#ffffff", accent: "#2a9d8f", soft: "#dff5ef", ink: "#1f3b38", muted: "#6b8582" },
  lavender: { bg: "#f6f3ff", card: "#ffffff", accent: "#7c6fd6", soft: "#e9e5fb", ink: "#2d2a4a", muted: "#7d7a99" },
  sky: { bg: "#f1f8ff", card: "#ffffff", accent: "#3b82f6", soft: "#dcebff", ink: "#1e3050", muted: "#6a7d99" },
} as const;
export type ExportTheme = keyof typeof EXPORT_THEMES;

/** Fetch a (cross-origin) image and return a data URL so html-to-image can draw it; falls back to the original URL. */
export async function inlineImage(url: string): Promise<string> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return url;
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(url);
      r.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

export async function exportPng(node: HTMLElement, filename: string): Promise<void> {
  await document.fonts.ready;
  const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: false, backgroundColor: undefined });
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename.replace(/[\\/:*?"<>|]+/g, "_") + ".png";
  a.click();
}
