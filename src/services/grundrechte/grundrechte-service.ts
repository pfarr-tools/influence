import { copyFile, mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"

import type { Calendar, CalendarPost } from "../../domain/calendar.js"
import type { ContentPackage } from "../../domain/content.js"
import { writeJsonFile } from "../content/content-storage.js"
import { renderPostById } from "../render/post-renderer.js"
import type { HtmlRenderClient } from "../render/html-renderer.js"
import { PublishingService, type PublicationPlatform } from "../publishing/index.js"

const supportedPlatforms = ["facebook", "instagram", "mastodon", "threads", "bluesky", "linkedin"] as const

export interface GrundrechteEntry {
  text: string
  reference: string
}

export interface GrundrechteOptions {
  assetsRoot: string
  force: boolean
  outputRoot: string
  platforms: string
  publicationTimezone: string
  sourcePath: string
  startDate: string
  year: number
}

export interface GrundrechteDependencies {
  pageRenderClient: HtmlRenderClient
  now?: () => Date
  onProgress?: (event: { type: string; date?: string; platform?: PublicationPlatform; scheduledAt?: string }) => void
}

export async function scheduleGrundrechte(
  options: GrundrechteOptions,
  dependencies: GrundrechteDependencies
): Promise<{ created: number; skipped: number }> {
  const entries = await loadGrundrechteEntries(options.sourcePath)
  const platforms = resolvePlatforms(options.platforms)
  const selectedPlatforms = platforms.length > 0 ? platforms : ["facebook", "instagram", "mastodon"] as PublicationPlatform[]
  const publishing = new PublishingService(options.outputRoot, new Map())
  const posts: CalendarPost[] = []
  const start = new Date(`${options.startDate}T00:00:00Z`)
  const end = new Date(Date.UTC(options.year + 1, 0, 1))
  for (let cursor = start; cursor < end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10)
    posts.push(buildGrundrechtePost(date, selectGrundrechteEntry(date, entries)))
  }
  const calendar = { wochen: [{ beitraege: posts }] } as unknown as Calendar
  let created = 0
  let skipped = 0

  for (const post of posts) {
    const baseDir = join(options.outputRoot, post.datum, post.id)
    const contentPath = join(baseDir, "content.json")
    if (!options.force && await exists(contentPath)) {
      skipped++
      continue
    }
    const entry = selectGrundrechteEntry(post.datum, entries)
    await writeJsonFile(contentPath, buildGrundrechteContent(post, entry))
    await writeJsonFile(join(baseDir, "publication-approval.json"), { approved: true, approvedAt: new Date().toISOString() })
    await mkdir(join(baseDir, "assets"), { recursive: true })
    await copyFile(join(options.assetsRoot, "flag.jpg"), join(baseDir, "assets", "background-1x1.jpg"))
    await copyFile(join(options.assetsRoot, "flag.jpg"), join(baseDir, "assets", "background-9x16.jpg"))
    await renderPostById(calendar, post.id, { force: options.force, outputRoot: options.outputRoot, formats: ["square", "instagram-story"] }, { pageRenderClient: dependencies.pageRenderClient, now: dependencies.now })
    const scheduledAt = resolveGrundrechtePublicationTime(post.datum, options.publicationTimezone)
    for (const platform of selectedPlatforms) {
      await publishing.schedulePost(calendar, post.id, platform, scheduledAt, platform === "instagram" ? "story" : "default", options.publicationTimezone, { force: true })
      dependencies.onProgress?.({ type: "platform-scheduled", date: post.datum, platform, scheduledAt })
    }
    created++
  }
  return { created, skipped }
}

export async function loadGrundrechteEntries(sourcePath: string): Promise<GrundrechteEntry[]> {
  const entries = JSON.parse(await readFile(sourcePath, "utf8")) as unknown
  if (!Array.isArray(entries) || entries.length === 0 || entries.some((entry) => !isEntry(entry))) throw new Error(`Keine gültigen Grundrechte in "${sourcePath}" gefunden.`)
  return entries
}

