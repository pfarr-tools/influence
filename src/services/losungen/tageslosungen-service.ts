import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { join } from "node:path"

import type { Calendar, CalendarPost } from "../../domain/calendar.js"
import type { ContentPackage } from "../../domain/content.js"
import { writeJsonFile } from "../content/content-storage.js"
import { renderPostById, type RenderFormatKey } from "../render/post-renderer.js"
import type { HtmlRenderClient } from "../render/html-renderer.js"
import { PublishingService, type PublicationPlatform } from "../publishing/index.js"

const execFileAsync = promisify(execFile)
const supportedPlatforms = ["facebook", "instagram", "mastodon", "threads", "bluesky", "linkedin"] as const

export interface TageslosungEntry {
  date: string
  weekday: string
  name?: string
  text: string
  verse: string
  teachingText: string
  teachingVerse: string
}

export interface TageslosungenOptions {
  assetsRoot: string
  force: boolean
  outputRoot: string
  platforms: string
  publicationTimezone: string
  sourceRoot: string
  year: number
}

export interface TageslosungenDependencies {
  pageRenderClient: HtmlRenderClient
  random?: () => number
  onProgress?: (event: TageslosungenProgress) => void
  now?: () => Date
}

export type TageslosungenProgress =
  | { type: "source-loaded"; year: number; total: number; ignoredPast: number }
  | { type: "entry-start"; index: number; total: number; entry: TageslosungEntry }
  | { type: "skipped"; index: number; total: number; entry: TageslosungEntry }
  | { type: "content-created"; entry: TageslosungEntry }
  | { type: "background-created"; entry: TageslosungEntry; format: "1x1" | "9x16" }
  | { type: "rendered"; entry: TageslosungEntry; formats: string[] }
  | { type: "platform-scheduled"; entry: TageslosungEntry; platform: PublicationPlatform; scheduledAt: string }
  | { type: "entry-complete"; index: number; total: number; entry: TageslosungEntry }

/** Creates, renders, approves, and schedules all daily readings for one year. */
export async function scheduleTageslosungen(
  options: TageslosungenOptions,
  dependencies: TageslosungenDependencies
): Promise<{ created: number; skipped: number }> {
  const allEntries = await loadTageslosungen(options.sourceRoot, options.year)
  const today = currentDateInTimezone(options.publicationTimezone, dependencies.now?.() ?? new Date())
  const entries = allEntries.filter((entry) => entry.date >= today)
  dependencies.onProgress?.({ type: "source-loaded", year: options.year, total: entries.length, ignoredPast: allEntries.length - entries.length })
  const platforms = resolvePlatforms(options.platforms)
  const selectedPlatforms = platforms.length > 0 ? platforms : ["facebook", "instagram", "mastodon"] as PublicationPlatform[]
  const publishing = new PublishingService(options.outputRoot, new Map())
  const calendar = buildCalendar(entries)
  let created = 0
  let skipped = 0

  for (const [entryIndex, entry] of entries.entries()) {
    const index = entryIndex + 1
    dependencies.onProgress?.({ type: "entry-start", index, total: entries.length, entry })
    const post = calendar.wochen[0]!.beitraege.find((item) => item.id === postId(entry))!
    const baseDir = join(options.outputRoot, post.datum, post.id)
    const contentPath = join(baseDir, "content.json")
    if (!options.force && await exists(contentPath)) {
      skipped++
      dependencies.onProgress?.({ type: "skipped", index, total: entries.length, entry })
      continue
    }

    const content = buildContent(post, entry)
    await writeJsonFile(contentPath, content)
    await writeJsonFile(join(baseDir, "publication-approval.json"), { approved: true, approvedAt: new Date().toISOString() })
    dependencies.onProgress?.({ type: "content-created", entry })
    await copyRandomBackground(options.assetsRoot, baseDir, "1x1", dependencies.random)
    dependencies.onProgress?.({ type: "background-created", entry, format: "1x1" })
    await copyRandomBackground(options.assetsRoot, baseDir, "9x16", dependencies.random)
    dependencies.onProgress?.({ type: "background-created", entry, format: "9x16" })

    await renderPostById(calendar, post.id, {
      force: options.force,
      outputRoot: options.outputRoot,
      formats: ["square", "instagram-story"] as RenderFormatKey[]
    }, { pageRenderClient: dependencies.pageRenderClient })
    dependencies.onProgress?.({ type: "rendered", entry, formats: ["square", "instagram-story"] })

    const scheduledAt = zonedTimestamp(entry.date, "07:00", options.publicationTimezone)
    for (const platform of selectedPlatforms) {
      await publishing.schedulePost(calendar, post.id, platform, scheduledAt, platform === "instagram" ? "story" : "default", options.publicationTimezone, { force: true })
      dependencies.onProgress?.({ type: "platform-scheduled", entry, platform, scheduledAt })
    }
    created++
    dependencies.onProgress?.({ type: "entry-complete", index, total: entries.length, entry })
  }

  return { created, skipped }
}

