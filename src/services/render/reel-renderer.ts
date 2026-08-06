import { access, mkdir, writeFile } from "node:fs/promises"
import { constants } from "node:fs"
import { join, relative } from "node:path"
import { spawn } from "node:child_process"

import type { Calendar, CalendarPost } from "../../domain/calendar.js"
import { getPostById, getWeekForDate } from "../calendar/calendar-service.js"
import { CalendarValidationError } from "../calendar/errors.js"
import {
  assertContentApproved,
  getContentOutputPaths,
  pathExists,
  readContentPackage,
  writeJsonFile
} from "../content/content-storage.js"

const reelWidth = 1080
const reelHeight = 1920
const reelFps = 30

export interface ReelRenderOptions {
  audioPath?: string
  ffmpegBinary?: string
  force: boolean
  outputRoot: string
  subtitleFontName?: string
  subtitleFontsDir?: string
}

export interface ReelRenderJobResult {
  durationSeconds: number
  imagePath: string
  segmentIndex: number
  subtitleText: string
}

export interface ReelRenderResult {
  audioPath?: string
  contentPath: string
  durationSeconds: number
  postId: string
  segments: ReelRenderJobResult[]
  subtitlePath: string
  summaryPath: string
  videoPath: string
}

export interface ReelRenderDependencies {
  ffmpegRunner?: FfmpegRunner
  now?: () => Date
}

export interface FfmpegRunRequest {
  args: string[]
  binary: string
}

export interface FfmpegRunner {
  run(request: FfmpegRunRequest): Promise<void>
}

interface ReelSegment {
  durationSeconds: number
  imagePath: string
  segmentIndex: number
  subtitleText: string
}

export async function renderReelById(
  calendar: Calendar,
  postId: string,
  options: ReelRenderOptions,
  dependencies: ReelRenderDependencies = {}
): Promise<ReelRenderResult> {
  const post = getPostById(calendar, postId)
  return renderReelForCalendarPost(post, options, dependencies)
}

export async function renderReelsForWeek(
  calendar: Calendar,
  date: string,
  options: ReelRenderOptions,
  dependencies: ReelRenderDependencies = {}
): Promise<ReelRenderResult[]> {
  const week = getWeekForDate(calendar, date)
  const results: ReelRenderResult[] = []

  for (const post of week.beitraege) {
    results.push(await renderReelForCalendarPost(post, options, dependencies))
  }

  return results
}

