import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plane } from "lucide-react";
import { signOut } from "@/app/actions";
import { LocaleSwitcher } from "./locale-switcher";

export async function AppHeader({ signedIn = true }: { signedIn?: boolean }) {
  const t = await getTranslations("common");
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Plane size={18} className="text-primary" /> Trip Planner
        </Link>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          {signedIn && (
            <form action={signOut}>
              <button className="btn btn-sm">{t("signOut")}</button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
