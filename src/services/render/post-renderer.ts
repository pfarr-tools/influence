import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, extname, join, relative, resolve } from "node:path"

import Handlebars from "handlebars"

import { loadRuntimeConfig } from "../../config/runtime-config.js"
import type { Calendar, CalendarPost } from "../../domain/calendar.js"
import type { ContentPackage } from "../../domain/content.js"
import { getPostById, getWeekForDate } from "../calendar/calendar-service.js"
import { CalendarValidationError } from "../calendar/errors.js"
import {
  assertContentApproved,
  getContentOutputPaths,
  pathExists,
  readContentPackage,
  writeJsonFile
} from "../content/content-storage.js"
import type { HtmlRenderClient, RenderOverflowRegion } from "./html-renderer.js"

const renderFormats = {
  "facebook-mastodon": {
    assetSlug: "1.91x1",
    cssClass: "format-landscape",
    height: 630,
    label: "Facebook/Mastodon",
    width: 1200
  },
  "instagram-feed": {
    assetSlug: "4x5",
    cssClass: "format-feed",
    height: 1350,
    label: "Instagram Feed",
    width: 1080
  },
  square: {
    assetSlug: "1x1",
    cssClass: "format-square",
    height: 1080,
    label: "Square",
    width: 1080
  },
  "instagram-story": {
    assetSlug: "9x16",
    cssClass: "format-story",
    height: 1920,
    label: "Instagram Story/Reel Cover",
    width: 1080
  }
} as const

export type RenderFormatKey = keyof typeof renderFormats
type RenderTemplateKind =
  | "abendgebet"
  | "kirchenjahr"
  | "gebet-oder-liedgedanke"
  | "gemeinde-lebt"
  | "morgengebet"
  | "predigt-preview"
  | "reli-fragt"
  | "tageslosungen"
  | "wissenskarussell"
  | "wochenspruch"
type RenderVariant = "feed-card" | "landscape-post" | "story-slide"

/**
 * Options shared by render commands.
 */
export interface RenderPostOptions {
  force: boolean
  outputRoot: string
  formats?: RenderFormatKey[]
}

/**
 * One rendered output artifact.
 */
export interface RenderArtifactResult {
  format: RenderFormatKey
  height: number
  htmlPath: string
  imagePath: string
  overflowWarnings: string[]
  pageCount: number
  pageIndex: number
  pageLabel: string
  variant: RenderVariant
  width: number
}

/**
 * Result of rendering one post into all supported formats.
 */
export interface RenderPostResult {
  contentPath: string
  postId: string
  renders: RenderArtifactResult[]
  summaryPath: string
  template: RenderTemplateKind
  warnings: string[]
}

/**
 * Dependencies injected for testability.
 */
export interface RenderPostDependencies {
  now?: () => Date
  pageRenderClient: HtmlRenderClient
}

interface RenderPageSpec {
  citation?: string
  eyebrow: string
  format: RenderFormatKey
  pageCount: number
  pageIndex: number
  pageLabel: string
  secondaryText?: string
  secondaryCitation?: string
  titleCard?: boolean
  template: RenderTemplateKind
  title: string
  titleNote?: string
  variant: RenderVariant
  width: number
  height: number
  primaryText: string
}

interface RenderPageDocument extends RenderPageSpec {
  html: string
}

/**
 * Renders all supported export formats for one post.
 *
 * @param calendar Parsed calendar data.
 * @param postId Calendar post identifier.
 * @param options Render options.
 * @param dependencies External dependencies such as a page renderer and time source.
 * @returns Result with written image, HTML, and warning artifacts.
 */
export async function renderPostById(
  calendar: Calendar,
  postId: string,
  options: RenderPostOptions,
  dependencies: RenderPostDependencies
): Promise<RenderPostResult> {
  const post = getPostById(calendar, postId)
  return renderCalendarPost(post, options, dependencies)
}

/**
 * Renders all posts of the week containing the given date.
 *
 * @param calendar Parsed calendar data.
 * @param date ISO date inside the target week.
 * @param options Render options.
 * @param dependencies External dependencies such as a page renderer and time source.
 * @returns Result list for the week.
 */
export async function renderWeekByDate(
  calendar: Calendar,
  date: string,
  options: RenderPostOptions,
  dependencies: RenderPostDependencies
): Promise<RenderPostResult[]> {
  const week = getWeekForDate(calendar, date)
  const results: RenderPostResult[] = []

  for (const post of week.beitraege) {
    results.push(await renderCalendarPost(post, options, dependencies))
  }

  return results
}

