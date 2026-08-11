import OpenAI from "openai"

import type {
  JsonChatModelClient,
  JsonDiscussionRequest,
  JsonDiscussionResponse,
  JsonRevisionRequest,
  JsonRevisionResponse
} from "../review/content-chat-service.js"

/**
 * Creates a small OpenAI-backed client for discussion and schema-constrained JSON revisions.
 *
 * @param apiKey OpenAI API key.
 * @returns Client for natural-language discussion and structured revision requests.
 */
export function createOpenAIJsonChatClient(apiKey: string): JsonChatModelClient {
  const client = new OpenAI({ apiKey })

  return {
    async discussJson(request: JsonDiscussionRequest): Promise<JsonDiscussionResponse> {
      const response = await client.responses.create({
        model: request.model,
        instructions: request.instructions,
        input: request.input,
        text: {
          format: {
            type: "text"
          },
          verbosity: "medium"
        }
      })

      return {
        model: response.model,
        rawResponse: response,
        text: response.output_text,
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0
        }
      }
    },

    async discussJsonStream(
      request: JsonDiscussionRequest,
      onDelta: (delta: string, snapshot: string) => Promise<void> | void
    ): Promise<JsonDiscussionResponse> {
      const stream = client.responses.stream({
        model: request.model,
        instructions: request.instructions,
        input: request.input,
        text: {
          format: {
            type: "text"
          },
          verbosity: "medium"
        }
      })
      let latestSnapshot = ""

      for await (const event of stream) {
        if (event.type === "response.output_text.delta") {
          latestSnapshot += event.delta
          await onDelta(event.delta, latestSnapshot)
        }
      }

      const response = await stream.finalResponse()

      return {
        model: response.model,
        rawResponse: response,
        text: latestSnapshot || response.output_text,
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0
        }
      }
    },

    async reviseJson(request: JsonRevisionRequest): Promise<JsonRevisionResponse> {
      const response = await client.responses.create({
        model: request.model,
        instructions: request.instructions,
        input: request.input,
        text: {
          // The application performs the authoritative Zod validation and retry loop.
          // JSON mode avoids rejecting the request because the source schema contains
          // Zod-specific constraints or optional fields unsupported by strict provider schemas.
          format: { type: "json_object" },
          verbosity: "medium"
        }
      })

      return {
        model: response.model,
        parsedJson: JSON.parse(response.output_text),
        rawResponse: response,
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0
        }
      }
    },

    async reviseJsonStream(
      request: JsonRevisionRequest,
      onDelta: (delta: string, snapshot: string) => Promise<void> | void
    ): Promise<JsonRevisionResponse> {
      const stream = client.responses.stream({
        model: request.model,
        instructions: request.instructions,
        input: request.input,
        text: {
          format: { type: "json_object" },
          verbosity: "medium"
        }
      })
      let latestSnapshot = ""

      for await (const event of stream) {
        if (event.type === "response.output_text.delta") {
          latestSnapshot += event.delta
          await onDelta(event.delta, latestSnapshot)
        }
      }

      const response = await stream.finalResponse()
      const outputText = latestSnapshot || response.output_text

      return {
        model: response.model,
        parsedJson: JSON.parse(outputText),
        rawResponse: response,
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0
        }
      }
    }
  }
}
