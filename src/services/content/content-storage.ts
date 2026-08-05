import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { constants } from "node:fs"
import { dirname, join } from "node:path"

import type { CalendarPost } from "../../domain/calendar.js"

/**
 * Computes all file paths used for a content generation result.
 *
 * @param outputRoot Root output directory.
 * @param post Source calendar post.
 * @returns Content output paths for the post.
 */
export function getContentOutputPaths(
  outputRoot: string,
  post: CalendarPost
): ContentOutputPaths {
  const baseDir = join(outputRoot, post.datum, post.id)

  return {
    baseDir,
    contentPath: join(baseDir, "content.json"),
    rawResponsePath: join(baseDir, "raw-openai-response.json")
  }
}

/**
 * Prevents accidental overwrite of an existing final content package.
 *
 * @param contentPath Target content file path.
 * @param force Whether overwrite is explicitly allowed.
 * @throws {Error} If the file already exists and `force` is false.
 */
export async function assertWritableContentTarget(
  contentPath: string,
  force: boolean
): Promise<void> {
  const exists = await pathExists(contentPath)

  if (exists && !force) {
    throw new Error(
      `Content package already exists at "${contentPath}". Use --force to overwrite it.`
    )
  }
}

/**
 * Writes a JSON document with pretty formatting.
 *
 * @param path Target file path.
 * @param value Serializable value.
 */
export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

/**
 * Reads a JSON document from disk.
 *
 * @param path File path to read.
 * @returns Parsed JSON value.
 */
export async function readJsonFile<T>(path: string): Promise<T> {
  const fileContent = await readFile(path, "utf8")
  return JSON.parse(fileContent) as T
}

/**
 * Checks whether a file path exists.
 *
 * @param path File path to check.
 * @returns True when the path exists.
 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Content output paths for one post.
 */
export interface ContentOutputPaths {
  baseDir: string
  contentPath: string
  rawResponsePath: string
}
