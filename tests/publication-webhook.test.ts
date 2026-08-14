import { describe, expect, it, vi } from "vitest"

import { notifyPublicationWebhook } from "../src/services/publishing/publication-webhook.js"
import type { PublicationJob } from "../src/services/publishing/types.js"

describe("publication webhook", () => {
  it("posts published jobs with bearer authentication", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
    const job = { id: "job-1", postId: "post-1", status: "published" } as PublicationJob

    await notifyPublicationWebhook("https://example.test/hook", "secret", [job], fetchImpl)

    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/hook", expect.objectContaining({
      method: "POST",
      headers: {
        authorization: "Bearer secret",
        "content-type": "application/json"
      },
      body: JSON.stringify({ event: "publication.completed", jobs: [job] })
    }))
  })

  it("throws when the webhook responds unsuccessfully", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 500 }))

    await expect(notifyPublicationWebhook("https://example.test/hook", "secret", [], fetchImpl)).rejects.toThrow("HTTP 500")
  })
})
