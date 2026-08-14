import { mkdtemp, rm, mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { loadRuntimeConfig } from "../src/config/runtime-config.js"
import { loadCalendarFromFile } from "../src/services/calendar/calendar-service.js"
import { handleReviewRequest } from "../src/services/review/server/routes/review-routes.js"

const fixturePath = join(process.cwd(), "content", "content-plan.json")

describe("review api routes", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "director-review-api-"))
  })

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true })
  })

  it("serves the default week endpoint and week overview JSON", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const runtimeConfig = {
      ...loadRuntimeConfig(),
      outputDir: tempDir
    }
    const dependencies = {
      calendar,
      pageRenderClient: {
        async renderHtmlDocument() {
          return { overflowRegions: [] }
        }
      },
      runtimeConfig
    }

    const defaultWeekResponse = createMockResponse()
    await handleReviewRequest(
      { method: "GET", url: "/api/weeks/default" } as never,
      defaultWeekResponse as never,
      dependencies
    )
    const defaultWeek = JSON.parse(defaultWeekResponse.body) as { date: string }

    const overviewResponse = createMockResponse()
    await handleReviewRequest(
      { method: "GET", url: `/api/weeks/${defaultWeek.date}` } as never,
      overviewResponse as never,
      dependencies
    )
    const overview = JSON.parse(overviewResponse.body) as {
      selectedWeek: { startDate: string }
      weekActions: Array<{ action: string }>
    }

    expect(defaultWeek.date).toBe("2026-08-10")
    expect(overview.selectedWeek.startDate).toBe(defaultWeek.date)
    expect(overview.weekActions[0]?.action).toBe("scaffold")
  })

  it("serves published posts as an aggregated feed", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const post = calendar.wochen[0]!.beitraege[0]!
    const postDir = join(tempDir, post.datum, post.id)
    await mkdir(join(postDir, "assets"), { recursive: true })
    await writeFile(join(postDir, "assets", "image.webp"), "image")
    await writeFile(join(postDir, "content.json"), JSON.stringify({
      id: post.id, status: "veröffentlicht", needs_input: false,
      source: { calendar_post_id: post.id, date: post.datum, rubric: post.rubrik, liturgical_source: "" },
      editorial_core: { title: "Test title", main_message: "Main message", audience: "Everyone", tone: ["warm"], source_notes: [] },
      platforms: { facebook: { text: "Facebook", headline: "Headline" }, instagram: { caption: "Instagram", carousel: [] }, mastodon: { text: "Mastodon" }, bluesky: { text: "Bluesky" }, story: { slides: [] }, reel: { hook: "Hook", script: "Script", shots: [], duration_seconds: 0 } },
      visual: { concept: "Concept", flux_prompt: "Prompt", negative_prompt: "None", formats: ["4x5"], alt_text: "Alt text" },
      qa: { warnings: [], approved: true }, metadata: { model: "test", generated_at: "2026-08-10T00:00:00Z", prompt_version: "test", assets: ["assets/image.webp"] }
    }))
    await writeFile(join(postDir, "published.json"), JSON.stringify([{ postId: post.id, contentDate: post.datum, platform: "instagram", format: "default", status: "published", updatedAt: "2026-08-10T12:00:00Z", text: "Published", assets: ["assets/image.webp"], remoteId: "remote-1", remoteUrl: "https://example.test/post" }]))

    const response = createMockResponse()
    await handleReviewRequest({ method: "GET", url: "/api/feed/published.json" } as never, response as never, {
      calendar,
      pageRenderClient: { async renderHtmlDocument() { return { overflowRegions: [] } } },
      runtimeConfig: { ...loadRuntimeConfig(), outputDir: tempDir, publicBaseUrl: "https://influence.example" }
    })
    const feed = JSON.parse(response.body) as { posts: Array<{ id: string; images: Array<{ url: string }>; publications: Array<{ platform: string }> }> }
    expect(response.statusCode).toBe(200)
    expect(feed.posts[0]?.id).toBe(post.id)
    expect(feed.posts[0]?.images[0]?.url).toBe(`https://influence.example/files/${post.datum}/${post.id}/assets/image.webp`)
    expect(feed.posts[0]?.publications[0]?.platform).toBe("instagram")
  })

  it("reloads the calendar so newly created prayer posts appear without restart", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const calendarPath = join(tempDir, "content-plan.json")
    await writeFile(calendarPath, await readFile(fixturePath, "utf8"))
    const runtimeConfig = {
      ...loadRuntimeConfig(),
      calendarPath,
      outputDir: tempDir
    }
    const dependencies = {
      calendar,
      pageRenderClient: { async renderHtmlDocument() { return { overflowRegions: [] } } },
      runtimeConfig
    }

    const firstResponse = createMockResponse()
    await handleReviewRequest({ method: "GET", url: "/api/weeks/2026-08-10" } as never, firstResponse as never, dependencies)

    const updatedCalendar = await loadCalendarFromFile(calendarPath)
    const sourcePost = updatedCalendar.wochen[0]!.beitraege[0]!
    updatedCalendar.wochen[0]!.beitraege.push({
      ...sourcePost,
      id: "prayer-morning-2026-08-15",
      rubrik: "Morgengebet",
      thema: "Morgengebet"
    })
    await writeFile(calendarPath, `${JSON.stringify(updatedCalendar, null, 2)}\n`)

    const secondResponse = createMockResponse()
    await handleReviewRequest({ method: "GET", url: "/api/weeks/2026-08-10" } as never, secondResponse as never, dependencies)
    const overview = JSON.parse(secondResponse.body) as {
      selectedWeek: { posts: Array<{ postId: string }> }
    }

    expect(overview.selectedWeek.posts.some((post) => post.postId === "prayer-morning-2026-08-15")).toBe(true)
  })
})

function createMockResponse() {
  return {
    body: "",
    headers: {} as Record<string, string>,
    statusCode: 200,
    writableEnded: false,
    end(chunk?: string) {
      this.body = chunk ?? ""
      this.writableEnded = true
      return this
    },
    writeHead(statusCode: number, headers: Record<string, string>) {
      this.statusCode = statusCode
      this.headers = headers
      return this
    }
  }
}
