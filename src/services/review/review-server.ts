import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { readFile } from "node:fs/promises"
import { extname, resolve } from "node:path"
import { Readable } from "node:stream"
import { URL } from "node:url"

import type { Calendar } from "../../domain/calendar.js"
import type { RuntimeConfig } from "../../config/runtime-config.js"
import { getWeekForDate } from "../calendar/calendar-service.js"
import { CalendarValidationError } from "../calendar/errors.js"
import { scaffoldPostById, scaffoldWeekByDate } from "../content/content-scaffolder.js"
import type { ContentGeneratorDependencies } from "../content/content-generator.js"
import { generateContentForWeek } from "../content/content-generator.js"
import { runQaForPost, runQaForWeek } from "../content/content-qa.js"
import type { ImageModelClient } from "../image/flux-client.js"
import {
  generateImagesForPost,
  generateImagesForWeek,
  generateReelImagesForPost,
  generateReelImagesForWeek
} from "../image/image-generator.js"
import type { HtmlRenderClient } from "../render/index.js"
import {
  renderPostById,
  renderReelById,
  renderReelsForWeek,
  renderWeekByDate
} from "../render/index.js"
import {
  approveReviewPost,
  exportReviewPost,
  loadReviewPost,
  loadReviewWeek,
  regenerateReviewPost,
  storeReviewReelAudioAsset,
  updateReviewPost
} from "./review-service.js"

const bootstrapCssHref =
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
const bootstrapJsHref =
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"

export interface ReviewServerDependencies extends ContentGeneratorDependencies {
  calendar: Calendar
  imageClient?: ImageModelClient
  pageRenderClient: HtmlRenderClient
  runtimeConfig: RuntimeConfig
}

interface ParsedFormBody {
  get(name: string): string
  getAll(name: string): string[]
  getFile(name: string): ParsedUploadedFile | undefined
}

interface ParsedUploadedFile {
  buffer: Buffer
  fileName: string
  mimeType: string
}

