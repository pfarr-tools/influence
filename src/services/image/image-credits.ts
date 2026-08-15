import { access, readFile } from "node:fs/promises"
import { resolve } from "node:path"

import sharp from "sharp"

const defaultFontPath = resolve(process.cwd(), "assets/fonts/Sarabun-Light.ttf")

export interface ImageCreditOptions {
  credits?: string
  isAi?: boolean
  model?: string
}

export function buildImageCreditText(options: ImageCreditOptions): string {
  const credits =
    options.credits?.trim() || process.env.IMAGE_CREDITS?.trim() || ""
  const model = options.model?.trim()
  const source = options.isAi && model ? `${model} / Black Forest Labs / ` : ""

  return `Bild: ${source}${credits}`.trim()
}

export async function burnImageCredits(
  image: Buffer,
  options: ImageCreditOptions
): Promise<Buffer> {
  const text = buildImageCreditText(options)
  if (!text || text === "Bild:") {
    return image
  }

  const metadata = await sharp(image).metadata()
  if ((metadata.width ?? 0) < 32 || (metadata.height ?? 0) < 32) {
    return sharp(image).webp().toBuffer()
  }

  const fontPath = await resolveFontPath()
  const fontData = await readFile(fontPath)
  const overlay = Buffer.from(
    buildCreditLabelSvg(text, options.isAi, fontData.toString("base64"))
  )
  const overlayMetadata = await sharp(overlay).metadata()
  const top = Math.max(
    0,
    (metadata.height ?? 0) - (overlayMetadata.height ?? 0) - 8
  )

  return sharp(image)
    .composite([{ input: overlay, left: 8, top }])
    .webp()
    .toBuffer()
}

function buildCreditLabelSvg(
  text: string,
  isAi = false,
  fontData = ""
): string {
  const textWidth = Math.max(80, text.length * 4.8)
  const iconOffset = isAi ? 18 : 0
  const width = Math.ceil(textWidth + iconOffset + 4)
  const icon = isAi
    ? '<circle cx="7" cy="8" r="6" fill="none" stroke="white" stroke-width="1"/><text x="2.7" y="10.5">KI</text>'
    : ""

  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="${width}" viewBox="0 0 16 ${width}"><style>@font-face{font-family:Sarabun;src:url(data:font/ttf;base64,${fontData})}text{font-family:Sarabun,sans-serif;font-size:8px;font-weight:300;fill:white}</style><g transform="translate(0 ${width}) rotate(-90)">${icon}<text x="${iconOffset}" y="10.5">${escapeXml(text)}</text></g></svg>`
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

async function resolveFontPath(): Promise<string> {
  const configured = process.env.IMAGE_CREDITS_FONT_PATH?.trim()
  const candidates = configured
    ? [configured, defaultFontPath]
    : [defaultFontPath]

  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try the next configured/default font path.
    }
  }

  return "Sarabun-Light"
}
