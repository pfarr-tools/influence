import type { ServerResponse } from "node:http"
import { ZodError, type ZodType } from "zod"

export function respondJson<T>(
  response: ServerResponse,
  statusCode: number,
  payload: T,
  schema?: ZodType<T>
): void {
  const validated = schema ? schema.parse(payload) : payload

  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  })
  response.end(JSON.stringify(validated))
}

export function isValidationError(error: unknown): error is ZodError {
  return error instanceof ZodError
}
