import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

import type {
  Calendar,
  CalendarPost,
  CalendarSourceReference
} from "../../domain/calendar.js"
import type { ContentPackage } from "../../domain/content.js"
import {
  getPostById,
  getWeekForDate
} from "../calendar/calendar-service.js"
import { CalendarValidationError } from "../calendar/errors.js"
import { contentPackageSchema } from "./content-schema.js"
import type { LiturgicalContext } from "../liturgy/liturgical-source.js"

/**
 * Creates a validated content scaffold for a single calendar post.
 *
 * @param post Calendar post used as the source of truth.
 * @returns Validated content package scaffold.
 */
export function createContentScaffold(
  post: CalendarPost,
  options?: { liturgicalContext?: LiturgicalContext }
): ContentPackage {
  const liturgicalSource = post.liturgische_quelle?.jahr_endpoint ?? ""
  const needsInput = (post.aktuelle_eingaben?.length ?? 0) > 0
  const title = post.redaktionsfelder.arbeitstitel || post.thema
  const mainMessage = post.konkrete_idee
  const audience = needsInput
    ? "[TODO: define audience after current inputs are available]"
    : "breite Öffentlichkeit"

  const sourceNotes = buildSourceNotes(post, options?.liturgicalContext)
  const qaWarnings = buildQaWarnings(post, options?.liturgicalContext)

  return contentPackageSchema.parse({
    id: post.id,
    status: "in Arbeit",
    needs_input: needsInput,
    source: {
      calendar_post_id: post.id,
      date: post.datum,
      rubric: post.rubrik,
      liturgical_source: liturgicalSource
    },
    editorial_core: {
      title,
      main_message: mainMessage,
      audience,
      tone: ["klar", "ruhig", "zugänglich"],
      source_notes: sourceNotes
    },
    platforms: {
      facebook: {
        text: post.redaktionsfelder.facebook_text,
        headline: ""
      },
      instagram: {
        caption: post.redaktionsfelder.instagram_caption,
        carousel: []
      },
      mastodon: {
        text: post.redaktionsfelder.mastodon_text
      },
      story: {
        slides: post.redaktionsfelder.story_ablauf.map((text) => ({ text }))
      },
      reel: {
        hook: "",
        script: post.redaktionsfelder.reel_skript,
        shots: [],
        duration_seconds: 0
      }
    },
    visual: {
      concept: post.redaktionsfelder.bildidee,
      flux_prompt: sanitizeFluxPrompt(post.redaktionsfelder.ki_bildprompt),
      negative_prompt: "text, letters, logo, watermark",
      formats: ["4:5", "9:16", "1.91:1"],
      alt_text: post.redaktionsfelder.alt_text
    },
    qa: {
      warnings: qaWarnings,
      approved: false
    },
    metadata: {
      model: "",
      generated_at: "",
      prompt_version: "1.0",
      assets: post.redaktionsfelder.asset_pfade
    }
  })
}

/**
 * Creates and writes a scaffold for a single post identifier.
 *
 * @param calendar Parsed calendar data.
 * @param postId Calendar post identifier.
 * @param outputRoot Root folder where scaffold files should be written.
 * @returns Information about the created scaffold.
 */
export async function scaffoldPostById(
  calendar: Calendar,
  postId: string,
  outputRoot: string
): Promise<ScaffoldResult> {
  const post = getPostById(calendar, postId)
  return writeScaffold(post, outputRoot)
}

/**
 * Creates and writes scaffolds for all posts in the week containing a given date.
 *
 * @param calendar Parsed calendar data.
 * @param date ISO date within the target week.
 * @param outputRoot Root folder where scaffold files should be written.
 * @returns Information about all created scaffold files.
 */
export async function scaffoldWeekByDate(
  calendar: Calendar,
  date: string,
  outputRoot: string
): Promise<ScaffoldResult[]> {
  const week = getWeekForDate(calendar, date)
  const results: ScaffoldResult[] = []

  for (const post of week.beitraege) {
    results.push(await writeScaffold(post, outputRoot))
  }

  return results
}

/**
 * Result data for a scaffold write operation.
 */
export interface ScaffoldResult {
  content: ContentPackage
  outputPath: string
}

