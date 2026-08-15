import { config as loadDotEnv } from "dotenv"

loadDotEnv({ quiet: true })
loadDotEnv({ path: "config/.env", override: false, quiet: true })

/**
 * Runtime configuration used by the CLI and generators.
 */
export interface RuntimeConfig {
  brandName?: string
  brandWebsite?: string
  calendarPath: string
  ffmpegBinary: string
  fluxApiBaseUrl: string
  fluxApiGeneratePath: string
  fluxApiKey: string
  fluxModel: string
  imageCredits?: string
  openAiApiKey: string
  openAiModel: string
  outputDir: string
  publicationDefaultTime: string
  publicationPlatforms: string
  publicationTimezone: string
  webhookSecret?: string
  webhookUrl?: string
  publicBaseUrl?: string
  reelSubtitleFontName: string
  reelSubtitleFontsDir: string
  sourceMark?: string
}

/**
 * Loads runtime configuration from environment variables with project defaults.
 *
 * @returns Resolved runtime configuration.
 */
export function loadRuntimeConfig(): RuntimeConfig {
  return {
    brandName: readEnv("BRAND_NAME", "Influence"),
    brandWebsite: readEnv("BRAND_WEBSITE", ""),
    calendarPath: readEnv("CONTENT_CALENDAR_PATH", "content/content-plan.json"),
    ffmpegBinary: readEnv("FFMPEG_BIN", "ffmpeg"),
    fluxApiBaseUrl: readEnv("FLUX_API_BASE_URL", ""),
    fluxApiGeneratePath: readEnv("FLUX_API_GENERATE_PATH", "/v1"),
    fluxApiKey: readEnv("FLUX_API_KEY", ""),
    fluxModel: readEnv("FLUX_MODEL", "flux"),
    imageCredits: readEnv("IMAGE_CREDITS", ""),
    openAiApiKey: readEnv("OPENAI_API_KEY", ""),
    openAiModel: readEnv("OPENAI_MODEL", "gpt-5.6"),
    outputDir: readEnv("OUTPUT_DIR", "content"),
    publicationDefaultTime: readEnv("PUBLICATION_DEFAULT_TIME", "07:00"),
    publicationPlatforms: readEnv("PUBLICATION_PLATFORMS", "facebook,instagram,mastodon"),
    publicationTimezone: readEnv("PUBLICATION_TIMEZONE", readEnv("TZ", "Europe/Berlin")),
    webhookSecret: readEnv("WEBHOOK_SECRET", ""),
    webhookUrl: readEnv("WEBHOOK_URL", ""),
    publicBaseUrl: readEnv("PUBLIC_BASE_URL", ""),
    reelSubtitleFontName: readEnv(
      "REEL_SUBTITLE_FONT_NAME",
      "Atkinson Hyperlegible Next"
    ),
    reelSubtitleFontsDir: readEnv("REEL_SUBTITLE_FONTS_DIR", ""),
    sourceMark: readEnv("SOURCE_MARK", "")
  }
}

function readEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : fallback
}
