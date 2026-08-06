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
          format: {
            type: "json_schema",
            name: request.schemaName,
            strict: true,
            schema: request.schema
          },
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
    }
  }
}
