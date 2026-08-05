import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CalendarPost } from "../src/domain/calendar.js"
import type { ContentPackage } from "../src/domain/content.js"
import { loadCalendarFromFile } from "../src/services/calendar/calendar-service.js"
import { scaffoldPostById } from "../src/services/content/content-scaffolder.js"
import {
  readJsonFile,
  writeJsonFile
} from "../src/services/content/content-storage.js"
import type {
  HtmlRenderClient,
  HtmlRenderRequest,
  HtmlRenderResult
} from "../src/services/render/index.js"
import {
  buildRenderDocument,
  renderPostById,
  resolveRenderTemplateKind
} from "../src/services/render/index.js"

const fixturePath = join(
  process.cwd(),
  "data",
  "redaktionskalender-2026-2027.json"
)

describe("post renderer", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "director-render-test-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it("maps the supported rubrics onto the six renderer templates", () => {
    expect(resolveRenderTemplateKind("Mit dem Wochenspruch in die Woche")).toBe(
      "wochenspruch"
    )
    expect(resolveRenderTemplateKind("Wochenspruch – meditativ")).toBe("wochenspruch")
    expect(resolveRenderTemplateKind("Gebet oder Lied")).toBe(
      "gebet-oder-liedgedanke"
    )
    expect(resolveRenderTemplateKind("Mittwochsserie")).toBe("wissenskarussell")
    expect(resolveRenderTemplateKind("Reli fragt")).toBe("reli-fragt")
    expect(resolveRenderTemplateKind("Predigt-Preview")).toBe("predigt-preview")
    expect(resolveRenderTemplateKind("Gemeinde lebt")).toBe("gemeinde-lebt")
  })

  it("builds a stable HTML snapshot for the Wochenspruch template", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const post = calendar.wochen[0]!.beitraege[0]!
    await writeRenderReadyContent(calendar, tempDir, post.id)
    const content = await readJsonFile<ContentPackage>(
      join(tempDir, post.datum, post.id, "content.json")
    )

    const document = await buildRenderDocument(
      post,
      content,
      "instagram-feed",
      tempDir
    )

    expect(document.template).toBe("wochenspruch")
    expect(document.html).toContain("Wochenspruch")
    expect(document.html).not.toContain("Fünf Minuten Aufmerksamkeit")
    expect(document.html).toContain(
      "Wohl dem Volk, dessen Gott der HERR ist, dem Volk, das er zum Erbe erwählt hat!"
    )
    expect(document.html).toContain("Ps 33,12")
    expect(document.html).toContain('url("data:image/webp;base64,')
    expect(normalizeMarkup(extractMainMarkup(document.html))).toMatchInlineSnapshot(`
      "<main class="canvas format-feed">
      <section class="layout">
      <div class="panel-meta">
      <div class="eyebrow">Wochenspruch</div>
      <div class="pager">1/4</div>
      </div>
      <section class="panel">
      <div class="accent-line"></div>
      <p class="body-text" data-overflow-id="primary-text">Wohl dem Volk, dessen Gott der HERR ist, dem Volk, das er zum Erbe erwählt hat! (Ps 33,12)</p>
      <div class="citation">Ps 33,12</div>
      <p class="sender-mark">christoph-fischer.de</p>
      </section>
      </section>
      </main>"
    `)
  })

  it("writes html, images, and a render summary for all supported formats", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    const post = findPost(calendar, "post-0001")
    await writeRenderReadyContent(calendar, tempDir, post.id)

    const result = await renderPostById(
      calendar,
      post.id,
      {
        force: false,
        outputRoot: tempDir
      },
      {
        now: () => new Date("2026-08-05T12:00:00.000Z"),
        pageRenderClient: createMockRenderClient()
      }
    )

    const summary = await readJsonFile<{
      rendered_at: string
      renders: Array<{
        format: string
        html_path: string
        image_path: string
        page_count: number
        page_index: number
        variant: string
      }>
      template: string
      warnings: string[]
    }>(result.summaryPath)

    expect(result.renders).toHaveLength(9)
    expect(summary.rendered_at).toBe("2026-08-05T12:00:00.000Z")
    expect(summary.template).toBe("wochenspruch")
    expect(summary.warnings).toEqual([])
    expect(summary.renders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          format: "instagram-feed",
          html_path: "render-instagram-feed-01.html",
          image_path: "render-instagram-feed-01.png",
          page_count: 4,
          page_index: 1,
          variant: "feed-card"
        }),
        expect.objectContaining({
          format: "instagram-story",
          html_path: "render-instagram-story-04.html",
          image_path: "render-instagram-story-04.png",
          page_count: 4,
          page_index: 4,
          variant: "story-slide"
        }),
        expect.objectContaining({
          format: "facebook-mastodon",
          html_path: "render-facebook-mastodon-01.html",
          image_path: "render-facebook-mastodon-01.png",
          page_count: 1,
          page_index: 1,
          variant: "landscape-post"
        })
      ])
    )

    const imageBuffer = await readFile(
      join(tempDir, post.datum, post.id, "render-instagram-feed-01.png")
    )
    const html = await readFile(
      join(tempDir, post.datum, post.id, "render-instagram-feed-01.html"),
      "utf8"
    )

    expect(imageBuffer.toString("utf8")).toContain("mock-image")
    expect(html).toContain("Wohl dem Volk")
  })

  it("surfaces clear warnings when a text box overflows", async () => {
    const calendar = await loadCalendarFromFile(fixturePath)
    await writeRenderReadyContent(calendar, tempDir, "post-0001", {
      mainMessage:
        "Dies ist ein absichtlich sehr langer Text, der fuer die Ueberlaufwarnung markiert wird."
    })

    const result = await renderPostById(
      calendar,
      "post-0001",
      {
        force: false,
        outputRoot: tempDir
      },
      {
        pageRenderClient: createMockRenderClient({
          overflowByFormat: {
            "instagram-story-02": [
              {
                height: 320,
                id: "primary-text",
                scrollHeight: 460,
                scrollWidth: 520,
                text: "too long",
                width: 420
              }
            ]
          }
        })
      }
    )

    expect(result.warnings).toEqual([
      "Text overflow detected in instagram-story page 2/4 (primary-text). Review copy before approval."
    ])
    expect(
      result.renders.find(
        (render) => render.format === "instagram-story" && render.pageIndex === 2
      )
        ?.overflowWarnings
    ).toEqual([
      "Text overflow detected in instagram-story page 2/4 (primary-text). Review copy before approval."
    ])
  })
})

