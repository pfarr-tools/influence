import type { IncomingMessage, ServerResponse } from "node:http"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { URL } from "node:url"

import type { Calendar } from "../../../../domain/calendar.js"
import type { RuntimeConfig } from "../../../../config/runtime-config.js"
import { CalendarValidationError } from "../../../calendar/errors.js"
import type { ContentGeneratorDependencies } from "../../../content/content-generator.js"
import type { ImageModelClient } from "../../../image/flux-client.js"
import type { HtmlRenderClient } from "../../../render/index.js"
import type { JsonChatModelClient } from "../../content-chat-service.js"
import {
  assetUploadResponseSchema,
  chatSessionResponseSchemaPublic,
  noticeResponseSchema,
  postDetailResponseSchemaPublic,
  reviewActionSchemaPublic,
  voiceoverUploadResponseSchema,
  weekActionSchemaPublic,
  weekOverviewResponseSchemaPublic
} from "../contracts/review-contracts.js"
import {
  uploadPostAsset,
  uploadVoiceoverAsset
} from "../controllers/asset-controller.js"
import {
  applyChatRevision,
  createChatSession,
  getChatSession,
  requestChatRevision,
  streamChatMessage,
  sendChatMessage
} from "../controllers/chat-controller.js"
import {
  downloadPostExport,
  getPostDetail,
  getWeekOverview,
  moveWeekPost,
  reschedulePost,
  runPostAction,
  runWeekAction
} from "../controllers/workflow-controller.js"
import { isValidationError, respondJson } from "../responses/json-response.js"

export interface ReviewServerDependencies extends ContentGeneratorDependencies {
  calendar: Calendar
  chatModelClient?: JsonChatModelClient
  imageClient?: ImageModelClient
  pageRenderClient: HtmlRenderClient
  runtimeConfig: RuntimeConfig
}

const frontendRoot = resolve(process.cwd(), "src", "services", "review", "frontend")
let viteServerPromise: Promise<import("vite").ViteDevServer> | undefined

export async function handleReviewRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ReviewServerDependencies
): Promise<void> {
  try {
    await routeReviewRequest(request, response, dependencies)
  } catch (error) {
    const statusCode =
      error instanceof CalendarValidationError || isValidationError(error) ? 400 : 500
    const message = error instanceof Error ? error.message : "Unbekannter Fehler."

    respondJson(response, statusCode, { error: message })
  }
}

export async function closeReviewFrontendServer(): Promise<void> {
  if (!viteServerPromise) {
    return
  }

  const viteServer = await viteServerPromise
  viteServerPromise = undefined
  await viteServer.close()
}

