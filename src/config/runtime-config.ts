import { config as loadDotEnv } from "dotenv"

loadDotEnv({ quiet: true })
loadDotEnv({ path: "config/.env", override: false, quiet: true })

/**
 * Runtime configuration used by the CLI and generators.
 */
export interface RuntimeConfig {
  calendarPath: string
  openAiApiKey: string
  openAiModel: string
  outputDir: string
}

/**
 * Loads runtime configuration from environment variables with project defaults.
 *
 * @returns Resolved runtime configuration.
 */
export function loadRuntimeConfig(): RuntimeConfig {
  return {
    calendarPath:
      process.env.CONTENT_CALENDAR_PATH ?? "data/redaktionskalender-2026-2027.json",
    openAiApiKey: process.env.OPENAI_API_KEY ?? "",
    openAiModel: process.env.OPENAI_MODEL ?? "gpt-5.6",
    outputDir: process.env.OUTPUT_DIR ?? "output"
  }
}