function createMockRenderClient(options?: {
  overflowByFormat?: Record<string, HtmlRenderResult["overflowRegions"]>
}): HtmlRenderClient {
  return {
    async renderHtmlDocument(request: HtmlRenderRequest): Promise<HtmlRenderResult> {
      await writeFile(
        request.outputPath,
        `mock-image:${request.width}x${request.height}`,
        "utf8"
      )

      const format =
        Object.keys(options?.overflowByFormat ?? {}).find((key) =>
          request.outputPath.endsWith(`render-${key}.png`)
        ) ?? ""

      return {
        overflowRegions: options?.overflowByFormat?.[format] ?? []
      }
    }
  }
}

async function writeRenderReadyContent(
  calendar: Awaited<ReturnType<typeof loadCalendarFromFile>>,
  outputRoot: string,
  postId: string,
  overrides?: {
    mainMessage?: string
  }
): Promise<void> {
  const scaffold = await scaffoldPostById(calendar, postId, outputRoot)
  const content = await readJsonFile<ContentPackage>(scaffold.outputPath)

  await writeJsonFile(scaffold.outputPath, {
    ...content,
    status: "freigegeben",
    editorial_core: {
      ...content.editorial_core,
      main_message:
        overrides?.mainMessage ??
        "Glaube wird konkret, wenn jemand einem anderen ehrlich zuhoert.",
      source_notes: [
        ...content.editorial_core.source_notes,
        "Wochenspruch: Wohl dem Volk, dessen Gott der HERR ist, dem Volk, das er zum Erbe erwählt hat! (Ps 33,12)"
      ],
      title: "Fünf Minuten Aufmerksamkeit"
    },
    platforms: {
      ...content.platforms,
      facebook: {
        headline: "Eine kleine Übung für diese Woche",
        text: "Wohl dem Volk, dessen Gott der HERR ist, dem Volk, das er zum Erbe erwählt hat! (Ps 33,12)\n\nNimm dir heute fünf Minuten für einen Menschen."
      },
      instagram: {
        caption: "Ein ruhiger Wochenauftakt mit einem klaren Satz.",
        carousel: [
          {
            text: "Wohl dem Volk, dessen Gott der HERR ist, dem Volk, das er zum Erbe erwählt hat! (Ps 33,12)",
            type: "Wochenspruch"
          },
          {
            text: "Gottes Treue macht Menschen nicht austauschbar. Aufmerksamkeit kann zeigen: Du bist nicht nebenbei.",
            type: "Alltagsgedanke"
          },
          {
            text: "Schenke heute einer Person fünf Minuten ungeteilte Aufmerksamkeit. Lege das Handy weg. Höre zu, ohne zu unterbrechen.",
            type: "Wochenübung"
          },
          {
            text: "Wem möchtest du heute so zuhören, dass nichts nebenbei läuft?",
            type: "Frage"
          }
        ]
      },
      reel: {
        ...content.platforms.reel,
        hook: "Welche Frage traegst du in diese Woche?"
      },
      story: {
        slides: [
          {
            text: "Wohl dem Volk, dessen Gott der HERR ist, dem Volk, das er zum Erbe erwählt hat! (Ps 33,12)"
          },
          { text: "Aufmerksamkeit kann zeigen: Du bist nicht nebenbei." },
          { text: "Die Übung: fünf Minuten zuhören. Ohne Handy. Ohne Unterbrechung." },
          { text: "Wem möchtest du heute ungeteilte Aufmerksamkeit schenken?" }
        ]
      }
    }
  })

  await mkdir(join(outputRoot, findPost(calendar, postId).datum, postId, "assets"), {
    recursive: true
  })
  await writeFile(
    join(outputRoot, findPost(calendar, postId).datum, postId, "assets", "background-4x5.webp"),
    "background",
    "utf8"
  )
  await writeFile(
    join(outputRoot, findPost(calendar, postId).datum, postId, "assets", "background-9x16.webp"),
    "background",
    "utf8"
  )
  await writeFile(
    join(
      outputRoot,
      findPost(calendar, postId).datum,
      postId,
      "assets",
      "background-1.91x1.webp"
    ),
    "background",
    "utf8"
  )
}

function findPost(
  calendar: Awaited<ReturnType<typeof loadCalendarFromFile>>,
  postId: string
): CalendarPost {
  for (const week of calendar.wochen) {
    const post = week.beitraege.find((entry) => entry.id === postId)

    if (post) {
      return post
    }
  }

  throw new Error(`Missing fixture post ${postId}`)
}

function extractMainMarkup(html: string): string {
  const match = html.match(/<main class="canvas[\s\S]+<\/main>/)

  if (!match?.[0]) {
    throw new Error("Missing <main> markup in render document")
  }

  return match[0]
}

function normalizeMarkup(markup: string): string {
  return markup
    .replaceAll(/>\s+</g, ">\n<")
    .replaceAll(/\n\s+/g, "\n")
    .trim()
}