async function routeReviewRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ReviewServerDependencies
) {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1")
  const method = request.method ?? "GET"
  const defaultDate = dependencies.calendar.wochen[0]?.zeitraum.von

  if (!defaultDate) {
    throw new CalendarValidationError("Der Kalender enthält keine Wochen.")
  }

  if (method === "GET" && requestUrl.pathname === "/api/weeks/default") {
    respondJson(response, 200, { date: defaultDate })
    return
  }

  if (method === "GET" && requestUrl.pathname.match(/^\/api\/weeks\/[^/]+$/)) {
    const weekDate = decodeURIComponent(requestUrl.pathname.replace(/^\/api\/weeks\//, ""))
    respondJson(
      response,
      200,
      await getWeekOverview(weekDate, dependencies),
      weekOverviewResponseSchemaPublic
    )
    return
  }

  if (method === "POST" && requestUrl.pathname.match(/^\/api\/weeks\/[^/]+\/actions\/[^/]+$/)) {
    const match = requestUrl.pathname.match(/^\/api\/weeks\/([^/]+)\/actions\/([^/]+)$/)
    const weekDate = decodeURIComponent(match?.[1] ?? "")
    const action = weekActionSchemaPublic.parse(match?.[2] ?? "")
    const force = parseForceSearchParam(requestUrl)
    respondJson(
      response,
      200,
      await runWeekAction(weekDate, action, dependencies, { force }),
      weekOverviewResponseSchemaPublic
    )
    return
  }

  if (method === "POST" && requestUrl.pathname.match(/^\/api\/weeks\/[^/]+\/posts$/)) {
    const weekDate = decodeURIComponent(requestUrl.pathname.replace(/^\/api\/weeks\/([^/]+)\/posts$/, "$1"))
    const { parseJsonBody } = await import("../request/parse-json-body.js")
    const { postIdeaRequestSchema } = await import("../contracts/review-contracts.js")
    const body = postIdeaRequestSchema.parse(await parseJsonBody(request))
    const { createReviewPostIdea } = await import("../controllers/workflow-controller.js")
    respondJson(response, 200, await createReviewPostIdea(weekDate, body, dependencies), weekOverviewResponseSchemaPublic)
    return
  }

  if (method === "POST" && requestUrl.pathname.match(/^\/api\/weeks\/[^/]+\/posts\/[^/]+\/move$/)) {
    const match = requestUrl.pathname.match(/^\/api\/weeks\/([^/]+)\/posts\/([^/]+)\/move$/)
    const weekDate = decodeURIComponent(match?.[1] ?? "")
    const postId = decodeURIComponent(match?.[2] ?? "")
    respondJson(
      response,
      200,
      await moveWeekPost(weekDate, postId, request, dependencies),
      weekOverviewResponseSchemaPublic
    )
    return
  }

  if (method === "GET" && requestUrl.pathname.match(/^\/api\/posts\/[^/]+$/)) {
    const postId = decodeURIComponent(requestUrl.pathname.replace(/^\/api\/posts\//, ""))
    respondJson(
      response,
      200,
      await getPostDetail(postId, dependencies),
      postDetailResponseSchemaPublic
    )
    return
  }

  if (method === "POST" && requestUrl.pathname.match(/^\/api\/posts\/[^/]+\/actions\/[^/]+$/)) {
    const match = requestUrl.pathname.match(/^\/api\/posts\/([^/]+)\/actions\/([^/]+)$/)
    const postId = decodeURIComponent(match?.[1] ?? "")
    const action = reviewActionSchemaPublic.parse(match?.[2] ?? "")
    const force = parseForceSearchParam(requestUrl)
    respondJson(
      response,
      200,
      await runPostAction(postId, action, request, dependencies, { force }),
      postDetailResponseSchemaPublic
    )
    return
  }

  if (method === "POST" && requestUrl.pathname.match(/^\/api\/posts\/[^/]+\/schedule$/)) {
    const postId = decodeURIComponent(
      requestUrl.pathname.replace(/^\/api\/posts\/([^/]+)\/schedule$/, "$1")
    )
    respondJson(
      response,
      200,
      await reschedulePost(postId, request, dependencies),
      postDetailResponseSchemaPublic
    )
    return
  }

  if (method === "POST" && requestUrl.pathname.match(/^\/api\/posts\/[^/]+\/assets$/)) {
    const postId = decodeURIComponent(
      requestUrl.pathname.replace(/^\/api\/posts\/([^/]+)\/assets$/, "$1")
    )
    respondJson(
      response,
      200,
      await uploadPostAsset(postId, request, dependencies),
      assetUploadResponseSchema
    )
    return
  }

  if (method === "DELETE" && requestUrl.pathname.match(/^\/api\/posts\/[^/]+\/assets$/)) {
    const postId = decodeURIComponent(requestUrl.pathname.replace(/^\/api\/posts\/([^/]+)\/assets$/, "$1"))
    const assetPath = requestUrl.searchParams.get("path") ?? ""
    const { deleteReviewAsset } = await import("../controllers/asset-controller.js")
    respondJson(response, 200, await deleteReviewAsset(postId, assetPath, dependencies), noticeResponseSchema)
    return
  }

  if (method === "DELETE" && requestUrl.pathname.match(/^\/api\/posts\/[^/]+$/)) {
    const postId = decodeURIComponent(requestUrl.pathname.replace(/^\/api\/posts\//, ""))
    const { deleteReviewPost } = await import("../controllers/workflow-controller.js")
    respondJson(response, 200, await deleteReviewPost(postId, dependencies), noticeResponseSchema)
    return
  }

  if (method === "POST" && requestUrl.pathname.match(/^\/api\/posts\/[^/]+\/reel-audio$/)) {
    const postId = decodeURIComponent(
      requestUrl.pathname.replace(/^\/api\/posts\/([^/]+)\/reel-audio$/, "$1")
    )
    respondJson(
      response,
      200,
      await uploadVoiceoverAsset(postId, request, dependencies),
      voiceoverUploadResponseSchema
    )
    return
  }

  if (method === "GET" && requestUrl.pathname.match(/^\/api\/posts\/[^/]+\/export$/)) {
    const postId = decodeURIComponent(
      requestUrl.pathname.replace(/^\/api\/posts\/([^/]+)\/export$/, "$1")
    )
    const result = await downloadPostExport(postId, dependencies)
    const content = await readFile(result.exportPath, "utf8")
    response.writeHead(200, {
      "content-disposition": `attachment; filename="${result.fileName}"`,
      "content-type": "application/json; charset=utf-8"
    })
    response.end(content)
    return
  }

  if (method === "POST" && requestUrl.pathname === "/api/chat/sessions") {
    respondJson(
      response,
      200,
      await createChatSession(request, dependencies),
      chatSessionResponseSchemaPublic
    )
    return
  }

  if (method === "GET" && requestUrl.pathname.match(/^\/api\/chat\/sessions\/[^/]+$/)) {
    const sessionId = decodeURIComponent(
      requestUrl.pathname.replace(/^\/api\/chat\/sessions\/([^/]+)$/, "$1")
    )
    respondJson(
      response,
      200,
      await getChatSession(sessionId, dependencies),
      chatSessionResponseSchemaPublic
    )
    return
  }

  if (method === "POST" && requestUrl.pathname.match(/^\/api\/chat\/sessions\/[^/]+\/messages$/)) {
    const sessionId = decodeURIComponent(
      requestUrl.pathname.replace(/^\/api\/chat\/sessions\/([^/]+)\/messages$/, "$1")
    )
    respondJson(
      response,
      200,
      await sendChatMessage(sessionId, request, dependencies),
      chatSessionResponseSchemaPublic
    )
    return
  }

  if (method === "POST" && requestUrl.pathname.match(/^\/api\/chat\/sessions\/[^/]+\/messages\/stream$/)) {
    const sessionId = decodeURIComponent(
      requestUrl.pathname.replace(/^\/api\/chat\/sessions\/([^/]+)\/messages\/stream$/, "$1")
    )
    await streamChatMessage(sessionId, request, response, dependencies)
    return
  }

  if (method === "POST" && requestUrl.pathname.match(/^\/api\/chat\/sessions\/[^/]+\/revise$/)) {
    const sessionId = decodeURIComponent(
      requestUrl.pathname.replace(/^\/api\/chat\/sessions\/([^/]+)\/revise$/, "$1")
    )
    respondJson(
      response,
      200,
      await requestChatRevision(sessionId, request, dependencies),
      chatSessionResponseSchemaPublic
    )
    return
  }

  if (method === "POST" && requestUrl.pathname.match(/^\/api\/chat\/sessions\/[^/]+\/apply$/)) {
    const sessionId = decodeURIComponent(
      requestUrl.pathname.replace(/^\/api\/chat\/sessions\/([^/]+)\/apply$/, "$1")
    )
    respondJson(
      response,
      200,
      await applyChatRevision(sessionId, dependencies),
      chatSessionResponseSchemaPublic
    )
    return
  }

  if (method === "GET" && requestUrl.pathname.startsWith("/files/")) {
    await serveOutputFile(
      response,
      dependencies.runtimeConfig.outputDir,
      requestUrl.pathname.replace("/files/", "")
    )
    return
  }

  await serveFrontend(request, response)
}

async function getViteServer() {
  if (!viteServerPromise) {
    viteServerPromise = (async () => {
      const { createServer } = await import("vite")
      const vuePlugin = (await import("@vitejs/plugin-vue")).default

      return createServer({
        appType: "spa",
        configFile: false,
        plugins: [vuePlugin()],
        publicDir: resolve(process.cwd(), "public"),
        root: frontendRoot,
        server: {
          middlewareMode: true
        }
      })
    })()
  }

  return viteServerPromise
}

async function serveFrontend(
  request: IncomingMessage,
  response: ServerResponse
) {
  const viteServer = await getViteServer()
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname
  const isHtmlRoute =
    pathname === "/" ||
    pathname.startsWith("/weeks/") ||
    pathname.startsWith("/posts/")

  if (isHtmlRoute) {
    const html = await readFile(resolve(frontendRoot, "index.html"), "utf8")
    const transformed = await viteServer.transformIndexHtml(pathname, html)
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
    response.end(transformed)
    return
  }

  await new Promise<void>((resolvePromise, rejectPromise) => {
    viteServer.middlewares(request, response, (error?: unknown) => {
      if (error) {
        rejectPromise(error)
        return
      }

      resolvePromise()
    })
  })

  if (!response.writableEnded) {
    respondJson(response, 404, { error: "Nicht gefunden." })
  }
}

function parseForceSearchParam(requestUrl: URL): boolean {
  return requestUrl.searchParams.get("force") === "1"
}

async function serveOutputFile(
  response: ServerResponse,
  outputRoot: string,
  relativePath: string
) {
  const filePath = resolve(outputRoot, relativePath)
  const content = await readFile(filePath)
  const extension = filePath.split(".").at(-1)?.toLowerCase()
  const contentType =
    extension === "png"
      ? "image/png"
      : extension === "jpg" || extension === "jpeg"
        ? "image/jpeg"
        : extension === "webp"
          ? "image/webp"
          : extension === "mp4"
            ? "video/mp4"
            : extension === "mp3"
              ? "audio/mpeg"
              : extension === "webm"
                ? "audio/webm"
                : "application/octet-stream"

  response.writeHead(200, { "content-type": contentType })
  response.end(content)
}
