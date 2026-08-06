import { join } from "node:path"

import type { ContentPackage } from "../../domain/content.js"
import type { CalendarPost } from "../../domain/calendar.js"

/** Supported manual Facebook workflows. */
export type FacebookMode = "share_link" | "manual_photo" | "skip"

export interface FacebookAssistantPayload {
  mode: FacebookMode
  text: string
  publicUrl: string | null
  shareUrl: string | null
  assetPaths: string[]
  copiedFirst: true
}

/** Builds the safe, manual Facebook hand-off; it never opens a browser. */
export function buildFacebookAssistant(
  post: CalendarPost,
  content: ContentPackage,
  outputRoot: string,
  publicBaseUrl = ""
): FacebookAssistantPayload {
  const mode: FacebookMode = publicBaseUrl && ["Predigt", "Artikel"].some((value) => post.rubrik.includes(value)) ? "share_link" : "manual_photo"
  const publicUrl = publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, "")}/posts/${post.id}/` : null
  return {
    mode,
    text: content.platforms.facebook.text,
    publicUrl,
    shareUrl: publicUrl ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicUrl)}` : null,
    assetPaths: content.metadata.assets.map((asset) => join(outputRoot, post.datum, post.id, asset)),
    copiedFirst: true
  }
}

/** Browser-side operation: clipboard confirmation precedes opening the share dialog. */
export async function shareOnFacebook(text: string, publicUrl: string, browser: Pick<Window, "open"> & { navigator?: Navigator } = globalThis as unknown as Window): Promise<void> {
  if (browser.navigator?.clipboard) await browser.navigator.clipboard.writeText(text)
  else throw new Error("Die Zwischenablage ist nicht verfügbar. Kopiere den Text manuell.")
  browser.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicUrl)}`, "facebook-share", "width=700,height=700,noopener,noreferrer")
}