async function renderReelForCalendarPost(
  post: CalendarPost,
  options: ReelRenderOptions,
  dependencies: ReelRenderDependencies
): Promise<ReelRenderResult> {
  const contentPaths = getContentOutputPaths(options.outputRoot, post)
  const content = await readContentPackage(contentPaths.contentPath)
  assertContentApproved(content, contentPaths.contentPath)

  const script = content.platforms.reel.script.trim()

  if (script.length === 0) {
    throw new CalendarValidationError(
      `Content package "${contentPaths.contentPath}" does not contain a reel script.`
    )
  }

  const durationSeconds = resolveReelDuration(
    content.platforms.reel.duration_seconds,
    content.platforms.reel.shots.length,
    script
  )
  const resolvedAudioPath = await resolveReelAudioPath(
    contentPaths.baseDir,
    content,
    options.audioPath
  )
  const segments = await buildReelSegments(
    contentPaths.baseDir,
    content.platforms.reel.shots,
    durationSeconds,
    script
  )
  const reelDir = join(contentPaths.baseDir, "reel")
  const videoPath = join(reelDir, "reel-1080x1920.mp4")
  const subtitlePath = join(reelDir, "reel-subtitles.srt")
  const summaryPath = join(contentPaths.baseDir, "reel-render-results.json")

  await assertWritableReelTargets(
    [videoPath, subtitlePath, summaryPath],
    options.force
  )

  await mkdir(reelDir, { recursive: true })
  await writeFile(subtitlePath, `${buildSubtitleDocument(segments)}\n`, "utf8")

  await runFfmpegForReel(
    {
      audioPath: resolvedAudioPath,
      ffmpegBinary: options.ffmpegBinary ?? "ffmpeg",
      segments,
      subtitlePath,
      subtitleFontName: options.subtitleFontName,
      subtitleFontsDir: options.subtitleFontsDir,
      videoPath
    },
    dependencies.ffmpegRunner ?? createNodeFfmpegRunner()
  )

  const now = dependencies.now ?? (() => new Date())

  await writeJsonFile(summaryPath, {
    audio_path: resolvedAudioPath
      ? relative(contentPaths.baseDir, resolvedAudioPath)
      : null,
    content_path: contentPaths.contentPath,
    duration_seconds: durationSeconds,
    generated_at: now().toISOString(),
    post_id: post.id,
    segments: segments.map((segment) => ({
      duration_seconds: segment.durationSeconds,
      image_path: relative(contentPaths.baseDir, segment.imagePath),
      segment_index: segment.segmentIndex,
      subtitle_text: segment.subtitleText
    })),
    subtitle_font_name: options.subtitleFontName ?? null,
    subtitle_fonts_dir: options.subtitleFontsDir
      ? relative(contentPaths.baseDir, options.subtitleFontsDir)
      : null,
    subtitle_path: relative(contentPaths.baseDir, subtitlePath),
    video_path: relative(contentPaths.baseDir, videoPath)
  })

  return {
    ...(resolvedAudioPath ? { audioPath: resolvedAudioPath } : {}),
    contentPath: contentPaths.contentPath,
    durationSeconds,
    postId: post.id,
    segments: segments.map((segment) => ({
      durationSeconds: segment.durationSeconds,
      imagePath: segment.imagePath,
      segmentIndex: segment.segmentIndex,
      subtitleText: segment.subtitleText
    })),
    subtitlePath,
    summaryPath,
    videoPath
  }
}

async function resolveReelAudioPath(
  baseDir: string,
  content: { metadata: { assets: string[] } },
  explicitAudioPath?: string
): Promise<string | undefined> {
  if (explicitAudioPath) {
    return explicitAudioPath
  }

  for (const assetPath of [...content.metadata.assets].reverse()) {
    if (!assetPath.startsWith("assets/reel-audio.")) {
      continue
    }

    const absolutePath = join(baseDir, assetPath)

    if (await pathExists(absolutePath)) {
      return absolutePath
    }
  }

  return undefined
}

async function buildReelSegments(
  baseDir: string,
  shots: string[],
  durationSeconds: number,
  script: string
): Promise<ReelSegment[]> {
  const imagePaths = await resolveReelImagePaths(baseDir, shots.length)
  const subtitleTexts = buildSubtitleChunks(script)
  const segmentCount = Math.max(imagePaths.length, subtitleTexts.length, 1)
  const segmentDuration = durationSeconds / segmentCount
  const segments: ReelSegment[] = []

  for (let index = 0; index < segmentCount; index += 1) {
    segments.push({
      durationSeconds: Number(segmentDuration.toFixed(3)),
      imagePath: imagePaths[Math.min(index, imagePaths.length - 1)]!,
      segmentIndex: index + 1,
      subtitleText:
        subtitleTexts[Math.min(index, subtitleTexts.length - 1)] ?? subtitleTexts[0] ?? script
    })
  }

  return segments
}

async function resolveReelImagePaths(
  baseDir: string,
  shotCount: number
): Promise<string[]> {
  const shotPaths: string[] = []

  for (let index = 0; index < shotCount; index += 1) {
    const candidate = join(baseDir, "assets", `reel-shot-${formatSequence(index + 1)}.webp`)

    if (await pathExists(candidate)) {
      shotPaths.push(candidate)
    }
  }

  if (shotPaths.length > 0) {
    return shotPaths
  }

  const fallbackPath = join(baseDir, "assets", "background-9x16.webp")

  if (!(await pathExists(fallbackPath))) {
    throw new CalendarValidationError(
      `Reel rendering requires either reel shot images or "${fallbackPath}". Run image generation first.`
    )
  }

  return [fallbackPath]
}

