import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"

import { chromium } from "playwright"

/**
 * One text region that exceeded its allowed box during rendering.
 */
export interface RenderOverflowRegion {
  height: number
  id: string
  scrollHeight: number
  scrollWidth: number
  text: string
  width: number
}

/**
 * Input used by the low-level HTML screenshot renderer.
 */
export interface HtmlRenderRequest {
  height: number
  html: string
  outputPath: string
  width: number
}

/**
 * Result returned by the low-level HTML screenshot renderer.
 */
export interface HtmlRenderResult {
  overflowRegions: RenderOverflowRegion[]
}

/**
 * Abstraction around HTML-to-image rendering so tests can inject a mock client.
 */
export interface HtmlRenderClient {
  renderHtmlDocument(request: HtmlRenderRequest): Promise<HtmlRenderResult>
}

/**
 * Creates a Playwright-backed renderer that captures one PNG screenshot per HTML document.
 *
 * @returns HTML render client using headless Chromium.
 */
export function createPlaywrightHtmlRenderClient(): HtmlRenderClient {
  return {
    async renderHtmlDocument(request: HtmlRenderRequest): Promise<HtmlRenderResult> {
      await mkdir(dirname(request.outputPath), { recursive: true })

      const browser = await chromium.launch({ headless: true })

      try {
        const page = await browser.newPage({
          deviceScaleFactor: 1,
          viewport: {
            height: request.height,
            width: request.width
          }
        })

        await page.setContent(request.html, { waitUntil: "load" })

        const overflowRegions = await page.evaluate(() =>
          Array.from(
            globalThis.document.querySelectorAll<HTMLElement>("[data-overflow-id]")
          )
            .map((element) => ({
              height: element.clientHeight,
              id: element.dataset.overflowId ?? "unknown",
              scrollHeight: element.scrollHeight,
              scrollWidth: element.scrollWidth,
              text: element.innerText.trim(),
              width: element.clientWidth
            }))
            .filter(
              (region) =>
                region.scrollHeight > region.height || region.scrollWidth > region.width
            )
        )

        await page.screenshot({
          path: request.outputPath,
          type: "png"
        })

        await page.close()

        return { overflowRegions }
      } finally {
        await browser.close()
      }
    }
  }
}
