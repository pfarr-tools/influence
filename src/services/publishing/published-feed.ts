import { readdir } from "node:fs/promises"
import { join, relative } from "node:path"

import type { Calendar, CalendarPost } from "../../domain/calendar.js"
import type { ContentPackage } from "../../domain/content.js"
import { pathExists, readContentPackage, readJsonFile } from "../content/content-storage.js"
import type { PublicationJob } from "./types.js"

export interface PublishedFeed {
  version: 1
  generatedAt: string
  posts: PublishedFeedPost[]
}

export interface PublishedFeedPost {
  id: string
  date: string
  weekday: string
  rubric: string
  topic: string
  title: string
  mainMessage: string
  audience: string
  tone: string[]
  altText: string
  texts: {
    facebook: { text: string; headline: string }
    instagram: { caption: string; carousel: Array<{ type: string; text: string }> }
    mastodon: { text: string }
    bluesky: { text: string }
    story: { slides: string[] }
    reel: { hook: string; script: string; shots: string[]; durationSeconds: number }
  }
  images: Array<{ path: string; url: string; altText: string }>
  publications: PublishedFeedPublication[]
}

export interface PublishedFeedPublication {
  platform: PublicationJob["platform"]
  format: string
  publishedAt: string
  text: string
  remoteId: string | null
  remoteUrl: string | null
}

/** Builds a stable, aggregated export of all successfully published posts. */
export async function buildPublishedFeed(
  calendar: Calendar,
  outputRoot: string,
  publicBaseUrl = ""
): Promise<PublishedFeed> {
  const jobs = await findPublishedJobs(outputRoot)
  const posts = await Promise.all(
    groupJobsByPost(jobs).map(async ([postId, postJobs]) => {
      const post = findCalendarPost(calendar, postId)
      if (!post) return null

      const contentPath = join(outputRoot, post.datum, post.id, "content.json")
      if (!(await pathExists(contentPath))) return null
      const content = await readContentPackage(contentPath)
      if (content.source.rubric === "Tageslosungen") return null

      return buildFeedPost(post, content, postJobs, outputRoot, publicBaseUrl)
    })
  )

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    posts: posts
      .filter((post): post is PublishedFeedPost => post !== null)
      .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))
  }
}

async function findPublishedJobs(outputRoot: string): Promise<PublicationJob[]> {
  const files = await findFiles(outputRoot, "published.json")
  const jobs: PublicationJob[] = []
  for (const file of files) {
    try {
      const value = await readJsonFile<unknown>(file)
      if (Array.isArray(value)) jobs.push(...(value as PublicationJob[]).filter((job) => job.status === "published"))
    } catch {
      // Ignore an incomplete archive file and continue exporting other posts.
    }
  }
  return jobs
}

async function findFiles(root: string, fileName: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }

  const files: string[] = []
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) files.push(...await findFiles(path, fileName))
    else if (entry.isFile() && entry.name === fileName) files.push(path)
  }
  return files
}

function groupJobsByPost(jobs: PublicationJob[]): Array<[string, PublicationJob[]]> {
  const grouped = new Map<string, PublicationJob[]>()
  for (const job of jobs) grouped.set(job.postId, [...(grouped.get(job.postId) ?? []), job])
  return [...grouped.entries()]
}

function findCalendarPost(calendar: Calendar, postId: string): CalendarPost | undefined {
  return calendar.wochen.flatMap((week) => week.beitraege).find((post) => post.id === postId)
}

function buildFeedPost(
  post: CalendarPost,
  content: ContentPackage,
  jobs: PublicationJob[],
  outputRoot: string,
  publicBaseUrl: string
): PublishedFeedPost {
  const assets = [...new Set(jobs.flatMap((job) => job.assets).concat(content.metadata.assets))]
  return {
    id: post.id,
    date: post.datum,
    weekday: post.wochentag,
    rubric: post.rubrik,
    topic: post.thema,
    title: content.editorial_core.title,
    mainMessage: content.editorial_core.main_message,
    audience: content.editorial_core.audience,
    tone: content.editorial_core.tone,
    altText: content.visual.alt_text,
    texts: {
      facebook: content.platforms.facebook,
      instagram: content.platforms.instagram,
      mastodon: content.platforms.mastodon,
      bluesky: content.platforms.bluesky,
      story: { slides: content.platforms.story.slides.map((slide) => slide.text) },
      reel: {
        hook: content.platforms.reel.hook,
        script: content.platforms.reel.script,
        shots: content.platforms.reel.shots,
        durationSeconds: content.platforms.reel.duration_seconds
      }
    },
    images: assets.map((assetPath) => ({
      path: assetPath,
      url: buildAssetUrl(publicBaseUrl, outputRoot, post, assetPath),
      altText: content.visual.alt_text
    })),
    publications: jobs
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .map((job) => ({
        platform: job.platform,
        format: job.format,
        publishedAt: job.updatedAt,
        text: job.text,
        remoteId: job.remoteId,
        remoteUrl: job.remoteUrl
      }))
  }
}

function buildAssetUrl(
  publicBaseUrl: string,
  outputRoot: string,
  post: CalendarPost,
  assetPath: string
): string {
  const base = publicBaseUrl.trim().replace(/\/+$/, "")
  const relativePath = relative(outputRoot, join(outputRoot, post.datum, post.id, assetPath))
  const encodedPath = relativePath.split("/").map(encodeURIComponent).join("/")
  return `${base}/files/${encodedPath}`
}