function resolveReelDuration(
  declaredDurationSeconds: number,
  shotCount: number,
  script: string
): number {
  if (declaredDurationSeconds > 0) {
    return declaredDurationSeconds
  }

  const sentenceCount = buildSubtitleChunks(script).length
  return Math.max(6, shotCount * 3, sentenceCount * 2)
}

function buildSubtitleChunks(script: string): string[] {
  const normalized = script
    .replace(/\s+/g, " ")
    .trim()

  if (normalized.length === 0) {
    return []
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)

  if (sentences.length <= 1) {
    return wrapSubtitleLine(normalized)
  }

  const chunks: string[] = []

  for (let index = 0; index < sentences.length; index += 2) {
    chunks.push(wrapSubtitleLine(sentences.slice(index, index + 2).join(" ")).join("\n"))
  }

  return chunks
}

function wrapSubtitleLine(text: string): string[] {
  if (text.length <= 54) {
    return [text]
  }

  const words = text.split(" ")
  const lines: string[] = []
  let currentLine = ""

  for (const word of words) {
    const candidate = currentLine.length === 0 ? word : `${currentLine} ${word}`

    if (candidate.length > 54 && currentLine.length > 0) {
      lines.push(currentLine)
      currentLine = word
      continue
    }

    currentLine = candidate
  }

  if (currentLine.length > 0) {
    lines.push(currentLine)
  }

  if (lines.length <= 2) {
    return lines
  }

  return [lines.slice(0, 2).join(" "), lines.slice(2).join(" ")]
}

function buildSubtitleDocument(segments: ReelSegment[]): string {
  let elapsed = 0

  return segments
    .map((segment, index) => {
      const start = elapsed
      const end = index === segments.length - 1 ? start + segment.durationSeconds : start + segment.durationSeconds
      elapsed = end

      return [
        String(index + 1),
        `${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}`,
        segment.subtitleText,
        ""
      ].join("\n")
    })
    .join("\n")
    .trimEnd()
}

function formatSrtTimestamp(totalSeconds: number): string {
  const totalMilliseconds = Math.max(0, Math.round(totalSeconds * 1000))
  const hours = Math.floor(totalMilliseconds / 3_600_000)
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000)
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1000)
  const milliseconds = totalMilliseconds % 1000

  return `${padNumber(hours)}:${padNumber(minutes)}:${padNumber(seconds)},${padMilliseconds(milliseconds)}`
}

function padNumber(value: number): string {
  return value.toString().padStart(2, "0")
}

function padMilliseconds(value: number): string {
  return value.toString().padStart(3, "0")
}

async function assertWritableReelTargets(
  paths: string[],
  force: boolean
): Promise<void> {
  for (const path of paths) {
    if ((await pathExists(path)) && !force) {
      throw new CalendarValidationError(
        `Reel output already exists at "${path}". Use --force to overwrite it.`
      )
    }
  }
}

