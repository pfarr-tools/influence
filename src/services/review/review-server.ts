import { createServer } from "node:http"

import {
  closeReviewFrontendServer,
  handleReviewRequest,
  type ReviewServerDependencies
} from "./server/routes/review-routes.js"

export function createReviewServer(dependencies: ReviewServerDependencies) {
  const server = createServer(async (request, response) => {
    await handleReviewRequest(request, response, dependencies)
  })

  server.on("close", () => {
    void closeReviewFrontendServer()
  })

  return server
}

export type {
  ReviewServerDependencies
} from "./server/routes/review-routes.js"