/**
 * Resolves the renderer template family from a calendar rubric.
 *
 * @param rubric Source rubric from the calendar.
 * @returns Stable renderer template family.
 */
export function resolveRenderTemplateKind(rubric: string): RenderTemplateKind {
  if (rubric === "Morgengebet") {
    return "morgengebet"
  }

  if (rubric === "Abendgebet") {
    return "abendgebet"
  }

  if (
    rubric === "Gebet oder Lied" ||
    rubric === "Ein Lied, das mich begleitet"
  ) {
    return "gebet-oder-liedgedanke"
  }

  if (rubric === "Mittwochsserie") {
    return "wissenskarussell"
  }

  if (rubric === "Reli fragt") {
    return "reli-fragt"
  }

  if (rubric === "Predigt-Preview") {
    return "predigt-preview"
  }

  if (rubric === "Gemeinde lebt") {
    return "gemeinde-lebt"
  }

  if (rubric === "Tageslosungen") {
    return "tageslosungen"
  }

  if (rubric === "Kirchenjahr") {
    return "kirchenjahr"
  }

  if (
    rubric === "Mit dem Wochenspruch in die Woche" ||
    rubric === "Wochenspruch – meditativ"
  ) {
    return "wochenspruch"
  }

  throw new CalendarValidationError(
    `No renderer template is defined for rubric "${rubric}".`
  )
}

/**
 * Builds the first render page document for a given format.
 *
 * @param post Source calendar post.
 * @param content Loaded content package.
 * @param format Render export format.
 * @param outputRoot Root output directory used for asset resolution.
 * @returns The first render document for the format.
 */
export async function buildRenderDocument(
  post: CalendarPost,
  content: ContentPackage,
  format: RenderFormatKey,
  outputRoot: string
): Promise<{
  format: RenderFormatKey
  height: number
  html: string
  template: RenderTemplateKind
  width: number
}> {
  const documents = await buildRenderDocuments(
    post,
    content,
    format,
    outputRoot
  )
  const firstDocument = documents[0]

  if (!firstDocument) {
    throw new CalendarValidationError(
      `No render document could be built for post "${post.id}" and format "${format}".`
    )
  }

  return {
    format,
    height: firstDocument.height,
    html: firstDocument.html,
    template: firstDocument.template,
    width: firstDocument.width
  }
}

async function renderCalendarPost(
  post: CalendarPost,
  options: RenderPostOptions,
  dependencies: RenderPostDependencies
): Promise<RenderPostResult> {
  const contentPaths = getContentOutputPaths(options.outputRoot, post)
  const content = await readContentPackage(contentPaths.contentPath)
  assertContentApproved(content, contentPaths.contentPath)
  const summaryPath = join(contentPaths.baseDir, "render-results.json")
  const allDocuments = await buildRenderDocumentsForPost(
    post,
    content,
    options.outputRoot,
    options.formats
  )
  const renders: RenderArtifactResult[] = []
  const aggregateWarnings = new Set<string>()

  await assertWritableRenderTargets(
    contentPaths.baseDir,
    summaryPath,
    allDocuments,
    options.force
  )

  for (const document of allDocuments) {
    const fileSuffix = `${document.format}-${formatPageNumber(document.pageIndex)}`
    const htmlPath = join(contentPaths.baseDir, `render-${fileSuffix}.html`)
    const imagePath = join(contentPaths.baseDir, `render-${fileSuffix}.png`)

    await mkdir(dirname(htmlPath), { recursive: true })
    await writeFile(htmlPath, `${document.html}\n`, "utf8")

    const renderResult = await dependencies.pageRenderClient.renderHtmlDocument(
      {
        height: document.height,
        html: document.html,
        outputPath: imagePath,
        width: document.width
      }
    )

    const overflowWarnings = renderResult.overflowRegions.map((region) =>
      formatOverflowWarning(document, region)
    )

    for (const warning of overflowWarnings) {
      aggregateWarnings.add(warning)
    }

    renders.push({
      format: document.format,
      height: document.height,
      htmlPath,
      imagePath,
      overflowWarnings,
      pageCount: document.pageCount,
      pageIndex: document.pageIndex,
      pageLabel: document.pageLabel,
      variant: document.variant,
      width: document.width
    })
  }

  const template = resolveRenderTemplateKind(post.rubrik)
  const warnings = Array.from(aggregateWarnings)
  const now = dependencies.now ?? (() => new Date())

  await writeJsonFile(summaryPath, {
    content_path: contentPaths.contentPath,
    post_id: post.id,
    rendered_at: now().toISOString(),
    renders: renders.map((render) => ({
      format: render.format,
      height: render.height,
      html_path: relative(contentPaths.baseDir, render.htmlPath),
      image_path: relative(contentPaths.baseDir, render.imagePath),
      overflow_warnings: render.overflowWarnings,
      page_count: render.pageCount,
      page_index: render.pageIndex,
      page_label: render.pageLabel,
      variant: render.variant,
      width: render.width
    })),
    template,
    warnings
  })

  return {
    contentPath: contentPaths.contentPath,
    postId: post.id,
    renders,
    summaryPath,
    template,
    warnings
  }
}

