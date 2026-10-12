import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { randomUUID } from "node:crypto"

export type TokenProvider = "instagram" | "threads"
export const defaultTokenStorePath = "../influence-runtime/tokens.json"

export interface StoredToken {
  provider: TokenProvider
  accessToken: string
  accountId: string
  expiresAt: string
}

type TokenFile = Partial<Record<TokenProvider, StoredToken>>

/** Stores provider credentials outside the public content tree. */
export class TokenStore {
  private mutationQueue: Promise<void> = Promise.resolve()

  constructor(private readonly path: string) {}

  async get(provider: TokenProvider): Promise<StoredToken | undefined> {
    const file = await this.readFile()
    const record = file[provider]
    return isStoredToken(record) && record.provider === provider ? record : undefined
  }

  async save(record: StoredToken): Promise<void> {
    if (!isStoredToken(record)) throw new Error("Ungültiger Token-Datensatz.")
    await this.enqueueMutation((file) => { file[record.provider] = record })
  }

  async remove(provider: TokenProvider): Promise<void> {
    await this.enqueueMutation((file) => { delete file[provider] })
  }

  private async enqueueMutation(mutate: (file: TokenFile) => void): Promise<void> {
    const operation = this.mutationQueue.then(async () => {
      const file = await this.readFile()
      mutate(file)
      await this.writeFile(file)
    })
    this.mutationQueue = operation.catch(() => undefined)
    await operation
  }

  private async writeFile(file: TokenFile): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const temporaryPath = `${this.path}.${randomUUID()}.tmp`
    try {
      await writeFile(temporaryPath, JSON.stringify(file, null, 2) + "\n", { encoding: "utf8", mode: 0o600 })
      await chmod(temporaryPath, 0o600)
      await rename(temporaryPath, this.path)
      await chmod(this.path, 0o600)
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }

  private async readFile(): Promise<TokenFile> {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8")) as unknown
      if (!isRecord(parsed)) return {}
      return Object.fromEntries(
        Object.entries(parsed).filter(([provider, value]) => (provider === "instagram" || provider === "threads") && isStoredToken(value) && value.provider === provider)
      ) as TokenFile
    } catch {
      return {}
    }
  }
}

function isStoredToken(value: unknown): value is StoredToken {
  return isRecord(value)
    && (value.provider === "instagram" || value.provider === "threads")
    && typeof value.accessToken === "string" && value.accessToken.length > 0
    && typeof value.accountId === "string" && value.accountId.length > 0
    && typeof value.expiresAt === "string" && !Number.isNaN(Date.parse(value.expiresAt))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
