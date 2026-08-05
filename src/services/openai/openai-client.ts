import OpenAI from "openai"
import { zodTextFormat } from "openai/helpers/zod"

import { contentPackageSchema } from "../content/content-schema.js"

/**
 * Small abstraction over the OpenAI Responses API for content generation.
 */
export interface ContentModelClient {
  generateContent(input: ContentModelRequest): Promise<ContentModelResponse>
}

/**
 * Request data for the content generation model call.
 */
export interface ContentModelRequest {
  developerPrompt: string
  maxOutputTokens?: number
  model: string
  userPrompt: string
}

/**
 * Result of a structured model generation call.
 */
export interface ContentModelResponse {
  model: string
  parsedContent: unknown
  rawResponse: unknown
  usage: TokenUsage
}

/**
 * Token usage emitted by the model provider.
 */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

/**
 * Creates the default OpenAI-backed content model client.
 *
 * @param apiKey OpenAI API key.
 * @returns Client using the OpenAI Responses API.
 */
export function createOpenAIContentClient(apiKey: string): ContentModelClient {
  const client = new OpenAI({ apiKey })

  return {
    async generateContent(
      input: ContentModelRequest
    ): Promise<ContentModelResponse> {
      const response = await client.responses.parse({
        model: input.model,
        instructions: input.developerPrompt,
        input: input.userPrompt,
        max_output_tokens: input.maxOutputTokens,
        text: {
          format: zodTextFormat(contentPackageSchema, "content_package"),
          verbosity: "medium"
        }
      })

      return {
        model: response.model,
        parsedContent: response.output_parsed,
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