async function buildRenderDocumentsForPost(
  post: CalendarPost,
  content: ContentPackage,
  outputRoot: string,
  formats?: RenderFormatKey[]
): Promise<RenderPageDocument[]> {
  const documents: RenderPageDocument[] = []

  for (const format of formats ?? (Object.keys(renderFormats).filter((key) => key !== "square") as RenderFormatKey[])) {
    documents.push(
      ...(await buildRenderDocuments(post, content, format, outputRoot))
    )
  }

  return documents
}

async function buildRenderDocuments(
  post: CalendarPost,
  content: ContentPackage,
  format: RenderFormatKey,
  outputRoot: string
): Promise<RenderPageDocument[]> {
  const template = resolveRenderTemplateKind(post.rubrik)
  const palette = resolvePalette(template, content)
  const dimensions = renderFormats[format]
  const backgroundImagePath = await resolveBackgroundAssetPath(
    outputRoot,
    post,
    format
  )
  const backgroundCss = template === "kirchenjahr"
    ? `background-color: ${palette.base}; background-image: none;`
    : backgroundImagePath
    ? await buildBackgroundCss(backgroundImagePath, palette)
    : `background-image:
      radial-gradient(circle at top left, ${palette.tint} 0%, transparent 28%),
      linear-gradient(165deg, ${palette.base} 0%, ${palette.baseDeep} 100%);`

  const pageSpecs = buildRenderPageSpecs(post, content, format)

  return Promise.all(
    pageSpecs.map(async (pageSpec) => ({
      ...pageSpec,
      height: dimensions.height,
      html: await buildHtmlDocument(
        pageSpec,
        dimensions.cssClass,
        backgroundCss,
        palette
      ),
      template,
      width: dimensions.width
    }))
  )
}

function buildRenderPageSpecs(
  post: CalendarPost,
  content: ContentPackage,
  format: RenderFormatKey
): RenderPageSpec[] {
  if (format === "facebook-mastodon") {
    return [buildLandscapePageSpec(post, content, format)]
  }

  if (format === "instagram-feed" || format === "square") {
    return buildFeedPageSpecs(post, content, format)
  }

  return buildStoryPageSpecs(post, content, format)
}

function buildLandscapePageSpec(
  post: CalendarPost,
  content: ContentPackage,
  format: RenderFormatKey
): RenderPageSpec {
  const template = resolveRenderTemplateKind(post.rubrik)
  const title =
    content.platforms.facebook.headline || content.editorial_core.title

  return {
    eyebrow: resolveEyebrow(template),
    format,
    pageCount: 1,
    pageIndex: 1,
    pageLabel: renderFormats[format].label,
    primaryText: "",
    template,
    title,
    variant: "landscape-post",
    width: renderFormats[format].width,
    height: renderFormats[format].height
  }
}