async function runFfmpegForReel(
  options: {
    audioPath?: string
    ffmpegBinary: string
    segments: ReelSegment[]
    subtitlePath: string
    subtitleFontName?: string
    subtitleFontsDir?: string
    videoPath: string
  },
  runner: FfmpegRunner
): Promise<void> {
  if (options.audioPath) {
    await assertReadablePath(options.audioPath)
  }

  if (options.subtitleFontsDir) {
    await assertReadablePath(options.subtitleFontsDir)
  }

  try {
    const args = buildFfmpegArgs(
      options.segments,
      options.subtitlePath,
      options.videoPath,
      options.audioPath,
      options.subtitleFontName,
      options.subtitleFontsDir
    )

    await runner.run({
      args,
      binary: options.ffmpegBinary
    })
  } catch (error) {
    if (error instanceof CalendarValidationError) {
      throw error
    }

    throw new CalendarValidationError(
      `FFmpeg reel render failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

function buildFfmpegArgs(
  segments: ReelSegment[],
  subtitlePath: string,
  videoPath: string,
  audioPath?: string,
  subtitleFontName?: string,
  subtitleFontsDir?: string
): string[] {
  const args = ["-y"]

  for (const segment of segments) {
    args.push(
      "-loop",
      "1",
      "-t",
      segment.durationSeconds.toFixed(3),
      "-i",
      segment.imagePath
    )
  }

  if (audioPath) {
    args.push("-i", audioPath)
  }

  const filterChains = segments.map((segment, index) => {
    const frames = Math.max(1, Math.round(segment.durationSeconds * reelFps))

    return `[${index}:v]scale=${reelWidth}:${reelHeight}:force_original_aspect_ratio=increase,crop=${reelWidth}:${reelHeight},zoompan=z='min(zoom+0.0008,1.12)':d=${frames}:s=${reelWidth}x${reelHeight}:fps=${reelFps},trim=duration=${segment.durationSeconds.toFixed(3)},setpts=PTS-STARTPTS[v${index}]`
  })
  const concatInputs = segments.map((_, index) => `[v${index}]`).join("")
  filterChains.push(
    `${concatInputs}concat=n=${segments.length}:v=1:a=0[video_base]`
  )
  filterChains.push(buildSubtitleFilter(subtitlePath, subtitleFontName, subtitleFontsDir))

  args.push(
    "-filter_complex",
    filterChains.join(";"),
    "-map",
    "[video_out]"
  )

  if (audioPath) {
    args.push("-map", `${segments.length}:a:0`, "-shortest")
  }

  args.push(
    "-r",
    String(reelFps),
    "-pix_fmt",
    "yuv420p",
    "-c:v",
    "libx264"
  )

  if (audioPath) {
    args.push("-c:a", "aac", "-b:a", "192k")
  }

  args.push(videoPath)

  return args
}

function buildSubtitleFilter(
  subtitlePath: string,
  subtitleFontName?: string,
  subtitleFontsDir?: string
): string {
  const options = [`subtitles=${escapeFfmpegFilterValue(subtitlePath)}`]

  if (subtitleFontsDir && subtitleFontsDir.trim().length > 0) {
    options.push(`fontsdir=${escapeFfmpegFilterValue(subtitleFontsDir)}`)
  }

  if (subtitleFontName && subtitleFontName.trim().length > 0) {
    options.push(
      `force_style='${escapeAssStyleValue(`FontName=${subtitleFontName.trim()}`)}'`
    )
  }

  return `[video_base]${options.join(":")}[video_out]`
}

function escapeFfmpegFilterValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/]/g, "\\]")
    .replace(/,/g, "\\,")
}

function escapeAssStyleValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/,/g, "\\,")
}

async function assertReadablePath(path: string): Promise<void> {
  try {
    await access(path, constants.R_OK)
  } catch {
    throw new CalendarValidationError(`Audio file "${path}" is not readable.`)
  }
}

export function createNodeFfmpegRunner(): FfmpegRunner {
  return {
    async run(request: FfmpegRunRequest): Promise<void> {
      await new Promise<void>((resolvePromise, reject) => {
        const child = spawn(request.binary, request.args, {
          stdio: ["ignore", "pipe", "pipe"]
        })
        let stderr = ""
        let stdout = ""

        child.stdout.on("data", (chunk) => {
          stdout += chunk.toString("utf8")
        })
        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString("utf8")
        })
        child.on("error", (error) => {
          reject(error)
        })
        child.on("close", (code) => {
          if (code === 0) {
            resolvePromise()
            return
          }

          reject(
            new Error(
              [stdout.trim(), stderr.trim()]
                .filter((part) => part.length > 0)
                .join("\n")
            )
          )
        })
      })
    }
  }
}

function formatSequence(value: number): string {
  return value.toString().padStart(2, "0")
}
