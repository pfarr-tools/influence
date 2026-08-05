import type { Calendar, CalendarPost } from "../../domain/calendar.js"
import type { ContentPackage } from "../../domain/content.js"
import { getPostById, getWeekForDate } from "../calendar/calendar-service.js"
import {
  getContentOutputPaths,
  readContentPackage,
  writeJsonFile
} from "./content-storage.js"

const citationPattern =
  /\b(?:[1-5]\s*)?(?:Mo|Ex|Lev|Num|Dtn|Jos|Ri|Rut|1 Sam|2 Sam|1 Kön|2 Kön|1 Chr|2 Chr|Esra|Neh|Est|Hi|Ps|Spr|Pred|Hld|Jes|Jer|Klgl|Ez|Dan|Hos|Joel|Am|Obd|Jona|Mi|Nah|Hab|Zef|Hag|Sach|Mal|Mt|Mk|Lk|Joh|Apg|Röm|1 Kor|2 Kor|Gal|Eph|Phil|Kol|1 Thess|2 Thess|1 Tim|2 Tim|Tit|Phlm|Hebr|Jak|1 Petr|2 Petr|1 Joh|2 Joh|3 Joh|Jud|Offb)\s+\d{1,3},\d{1,3}(?:-\d{1,3})?\b/i
const likelyTextInImagePattern =
  /\b(?:text im bild|text overlay|overlay text|headline im bild|schriftzug|schrift im bild|lettering|caption inside image)\b/i
const currentEventHintPattern =
  /\b(?:heute abend|heute um|morgen um|diesen sonntag um|um \d{1,2}:\d{2}|uhr|treffpunkt|live vor ort)\b/i
