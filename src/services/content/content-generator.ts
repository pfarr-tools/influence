import type { Calendar, CalendarPost } from "../../domain/calendar.js"
import type { ContentPackage } from "../../domain/content.js"
import {
  getPostById,
  getPostsForMonth,
  getWeekForDate
} from "../calendar/calendar-service.js"
import { CalendarValidationError } from "../calendar/errors.js"
import {
  createContentScaffold
} from "./content-scaffolder.js"
import { contentPackageSchema } from "./content-schema.js"
import {
  assertWritableContentTarget,
  getContentOutputPaths,
  writeJsonFile
} from "./content-storage.js"
import type { ContentModelClient, TokenUsage } from "../openai/openai-client.js"

/**
 * Generation options shared by post, week, and month commands.
 */
export interface GenerateContentOptions {
  dryRun: boolean
  force: boolean
  language: string
  model: string
  outputRoot: string
}

/**
 * Result of a post generation attempt.
 */
export interface GenerateContentResult {
  content?: ContentPackage
  contentPath: string
  dryRunRequest?: ContentGenerationRequestPreview
  postId: string
  rawResponsePath: string
  skippedReason?: string
  usage?: TokenUsage
}

/**
 * Request preview used by dry-run mode.
 */
export interface ContentGenerationRequestPreview {
  developerPrompt: string
  model: string
  userPrompt: string
}

/**
 * Generates content for one post and persists raw and validated results.
 *
 * @param calendar Parsed calendar data.
 * @param postId Calendar post identifier.
 * @param options Generation options.
 * @param dependencies External dependencies such as the model client and time source.
 * @returns Result details for the generated post.
 */
export async function generateContentForPost(
  calendar: Calendar,
  postId: string,
  options: GenerateContentOptions,
  dependencies: ContentGeneratorDependencies
): Promise<GenerateContentResult> {
  const post = getPostById(calendar, postId)
  return generateContentForCalendarPost(post, options, dependencies)
}

/**
 * Generates content for every post in the week containing the given date.
 *
 * @param calendar Parsed calendar data.
 * @param date ISO date inside the target week.
 * @param options Generation options.
 * @param dependencies External dependencies such as the model client and time source.
 * @returns Generation results for the week.
 */
export async function generateContentForWeek(
  calendar: Calendar,
  date: string,
  options: GenerateContentOptions,
  dependencies: ContentGeneratorDependencies
): Promise<GenerateContentResult[]> {
  const week = getWeekForDate(calendar, date)
  const results: GenerateContentResult[] = []

  for (const post of week.beitraege) {
    results.push(await generateContentForCalendarPost(post, options, dependencies))
  }

  return results
}

/**
 * Generates content for every post in the given month.
 *
 * @param calendar Parsed calendar data.
 * @param month ISO month in `YYYY-MM` format.
 * @param options Generation options.
 * @param dependencies External dependencies such as the model client and time source.
 * @returns Generation results for the month.
 */
export async function generateContentForMonth(
  calendar: Calendar,
  month: string,
  options: GenerateContentOptions,
  dependencies: ContentGeneratorDependencies
): Promise<GenerateContentResult[]> {
  const posts = getPostsForMonth(calendar, month)
  const results: GenerateContentResult[] = []

  for (const post of posts) {
    results.push(await generateContentForCalendarPost(post, options, dependencies))
  }

  return results
}

/**
 * Dependencies injected for testable content generation.
 */
export interface ContentGeneratorDependencies {
  modelClient?: ContentModelClient
  now?: () => Date
}

/**
 * Generates content for a calendar post.
 *
 * @param post Source calendar post.
 * @param options Generation options.
 * @param dependencies External dependencies such as the model client and time source.
 * @returns Generation result for the post.
 */
async function generateContentForCalendarPost(
  post: CalendarPost,
  options: GenerateContentOptions,
  dependencies: ContentGeneratorDependencies
): Promise<GenerateContentResult> {
  const scaffold = createContentScaffold(post)
  const outputPaths = getContentOutputPaths(options.outputRoot, post)

  if (!options.dryRun) {
    await assertWritableContentTarget(outputPaths.contentPath, options.force)
  }

  const requestPreview = buildGenerationRequestPreview(
    post,
    scaffold,
    options.model,
    options.language
  )

  if (options.dryRun) {
    return {
      contentPath: outputPaths.contentPath,
      dryRunRequest: requestPreview,
      postId: post.id,
      rawResponsePath: outputPaths.rawResponsePath
    }
  }

  const now = dependencies.now ?? (() => new Date())

  if (shouldSkipModelGeneration(post)) {
    const skippedContent = finalizeContentPackage(
      scaffold,
      scaffold,
      options.model,
      now,
      "Missing sermon input for Predigt-Preview"
    )
    const rawResponse = {
      type: "skipped",
      reason: "missing_predigtinput",
      post_id: post.id
    }

    await writeJsonFile(outputPaths.rawResponsePath, rawResponse)
    await writeJsonFile(outputPaths.contentPath, skippedContent)

    return {
      content: skippedContent,
      contentPath: outputPaths.contentPath,
      postId: post.id,
      rawResponsePath: outputPaths.rawResponsePath,
      skippedReason: "missing_predigtinput",
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    }
  }

  const modelClient = dependencies.modelClient

  if (!modelClient) {
    throw new CalendarValidationError(
      "OPENAI_API_KEY is required for content generation unless --dry-run is used."
    )
  }

  const modelResponse = await modelClient.generateContent(requestPreview)
  await writeJsonFile(outputPaths.rawResponsePath, modelResponse.rawResponse)

  const validation = contentPackageSchema.safeParse(modelResponse.parsedContent)

  if (!validation.success) {
    const details = validation.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n")

    throw new CalendarValidationError(
      `Generated content for "${post.id}" is invalid:\n${details}`
    )
  }

  const finalized = finalizeContentPackage(
    scaffold,
    validation.data,
    modelResponse.model,
    now
  )

  await writeJsonFile(outputPaths.contentPath, finalized)

  return {
    content: finalized,
    contentPath: outputPaths.contentPath,
    postId: post.id,
    rawResponsePath: outputPaths.rawResponsePath,
    usage: modelResponse.usage
  }
}

