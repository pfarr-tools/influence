import { describe, expect, it } from "vitest"

import { limitSocialText } from "../src/services/publishing/text-utils.js"

describe("limitSocialText", () => {
  it("shortens text to 300 graphemes and appends an ellipsis", () => {
    const text = "ä".repeat(300) + " Ende"

    expect(limitSocialText(text)).toBe("ä".repeat(297) + "...")
    expect([...limitSocialText(text)]).toHaveLength(300)
  })

  it("keeps text at or below the limit unchanged", () => {
    const text = "ä".repeat(300)

    expect(limitSocialText(text)).toBe(text)
  })
})
