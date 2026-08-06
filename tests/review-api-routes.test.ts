import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { loadRuntimeConfig } from "../src/config/runtime-config.js"
import { loadCalendarFromFile } from "../src/services/calendar/calendar-service.js"
import { handleReviewRequest } from "../src/services/review/server/routes/review-routes.js"

const fixturePath = join(process.cwd(), "data", "redaktionskalender-2026-2027.json")

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