/**
 * Writes a single scaffold to `output/<date>/<post-id>/content.json`.
 *
 * @param post Calendar post used as the source of truth.
 * @param outputRoot Root folder where scaffold files should be written.
 * @returns The validated content package and its output path.
 */
async function writeScaffold(
  post: CalendarPost,
  outputRoot: string
): Promise<ScaffoldResult> {
  const content = createContentScaffold(post)
  const outputPath = join(outputRoot, post.datum, post.id, "content.json")

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(content, null, 2)}\n`, "utf8")

  return {
    content,
    outputPath
  }
}

/**
 * Builds traceable source notes from the calendar metadata.
 *
 * @param post Calendar post used as the source of truth.
 * @returns Ordered notes carried into the content scaffold.
 */
function buildSourceNotes(
  post: CalendarPost,
  liturgicalContext?: LiturgicalContext
): string[] {
  const notes = [
    `Goal: ${post.ziel}`,
    `Column: ${post.saeule}`,
    `Production mode: ${post.vorproduktion}`,
    `Structure: ${post.struktur.join(" | ")}`,
    `AI support notes: ${post.ki_hilfe.join(" | ")}`
  ]

  if (post.aktuelle_eingaben) {
    notes.push(`Current inputs required: ${post.aktuelle_eingaben.join(" | ")}`)
  }

  if (post.liturgische_quelle) {
    notes.push(formatLiturgicalSourceNote(post.liturgische_quelle))
  }

  if (liturgicalContext?.weeklyVerse) {
    notes.push(
      `Wochenspruch: ${liturgicalContext.weeklyVerse.text} (${liturgicalContext.weeklyVerse.citation})`
    )
  }

  for (const warning of liturgicalContext?.warnings ?? []) {
    notes.push(`Liturgical note: ${warning}`)
  }

  if (post.sonderformat) {
    notes.push(
      `Special format: ${post.sonderformat.typ} | ${post.sonderformat.monatsthema} | ${post.sonderformat.monatslied}`
    )
  }

  return notes
}

/**
 * Builds scaffold warnings from calendar signals that require human completion.
 *
 * @param post Calendar post used as the source of truth.
 * @returns Warnings persisted in the scaffold QA block.
 */
function buildQaWarnings(
  post: CalendarPost,
  liturgicalContext?: LiturgicalContext
): string[] {
  const warnings = ["Alt text must be completed before approval"]

  if ((post.aktuelle_eingaben?.length ?? 0) > 0) {
    warnings.push("Current source inputs are still required before publication")
  }

  if (post.rubrik === "Predigt-Preview") {
    warnings.push("Predigt-Preview requires sermon input before final drafting")
  }

  if (post.rubrik === "Reli fragt" || post.rubrik === "Gemeinde lebt") {
    warnings.push("Review privacy and factual accuracy before drafting")
  }

  if (post.rubrik === "Gebet oder Lied") {
    warnings.push("Check song lyric copyright before publication")
  }

  for (const warning of liturgicalContext?.warnings ?? []) {
    warnings.push(warning)
  }

  return warnings
}

/**
 * Formats a calendar liturgical source into a single note string.
 *
 * @param source Liturgical reference from the calendar source data.
 * @returns Human-readable source note.
 */
function formatLiturgicalSourceNote(source: CalendarSourceReference): string {
  return `Liturgical source: ${source.jahr_endpoint} (${source.datum}, ${source.json_pfad})`
}

/**
 * Rejects any scaffolded prompt text that would ask an image model to render text.
 *
 * @param prompt Prompt text from the editorial calendar.
 * @returns The original prompt if safe, otherwise an empty placeholder.
 */
function sanitizeFluxPrompt(prompt: string): string {
  const lowered = prompt.toLowerCase()

  if (
    lowered.includes("text") ||
    lowered.includes("schrift") ||
    lowered.includes("buchstaben") ||
    lowered.includes("typography")
  ) {
    return ""
  }

  return prompt
}

/**
 * Guards against accidentally trying to scaffold an empty output root.
 *
 * @param outputRoot Target output root path.
 * @throws {CalendarValidationError} If the output root is empty.
 */
export function assertOutputRoot(outputRoot: string): void {
  if (outputRoot.trim() === "") {
    throw new CalendarValidationError("Output root must not be empty")
  }
}