function buildFeedPageSpecs(
  post: CalendarPost,
  content: ContentPackage,
  format: RenderFormatKey
): RenderPageSpec[] {
  const template = resolveRenderTemplateKind(post.rubrik)
  if (template === "kirchenjahr") return [buildKirchenjahrPageSpec(content, format, "feed-card")]
  if (template === "tageslosungen") {
    const sourceNote = (prefix: string) => content.editorial_core.source_notes.find((note) => note.startsWith(prefix))?.replace(prefix, "").trim() ?? ""
    return [{
      citation: sourceNote("Losungsvers:"),
      eyebrow: "",
      format,
      pageCount: 1,
      pageIndex: 1,
      pageLabel: renderFormats[format].label,
      primaryText: content.editorial_core.main_message,
      secondaryText: sourceNote("Lehrtext:"),
      secondaryCitation: sourceNote("Lehrtextvers:"),
      template,
      title: content.editorial_core.title,
      variant: "feed-card",
      width: renderFormats[format].width,
      height: renderFormats[format].height
    }]
  }
  const cards = content.platforms.instagram.carousel.filter(
    (card) => card.text.trim().length > 0
  )

  if (cards.length > 0) {
    const weeklyVerse = resolveWeeklyVerseText(content)

    return cards.map((card, index) => {
      const cardType = card.type.trim().toLowerCase()
      const isTitleCard = cardType === "title"
      const primaryText = isTitleCard ? "" : card.text.trim()
      const showCitation =
        template === "wochenspruch" &&
        weeklyVerse.length > 0 &&
        normalizeComparableText(primaryText) ===
          normalizeComparableText(weeklyVerse)

      return {
        citation: showCitation ? extractCitation(content, post) : undefined,
        eyebrow: resolveEyebrow(template),
        format,
        pageCount: cards.length,
        pageIndex: index + 1,
        pageLabel: `${renderFormats[format].label} ${index + 1}/${cards.length}`,
        primaryText,
        template,
        titleCard: isTitleCard,
        title:
          template === "wochenspruch"
            ? ""
            : isTitleCard
              ? card.text.trim()
              : index === 0
                ? content.editorial_core.title
                : "",
        titleNote: undefined,
        variant: "feed-card",
        width: renderFormats[format].width,
        height: renderFormats[format].height
      }
    })
  }

  return [
    {
      citation:
        template === "wochenspruch"
          ? extractCitation(content, post)
          : undefined,
      eyebrow: resolveEyebrow(template),
      format,
      pageCount: 1,
      pageIndex: 1,
      pageLabel: renderFormats[format].label,
      primaryText: content.editorial_core.main_message,
      template,
      title: content.editorial_core.title,
      variant: "feed-card",
      width: renderFormats[format].width,
      height: renderFormats[format].height
    }
  ]
}

function buildStoryPageSpecs(
  post: CalendarPost,
  content: ContentPackage,
  format: RenderFormatKey
): RenderPageSpec[] {
  const template = resolveRenderTemplateKind(post.rubrik)
  if (template === "kirchenjahr") return [buildKirchenjahrPageSpec(content, format, "story-slide")]
  const slides = content.platforms.story.slides
    .map((slide) => slide.text.trim())
    .filter((slide) => slide.length > 0)

  if (template === "tageslosungen") {
    const sourceNote = (prefix: string) => content.editorial_core.source_notes.find((note) => note.startsWith(prefix))?.replace(prefix, "").trim() ?? ""
    return [{
      citation: sourceNote("Losungsvers:"),
      eyebrow: "",
      format,
      pageCount: 1,
      pageIndex: 1,
      pageLabel: renderFormats[format].label,
      primaryText: content.editorial_core.main_message,
      secondaryText: sourceNote("Lehrtext:"),
      secondaryCitation: sourceNote("Lehrtextvers:"),
      template,
      title: content.editorial_core.title,
      variant: "story-slide",
      width: renderFormats[format].width,
      height: renderFormats[format].height
    }]
  }

  if (slides.length > 0) {
    const weeklyVerse = resolveWeeklyVerseText(content)

    return slides.map((slide, index) => {
      const showCitation =
        template === "wochenspruch" &&
        weeklyVerse.length > 0 &&
        normalizeComparableText(slide) === normalizeComparableText(weeklyVerse)

      return {
        citation: showCitation ? extractCitation(content, post) : undefined,
        eyebrow: resolveEyebrow(template),
        format,
        pageCount: slides.length,
        pageIndex: index + 1,
        pageLabel: `${renderFormats[format].label} ${index + 1}/${slides.length}`,
        primaryText: slide,
        template,
        title:
          template === "wochenspruch" ||
          (index === 0 &&
            normalizeComparableText(slide) ===
              normalizeComparableText(content.editorial_core.title))
            ? ""
            : index === 0
              ? content.editorial_core.title
              : "",
        titleNote: undefined,
        variant: "story-slide",
        width: renderFormats[format].width,
        height: renderFormats[format].height
      }
    })
  }

  return [
    {
      citation:
        template === "wochenspruch"
          ? extractCitation(content, post)
          : undefined,
      eyebrow: resolveEyebrow(template),
      format,
      pageCount: 1,
      pageIndex: 1,
      pageLabel: renderFormats[format].label,
      primaryText: content.editorial_core.main_message,
      template,
      title: content.editorial_core.title,
      variant: "story-slide",
      width: renderFormats[format].width,
      height: renderFormats[format].height
    }
  ]
}

