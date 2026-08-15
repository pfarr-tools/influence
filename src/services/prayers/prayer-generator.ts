import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"

import type { Calendar, CalendarPost } from "../../domain/calendar.js"
import type { ContentPackage } from "../../domain/content.js"
import { getPostById, getWeekForDate, loadCalendarFromFile } from "../calendar/calendar-service.js"
import { generateContentForPost, type ContentGeneratorDependencies, type GenerateContentResult } from "../content/content-generator.js"
import { contentPackageSchema } from "../content/content-schema.js"
import { writeJsonFile } from "../content/content-storage.js"

export type PrayerKind = "morning" | "evening"

export interface GeneratePrayerOptions {
  calendarPath: string
  date?: string
  dryRun: boolean
  force: boolean
  kind: PrayerKind
  language: string
  model: string
  outputRoot: string
  publicationTimezone: string
  scaffoldRoot?: string
}

export async function generatePrayer(
  options: GeneratePrayerOptions,
  dependencies: ContentGeneratorDependencies
): Promise<{ date: string; kind: PrayerKind; postId: string; result: GenerateContentResult }> {
  const calendar = await loadCalendarFromFile(options.calendarPath)
  const date = options.date ?? getDefaultPrayerDate(options.kind, new Date(), options.publicationTimezone)
  assertIsoDate(date)
  const postId = `prayer-${options.kind}-${date}`
  const scaffold = await loadPrayerScaffold(options.kind, date, postId, options.scaffoldRoot)
  const post = upsertPrayerCalendarPost(calendar, scaffold, options.kind, date, postId)

  if (!options.dryRun && !calendarContainsPost(calendar, postId)) {
    throw new Error(`Could not add prayer post ${postId} to the calendar.`)
  }

  const result = await generateContentForPost(
    calendar,
    post.id,
    {
      dryRun: options.dryRun,
      force: options.force,
      language: options.language,
      model: options.model,
      outputRoot: options.outputRoot,
      scaffold
    },
    dependencies
  )

  if (!options.dryRun) {
    await writeJsonFile(options.calendarPath, calendar)
  }

  return { date, kind: options.kind, postId, result }
}

async function loadPrayerScaffold(
  kind: PrayerKind,
  date: string,
  postId: string,
  scaffoldRoot = resolve("assets/prayers")
): Promise<ContentPackage> {
  const path = join(scaffoldRoot, `scaffold.${kind}.json`)
  const raw = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>
  return contentPackageSchema.parse({
    ...raw,
    id: postId,
    source: {
      ...(raw.source as Record<string, unknown>),
      calendar_post_id: postId,
      date
    },
    metadata: {
      ...(raw.metadata as Record<string, unknown>),
      generated_at: "",
      model: ""
    },
    qa: {
      ...(raw.qa as Record<string, unknown>),
      approved: false
    }
  })
}

function upsertPrayerCalendarPost(
  calendar: Calendar,
  scaffold: ContentPackage,
  kind: PrayerKind,
  date: string,
  postId: string
): CalendarPost {
  try {
    return getPostById(calendar, postId)
  } catch {
    const week = getWeekForDate(calendar, date)
    const post = createCalendarPost(scaffold, kind, date, postId)
    week.beitraege.push(post)
    week.beitraege.sort((left, right) => left.datum.localeCompare(right.datum) || left.id.localeCompare(right.id))
    calendar.meta.umfang.beitraege = calendar.wochen.reduce(
      (count, currentWeek) => count + currentWeek.beitraege.length,
      0
    )
    return post
  }
}

function createCalendarPost(
  scaffold: ContentPackage,
  kind: PrayerKind,
  date: string,
  postId: string
): CalendarPost {
  const publicationTime = kind === "morning" ? "07:15" : "20:00"
  const editorial = scaffold.editorial_core
  const platforms = scaffold.platforms
  const visual = scaffold.visual

  return {
    id: postId,
    datum: date,
    wochentag: new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "long" }).format(new Date(`${date}T00:00:00Z`)),
    rubrik: scaffold.source.rubric,
    saeule: kind === "morning" ? "Gebet am Morgen" : "Gebet am Abend",
    ziel: editorial.main_message,
    vorproduktion: kind === "morning" ? "am Morgen der Veröffentlichung" : "am Nachmittag des Vortags",
    plattformen_und_formate: {
      facebook: ["Feed"],
      instagram: ["Feed", "Story"],
      mastodon: ["Post"]
    },
    struktur: editorial.source_notes,
    ki_hilfe: ["Aktuelle Nachrichten prüfen", "Gebet und Plattformtexte generieren", "redaktionell prüfen"],
    status: "in Arbeit",
    veroeffentlichungszeit: publicationTime,
    redaktionsfelder: {
      arbeitstitel: editorial.title,
      facebook_text: platforms.facebook.text,
      instagram_caption: platforms.instagram.caption,
      mastodon_text: platforms.mastodon.text,
      bluesky_text: platforms.bluesky.text,
      story_ablauf: platforms.story.slides.map((slide) => slide.text),
      reel_skript: platforms.reel.script,
      bildidee: visual.concept,
      ki_bildprompt: visual.flux_prompt,
      alt_text: visual.alt_text,
      hashtags: [],
      veroeffentlichungszeit: publicationTime,
      asset_pfade: scaffold.metadata.assets,
      notizen: "Automatisch aus dem universellen Gebets-Scaffold angelegt."
    },
    thema: editorial.title,
    konkrete_idee: editorial.main_message
  }
}

function calendarContainsPost(calendar: Calendar, postId: string): boolean {
  return calendar.wochen.some((week) => week.beitraege.some((post) => post.id === postId))
}

function getDefaultPrayerDate(kind: PrayerKind, now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now)
  const date = `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}`
  if (kind === "evening") return date
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10)
}

function part(parts: Intl.DateTimeFormatPart[], type: string): string {
  return parts.find((item) => item.type === type)?.value ?? ""
}

function assertIsoDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid prayer date "${date}". Expected YYYY-MM-DD.`)
  }
}
