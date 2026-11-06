"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import imageCompression from "browser-image-compression";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { deletePlanPhoto, registerPlanPhoto } from "@/app/actions";

const MAX_BYTES = 10 * 1024 * 1024;

export function PhotoUploader({
  tripId, planId, photos, max,
}: {
  tripId: string;
  planId: string;
  photos: { id: string; url: string }[];
  max: number;
}) {
  const t = useTranslations("plan");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [, startTransition] = useTransition();

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const errs: string[] = [];
    const room = max - photos.length;
    if (files.length > room) errs.push(t("maxPhotos", { n: max }));
    setBusy(true);
    const supabase = createClient();
    for (const file of Array.from(files).slice(0, Math.max(0, room))) {
      if (file.size > MAX_BYTES) { errs.push(t("tooBig", { name: file.name })); continue; }
      try {
        // Long edge 1600px, JPEG — keeps storage small and exports fast.
        const small = await imageCompression(file, { maxWidthOrHeight: 1600, maxSizeMB: 1.5, useWebWorker: true, fileType: "image/jpeg" });
        const path = `${tripId}/${planId}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from("trip-photos").upload(path, small, { contentType: "image/jpeg", upsert: false });
        if (error) throw error;
        await registerPlanPhoto(tripId, planId, path);
      } catch {
        errs.push(t("uploadError", { name: file.name }));
      }
    }
    setErrors(errs);
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {photos.length === 0 ? (
        <p className="text-muted">{t("noPhotos")}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <li key={p.id} className="group relative aspect-square overflow-hidden rounded-[8px] bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" />
              <button
                type="button"
                aria-label={t("deletePhoto")}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                onClick={() => { if (window.confirm(t("deletePhotoConfirm"))) startTransition(() => deletePlanPhoto(tripId, planId, p.id)); }}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-3">
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        <button type="button" className="btn btn-sm" disabled={busy || photos.length >= max} onClick={() => input.current?.click()}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} {busy ? t("uploading") : t("addPhotos")}
        </button>
        <span className="text-xs text-muted">{photos.length}/{max}</span>
      </div>
      {errors.map((e) => <p key={e} className="text-xs text-danger">{e}</p>)}
    </div>
  );
}