function buildKirchenjahrPageSpec(
  content: ContentPackage,
  format: RenderFormatKey,
  variant: "feed-card" | "story-slide"
): RenderPageSpec {
  return {
    eyebrow: "",
    format,
    pageCount: 1,
    pageIndex: 1,
    pageLabel: renderFormats[format].label,
    primaryText: "",
    titleNote: content.editorial_core.source_notes.find((note) => note.startsWith("Titel:"))?.replace("Titel:", "").trim(),
    template: "kirchenjahr",
    title: content.editorial_core.title,
    variant,
    width: renderFormats[format].width,
    height: renderFormats[format].height
  }
}

async function buildHtmlDocument(
  page: RenderPageSpec,
  cssClass: string,
  backgroundCss: string,
  palette: {
    accent: string
    base: string
    baseDeep: string
    muted: string
    text: string
    tint: string
  }
): Promise<string> {
  const isLandscapePost = page.variant === "landscape-post"
  const templateName =
    page.template === "morgengebet"
      ? "morning-prayer"
      : page.template === "abendgebet"
        ? "evening-prayer"
        : page.template === "tageslosungen"
          ? "tageslosungen"
          : page.template === "kirchenjahr"
            ? (page.variant === "story-slide" ? "kirchenjahr-story" : "kirchenjahr-feed")
            :
    page.variant === "landscape-post"
      ? "facebook-mastodon"
      : page.variant === "feed-card"
        ? "instagram-feed"
        : "instagram-story"
  const panel = renderTemplate(
    await readFile(
      new URL(`./templates/${templateName}.html`, import.meta.url),
      "utf8"
    ),
    {
      citation: page.citation ?? "",
      primaryText:
        isLandscapePost || !page.primaryText
          ? ""
          : formatPrimaryTextHtml(page.primaryText),
      secondaryText: isLandscapePost ? "" : (page.secondaryText ?? ""),
      secondaryCitation: isLandscapePost ? "" : (page.secondaryCitation ?? ""),
      titleCard: page.titleCard ?? false,
      title: page.title,
      titleNote: isLandscapePost ? "" : (page.titleNote ?? ""),
      sourceMark: loadRuntimeConfig().sourceMark
    }
  )

  return `<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        --canvas-width: ${page.width}px;
        --canvas-height: ${page.height}px;
        --page-bg: ${palette.base};
        --page-bg-deep: ${palette.baseDeep};
        --text-primary: ${palette.text};
        --text-secondary: ${palette.muted};
        --accent: ${palette.accent};
        --surface: rgba(255, 255, 255, 0.1);
        --surface-strong: rgba(10, 14, 22, 0.54);
        --border: rgba(255, 255, 255, 0.22);
        --shadow: rgba(0, 0, 0, 0.24);
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        width: var(--canvas-width);
        height: var(--canvas-height);
        overflow: hidden;
      }

      body {
        background: var(--page-bg);
        color: var(--text-primary);
        font-family: "Atkinson Hyperlegible Next", "Atkinson Hyperlegible", "Aptos", "Segoe UI", "Helvetica Neue", sans-serif;
      }

      .canvas {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        ${backgroundCss}
        background-position: center;
        background-repeat: no-repeat;
        background-size: cover;
      }

      .canvas::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          linear-gradient(150deg, rgba(255, 255, 255, 0.08), transparent 42%),
          linear-gradient(0deg, rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.12));
        pointer-events: none;
      }

      .layout {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        gap: 24px;
        height: 100%;
        padding: 56px;
      }

      .format-story .layout {
        padding: 72px 58px;
        gap: 28px;
      }

      .format-landscape .layout {
        padding: 42px 48px;
        gap: 18px;
      }

      .format-square .layout,
      .format-story .layout {
        justify-content: center;
      }

      .format-square .panel,
      .format-story .panel {
        margin-top: 0;
      }

      .format-square .tageslosungen-panel,
      .format-story .tageslosungen-panel {
        width: 100%;
      }

      .template-tageslosungen .sender-mark {
        position: absolute;
        right: 56px;
        bottom: 42px;
        margin: 0;
      }

      .template-tageslosungen .panel {
        background: transparent;
        backdrop-filter: none;
        box-shadow: none;
        border-radius: 0;
      }

      .template-kirchenjahr::before {
        display: none;
      }

      .template-kirchenjahr .panel {
        width: 100%;
        background: transparent;
        backdrop-filter: none;
        box-shadow: none;
        border-radius: 0;
        text-align: center;
      }

      .template-kirchenjahr .panel-meta {
        display: none;
      }

      .template-kirchenjahr .sender-mark {
        position: absolute;
        left: 56px;
        right: 56px;
        bottom: 36px;
        margin: 0;
        color: var(--text-primary);
        text-align: center;
        font-size: 26px;
      }

      .template-kirchenjahr .title {
        font-size: 68px;
      }

      .format-story .template-kirchenjahr .title {
        font-size: 82px;
      }

      .template-kirchenjahr .title-note {
        color: var(--text-primary);
        font-size: 38px;
        line-height: 1.2;
        margin: 0;
      }

      .format-story .template-kirchenjahr .title-note {
        font-size: 44px;
      }

      .panel-meta {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
      }

      .eyebrow {
        display: inline-flex;
        align-self: flex-start;
        padding: 10px 16px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.14);
        border: 1px solid var(--border);
        color: var(--text-primary);
        font-size: 26px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .pager {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 70px;
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.12);
        border: 1px solid var(--border);
        font-size: 22px;
        font-weight: 700;
      }

      .format-landscape .eyebrow,
      .format-landscape .pager {
        font-size: 18px;
        padding: 7px 12px;
      }

      .panel {
        display: flex;
        flex-direction: column;
        gap: 18px;
        margin-top: auto;
        min-height: 0;
        padding: 36px;
        border-radius: 34px;
        background: linear-gradient(180deg, rgba(11, 17, 27, 0.28), rgba(11, 17, 27, 0.58));
        backdrop-filter: blur(10px);
        box-shadow: 0 24px 64px var(--shadow);
      }

      .prayer-panel {
        position: relative;
        overflow: hidden;
      }

      .prayer-symbol {
        width: 74px;
        height: 74px;
        flex: 0 0 auto;
        border-radius: 50%;
        border: 3px solid var(--accent);
        box-shadow: 0 0 0 14px color-mix(in srgb, var(--accent) 14%, transparent);
      }

      .prayer-symbol-morning {
        background: radial-gradient(circle, var(--accent) 0 42%, transparent 44%);
      }

      .prayer-symbol-evening {
        background: linear-gradient(135deg, transparent 0 45%, var(--accent) 47% 72%, transparent 74%);
        border-color: var(--accent);
      }

      .template-morgengebet .prayer-panel {
        background: linear-gradient(180deg, rgba(36, 84, 106, 0.32), rgba(11, 27, 40, 0.62));
      }

      .template-abendgebet .prayer-panel {
        background: linear-gradient(180deg, rgba(47, 42, 93, 0.34), rgba(15, 16, 41, 0.66));
      }

      .format-landscape .panel {
        gap: 12px;
        padding: 24px 26px;
        border-radius: 24px;
      }

      .accent-line {
        width: 120px;
        height: 8px;
        border-radius: 999px;
        background: var(--accent);
      }

      .format-landscape .accent-line {
        width: 72px;
        height: 6px;
      }

      .title {
        margin: 0;
        font-size: 52px;
        line-height: 1.08;
        font-weight: 800;
      }

      .title-story {
        font-size: 64px;
      }

      .format-landscape .title {
        font-size: 32px;
      }

      .title-note {
        margin: 0;
        color: var(--text-secondary);
        font-size: 22px;
        line-height: 1.3;
      }

      .format-landscape .title-note {
        font-size: 14px;
      }

      .body-text {
        margin: 0;
        font-size: 40px;
        line-height: 1.22;
        white-space: pre-wrap;
      }

      .body-text-story {
        font-size: 50px;
      }

      .format-landscape .body-text {
        font-size: 22px;
      }

      .small-text {
        margin: 0;
        color: var(--text-secondary);
        font-size: 26px;
        line-height: 1.35;
        white-space: pre-wrap;
      }

      .format-story .small-text {
        font-size: 28px;
      }

      .format-landscape .small-text {
        font-size: 15px;
      }

      .citation {
        color: var(--accent);
        font-size: 28px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .format-landscape .citation {
        font-size: 16px;
      }

      .sender-mark {
        margin: 0;
        padding-top: 8px;
        color: rgba(255, 255, 255, 0.78);
        font-size: 18px;
        line-height: 1.2;
        letter-spacing: 0.03em;
      }

      .format-story .sender-mark {
        font-size: 19px;
      }

      .format-landscape .sender-mark {
        font-size: 12px;
        padding-top: 4px;
      }

      [data-overflow-id] {
        min-height: 0;
        overflow: hidden;
      }
    </style>
  </head>
  <body>
    <main class="canvas ${cssClass}${page.template === "tageslosungen" ? " template-tageslosungen" : ""}${page.template === "kirchenjahr" ? " template-kirchenjahr" : ""}${page.template === "morgengebet" ? " template-morgengebet" : ""}${page.template === "abendgebet" ? " template-abendgebet" : ""}">
      <section class="layout">
        <div class="panel-meta">
          <div class="eyebrow">${escapeHtml(page.eyebrow)}</div>
          ${
            page.pageCount > 1
              ? `<div class="pager">${escapeHtml(`${page.pageIndex}/${page.pageCount}`)}</div>`
              : ""
          }
        </div>
        ${panel}
      </section>
    </main>
  </body>
</html>`
}

