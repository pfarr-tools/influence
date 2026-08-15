import type { Calendar, CalendarPost } from "../../domain/calendar.js"
import type { ContentPackage } from "../../domain/content.js"
import { writeJsonFile } from "../content/content-storage.js"
import { renderPostById, type RenderFormatKey } from "../render/post-renderer.js"
import type { HtmlRenderClient } from "../render/html-renderer.js"
import { PublishingService, type PublicationPlatform } from "../publishing/index.js"

const apiUrl = (year: number) => `https://kirchenjahr.pfarr.tools/api/jahr/${year}`
const supportedPlatforms = ["facebook", "instagram", "mastodon", "threads", "bluesky", "linkedin"] as const

export interface KirchenjahrProprium {
  code: string
  date: string
  designation: string
  title?: string
  cssColor: string
  description: string
}

export interface KirchenjahrOptions {
  force: boolean
  outputRoot: string
  platforms: string
  publicationTimezone: string
  year: number
}

export interface KirchenjahrDependencies {
  fetch?: typeof fetch
  now?: () => Date
  pageRenderClient: HtmlRenderClient
  onProgress?: (event: KirchenjahrProgress) => void
}

export type KirchenjahrProgress =
  | { type: "source-loaded"; year: number; total: number; ignoredPast: number }
  | { type: "proprium-start"; index: number; total: number; proprium: KirchenjahrProprium }
  | { type: "skipped"; proprium: KirchenjahrProprium }
  | { type: "rendered"; proprium: KirchenjahrProprium }
  | { type: "scheduled"; proprium: KirchenjahrProprium; scheduledAt: string }

interface KirchenjahrApiEntry {
  Code?: string
  isoDate?: string
  Bezeichnung?: string
  Titel?: string
  "CSS-Farbe"?: string
  Wochenspruch?: { Text?: string; Bibelstelle?: string }
  Psalm?: { Bibelstelle?: string }
  Perikopen?: Record<string, { Bibelstelle?: string }>
  Predigt?: { Bibelstelle?: string }
  Lieder?: Array<{ Titel?: string; Buch?: string; Nummer?: string | number }>
}

export async function loadKirchenjahr(year: number, fetcher: typeof fetch = fetch): Promise<KirchenjahrProprium[]> {
  const response = await fetcher(apiUrl(year))
  if (!response.ok) throw new Error(`Download des Kirchenjahrs ${year} fehlgeschlagen (${response.status}).`)
  const payload = await response.json() as { Tage?: Record<string, KirchenjahrApiEntry[]> }
  const entries: KirchenjahrProprium[] = []
  for (const [dateKey, dayEntries] of Object.entries(payload.Tage ?? {})) {
    for (const entry of dayEntries ?? []) {
      const date = entry.isoDate || dateKey
      if (!date.startsWith(`${year}-`) || !entry.Code || !entry.Bezeichnung || !entry["CSS-Farbe"]) continue
      entries.push({
        code: entry.Code,
        date,
        designation: expandKirchenjahrAbbreviations(entry.Bezeichnung),
        title: entry.Titel ? expandKirchenjahrAbbreviations(entry.Titel) : undefined,
        cssColor: normalizeColor(entry["CSS-Farbe"], entry.Code),
        description: describeEntry(entry, dayEntries ?? [])
      })
    }
  }
  return entries.sort((left, right) => left.date.localeCompare(right.date) || left.code.localeCompare(right.code))
}