export function createReviewServer(dependencies: ReviewServerDependencies) {
  return createServer(async (request, response) => {
    try {
      await routeRequest(request, response, dependencies)
    } catch (error) {
      const statusCode = error instanceof CalendarValidationError ? 400 : 500
      const message = error instanceof Error ? error.message : "Unknown error"

      response.writeHead(statusCode, { "content-type": "text/html; charset=utf-8" })
      response.end(renderDocument("Review-Fehler", renderAlert("danger", message)))
    }
  })
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ReviewServerDependencies
): Promise<void> {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1")
  const method = request.method ?? "GET"
  const defaultDate = dependencies.calendar.wochen[0]?.zeitraum.von

  if (!defaultDate) {
    throw new CalendarValidationError("The calendar does not contain any weeks.")
  }

  if (method === "GET" && requestUrl.pathname === "/") {
    redirect(response, `/weeks/${requestUrl.searchParams.get("date") ?? defaultDate}`)
    return
  }

  if (method === "GET" && requestUrl.pathname.startsWith("/weeks/")) {
    const date = decodeURIComponent(requestUrl.pathname.replace("/weeks/", ""))
    const overview = await loadReviewWeek(
      dependencies.calendar,
      date,
      dependencies.runtimeConfig.outputDir
    )

    respondHtml(
      response,
      renderWeekPage(
        overview,
        requestUrl.searchParams.get("notice"),
        requestUrl.searchParams.get("error")
      )
    )
    return
  }

  if (method === "POST" && requestUrl.pathname.startsWith("/weeks/")) {
    const actionMatch = requestUrl.pathname.match(
      /^\/weeks\/([^/]+)\/(scaffold|generate|qa|images|images-reel|render|render-reel)$/
    )

    if (actionMatch) {
      const date = decodeURIComponent(actionMatch[1] ?? "")
      const action = actionMatch[2]

      if (action === "scaffold") {
        await scaffoldWeekByDate(
          dependencies.calendar,
          date,
          dependencies.runtimeConfig.outputDir
        )
        redirect(
          response,
          `/weeks/${encodeURIComponent(date)}?notice=${encodeURIComponent("Wochen-Gerüste erstellt.")}`
        )
        return
      }

      if (action === "generate") {
        await generateContentForWeek(
          dependencies.calendar,
          date,
          {
            dryRun: false,
            force: true,
            language: "de",
            model: dependencies.runtimeConfig.openAiModel,
            outputRoot: dependencies.runtimeConfig.outputDir
          },
          dependencies
        )
        redirect(
          response,
          `/weeks/${encodeURIComponent(date)}?notice=${encodeURIComponent("Wocheninhalte generiert.")}`
        )
        return
      }

      if (action === "qa") {
        await runQaForWeek(
          dependencies.calendar,
          date,
          dependencies.runtimeConfig.outputDir
        )
        redirect(
          response,
          `/weeks/${encodeURIComponent(date)}?notice=${encodeURIComponent("Wochen-QA ausgeführt.")}`
        )
        return
      }

      if (action === "images") {
        await generateImagesForWeek(
          dependencies.calendar,
          date,
          {
            dryRun: false,
            force: true,
            model: dependencies.runtimeConfig.fluxModel,
            outputRoot: dependencies.runtimeConfig.outputDir
          },
          {
            imageClient: dependencies.imageClient
          }
        )
        redirect(
          response,
          `/weeks/${encodeURIComponent(date)}?notice=${encodeURIComponent("Wochen-Bildgenerierung ausgeführt.")}`
        )
        return
      }

      if (action === "images-reel") {
        await generateReelImagesForWeek(
          dependencies.calendar,
          date,
          {
            dryRun: false,
            force: true,
            model: dependencies.runtimeConfig.fluxModel,
            outputRoot: dependencies.runtimeConfig.outputDir
          },
          {
            imageClient: dependencies.imageClient
          }
        )
        redirect(
          response,
          `/weeks/${encodeURIComponent(date)}?notice=${encodeURIComponent("Wochen-Reelbilder generiert.")}`
        )
        return
      }

      if (action === "render-reel") {
        await renderReelsForWeek(
          dependencies.calendar,
          date,
          {
            force: true,
            outputRoot: dependencies.runtimeConfig.outputDir,
            subtitleFontName: dependencies.runtimeConfig.reelSubtitleFontName,
            subtitleFontsDir:
              dependencies.runtimeConfig.reelSubtitleFontsDir || undefined
          }
        )
        redirect(
          response,
          `/weeks/${encodeURIComponent(date)}?notice=${encodeURIComponent("Wochen-Reels gerendert.")}`
        )
        return
      }

      await renderWeekByDate(
        dependencies.calendar,
        date,
        {
          force: true,
          outputRoot: dependencies.runtimeConfig.outputDir
        },
        {
          pageRenderClient: dependencies.pageRenderClient
        }
      )
      redirect(
        response,
        `/weeks/${encodeURIComponent(date)}?notice=${encodeURIComponent("Wochen-Rendering ausgeführt.")}`
      )
      return
    }

    redirect(response, `/?error=${encodeURIComponent("Nicht unterstützte Wochen-Aktion.")}`)
    return
  }

  if (method === "GET" && requestUrl.pathname.startsWith("/posts/")) {
    const postId = decodeURIComponent(requestUrl.pathname.replace("/posts/", ""))
    const detail = await loadReviewPost(
      dependencies.calendar,
      postId,
      dependencies.runtimeConfig.outputDir
    )
    const week = getWeekForDate(dependencies.calendar, detail.post.datum)

    respondHtml(
      response,
      renderPostPage(
        detail,
        week.zeitraum.von,
        requestUrl.searchParams.get("notice"),
        requestUrl.searchParams.get("error"),
        {
          reelSubtitleFontName: dependencies.runtimeConfig.reelSubtitleFontName,
          reelSubtitleFontsDir: dependencies.runtimeConfig.reelSubtitleFontsDir
        }
      )
    )
    return
  }

  if (method === "POST" && requestUrl.pathname.startsWith("/posts/")) {
    const actionMatch = requestUrl.pathname.match(
      /^\/posts\/([^/]+)\/(scaffold|generate|edit|qa|images|images-reel|render|render-reel|render-reel-rerun|approve)$/
    )

    if (actionMatch) {
      const postId = decodeURIComponent(actionMatch[1] ?? "")
      const action = actionMatch[2]

      if (action === "scaffold") {
        await scaffoldPostById(
          dependencies.calendar,
          postId,
          dependencies.runtimeConfig.outputDir
        )
        redirectToPostOrWeek(
          response,
          dependencies,
          postId,
          "Beitragsgerüst erstellt."
        )
        return
      }

      if (action === "generate") {
        await regenerateReviewPost(
          dependencies.calendar,
          postId,
          {
            dryRun: false,
            force: true,
            language: "de",
            model: dependencies.runtimeConfig.openAiModel,
            outputRoot: dependencies.runtimeConfig.outputDir
          },
          dependencies
        )
        redirectToPostOrWeek(
          response,
          dependencies,
          postId,
          "Inhalt generiert."
        )
        return
      }

      if (action === "edit") {
        const form = await parseFormBody(request)

        await updateReviewPost(dependencies.calendar, postId, dependencies.runtimeConfig.outputDir, {
          altText: form.get("alt_text"),
          audience: form.get("audience"),
          concept: form.get("concept"),
          facebookHeadline: form.get("facebook_headline"),
          facebookText: form.get("facebook_text"),
          fluxPrompt: form.get("flux_prompt"),
          instagramCaption: form.get("instagram_caption"),
          mainMessage: form.get("main_message"),
          mastodonText: form.get("mastodon_text"),
          reelHook: form.get("reel_hook"),
          reelScript: form.get("reel_script"),
          storySlides: form.getAll("story_slides"),
          title: form.get("title")
        })

        redirect(
          response,
          `/posts/${encodeURIComponent(postId)}?notice=${encodeURIComponent("Inhalt gespeichert. Die QA-Freigabe wurde zurückgesetzt.")}`
        )
        return
      }

      if (action === "qa") {
        await runQaForPost(
          dependencies.calendar,
          postId,
          dependencies.runtimeConfig.outputDir
        )
        redirect(
          response,
          `/posts/${encodeURIComponent(postId)}?notice=${encodeURIComponent("QA ausgeführt.")}`
        )
        return
      }

      if (action === "images") {
        await generateImagesForPost(
          dependencies.calendar,
          postId,
          {
            dryRun: false,
            force: true,
            model: dependencies.runtimeConfig.fluxModel,
            outputRoot: dependencies.runtimeConfig.outputDir
          },
          {
            imageClient: dependencies.imageClient
          }
        )
        redirect(
          response,
          `/posts/${encodeURIComponent(postId)}?notice=${encodeURIComponent("Bildgenerierung ausgeführt.")}`
        )
        return
      }

      if (action === "images-reel") {
        await generateReelImagesForPost(
          dependencies.calendar,
          postId,
          {
            dryRun: false,
            force: true,
            model: dependencies.runtimeConfig.fluxModel,
            outputRoot: dependencies.runtimeConfig.outputDir
          },
          {
            imageClient: dependencies.imageClient
          }
        )
        redirect(
          response,
          `/posts/${encodeURIComponent(postId)}?notice=${encodeURIComponent("Reelbilder generiert.")}`
        )
        return
      }

      if (action === "render") {
        await renderPostById(
          dependencies.calendar,
          postId,
          {
            force: true,
            outputRoot: dependencies.runtimeConfig.outputDir
          },
          {
            pageRenderClient: dependencies.pageRenderClient
          }
        )
        redirect(
          response,
          `/posts/${encodeURIComponent(postId)}?notice=${encodeURIComponent("Rendering ausgeführt.")}`
        )
        return
      }

      if (action === "render-reel" || action === "render-reel-rerun") {
        const form = await parseFormBody(request)
        const uploadedAudio = form.getFile("audio_upload")
        const audioPath = uploadedAudio
          ? await storeReviewReelAudioAsset(
              dependencies.calendar,
              postId,
              dependencies.runtimeConfig.outputDir,
              uploadedAudio
            )
          : undefined

        await renderReelById(
          dependencies.calendar,
          postId,
          {
            audioPath,
            ffmpegBinary: dependencies.runtimeConfig.ffmpegBinary,
            force: true,
            outputRoot: dependencies.runtimeConfig.outputDir,
            subtitleFontName: dependencies.runtimeConfig.reelSubtitleFontName,
            subtitleFontsDir:
              dependencies.runtimeConfig.reelSubtitleFontsDir || undefined
          }
        )
        redirect(
          response,
          `/posts/${encodeURIComponent(postId)}?notice=${encodeURIComponent(
            action === "render-reel-rerun"
              ? "Reel erneut gerendert."
              : "Reel gerendert."
          )}`
        )
        return
      }

      if (action === "approve") {
        await approveReviewPost(
          dependencies.calendar,
          postId,
          dependencies.runtimeConfig.outputDir
        )
        redirect(
          response,
          `/posts/${encodeURIComponent(postId)}?notice=${encodeURIComponent("Beitrag freigegeben.")}`
        )
        return
      }

    }

    if (requestUrl.pathname.match(/^\/posts\/[^/]+\/export$/)) {
      const postId = decodeURIComponent(
        requestUrl.pathname.replace(/^\/posts\/([^/]+)\/export$/, "$1")
      )
      const result = await exportReviewPost(
        dependencies.calendar,
        postId,
        dependencies.runtimeConfig.outputDir
      )
      const content = await readFile(result.exportPath, "utf8")

      response.writeHead(200, {
        "content-disposition": `attachment; filename="${result.fileName}"`,
        "content-type": "application/json; charset=utf-8"
      })
      response.end(content)
      return
    }

    redirectToPostError(response, requestUrl.pathname, "Nicht unterstützte Review-Aktion.")
    return
  }

  if (method === "GET" && requestUrl.pathname.startsWith("/files/")) {
    await serveLocalFile(
      response,
      dependencies.runtimeConfig.outputDir,
      requestUrl.pathname.replace("/files/", "")
    )
    return
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
  response.end("Nicht gefunden")
}

async function parseFormBody(
  request: IncomingMessage
): Promise<ParsedFormBody> {
  const webRequest = new Request("http://127.0.0.1/", {
    body: Readable.toWeb(request) as BodyInit,
    headers: request.headers as HeadersInit,
    method: request.method
  } as RequestInit & { duplex: "half" })
  const formData = await webRequest.formData()
  const values = new Map<string, string[]>()
  const files = new Map<string, ParsedUploadedFile>()

  for (const [name, value] of formData.entries()) {
    if (typeof value === "string") {
      values.set(name, [...(values.get(name) ?? []), value.trim()])
      continue
    }

    if (value.size === 0) {
      continue
    }

    files.set(name, {
      buffer: Buffer.from(await value.arrayBuffer()),
      fileName: value.name,
      mimeType: value.type
    })
  }

  return {
    get: (name: string) => values.get(name)?.[0] ?? "",
    getAll: (name: string) => values.get(name) ?? [],
    getFile: (name: string) => files.get(name)
  }
}

function renderWeekPage(
  overview: Awaited<ReturnType<typeof loadReviewWeek>>,
  notice: string | null,
  error: string | null
): string {
  return renderDocument(
    `${overview.selectedWeek.id} · pfarr.media director`,
    `
      ${renderLayoutHeader("Wochenansicht", "Lokale Workflow-Oberfläche für Planung, Generierung, Prüfung und Export")}
      <div class="container py-4">
        ${renderFlash(notice, error)}
        <div class="row g-4">
          <div class="col-lg-3">
            <div class="card shadow-sm">
              <div class="card-body">
                <h2 class="h5">Wochen</h2>
                <div class="list-group list-group-flush">
                  ${overview.weekOptions
                    .map(
                      (week) => `
                        <a class="list-group-item list-group-item-action ${
                          week.id === overview.selectedWeek.id ? "active" : ""
                        }" href="/weeks/${escapeHtml(week.startDate)}">
                          <strong>${escapeHtml(week.id)}</strong><br>
                          <small>${escapeHtml(formatWeekRangeLabel(week.startDate, week.endDate))}</small>
                        </a>
                      `
                    )
                    .join("")}
                </div>
              </div>
            </div>
          </div>
          <div class="col-lg-9">
            <div class="card shadow-sm mb-4">
              <div class="card-body">
                <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
                  <div>
                    <h1 class="h3 mb-2">${escapeHtml(formatWeekTitle(overview.selectedWeek.startDate))}</h1>
                    <p class="text-body-secondary mb-1">${escapeHtml(formatWeekRangeLabel(
                      overview.selectedWeek.startDate,
                      overview.selectedWeek.endDate
                    ))}</p>
                    <p class="mb-0">${escapeHtml(overview.selectedWeek.focus)}</p>
                  </div>
                  <div class="d-flex flex-wrap gap-2">
                    ${renderWeekActionForm(overview.selectedWeek.startDate, "scaffold", "Woche Gerüst", "outline-secondary")}
                    ${renderWeekActionForm(overview.selectedWeek.startDate, "generate", "Woche Inhalt", "outline-secondary")}
                    ${renderWeekActionForm(overview.selectedWeek.startDate, "qa", "Woche QA", "outline-secondary")}
                    ${renderWeekActionForm(overview.selectedWeek.startDate, "images", "Woche Bilder", "outline-secondary")}
                    ${renderWeekActionForm(overview.selectedWeek.startDate, "images-reel", "Woche Reelbilder", "outline-secondary")}
                    ${renderWeekActionForm(overview.selectedWeek.startDate, "render", "Woche Render", "outline-secondary")}
                    ${renderWeekActionForm(overview.selectedWeek.startDate, "render-reel", "Woche Reels", "outline-secondary")}
                  </div>
                </div>
              </div>
            </div>
            <div class="row g-3">
              ${overview.selectedWeek.posts
                .map(
                  (post) => `
                    <div class="col-md-6">
                      <div class="card h-100 shadow-sm border-${resolveStatusTone(post.status)}">
                        <div class="card-body">
                          <div class="d-flex justify-content-between gap-3 mb-2">
                            <div>
                              <div class="text-body-secondary small">${escapeHtml(formatGermanDate(post.date))} · ${escapeHtml(
                                post.weekday
                              )}</div>
                              <h2 class="h5 mb-1">${escapeHtml(post.theme)}</h2>
                            </div>
                            <span class="badge text-bg-${resolveStatusTone(post.status)} align-self-start">${escapeHtml(
                              post.status
                            )}</span>
                          </div>
                          <p class="mb-2"><strong>${escapeHtml(post.postId)}</strong> · ${escapeHtml(
                            post.rubric
                          )}</p>
                          <div class="d-flex flex-wrap gap-2 mb-3">
                            ${renderWorkflowBadge("Gerüst", post.workflow.scaffolded)}
                            ${renderWorkflowBadge("Inhalt", post.workflow.contentGenerated)}
                            ${renderWorkflowBadge("QA", post.workflow.qaRun)}
                            ${renderWorkflowBadge("Bilder", post.workflow.imagesGenerated)}
                            ${renderWorkflowBadge("Reelbilder", post.workflow.reelImagesGenerated)}
                            ${renderWorkflowBadge("Render", post.workflow.rendered)}
                            ${renderWorkflowBadge("Reel", post.workflow.reelRendered)}
                            ${renderWorkflowBadge("Freigabe", post.isApproved)}
                            ${renderWorkflowBadge("Export", post.workflow.exportGenerated)}
                          </div>
                          <div class="d-flex flex-wrap gap-2">
                            ${renderPostActionForm(post.postId, "scaffold", "Gerüst", "outline-secondary")}
                            ${renderPostActionForm(post.postId, "generate", "Inhalt", "outline-secondary")}
                            ${renderPostActionForm(post.postId, "qa", "QA", "outline-secondary", !post.contentExists)}
                            ${renderPostActionForm(post.postId, "images", "Bilder", "outline-secondary", !post.contentExists)}
                            ${renderPostActionForm(post.postId, "images-reel", "Reelbilder", "outline-secondary", !post.contentExists)}
                            ${renderPostActionForm(post.postId, "render", "Render", "outline-secondary", !post.contentExists)}
                            ${renderPostActionForm(post.postId, "render-reel", "Reel", "outline-secondary", !post.contentExists)}
                            ${
                              post.contentExists
                                ? `<a class="btn btn-outline-primary btn-sm" href="/posts/${escapeHtml(post.postId)}">Öffnen</a>`
                                : ""
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                  `
                )
                .join("")}
            </div>
          </div>
        </div>
      </div>
    `
  )
}

function renderPostPage(
  detail: Awaited<ReturnType<typeof loadReviewPost>>,
  weekDate: string,
  notice: string | null,
  error: string | null,
  defaults: {
    reelSubtitleFontName: string
    reelSubtitleFontsDir: string
  }
): string {
  const allPreviewPaths = Array.from(
    new Set([...detail.imagePreviewPaths, ...detail.renderPreviewPaths])
  )

  return renderDocument(
    `${detail.post.id} · pfarr.media director`,
    `
      ${renderLayoutHeader("Beitragsreview", `${escapeHtml(detail.post.id)} · ${escapeHtml(detail.post.rubrik)}`)}
      <div class="container py-4">
        ${renderFlash(notice, error)}
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
          <div>
            <a class="link-secondary" href="/weeks/${escapeHtml(weekDate)}">Zur Wochenansicht</a>
            <h1 class="h3 mt-2 mb-1">${escapeHtml(detail.content.editorial_core.title)}</h1>
            <p class="text-body-secondary mb-0">${escapeHtml(formatGermanDate(detail.post.datum))} · ${escapeHtml(
              detail.post.wochentag
            )} · <span class="badge text-bg-${resolveStatusTone(detail.content.status)}">${escapeHtml(
              detail.content.status
            )}</span></p>
          </div>
          <div class="d-flex flex-wrap gap-2">
            ${renderPostActionForm(detail.post.id, "generate", "Inhalt generieren", "outline-secondary")}
            ${renderPostActionForm(detail.post.id, "qa", "QA ausführen", "outline-secondary")}
            ${renderPostActionForm(detail.post.id, "images", "Bilder generieren", "outline-secondary")}
            ${renderPostActionForm(detail.post.id, "images-reel", "Reelbilder generieren", "outline-secondary")}
            ${renderPostActionForm(detail.post.id, "render", "Rendern", "outline-secondary")}
            ${renderModalActionButton("reelRenderModal", "Reel rendern", "outline-secondary")}
            ${renderModalActionButton("reelRerenderModal", "Reel erneut rendern", "outline-secondary")}
            ${renderPostActionForm(
              detail.post.id,
              "approve",
              "Freigeben",
              "success",
              !detail.qaSummary?.ready_for_approval
            )}
            <form method="post" action="/posts/${escapeHtml(detail.post.id)}/export">
              <button class="btn btn-primary" type="submit">Exportieren</button>
            </form>
          </div>
        </div>
        <div class="row g-4">
          <div class="col-xl-7">
            <div class="card shadow-sm mb-4">
              <div class="card-body">
                <h2 class="h4 mb-3">Workflow</h2>
                <div class="d-flex flex-wrap gap-2">
                  ${renderWorkflowBadge("Gerüst", detail.workflow.scaffolded)}
                  ${renderWorkflowBadge("Inhalt", detail.workflow.contentGenerated)}
                  ${renderWorkflowBadge("QA", detail.workflow.qaRun)}
                  ${renderWorkflowBadge("QA bereit", detail.workflow.qaReadyForApproval)}
                  ${renderWorkflowBadge("Bilder", detail.workflow.imagesGenerated)}
                  ${renderWorkflowBadge("Reelbilder", detail.workflow.reelImagesGenerated)}
                  ${renderWorkflowBadge("Render", detail.workflow.rendered)}
                  ${renderWorkflowBadge("Reel", detail.workflow.reelRendered)}
                  ${renderWorkflowBadge("Freigabe", detail.content.qa.approved)}
                  ${renderWorkflowBadge("Export", detail.workflow.exportGenerated)}
                </div>
              </div>
            </div>
            <div class="card shadow-sm mb-4">
              <div class="card-body">
                <h2 class="h4 mb-3">Bearbeiten</h2>
                <form method="post" action="/posts/${escapeHtml(detail.post.id)}/edit">
                  ${renderTextInput("Titel", "title", detail.content.editorial_core.title)}
                  ${renderTextarea("Kernbotschaft", "main_message", detail.content.editorial_core.main_message, 3)}
                  ${renderTextarea("Zielgruppe", "audience", detail.content.editorial_core.audience, 2)}
                  ${renderTextarea("Facebook Headline", "facebook_headline", detail.content.platforms.facebook.headline, 2)}
                  ${renderTextarea("Facebook Text", "facebook_text", detail.content.platforms.facebook.text, 6)}
                  ${renderTextarea("Instagram Caption", "instagram_caption", detail.content.platforms.instagram.caption, 6)}
                  ${renderTextarea("Mastodon Text", "mastodon_text", detail.content.platforms.mastodon.text, 4)}
                  ${detail.content.platforms.story.slides
                    .map((slide, index) =>
                      renderTextarea(`Story Slide ${index + 1}`, "story_slides", slide.text, 2)
                    )
                    .join("")}
                  ${renderTextarea("Reel Hook", "reel_hook", detail.content.platforms.reel.hook, 2)}
                  ${renderTextarea("Reel Script", "reel_script", detail.content.platforms.reel.script, 5)}
                  ${renderTextarea("Bildkonzept", "concept", detail.content.visual.concept, 3)}
                  ${renderTextarea("Flux Prompt", "flux_prompt", detail.content.visual.flux_prompt, 5)}
                  ${renderTextarea("Alt-Text", "alt_text", detail.content.visual.alt_text, 3)}
                  <button class="btn btn-primary" type="submit">Änderungen speichern</button>
                </form>
              </div>
            </div>
            <div class="card shadow-sm">
              <div class="card-body">
                <h2 class="h4 mb-3">Plattformvorschau</h2>
                ${renderPlatformPreview("Facebook", detail.content.platforms.facebook.headline, detail.content.platforms.facebook.text)}
                ${renderPlatformPreview("Instagram", "", detail.content.platforms.instagram.caption)}
                ${renderPlatformPreview("Mastodon", "", detail.content.platforms.mastodon.text)}
                ${renderPlatformPreview("Reel", detail.content.platforms.reel.hook, detail.content.platforms.reel.script)}
              </div>
            </div>
          </div>
          <div class="col-xl-5">
            <div class="card shadow-sm mb-4">
              <div class="card-body">
                <h2 class="h4 mb-3">QA</h2>
                <p class="mb-2">Bereit für Freigabe: <strong>${
                  detail.qaSummary?.ready_for_approval ? "ja" : "nein"
                }</strong></p>
                ${renderMessageList("Fehler", detail.qaSummary?.errors ?? [])}
                ${renderMessageList("Warnungen", detail.qaSummary?.warnings ?? detail.content.qa.warnings)}
              </div>
            </div>
            <div class="card shadow-sm mb-4">
              <div class="card-body">
                <h2 class="h4 mb-3">Reel</h2>
                <p class="mb-2">Audio: <code>${escapeHtml(detail.reelAudioPath || "keine")}</code></p>
                <p class="mb-2">Untertitel-Schrift: <code>${escapeHtml(
                  resolveDisplayValue(
                    detail.reelRenderSummary?.subtitle_font_name,
                    detail.reelSubtitleFontName,
                    defaults.reelSubtitleFontName,
                    "FFmpeg-Standard"
                  )
                )}</code></p>
                <p class="mb-2">Font-Verzeichnis: <code>${escapeHtml(
                  resolveDisplayValue(
                    detail.reelRenderSummary?.subtitle_fonts_dir,
                    detail.reelSubtitleFontsDir,
                    defaults.reelSubtitleFontsDir,
                    "systemweit"
                  )
                )}</code></p>
                <p class="mb-2">Dauer: <strong>${
                  detail.reelRenderSummary?.duration_seconds ?? detail.content.platforms.reel.duration_seconds
                }</strong> Sekunden</p>
                <p class="mb-3">Shots: <strong>${detail.content.platforms.reel.shots.length}</strong></p>
                ${
                  detail.reelAudioAssetPath
                    ? renderAudioPreview(detail.reelAudioAssetPath)
                    : `<p class="text-body-secondary">Noch keine Audio-Datei als Asset gespeichert.</p>`
                }
                ${
                  detail.reelPreviewPath
                    ? renderVideoPreview(detail.reelPreviewPath)
                    : `<p class="text-body-secondary mb-0">Noch kein Reel gerendert.</p>`
                }
              </div>
            </div>
            <div class="card shadow-sm mb-4">
              <div class="card-body">
                <h2 class="h4 mb-3">Bildvorschau</h2>
                ${renderImageGallery(detail.imagePreviewPaths, allPreviewPaths)}
              </div>
            </div>
            <div class="card shadow-sm">
              <div class="card-body">
                <h2 class="h4 mb-3">Render-Vorschau</h2>
                ${renderImageGallery(detail.renderPreviewPaths, allPreviewPaths)}
              </div>
            </div>
          </div>
        </div>
        ${renderReelActionModal(
          "reelRenderModal",
          detail.post.id,
          "render-reel",
          "Reel rendern",
          detail.reelAudioPath,
          detail.reelAudioAssetPath
        )}
        ${renderReelActionModal(
          "reelRerenderModal",
          detail.post.id,
          "render-reel-rerun",
          "Reel erneut rendern",
          detail.reelAudioPath,
          detail.reelAudioAssetPath
        )}
        ${renderPreviewModal(allPreviewPaths)}
      </div>
    `
  )
}

function renderDocument(title: string, body: string): string {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link href="${bootstrapCssHref}" rel="stylesheet">
    <style>
      body { background: #f4f1ea; }
      .preview-image { background: #fff; border: 1px solid #d6d0c4; border-radius: 0.75rem; overflow: hidden; }
      .preview-image img { display: block; width: 100%; height: auto; }
      .preview-modal-dialog { margin: 1rem auto; max-width: min(95vw, 1400px); }
      .preview-modal-body { max-height: calc(100vh - 8rem); overflow: hidden; }
      .preview-modal-stage { align-items: center; display: flex; height: calc(100vh - 18rem); justify-content: center; overflow: hidden; }
      .preview-modal-stage img { display: block; height: auto; margin: 0 auto; max-height: calc(100vh - 18rem); max-width: 100%; object-fit: contain; width: auto; }
      .platform-preview { border: 1px solid #d6d0c4; border-radius: 0.75rem; padding: 1rem; background: #fffdfa; }
      .app-hero { background: linear-gradient(135deg, #fff4df, #e6f1ea); border-bottom: 1px solid #dccfb6; }
    </style>
  </head>
  <body>
    ${body}
    <script src="${bootstrapJsHref}"></script>
  </body>
</html>`
}

function renderLayoutHeader(title: string, subtitle: string): string {
  return `
    <div class="app-hero py-4 mb-4">
      <div class="container">
        <p class="text-uppercase small mb-1">Pfarr.Media</p>
        <h1 class="display-6 mb-1">pfarr.media director</h1>
        <p class="fw-semibold mb-1">${escapeHtml(title)}</p>
        <p class="mb-0 text-body-secondary">${escapeHtml(subtitle)}</p>
      </div>
    </div>
  `
}

function renderPostActionForm(
  postId: string,
  action:
    | "approve"
    | "generate"
    | "images"
    | "images-reel"
    | "qa"
    | "render"
    | "render-reel"
    | "scaffold",
  label: string,
  tone: string,
  disabled = false
): string {
  return `
    <form method="post" action="/posts/${escapeHtml(postId)}/${action}">
      <button class="btn btn-${tone} btn-sm" type="submit"${disabled ? " disabled" : ""}>${escapeHtml(label)}</button>
    </form>
  `
}

function renderWeekActionForm(
  weekDate: string,
  action:
    | "generate"
    | "images"
    | "images-reel"
    | "qa"
    | "render"
    | "render-reel"
    | "scaffold",
  label: string,
  tone: string
): string {
  return `
    <form method="post" action="/weeks/${escapeHtml(weekDate)}/${action}">
      <button class="btn btn-${tone} btn-sm" type="submit">${escapeHtml(label)}</button>
    </form>
  `
}

function renderModalActionButton(
  targetId: string,
  label: string,
  tone: string
): string {
  return `
    <button class="btn btn-${tone}" type="button" data-bs-toggle="modal" data-bs-target="#${escapeHtml(targetId)}">
      ${escapeHtml(label)}
    </button>
  `
}

function renderReelActionModal(
  modalId: string,
  postId: string,
  action: "render-reel" | "render-reel-rerun",
  title: string,
  currentAudioPath: string,
  currentAudioAssetPath?: string
): string {
  return `
    <div class="modal fade" id="${escapeHtml(modalId)}" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <form method="post" action="/posts/${escapeHtml(postId)}/${action}" enctype="multipart/form-data">
            <div class="modal-header">
              <h2 class="modal-title fs-5">${escapeHtml(title)}</h2>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Schließen"></button>
            </div>
            <div class="modal-body">
              <p class="text-body-secondary">
                ${currentAudioPath
                  ? `Vorhandenes Audio wird wiederverwendet: ${escapeHtml(currentAudioPath)}`
                  : "Ohne Upload wird ein bereits gespeichertes Audio-Asset wiederverwendet, falls vorhanden."}
              </p>
              ${
                currentAudioAssetPath
                  ? `<p class="small text-body-secondary">Gespeichertes Audio-Asset: ${escapeHtml(currentAudioAssetPath)}</p>`
                  : ""
              }
              <div class="mb-0">
                <label class="form-label" for="${escapeHtml(modalId)}-audio">Audio hochladen</label>
                <input
                  class="form-control"
                  id="${escapeHtml(modalId)}-audio"
                  name="audio_upload"
                  type="file"
                  accept="audio/*"
                >
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Abbrechen</button>
              <button type="submit" class="btn btn-primary">${escapeHtml(title)}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `
}

function renderTextInput(label: string, name: string, value: string): string {
  return `
    <div class="mb-3">
      <label class="form-label" for="${escapeHtml(name)}">${escapeHtml(label)}</label>
      <input class="form-control" id="${escapeHtml(name)}" name="${escapeHtml(
        name
      )}" value="${escapeHtml(value)}">
    </div>
  `
}

function renderTextarea(
  label: string,
  name: string,
  value: string,
  rows: number
): string {
  return `
    <div class="mb-3">
      <label class="form-label" for="${escapeHtml(name)}-${rows}">${escapeHtml(label)}</label>
      <textarea class="form-control" id="${escapeHtml(name)}-${rows}" name="${escapeHtml(
        name
      )}" rows="${rows}">${escapeHtml(value)}</textarea>
    </div>
  `
}

function renderPlatformPreview(label: string, headline: string, text: string): string {
  return `
    <div class="platform-preview mb-3">
      <div class="text-uppercase small text-body-secondary mb-2">${escapeHtml(label)}</div>
      ${
        headline.length > 0
          ? `<h3 class="h6">${escapeHtml(headline)}</h3>`
          : ""
      }
      <p class="mb-0" style="white-space: pre-wrap;">${escapeHtml(text)}</p>
    </div>
  `
}

function renderMessageList(title: string, messages: string[]): string {
  if (messages.length === 0) {
    return `<p class="text-body-secondary mb-0">${escapeHtml(title)}: keine</p>`
  }

  return `
    <h3 class="h6 mt-3">${escapeHtml(title)}</h3>
    <ul class="mb-0">
      ${messages.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}
    </ul>
  `
}

function renderWorkflowBadge(label: string, active: boolean): string {
  return `<span class="badge rounded-pill text-bg-${active ? "success" : "secondary"}">${escapeHtml(label)}</span>`
}

function renderImageGallery(paths: string[], allPreviewPaths: string[]): string {
  if (paths.length === 0) {
    return `<p class="text-body-secondary mb-0">Noch keine Dateien vorhanden.</p>`
  }

  return `
    <div class="row g-3">
      ${paths
        .map(
          (path) => `
            <div class="col-sm-6">
              <div class="preview-image">
                <button
                  class="btn p-0 border-0 w-100 text-start"
                  type="button"
                  onclick="openPreviewModal(${allPreviewPaths.indexOf(path)})"
                >
                  <img alt="${escapeHtml(path)}" src="/files/${escapeHtml(path)}">
                </button>
              </div>
              <div class="small mt-2 text-body-secondary">${escapeHtml(path)}</div>
            </div>
          `
        )
        .join("")}
    </div>
  `
}

function renderVideoPreview(path: string): string {
  return `
    <div class="preview-image">
      <video controls preload="metadata" style="display:block; width:100%; height:auto;">
        <source src="/files/${escapeHtml(path)}" type="video/mp4">
      </video>
    </div>
    <div class="small mt-2 text-body-secondary">${escapeHtml(path)}</div>
  `
}

function renderAudioPreview(path: string): string {
  return `
    <div class="preview-image mb-3 p-3">
      <audio controls preload="metadata" style="width:100%;">
        <source src="/files/${escapeHtml(path)}">
      </audio>
    </div>
    <div class="small mt-2 text-body-secondary">${escapeHtml(path)}</div>
  `
}

function renderPreviewModal(paths: string[]): string {
  if (paths.length === 0) {
    return ""
  }

  return `
    <div class="modal fade" id="previewModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered preview-modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title fs-5">Großansicht</h2>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Schließen"></button>
          </div>
          <div class="modal-body preview-modal-body">
            <div class="d-flex justify-content-between align-items-center gap-3 mb-3">
              <button class="btn btn-outline-secondary" type="button" onclick="showPreviousPreview()">Zurück</button>
              <div class="small text-body-secondary text-center flex-grow-1" id="previewModalCaption"></div>
              <button class="btn btn-outline-secondary" type="button" onclick="showNextPreview()">Weiter</button>
            </div>
            <div class="preview-image preview-modal-stage">
              <img id="previewModalImage" alt="" src="">
            </div>
          </div>
        </div>
      </div>
    </div>
    <script>
      (() => {
        const previewPaths = ${JSON.stringify(paths)};
        let currentPreviewIndex = 0;
        let modalInstance;

        function getModalInstance() {
          if (!modalInstance) {
            const modalElement = document.getElementById("previewModal");
            modalInstance = new bootstrap.Modal(modalElement);
          }

          return modalInstance;
        }

        function renderPreview(index) {
          if (previewPaths.length === 0) {
            return;
          }

          currentPreviewIndex = (index + previewPaths.length) % previewPaths.length;

          const imagePath = previewPaths[currentPreviewIndex];
          const imageElement = document.getElementById("previewModalImage");
          const captionElement = document.getElementById("previewModalCaption");

          imageElement.src = "/files/" + imagePath;
          imageElement.alt = imagePath;
          captionElement.textContent =
            (currentPreviewIndex + 1) + " / " + previewPaths.length + " · " + imagePath;
        }

        window.openPreviewModal = (index) => {
          renderPreview(index);
          getModalInstance().show();
        };

        window.showPreviousPreview = () => {
          renderPreview(currentPreviewIndex - 1);
        };

        window.showNextPreview = () => {
          renderPreview(currentPreviewIndex + 1);
        };
      })();
    </script>
  `
}

function renderFlash(notice: string | null, error: string | null): string {
  return `${notice ? renderAlert("success", notice) : ""}${error ? renderAlert("danger", error) : ""}`
}

function renderAlert(tone: "danger" | "success", message: string): string {
  return `<div class="alert alert-${tone}" role="alert">${escapeHtml(message)}</div>`
}

function resolveStatusTone(status: string): string {
  if (status === "freigegeben" || status === "veroeffentlicht") {
    return "success"
  }

  if (status === "zur Prüfung" || status === "zur Pruefung") {
    return "warning"
  }

  if (status === "verworfen" || status === "missing") {
    return "secondary"
  }

  return "primary"
}

function redirectToPostOrWeek(
  response: ServerResponse,
  dependencies: ReviewServerDependencies,
  postId: string,
  notice: string
): void {
  const week = dependencies.calendar.wochen.find((entry) =>
    entry.beitraege.some((post) => post.id === postId)
  )

  if (!week) {
    redirect(response, `/?notice=${encodeURIComponent(notice)}`)
    return
  }

  redirect(
    response,
    `/weeks/${encodeURIComponent(week.zeitraum.von)}?notice=${encodeURIComponent(notice)}`
  )
}

function respondHtml(response: ServerResponse, body: string): void {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
  response.end(body)
}

function redirect(response: ServerResponse, location: string): void {
  response.writeHead(303, { location })
  response.end()
}

function redirectToPostError(
  response: ServerResponse,
  pathname: string,
  message: string
): void {
  const match = pathname.match(/^\/posts\/([^/]+)/)
  const postId = match?.[1]

  if (!postId) {
    redirect(response, `/?error=${encodeURIComponent(message)}`)
    return
  }

  redirect(
    response,
    `/posts/${postId}?error=${encodeURIComponent(message)}`
  )
}

async function serveLocalFile(
  response: ServerResponse,
  outputRoot: string,
  relativePath: string
): Promise<void> {
  const root = resolve(outputRoot)
  const filePath = resolve(root, relativePath)

  if (!filePath.startsWith(root)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" })
    response.end("Forbidden")
    return
  }

  const file = await readFile(filePath)
  response.writeHead(200, {
    "content-type": resolveMimeType(extname(filePath))
  })
  response.end(file)
}

function resolveMimeType(extension: string): string {
  if (extension === ".png") {
    return "image/png"
  }

  if (extension === ".webp") {
    return "image/webp"
  }

  if (extension === ".html") {
    return "text/html; charset=utf-8"
  }

  if (extension === ".json") {
    return "application/json; charset=utf-8"
  }

  if (extension === ".mp4") {
    return "video/mp4"
  }

  if (extension === ".mp3") {
    return "audio/mpeg"
  }

  if (extension === ".m4a") {
    return "audio/mp4"
  }

  if (extension === ".wav") {
    return "audio/wav"
  }

  if (extension === ".ogg") {
    return "audio/ogg"
  }

  return "application/octet-stream"
}

function resolveDisplayValue(
  ...values: Array<string | null | undefined>
): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value
    }
  }

  return ""
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function formatGermanDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date)
}

function formatWeekRangeLabel(startDate: string, endDate: string): string {
  return `KW ${getIsoWeekNumber(startDate)} · ${formatGermanDate(startDate)} bis ${formatGermanDate(endDate)}`
}

function formatWeekTitle(startDate: string): string {
  return `Kalenderwoche ${getIsoWeekNumber(startDate)}`
}

function getIsoWeekNumber(value: string): number {
  const date = new Date(`${value}T00:00:00Z`)
  const day = date.getUTCDay() || 7

  date.setUTCDate(date.getUTCDate() + 4 - day)

  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))

  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}
