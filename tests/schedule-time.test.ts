import { describe, expect, it } from "vitest"
import { resolveScheduleTime } from "../src/services/publishing/schedule-time.js"

describe("resolveScheduleTime", () => {
  it("resolves now to the current time as an ISO timestamp", () => {
    const now = new Date("2026-08-11T10:15:00.000Z")

    expect(resolveScheduleTime("now", now)).toBe("2026-08-11T10:15:00.000Z")
  })

  it("keeps explicit schedule timestamps unchanged", () => {
    const value = "2026-08-16T08:00:00+02:00"

    expect(resolveScheduleTime(value)).toBe(value)
  })
})