const lyricPattern =
  /["„‚][^"“”]{12,}["“”]|(?:^|\n)\s*[A-ZÄÖÜa-zäöü].+\n[A-ZÄÖÜa-zäöü].+\n[A-ZÄÖÜa-zäöü].+/m

const maxLengths = {
  facebookHeadline: 80,
  facebookText: 1500,
  instagramCaption: 2200,
  mastodonText: 500,
  reelHook: 140,
  reelScript: 900,
  storySlide: 220
} as const

type QaCheckId =
  | "alt-text-present"
  | "flux-prompt-no-text"
  | "required-fields"
  | "platform-lengths"
  | "current-events"
  | "privacy"
  | "song-lyrics"
  | "scripture-citation"
  | "predigt-preview-input"

type QaSeverity = "error" | "warning"
type QaStatus = "passed" | "failed" | "warning"

export interface QaFinding {
  check: QaCheckId
  message: string
  severity: QaSeverity
}

export interface QaCheckResult {
  check: QaCheckId
  findings: QaFinding[]
  status: QaStatus
}

export interface QaPostResult {
  checks: QaCheckResult[]
  contentPath: string
  errors: string[]
  postId: string
  readyForApproval: boolean
  statusAfterRun: ContentPackage["status"]
  statusBeforeRun: ContentPackage["status"]
  summaryPath: string
  warnings: string[]
}

export async function runQaForPost(
  calendar: Calendar,
  postId: string,
  outputRoot: string
): Promise<QaPostResult> {
  const post = getPostById(calendar, postId)
  return runQaForCalendarPost(post, outputRoot)
}

export async function runQaForWeek(
  calendar: Calendar,
  date: string,
  outputRoot: string
): Promise<QaPostResult[]> {
  const week = getWeekForDate(calendar, date)
  const results: QaPostResult[] = []

  for (const post of week.beitraege) {
    results.push(await runQaForCalendarPost(post, outputRoot))
  }

  return results
}

async function runQaForCalendarPost(
  post: CalendarPost,
  outputRoot: string
): Promise<QaPostResult> {
  const contentPaths = getContentOutputPaths(outputRoot, post)
  const content = await readContentPackage(contentPaths.contentPath)
  const checks = runChecks(post, content)
  const warnings = flattenFindings(checks, "warning")
  const errors = flattenFindings(checks, "error")
  const readyForApproval = errors.length === 0
  const statusBeforeRun = content.status
  const statusAfterRun = resolveStatusAfterQa(content.status, readyForApproval)
  const persistedContent: ContentPackage = {
    ...content,
    status: statusAfterRun,
    qa: {
      approved: false,
      warnings
    }
  }
  const summaryPath = `${contentPaths.baseDir}/qa-results.json`

  await writeJsonFile(contentPaths.contentPath, persistedContent)
  await writeJsonFile(summaryPath, {
    checks: checks.map((check) => ({
      check: check.check,
      findings: check.findings,
      status: check.status
    })),
    content_path: contentPaths.contentPath,
    errors,
    post_id: post.id,
    ready_for_approval: readyForApproval,
    status_after_run: statusAfterRun,
    status_before_run: statusBeforeRun,
    warnings
  })

  return {
    checks,
    contentPath: contentPaths.contentPath,
    errors,
    postId: post.id,
    readyForApproval,
    statusAfterRun,
    statusBeforeRun,
    summaryPath,
    warnings
  }
}

function runChecks(post: CalendarPost, content: ContentPackage): QaCheckResult[] {
  return [
    buildCheck("alt-text-present", checkAltText(content)),
    buildCheck("flux-prompt-no-text", checkFluxPrompt(content)),
    buildCheck("required-fields", checkRequiredFields(post, content)),
    buildCheck("platform-lengths", checkPlatformLengths(content)),
    buildCheck("current-events", checkCurrentEvents(post, content)),
    buildCheck("privacy", checkPrivacy(post)),
    buildCheck("song-lyrics", checkSongLyrics(post, content)),
    buildCheck("scripture-citation", checkScriptureCitation(post, content)),
    buildCheck("predigt-preview-input", checkPredigtPreview(post, content))
  ]
}

function buildCheck(check: QaCheckId, findings: QaFinding[]): QaCheckResult {
  if (findings.some((finding) => finding.severity === "error")) {
    return { check, findings, status: "failed" }
  }

  if (findings.length > 0) {
    return { check, findings, status: "warning" }
  }

  return { check, findings, status: "passed" }
}

function checkAltText(content: ContentPackage): QaFinding[] {
  if (content.visual.alt_text.trim().length > 0) {
    return []
  }

  return [
    {
      check: "alt-text-present",
      message: "Alt text is missing.",
      severity: "error"
    }
  ]
}

function checkFluxPrompt(content: ContentPackage): QaFinding[] {
  const prompt = content.visual.flux_prompt.trim()
  const lowered = prompt.toLowerCase()

  if (prompt.length === 0) {
    return [
      {
        check: "flux-prompt-no-text",
        message: "Flux prompt is missing or was removed because it requested text in the image.",
        severity: "error"
      }
    ]
  }

  if (
    likelyTextInImagePattern.test(prompt) ||
    (lowered.includes("typography") && !lowered.includes("no typography")) ||
    (lowered.includes("text") &&
      !lowered.includes("no text") &&
      !lowered.includes("without text") &&
      !lowered.includes("ohne text")) ||
    (lowered.includes("letters") &&
      !lowered.includes("no letters") &&
      !lowered.includes("without letters")) ||
    (lowered.includes("schrift") && !lowered.includes("ohne schrift"))
  ) {
    return [
      {
        check: "flux-prompt-no-text",
        message: "Flux prompt appears to ask for text inside the image.",
        severity: "error"
      }
    ]
  }

  return []
}

function checkRequiredFields(
  post: CalendarPost,
  content: ContentPackage
): QaFinding[] {
  const findings: QaFinding[] = []
  const requiredFields: Array<[string, string]> = [
    ["editorial_core.title", content.editorial_core.title],
    ["editorial_core.main_message", content.editorial_core.main_message],
    ["editorial_core.audience", content.editorial_core.audience],
    ["platforms.facebook.headline", content.platforms.facebook.headline],
    ["platforms.facebook.text", content.platforms.facebook.text],
    ["platforms.instagram.caption", content.platforms.instagram.caption],
    ["platforms.mastodon.text", content.platforms.mastodon.text],
    ["visual.concept", content.visual.concept],
    ["visual.flux_prompt", content.visual.flux_prompt],
    ["visual.alt_text", content.visual.alt_text]
  ]

  if (post.plattformen_und_formate.instagram.some((format) => format.toLowerCase().includes("story"))) {
    requiredFields.push([
      "platforms.story.slides",
      content.platforms.story.slides.some((slide) => slide.text.trim().length > 0)
        ? "present"
        : ""
    ])
  }

  if (post.plattformen_und_formate.instagram.some((format) => format.toLowerCase().includes("reel"))) {
    requiredFields.push(["platforms.reel.hook", content.platforms.reel.hook])
    requiredFields.push(["platforms.reel.script", content.platforms.reel.script])
  }

  if (content.platforms.instagram.carousel.length > 0) {
    requiredFields.push([
      "platforms.instagram.carousel",
      content.platforms.instagram.carousel.some((card) => card.text.trim().length > 0)
        ? "present"
        : ""
    ])
  }

  for (const [field, value] of requiredFields) {
    if (value.trim().length === 0) {
      findings.push({
        check: "required-fields",
        message: `Required field "${field}" is empty.`,
        severity: "error"
      })
    }
  }

  return findings
}

function checkPlatformLengths(content: ContentPackage): QaFinding[] {
  const findings: QaFinding[] = []

  pushLengthWarning(
    findings,
    "facebook.text",
    content.platforms.facebook.text,
    maxLengths.facebookText
  )
  pushLengthWarning(
    findings,
    "facebook.headline",
    content.platforms.facebook.headline,
    maxLengths.facebookHeadline
  )
  pushLengthWarning(
    findings,
    "instagram.caption",
    content.platforms.instagram.caption,
    maxLengths.instagramCaption
  )
  pushLengthWarning(
    findings,
    "mastodon.text",
    content.platforms.mastodon.text,
    maxLengths.mastodonText
  )
  pushLengthWarning(findings, "reel.hook", content.platforms.reel.hook, maxLengths.reelHook)
  pushLengthWarning(
    findings,
    "reel.script",
    content.platforms.reel.script,
    maxLengths.reelScript
  )

  content.platforms.story.slides.forEach((slide, index) => {
    pushLengthWarning(
      findings,
      `story.slides[${index}]`,
      slide.text,
      maxLengths.storySlide
    )
  })

  return findings
}

function pushLengthWarning(
  findings: QaFinding[],
  field: string,
  text: string,
  maxLength: number
): void {
  const length = text.trim().length

  if (length <= maxLength || length === 0) {
    return
  }

  findings.push({
    check: "platform-lengths",
    message: `Field "${field}" is ${length} characters long and exceeds the plausibility limit of ${maxLength}.`,
    severity: "warning"
  })
}

function checkCurrentEvents(
  post: CalendarPost,
  content: ContentPackage
): QaFinding[] {
  if ((post.aktuelle_eingaben?.length ?? 0) === 0 && !content.needs_input) {
    return []
  }

  const textBundle = collectPublicText(content)
  const message = currentEventHintPattern.test(textBundle)
    ? "Current-event details appear in public copy and must be verified against the real input source."
    : "Current-event or local factual details are still required. Verify that no details were invented."

  return [
    {
      check: "current-events",
      message,
      severity: "warning"
    }
  ]
}

function checkPrivacy(post: CalendarPost): QaFinding[] {
  if (post.rubrik !== "Reli fragt" && post.rubrik !== "Gemeinde lebt") {
    return []
  }

  return [
    {
      check: "privacy",
      message: "Privacy review required for Reli/Gemeinde content: confirm anonymization, consent, and local factual accuracy.",
      severity: "warning"
    }
  ]
}

function checkSongLyrics(
  post: CalendarPost,
  content: ContentPackage
): QaFinding[] {
  if (post.rubrik !== "Gebet oder Lied") {
    return []
  }

  const findings: QaFinding[] = [
    {
      check: "song-lyrics",
      message: "Song lyric copyright must be checked manually before publication.",
      severity: "warning"
    }
  ]
  const publicText = collectPublicText(content)

  if (lyricPattern.test(publicText)) {
    findings.push({
      check: "song-lyrics",
      message: "Public copy may contain quoted or verse-like lyrics. Confirm that no protected full lyrics are published.",
      severity: "warning"
    })
  }

  return findings
}

function checkScriptureCitation(
  post: CalendarPost,
  content: ContentPackage
): QaFinding[] {
  if (!requiresScriptureCitation(post, content)) {
    return []
  }

  if (citationPattern.test(collectPublicText(content))) {
    return []
  }

  return [
    {
      check: "scripture-citation",
      message: "A biblical citation is required but was not found in the public platform copy.",
      severity: "error"
    }
  ]
}

function checkPredigtPreview(
  post: CalendarPost,
  content: ContentPackage
): QaFinding[] {
  if (post.rubrik !== "Predigt-Preview") {
    return []
  }

  if (!content.needs_input) {
    return []
  }

  return [
    {
      check: "predigt-preview-input",
      message: "Predigt-Preview still requires sermon input before approval.",
      severity: "error"
    }
  ]
}

function flattenFindings(checks: QaCheckResult[], severity: QaSeverity): string[] {
  return checks
    .flatMap((check) => check.findings)
    .filter((finding) => finding.severity === severity)
    .map((finding) => finding.message)
}

function resolveStatusAfterQa(
  status: ContentPackage["status"],
  readyForApproval: boolean
): ContentPackage["status"] {
  if (!readyForApproval) {
    return status
  }

  if (status === "Idee" || status === "in Arbeit") {
    return "zur Prüfung"
  }

  return status
}

function collectPublicText(content: ContentPackage): string {
  return [
    content.editorial_core.title,
    content.editorial_core.main_message,
    content.platforms.facebook.headline,
    content.platforms.facebook.text,
    content.platforms.instagram.caption,
    ...content.platforms.instagram.carousel.map((card) => card.text),
    content.platforms.mastodon.text,
    ...content.platforms.story.slides.map((slide) => slide.text),
    content.platforms.reel.hook,
    content.platforms.reel.script
  ]
    .join("\n")
    .trim()
}

function requiresScriptureCitation(
  post: CalendarPost,
  content: ContentPackage
): boolean {
  if (post.liturgische_quelle) {
    return true
  }

  return /\bwochen(?:spruch)?\b/i.test(post.rubrik) || /\bwochen(?:spruch)?\b/i.test(content.editorial_core.title)
}
