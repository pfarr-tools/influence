import type { IncomingMessage, ServerResponse } from "node:http"

import { CalendarValidationError } from "../../../calendar/errors.js"
import {
  applyContentChatRevision,
  loadContentChatSession,
  persistDiscussionReply,
  prepareDiscussionRequest,
  requestContentChatRevision,
  startContentChatSession
} from "../../content-chat-service.js"
import {
  chatMessageRequestSchema,
  chatRevisionRequestSchema,
  chatSessionCreateRequestSchema
} from "../contracts/review-contracts.js"
import { parseJsonBody } from "../request/parse-json-body.js"
import { buildChatSessionResponse } from "../view-models/review-view-models.js"
import type { ReviewServerDependencies } from "../routes/review-routes.js"

export async function createChatSession(
  request: IncomingMessage,
  dependencies: ReviewServerDependencies
) {
  const body = chatSessionCreateRequestSchema.parse(
    await parseJsonBody(request)
  )
  const sessionInput =
    body.contextType === "post"
      ? { contextType: "post" as const, postId: body.postId ?? "" }
      : body.contextType === "week"
        ? { contextType: "week" as const, weekDate: body.weekDate ?? "" }
        : { contextType: "plan" as const, planPath: body.planPath }
  const result = await startContentChatSession(
    sessionInput,
    {
      initialPrompt: body.prompt,
      model: body.model ?? dependencies.runtimeConfig.openAiModel
    },
    {
      calendar: dependencies.calendar,
      modelClient: dependencies.chatModelClient,
      runtimeConfig: dependencies.runtimeConfig
    }
  )

  return buildChatSessionResponse(result.session)
}

export async function getChatSession(
  sessionId: string,
  dependencies: ReviewServerDependencies
) {
  const session = await loadContentChatSession(
    sessionId,
    dependencies.runtimeConfig.outputDir
  )
  return buildChatSessionResponse(session)
}

export async function sendChatMessage(
  sessionId: string,
  request: IncomingMessage,
  dependencies: ReviewServerDependencies
) {
  const body = chatMessageRequestSchema.parse(await parseJsonBody(request))
  const preparedRequest = await prepareDiscussionRequest(
    sessionId,
    body.text,
    { model: body.model ?? dependencies.runtimeConfig.openAiModel },
    {
      calendar: dependencies.calendar,
      runtimeConfig: dependencies.runtimeConfig
    }
  )
  const discussionResponse = await dependencies.chatModelClient?.discussJson(
    preparedRequest.request
  )

  if (!discussionResponse) {
    throw new CalendarValidationError(
      "OPENAI_API_KEY ist für Chat-Anfragen erforderlich."
    )
  }

  const session = await persistDiscussionReply(
    preparedRequest.session,
    preparedRequest.prompt,
    discussionResponse.text,
    {
      runtimeConfig: dependencies.runtimeConfig
    }
  )

  return buildChatSessionResponse(session)
}

export async function streamChatMessage(
  sessionId: string,
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ReviewServerDependencies
) {
  const body = chatMessageRequestSchema.parse(await parseJsonBody(request))
  const preparedRequest = await prepareDiscussionRequest(
    sessionId,
    body.text,
    { model: body.model ?? dependencies.runtimeConfig.openAiModel },
    {
      calendar: dependencies.calendar,
      runtimeConfig: dependencies.runtimeConfig
    }
  )
  const client = dependencies.chatModelClient

  if (!client) {
    throw new CalendarValidationError(
      "OPENAI_API_KEY ist für Chat-Anfragen erforderlich."
    )
  }

  response.writeHead(200, {
    "cache-control": "no-cache",
    connection: "keep-alive",
    "content-type": "application/x-ndjson; charset=utf-8"
  })

  const writeEvent = (event: Record<string, unknown>) => {
    response.write(`${JSON.stringify(event)}\n`)
  }

  try {
    const discussionResponse = client.discussJsonStream
      ? await client.discussJsonStream(preparedRequest.request, async (delta, snapshot) => {
          writeEvent({
            delta,
            snapshot,
            type: "delta"
          })
        })
      : await client.discussJson(preparedRequest.request)

    if (!client.discussJsonStream) {
      writeEvent({
        delta: discussionResponse.text,
        snapshot: discussionResponse.text,
        type: "delta"
      })
    }

    const session = await persistDiscussionReply(
      preparedRequest.session,
      preparedRequest.prompt,
      discussionResponse.text,
      {
        runtimeConfig: dependencies.runtimeConfig
      }
    )

    writeEvent({
      session: buildChatSessionResponse(session),
      type: "done"
    })
  } catch (error) {
    writeEvent({
      error: error instanceof Error ? error.message : "Unbekannter Fehler.",
      type: "error"
    })
  } finally {
    response.end()
  }
}

export async function requestChatRevision(
  sessionId: string,
  request: IncomingMessage,
  dependencies: ReviewServerDependencies
) {
  const body = chatRevisionRequestSchema.parse(await parseJsonBody(request))
  const result = await requestContentChatRevision(
    sessionId,
    {
      model: body.model ?? dependencies.runtimeConfig.openAiModel
    },
    {
      calendar: dependencies.calendar,
      modelClient: dependencies.chatModelClient,
      runtimeConfig: dependencies.runtimeConfig
    }
  )

  return buildChatSessionResponse(result.session)
}

export async function applyChatRevision(
  sessionId: string,
  dependencies: ReviewServerDependencies
) {
  const session = await applyContentChatRevision(sessionId, {
    calendar: dependencies.calendar,
    runtimeConfig: dependencies.runtimeConfig
  })

  return buildChatSessionResponse(session)
}