function renderTemplate(
  template: string,
  values: Record<string, unknown>
): string {
  return Handlebars.compile(template)(values)
}

async function assertWritableRenderTargets(
  baseDir: string,
  summaryPath: string,
  documents: RenderPageDocument[],
  force: boolean
): Promise<void> {
  const targetPaths = [
    summaryPath,
    ...documents.flatMap((document) => {
      const suffix = `${document.format}-${formatPageNumber(document.pageIndex)}`

      return [
        join(baseDir, `render-${suffix}.html`),
        join(baseDir, `render-${suffix}.png`)
      ]
    })
  ]

  for (const targetPath of targetPaths) {
    if ((await pathExists(targetPath)) && !force) {
      throw new CalendarValidationError(
        `Render output already exists at "${targetPath}". Use --force to overwrite it.`
      )
    }
  }
}

async function resolveBackgroundAssetPath(
  outputRoot: string,
  post: CalendarPost,
  format: RenderFormatKey
): Promise<string | undefined> {
  const basePath = join(outputRoot, post.datum, post.id, "assets", `background-${renderFormats[format].assetSlug}`)
  for (const extension of ["webp", "jpg", "jpeg", "png"]) {
    const candidate = resolve(`${basePath}.${extension}`)
    if (await pathExists(candidate)) return candidate
  }
  return undefined
}