export async function scheduleKirchenjahr(options: KirchenjahrOptions, dependencies: KirchenjahrDependencies): Promise<{ created: number; skipped: number }> {
  const allEntries = await loadKirchenjahr(options.year, dependencies.fetch)
  const today = currentDateInTimezone(options.publicationTimezone, dependencies.now?.() ?? new Date())
  const entries = allEntries.filter((entry) => entry.date >= today)
  dependencies.onProgress?.({ type: "source-loaded", year: options.year, total: entries.length, ignoredPast: allEntries.length - entries.length })
  const platforms = resolvePlatforms(options.platforms)
  const calendar = buildCalendar(entries)
  const publishing = new PublishingService(options.outputRoot, new Map())
  let created = 0
  let skipped = 0

  for (const [index, entry] of entries.entries()) {
    dependencies.onProgress?.({ type: "proprium-start", index: index + 1, total: entries.length, proprium: entry })
    const post = calendar.wochen[0]!.beitraege.find((item) => item.id === postId(entry))!
    const baseDir = `${options.outputRoot}/${post.datum}/${post.id}`
    const contentPath = `${baseDir}/content.json`
    if (!options.force && await exists(contentPath)) {
      skipped++
      dependencies.onProgress?.({ type: "skipped", proprium: entry })
      continue
    }

    await writeJsonFile(contentPath, buildContent(post, entry))
    await writeJsonFile(`${baseDir}/publication-approval.json`, { approved: true, approvedAt: new Date().toISOString() })
    await renderPostById(calendar, post.id, {
      force: options.force,
      outputRoot: options.outputRoot,
      formats: ["square", "instagram-story"] as RenderFormatKey[]
    }, { pageRenderClient: dependencies.pageRenderClient })
    dependencies.onProgress?.({ type: "rendered", proprium: entry })

    const scheduledAt = zonedTimestamp(entry.date, addMinutes("09:00", indexForDate(entries, entry) * 5), options.publicationTimezone)
    await publishing.schedulePost(calendar, post.id, "instagram", scheduledAt, "story", options.publicationTimezone, { force: true })
    await publishing.schedulePost(calendar, post.id, "instagram", scheduledAt, "square", options.publicationTimezone, { force: true })
    for (const platform of platforms.filter((item) => item !== "instagram")) {
      await publishing.schedulePost(calendar, post.id, platform, scheduledAt, "square", options.publicationTimezone, { force: true })
    }
    dependencies.onProgress?.({ type: "scheduled", proprium: entry, scheduledAt })
    created++
  }
  return { created, skipped }
}

function buildCalendar(entries: KirchenjahrProprium[]): Calendar {
  return { wochen: [{ beitraege: entries.map(buildPost) }] } as unknown as Calendar
}

function buildPost(entry: KirchenjahrProprium): CalendarPost {
  return {
    id: postId(entry), datum: entry.date, wochentag: "", rubrik: "Kirchenjahr", saeule: "Kirchenjahr",
    ziel: "Liturgischer Tagesimpuls", vorproduktion: "automatisch", plattformen_und_formate: { facebook: ["square"], instagram: ["story", "square"], mastodon: ["square"] },
    struktur: ["Bezeichnung", "Titel"], ki_hilfe: [], status: "freigegeben", veroeffentlichungszeit: "09:00",
    redaktionsfelder: { arbeitstitel: entry.designation, facebook_text: entry.designation, instagram_caption: entry.designation, mastodon_text: entry.designation, bluesky_text: entry.designation, story_ablauf: [], reel_skript: "", bildidee: "", ki_bildprompt: "", alt_text: entry.designation, hashtags: [], veroeffentlichungszeit: "09:00", asset_pfade: [], notizen: "" },
    thema: "Kirchenjahr", konkrete_idee: entry.designation
  }
}

function buildContent(post: CalendarPost, entry: KirchenjahrProprium): ContentPackage {
  return {
    id: post.id, status: "freigegeben", needs_input: false,
    source: { calendar_post_id: post.id, date: post.datum, rubric: post.rubrik, liturgical_source: apiUrl(Number(post.datum.slice(0, 4))) },
    editorial_core: { title: entry.designation, main_message: "", audience: "breite Öffentlichkeit", tone: ["ruhig"], source_notes: [entry.title ? `Titel: ${entry.title}` : ""] .filter(Boolean) },
    platforms: { facebook: { text: entry.description, headline: entry.designation }, instagram: { caption: entry.description, carousel: [] }, mastodon: { text: entry.description }, bluesky: { text: entry.description }, story: { slides: [] }, reel: { hook: "", script: "", shots: [], duration_seconds: 0 } },
    visual: { concept: `kirchenjahr:${entry.cssColor}`, flux_prompt: "", negative_prompt: "text, letters, logo, watermark", formats: ["1:1", "9:16"], alt_text: entry.designation },
    qa: { warnings: [], approved: true }, metadata: { model: "", generated_at: new Date().toISOString(), prompt_version: "kirchenjahr-1.0", assets: [] }
  }
}