export function selectGrundrechteEntry(date: string, entries: GrundrechteEntry[]): GrundrechteEntry {
  const start = Date.UTC(2026, 0, 1)
  const current = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))
  const day = Math.floor((current - start) / 86_400_000)
  return entries[((day % entries.length) + entries.length) % entries.length]!
}

export function buildGrundrechtePost(date: string, entry: GrundrechteEntry): CalendarPost {
  const text = `${entry.text} (${entry.reference})`
  return {
    id: `grundrechte-${date}`, datum: date, wochentag: "", rubrik: "Grundrechte", saeule: "Grundrechte",
    ziel: "An grundlegende Menschenrechte erinnern", vorproduktion: "automatisch", plattformen_und_formate: { facebook: ["square"], instagram: ["story"], mastodon: ["square"] },
    struktur: ["Titel", "Grundrecht", "Quelle"], ki_hilfe: [], status: "freigegeben", veroeffentlichungszeit: "12:00",
    redaktionsfelder: { arbeitstitel: "Zur Erinnerung", facebook_text: text, instagram_caption: text, mastodon_text: text, bluesky_text: text, story_ablauf: [], reel_skript: "", bildidee: "Flagge", ki_bildprompt: "", alt_text: text, hashtags: [], veroeffentlichungszeit: "12:00", asset_pfade: [], notizen: "" },
    thema: "Grundrechte", konkrete_idee: entry.text
  }
}

export function buildGrundrechteContent(post: CalendarPost, entry: GrundrechteEntry): ContentPackage {
  const text = `${entry.text} (${entry.reference})`
  return {
    id: post.id, status: "freigegeben", needs_input: false,
    source: { calendar_post_id: post.id, date: post.datum, rubric: post.rubrik, liturgical_source: "" },
    editorial_core: { title: "Zur Erinnerung", main_message: entry.text, audience: "breite Öffentlichkeit", tone: ["klar", "ruhig"], source_notes: [entry.reference] },
    platforms: { facebook: { text, headline: "Zur Erinnerung" }, instagram: { caption: text, carousel: [] }, mastodon: { text }, bluesky: { text }, story: { slides: [] }, reel: { hook: "", script: "", shots: [], duration_seconds: 0 } },
    visual: { concept: "Deutsche Flagge", flux_prompt: "", negative_prompt: "text, letters, logo, watermark", formats: ["1:1", "9:16"], alt_text: text },
    qa: { warnings: [], approved: true }, metadata: { model: "", generated_at: new Date().toISOString(), prompt_version: "grundrechte-1.0", assets: [] }
  }
}

export function resolveGrundrechtePublicationTime(date: string, timezone: string): string {
  const candidate = new Date(`${date}T12:00:00Z`)
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" }).formatToParts(candidate)
  const offset = parts.find((part) => part.type === "timeZoneName")?.value.match(/GMT([+-])(\d{2}):?(\d{2})?/)
  if (!offset) return new Date(`${date}T12:00:00Z`).toISOString()
  const minutes = (Number(offset[2]) * 60 + Number(offset[3] ?? 0)) * (offset[1] === "+" ? 1 : -1)
  return new Date(candidate.getTime() - minutes * 60_000).toISOString()
}

function resolvePlatforms(value: string): PublicationPlatform[] { return value.split(",").map((item) => item.trim().toLowerCase()).filter((item): item is PublicationPlatform => (supportedPlatforms as readonly string[]).includes(item)) }
function isEntry(value: unknown): value is GrundrechteEntry { return typeof value === "object" && value !== null && typeof (value as { text?: unknown }).text === "string" && typeof (value as { reference?: unknown }).reference === "string" }
function exists(path: string): Promise<boolean> { return import("node:fs/promises").then(({ access }) => access(path).then(() => true).catch(() => false)) }