export async function loadTageslosungen(sourceRoot: string, year: number): Promise<TageslosungEntry[]> {
  const xmlPath = join(sourceRoot, `Losungen Free ${year}.xml`)
  if (!(await exists(xmlPath))) await downloadXmlArchive(sourceRoot, year, xmlPath)
  const xml = await readFile(xmlPath, "utf8")
  const entries = [...xml.matchAll(/<Losungen>([\s\S]*?)<\/Losungen>/g)].map((match) => {
    const block = match[1] ?? ""
    const field = (name: string) => decodeXml(block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1] ?? "")
    return { date: field("Datum").slice(0, 10), weekday: field("Wtag"), name: field("Sonntag") || undefined, text: field("Losungstext"), verse: field("Losungsvers"), teachingText: field("Lehrtext"), teachingVerse: field("Lehrtextvers") }
  }).filter((entry) => entry.date && entry.text && entry.verse && entry.teachingText && entry.teachingVerse)
  if (entries.length === 0) throw new Error(`Keine Tageslosungen für ${year} in "${xmlPath}" gefunden.`)
  return entries
}

function buildCalendar(entries: TageslosungEntry[]): Calendar {
  return { wochen: [{ beitraege: entries.map((entry) => buildPost(entry)) }] } as unknown as Calendar
}

function buildPost(entry: TageslosungEntry): CalendarPost {
  return {
    id: postId(entry), datum: entry.date, wochentag: entry.weekday, rubrik: "Tageslosungen", saeule: "Tageslosungen",
    ziel: "Täglicher geistlicher Impuls", vorproduktion: "automatisch", plattformen_und_formate: { facebook: ["square"], instagram: ["story"], mastodon: ["square"] },
    struktur: ["Header", "Losungstext", "Losungsvers"], ki_hilfe: [], status: "freigegeben", veroeffentlichungszeit: "07:00",
    redaktionsfelder: { arbeitstitel: `Losung für ${entry.weekday}, ${formatGermanDate(entry.date)}`, facebook_text: entry.text, instagram_caption: entry.text, mastodon_text: entry.text, bluesky_text: entry.text, story_ablauf: [], reel_skript: "", bildidee: "", ki_bildprompt: "", alt_text: entry.text, hashtags: [], veroeffentlichungszeit: "07:00", asset_pfade: [], notizen: "" },
    thema: "Tageslosung", konkrete_idee: entry.text
  }
}