async function buildBackgroundCss(
  backgroundImagePath: string,
  palette: {
    accent: string
    base: string
    baseDeep: string
    muted: string
    text: string
    tint: string
  }
): Promise<string> {
  if (!(await pathExists(backgroundImagePath))) {
    return `background-image:
      radial-gradient(circle at top left, ${palette.tint} 0%, transparent 28%),
      linear-gradient(165deg, ${palette.base} 0%, ${palette.baseDeep} 100%);`
  }

  const imageBuffer = await readFile(backgroundImagePath)
  const mimeType = resolveImageMimeType(backgroundImagePath)

  return `background-image:
      linear-gradient(180deg, rgba(20, 20, 24, 0.08), rgba(20, 20, 24, 0.34)),
      url("data:${mimeType};base64,${imageBuffer.toString("base64")}");`
}

function resolvePalette(template: RenderTemplateKind, content?: ContentPackage): {
  accent: string
  base: string
  baseDeep: string
  muted: string
  text: string
  tint: string
} {
  if (template === "kirchenjahr") {
    const color = content?.visual.concept.match(/^kirchenjahr:(.+)$/)?.[1] ?? "purple"
    const text = color === "white" ? "#6f3f93" : "#ffffff"
    return { accent: text, base: color, baseDeep: color, muted: text, text, tint: color }
  }
  if (template === "morgengebet") {
    return {
      accent: "#f6c453",
      base: "#385b70",
      baseDeep: "#172f43",
      muted: "#e5f0f2",
      text: "#ffffff",
      tint: "rgba(246, 196, 83, 0.38)"
    }
  }

  if (template === "abendgebet") {
    return {
      accent: "#c8b5f2",
      base: "#302c59",
      baseDeep: "#13152f",
      muted: "#e5e0f5",
      text: "#ffffff",
      tint: "rgba(200, 181, 242, 0.3)"
    }
  }

  if (template === "gebet-oder-liedgedanke") {
    return {
      accent: "#f0c674",
      base: "#173248",
      baseDeep: "#0a1a27",
      muted: "#d9e4ec",
      text: "#ffffff",
      tint: "rgba(240, 198, 116, 0.36)"
    }
  }

  if (template === "wissenskarussell") {
    return {
      accent: "#ffd166",
      base: "#11394d",
      baseDeep: "#08161e",
      muted: "#d7ebf6",
      text: "#ffffff",
      tint: "rgba(255, 209, 102, 0.34)"
    }
  }

  if (template === "reli-fragt") {
    return {
      accent: "#ff8a5b",
      base: "#432534",
      baseDeep: "#1f1017",
      muted: "#f1d7e0",
      text: "#ffffff",
      tint: "rgba(255, 138, 91, 0.28)"
    }
  }

  if (template === "predigt-preview") {
    return {
      accent: "#ffcf5c",
      base: "#2a2d6e",
      baseDeep: "#14163a",
      muted: "#e3e5ff",
      text: "#ffffff",
      tint: "rgba(255, 207, 92, 0.24)"
    }
  }

  if (template === "gemeinde-lebt") {
    return {
      accent: "#7bd389",
      base: "#17392c",
      baseDeep: "#091c15",
      muted: "#dcf0e5",
      text: "#ffffff",
      tint: "rgba(123, 211, 137, 0.26)"
    }
  }

  return {
    accent: "#dcb35c",
    base: "#4a2b1d",
    baseDeep: "#1b130f",
    muted: "#f1e6d8",
    text: "#ffffff",
    tint: "rgba(220, 179, 92, 0.22)"
  }
}

