import type { Metadata } from "next";

/** Gắn manifest cài lên màn hình chính cho một bề mặt của quán (P17 17-01, OPS-04). */
export function manifestMeta(slug: string, app: "pos" | "kds" | "admin"): Metadata {
  return {
    manifest: `/r/${slug}/manifest.webmanifest?app=${app}`,
    appleWebApp: { capable: true, statusBarStyle: "default" },
  };
}
