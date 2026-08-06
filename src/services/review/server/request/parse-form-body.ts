import type { IncomingMessage } from "node:http"
import { Readable } from "node:stream"

export interface ParsedUploadedFile {
  buffer: Buffer
  fileName: string
  mimeType: string
}

export interface ParsedFormBody {
  get(name: string): string
  getAll(name: string): string[]
  getFile(name: string): ParsedUploadedFile | undefined
}

export async function parseFormBody(
  request: IncomingMessage
): Promise<ParsedFormBody> {
  const webRequest = new Request("http://127.0.0.1/", {
    body: Readable.toWeb(request) as BodyInit,
    duplex: "half",
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
