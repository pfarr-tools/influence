import { afterEach, describe, expect, it, vi } from "vitest"

import { CalendarValidationError } from "../src/services/calendar/errors.js"
import { createFluxImageClient } from "../src/services/image/flux-client.js"

describe("flux client", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("supports BFL async submit, poll, and download flow", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse({
          id: "task_123",
          polling_url: "https://api.bfl.ai/v1/get_result?id=task_123"
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          id: "task_123",
          progress: 100,
          result: {
            sample: "https://delivery.eu.bfl.ai/sample/task_123.webp"
          },
          status: "Ready"
        })
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from("image-bytes"), {
          status: 200,
          headers: {
            "content-type": "image/webp"
          }
        })
      )

    vi.stubGlobal("fetch", fetchMock)

    const client = createFluxImageClient({
      apiBaseUrl: "https://api.bfl.ai",
      apiKey: "test-key",
      generatePath: "/v1",
      pollIntervalMs: 0,
      pollTimeoutMs: 1000
    })

    const result = await client.generateImage({
      aspectRatio: "4:5",
      model: "flux-2-pro-preview",
      negativePrompt: "text, logo",
      outputFormat: "webp",
      prompt: "quiet morning table",
      seed: 42
    })

    expect(result.mimeType).toBe("image/webp")
    expect(Buffer.from(result.imageBase64, "base64").toString("utf8")).toBe("image-bytes")
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.bfl.ai/v1/flux-2-pro-preview",
      expect.objectContaining({
        method: "POST"
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.bfl.ai/v1/get_result?id=task_123",
      expect.objectContaining({
        method: "GET"
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://delivery.eu.bfl.ai/sample/task_123.webp"
    )
  })

  it("rejects missing BFL model slugs", async () => {
    const client = createFluxImageClient({
      apiBaseUrl: "https://api.bfl.ai",
      apiKey: "test-key",
      generatePath: "/v1"
    })

    await expect(
      client.generateImage({
        aspectRatio: "4:5",
        model: "",
        negativePrompt: "text, logo",
        outputFormat: "webp",
        prompt: "quiet morning table"
      })
    ).rejects.toThrow(CalendarValidationError)
  })
})

function createJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  })
}
