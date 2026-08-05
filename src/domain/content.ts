import type { z } from "zod"

import type { contentPackageSchema } from "../services/content/content-schema.js"

/** Parsed content package document. */
export type ContentPackage = z.infer<typeof contentPackageSchema>