function resolveEyebrow(template: RenderTemplateKind): string {
  if (template === "morgengebet") {
    return "Morgengebet"
  }

  if (template === "abendgebet") {
    return "Abendgebet"
  }

  if (template === "gebet-oder-liedgedanke") {
    return "Gebet oder Liedgedanke"
  }

  if (template === "wissenskarussell") {
    return "Gut zu wissen"
  }

  if (template === "reli-fragt") {
    return "Reli fragt"
  }

  if (template === "predigt-preview") {
    return "Predigt-Preview"
  }

  if (template === "gemeinde-lebt") {
    return "Gemeinde lebt"
  }

  return "Wochenspruch"
}

function resolveWeeklyVerseText(content: ContentPackage): string {
  const wochenspruchCard = content.platforms.instagram.carousel.find((card) =>
    card.type.toLowerCase().includes("wochenspruch")
  )

  if (wochenspruchCard?.text.trim()) {
    return wochenspruchCard.text.trim()
  }

  const note = content.editorial_core.source_notes.find((entry) =>
    entry.startsWith("Wochenspruch:")
  )

  if (!note) {
    return ""
  }

  return note
    .replace(/^Wochenspruch:\s*/, "")
    .replace(/\s*\([^()]+\)\s*$/, "")
    .trim()
}

function normalizeComparableText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[“”„"]/g, "")
    .replace(/[.!?]+$/g, "")
}

function extractCitation(content: ContentPackage, post: CalendarPost): string {
  const note = content.editorial_core.source_notes.find((entry) =>
    entry.startsWith("Wochenspruch:")
  )

  if (note) {
    const match = note.match(/\(([^()]+)\)\s*$/)

    if (match?.[1]) {
      return match[1]
    }
  }

  return post.rubrik
}

function formatOverflowWarning(
  document: RenderPageDocument,
  region: RenderOverflowRegion
): string {
  return `Text overflow detected in ${document.format} page ${document.pageIndex}/${document.pageCount} (${region.id}). Review copy before approval.`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function formatPrimaryTextHtml(value: string): string {
  const escaped = escapeHtml(value)
  const patterns = [
    /^((?:Die|Das)\s+Übung(?:\s*:)?)/u,
    /^((?:Die|Das)\s+Frage(?:\s*:)?)/u,
    /^((?:Der|Die|Das)\s+Gedanke(?:\s*:)?)/u,
    /^((?:Der|Die|Das)\s+Impuls(?:\s*:)?)/u,
    /^((?:Der|Die|Das)\s+Wochenspruch(?:\s+für\s+diese\s+Woche)?(?:\s*:)?)/u,
    /^((?:Frage|Impuls|Übung|Wochenspruch)(?:\s*:)?)/u
  ]

  for (const pattern of patterns) {
    const match = escaped.match(pattern)

    if (match?.[1]) {
      return escaped.replace(pattern, `<strong>${match[1]}</strong>`)
    }
  }

  return escaped
}

function resolveImageMimeType(path: string): string {
  const extension = extname(path).toLowerCase()

  if (extension === ".webp") {
    return "image/webp"
  }

  if (extension === ".png") {
    return "image/png"
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg"
  }

  return "application/octet-stream"
}

function formatPageNumber(index: number): string {
  return String(index).padStart(2, "0")
}