/**
 * Builds the structured prompt payload for one model request.
 *
 * @param post Source calendar post.
 * @param scaffold Deterministic scaffold derived from the source post.
 * @param model Model name selected by the caller.
 * @param language Desired content language.
 * @returns Request preview used for dry-run and the real model call.
 */
function buildGenerationRequestPreview(
  post: CalendarPost,
  scaffold: ContentPackage,
  model: string,
  language: string
): ContentGenerationRequestPreview {
  const developerPrompt = [
    "You are part of a Protestant social media editorial team.",
    "Write in clear, accessible, theologically responsible German without church clichés.",
    "Use short sentences and concrete imagery.",
    "Never invent events, people, school situations, quotes, or factual details.",
    "Do not include copyrighted full song verses.",
    "For Reli and community posts, only use current details when they are explicitly provided.",
    "Return content that strictly matches the requested JSON schema.",
    "Set needs_input to true whenever required facts are missing.",
    "Keep qa.approved false.",
    "Do not ask for any text inside generated images."
  ].join(" ")

  const userPrompt = JSON.stringify(
    {
      task: "Generate a structured content package for one calendar post.",
      language,
      post: {
        id: post.id,
        date: post.datum,
        rubric: post.rubrik,
        title: post.thema,
        goal: post.ziel,
        idea: post.konkrete_idee,
        production_mode: post.vorproduktion,
        structure: post.struktur,
        ai_support: post.ki_hilfe,
        current_inputs: post.aktuelle_eingaben ?? [],
        liturgical_source: post.liturgische_quelle ?? null,
        platform_requirements: post.plattformen_und_formate
      },
      scaffold,
      constraints: {
        preserve_source_truth: true,
        no_invented_current_events: true,
        no_text_in_image_prompts: true
      }
    },
    null,
    2
  )

  return {
    developerPrompt,
    model,
    userPrompt
  }
}

/**
 * Applies source-of-truth fields and metadata to a model-generated package.
 *
 * @param scaffold Deterministic scaffold derived from the calendar source data.
 * @param generated Model-generated content package.
 * @param model Model used for generation.
 * @param now Time provider used to stamp metadata.
 * @param extraWarning Optional warning to append.
 * @returns Final validated content package.
 */
function finalizeContentPackage(
  scaffold: ContentPackage,
  generated: ContentPackage,
  model: string,
  now: () => Date,
  extraWarning?: string
): ContentPackage {
  const warningSet = new Set([...scaffold.qa.warnings, ...generated.qa.warnings])

  if (extraWarning) {
    warningSet.add(extraWarning)
  }

  return contentPackageSchema.parse({
    ...generated,
    id: scaffold.id,
    source: scaffold.source,
    needs_input: scaffold.needs_input || generated.needs_input,
    visual: {
      ...generated.visual,
      flux_prompt: sanitizeGeneratedFluxPrompt(generated.visual.flux_prompt),
      negative_prompt: generated.visual.negative_prompt || scaffold.visual.negative_prompt
    },
    qa: {
      warnings: [...warningSet],
      approved: false
    },
    metadata: {
      ...generated.metadata,
      model,
      generated_at: now().toISOString(),
      prompt_version: generated.metadata.prompt_version || "1.0"
    }
  })
}

/**
 * Prevents generated image prompts from requesting text rendering.
 *
 * @param prompt Model-generated image prompt.
 * @returns Safe prompt content.
 */
function sanitizeGeneratedFluxPrompt(prompt: string): string {
  const lowered = prompt.toLowerCase()

  if (
    lowered.includes("text") ||
    lowered.includes("letters") ||
    lowered.includes("buchstaben") ||
    lowered.includes("logo") ||
    lowered.includes("watermark")
  ) {
    return ""
  }

  return prompt
}

/**
 * Detects the mandatory incomplete fallback case for sermon preview posts.
 *
 * @param post Source calendar post.
 * @returns True when model generation must be skipped.
 */
function shouldSkipModelGeneration(post: CalendarPost): boolean {
  return post.rubrik === "Predigt-Preview"
}