function describeEntry(entry: KirchenjahrApiEntry, sameDay: KirchenjahrApiEntry[]): string {
  const lines = [entry.Bezeichnung ? expandKirchenjahrAbbreviations(entry.Bezeichnung) : ""]
  if (entry.Titel) lines.push(`Titel: ${expandKirchenjahrAbbreviations(entry.Titel)}`)
  if (entry.Wochenspruch?.Text) lines.push(`Wochenspruch: „${entry.Wochenspruch.Text}“${entry.Wochenspruch.Bibelstelle ? ` (${entry.Wochenspruch.Bibelstelle})` : ""}`)
  if (entry.Psalm?.Bibelstelle) lines.push(`Psalm: ${entry.Psalm.Bibelstelle}`)
  const readings = entry.Perikopen ?? {}
  for (const [label, key] of [["Altes Testament", "Altes Testament"], ["Evangelium", "Evangelium"], ["Epistel", "Epistel"]]) {
    if (readings[key]?.Bibelstelle) lines.push(`${label}: ${readings[key]!.Bibelstelle}`)
  }
  if (entry.Predigt?.Bibelstelle) lines.push(`Predigttext: ${entry.Predigt.Bibelstelle}`)
  if (entry.Lieder?.length) lines.push(`Lieder: ${entry.Lieder.map((song) => [song.Titel, song.Buch && song.Nummer ? `${song.Buch} ${song.Nummer}` : song.Buch].filter(Boolean).join(", ")).join("; ")}`)
  const others = sameDay.filter((other) => other.Code !== entry.Code && other.Bezeichnung).map((other) => expandKirchenjahrAbbreviations(other.Bezeichnung!))
  if (others.length) lines.push(`Weitere Proprien an diesem Tag: ${others.join(", ")}`)
  return lines.join("\n\n")
}

/** Abbreviations found in the 2026 source, kept stable for future years. */
export function expandKirchenjahrAbbreviations(value: string): string {
  return value
    .replace(/Drittl\.\s*S\.\s*d\.\s*Kj\./g, "Drittletzter Sonntag des Kirchenjahres")
    .replace(/\bSo\.\s*n\./g, "Sonntag nach")
    .replace(/\bSo\s+n\./g, "Sonntag nach")
    .replace(/\bSo\.?\b/g, "Sonntag")
    .replace(/\bS\.\b/g, "Sonntag")
    .replace(/\bDrittl\.\b/g, "Drittletzter")
    .replace(/\bd\.\s*Kj\./g, "des Kirchenjahres")
    .replace(/\bKj\./g, "Kirchenjahres")
}

function postId(entry: KirchenjahrProprium): string { return `kirchenjahr-${entry.date}-${entry.code.toLowerCase()}` }
function normalizeColor(color: string, code: string): string { if (color === "purple" && (code === "4ADV" || code === "LAET")) return "pink"; return color === "rot" ? "red" : color }
function resolvePlatforms(value: string): PublicationPlatform[] { return value.split(",").map((item) => item.trim().toLowerCase()).filter((item): item is PublicationPlatform => (supportedPlatforms as readonly string[]).includes(item)) }
function indexForDate(entries: KirchenjahrProprium[], entry: KirchenjahrProprium): number { return entries.filter((item) => item.date === entry.date).findIndex((item) => item.code === entry.code) }
function addMinutes(time: string, minutes: number): string { const [hour, minute] = time.split(":").map(Number); const total = hour * 60 + minute + minutes; return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}` }
function zonedTimestamp(date: string, time: string, timezone: string): string { const [hour, minute] = time.split(":").map(Number); let candidate = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), hour, minute)); const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" }).formatToParts(candidate); const offset = parts.find((part) => part.type === "timeZoneName")?.value.match(/GMT([+-])(\d{2}):?(\d{2})?/); if (offset) { const minutesOffset = (Number(offset[2]) * 60 + Number(offset[3] ?? 0)) * (offset[1] === "+" ? 1 : -1); candidate = new Date(candidate.getTime() - minutesOffset * 60_000) } return candidate.toISOString() }
function currentDateInTimezone(timezone: string, now: Date): string { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now); const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}` }
function exists(path: string): Promise<boolean> { return import("node:fs/promises").then(({ access }) => access(path).then(() => true).catch(() => false)) }
