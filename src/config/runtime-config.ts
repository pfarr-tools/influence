import { config as loadDotEnv } from "dotenv"

loadDotEnv({ quiet: true })
loadDotEnv({ path: "config/.env", override: false, quiet: true })

/**
 * Runtime configuration used by the CLI and generators.
 */
export interface RuntimeConfig {
  calendarPath: string
  ffmpegBinary: string
  fluxApiBaseUrl: string
  fluxApiGeneratePath: string
  fluxApiKey: string
  fluxModel: string
  openAiApiKey: string
  openAiModel: string
  outputDir: string
  reelSubtitleFontName: string
  reelSubtitleFontsDir: string
}

/**
 * Loads runtime configuration from environment variables with project defaults.
 *
 * @returns Resolved runtime configuration.
 */
export function loadRuntimeConfig(): RuntimeConfig {
  return {
    calendarPath: readEnv("CONTENT_CALENDAR_PATH", "data/redaktionskalender-2026-2027.json"),
    ffmpegBinary: readEnv("FFMPEG_BIN", "ffmpeg"),
    fluxApiBaseUrl: readEnv("FLUX_API_BASE_URL", ""),
    fluxApiGeneratePath: readEnv("FLUX_API_GENERATE_PATH", "/v1"),
    fluxApiKey: readEnv("FLUX_API_KEY", ""),
    fluxModel: readEnv("FLUX_MODEL", "flux"),
    openAiApiKey: readEnv("OPENAI_API_KEY", ""),
    openAiModel: readEnv("OPENAI_MODEL", "gpt-5.6"),
    outputDir: readEnv("OUTPUT_DIR", "output"),
    reelSubtitleFontName: readEnv(
      "REEL_SUBTITLE_FONT_NAME",
      "Atkinson Hyperlegible Next"
    ),
    reelSubtitleFontsDir: readEnv("REEL_SUBTITLE_FONTS_DIR", "")
  }
}

function readEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : fallback
}