function buildContent(post: CalendarPost, entry: TageslosungEntry): ContentPackage {
  return {
    id: post.id, status: "freigegeben", needs_input: false,
    source: { calendar_post_id: post.id, date: post.datum, rubric: post.rubrik, liturgical_source: "" },
    editorial_core: { title: post.redaktionsfelder.arbeitstitel, main_message: entry.text, audience: "breite Öffentlichkeit", tone: ["ruhig"], source_notes: [`Losungsvers: ${entry.verse}`, `Lehrtext: ${entry.teachingText}`, `Lehrtextvers: ${entry.teachingVerse}`] },
    platforms: { facebook: { text: entry.text, headline: post.redaktionsfelder.arbeitstitel }, instagram: { caption: entry.text, carousel: [] }, mastodon: { text: entry.text }, bluesky: { text: entry.text }, story: { slides: [] }, reel: { hook: "", script: "", shots: [], duration_seconds: 0 } },
    visual: { concept: "Ruhiger Hintergrund", flux_prompt: "", negative_prompt: "text, letters, logo, watermark", formats: ["1:1", "9:16"], alt_text: entry.text },
    qa: { warnings: [], approved: true }, metadata: { model: "", generated_at: new Date().toISOString(), prompt_version: "tageslosungen-1.0", assets: [] }
  }
}

async function copyRandomBackground(root: string, baseDir: string, format: "1x1" | "9x16", random = Math.random): Promise<void> {
  const directory = join(root, "images", format)
  const files = (await readdir(directory)).filter((file) => /\.(jpe?g|png|webp)$/i.test(file))
  if (files.length === 0) throw new Error(`Keine ${format}-Hintergründe in "${directory}" gefunden.`)
  const source = files[Math.min(files.length - 1, Math.floor(random() * files.length))]!
  const extension = source.split(".").pop()!.toLowerCase()
  await mkdir(join(baseDir, "assets"), { recursive: true })
  await copyFile(join(directory, source), join(baseDir, "assets", `background-${format}.${extension}`))
}

async function downloadXmlArchive(root: string, year: number, target: string): Promise<void> {
  const temp = await mkdtemp(join(root, ".losungen-"))
  const zip = join(temp, `Losung_${year}_XML.zip`)
  try {
    const response = await fetch(`https://www.losungen.de/fileadmin/media-losungen/download/Losung_${year}_XML.zip`)
    if (!response.ok) throw new Error(`Download der Losungen ${year} fehlgeschlagen (${response.status}).`)
    await writeFile(zip, Buffer.from(await response.arrayBuffer()))
    await execFileAsync("unzip", ["-o", zip, "-d", temp])
    const files = (await readdir(temp)).filter((file) => file.toLowerCase().endsWith(".xml"))
    if (!files[0]) throw new Error(`Das Losungen-Archiv ${year} enthält keine XML-Datei.`)
    await copyFile(join(temp, files[0]), target)
  } finally { await rm(temp, { recursive: true, force: true }) }
}

function resolvePlatforms(value: string): PublicationPlatform[] { return value.split(",").map((item) => item.trim().toLowerCase()).filter((item): item is PublicationPlatform => (supportedPlatforms as readonly string[]).includes(item)) }
function postId(entry: TageslosungEntry): string { return `tageslosung-${entry.date}` }
function formatGermanDate(date: string): string { const [year, month, day] = date.split("-"); return `${day}.${month}.${year}` }
function decodeXml(value: string): string { return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim() }
function exists(path: string): Promise<boolean> { return import("node:fs/promises").then(({ access }) => access(path).then(() => true).catch(() => false)) }
function zonedTimestamp(date: string, time: string, timezone: string): string { const [hour, minute] = time.split(":").map(Number); let candidate = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), hour, minute)); const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" }).formatToParts(candidate); const offset = parts.find((part) => part.type === "timeZoneName")?.value.match(/GMT([+-])(\d{2}):?(\d{2})?/); if (offset) { const minutes = (Number(offset[2]) * 60 + Number(offset[3] ?? 0)) * (offset[1] === "+" ? 1 : -1); candidate = new Date(candidate.getTime() - minutes * 60_000) } return candidate.toISOString() }
function currentDateInTimezone(timezone: string, now: Date): string { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now); const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}` }
