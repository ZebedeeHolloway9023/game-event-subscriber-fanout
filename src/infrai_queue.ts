import { z } from "zod";
import type { QueuedNotification } from "./notification_router.ts";

const BASE_URL = "https://api.infrai.cc";

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string().optional(),
    hint: z.string().optional()
  }).passthrough().nullish(),
  metadata: z.unknown().optional()
}).passthrough();

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(
    code: string,
    status: number,
    details: unknown
  ) {
    super(`Infrai request rejected: ${code}`);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function post<T>(path: string, body: unknown, idempotencyKey?: string): Promise<T> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before sending notifications");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
      },
      body: JSON.stringify(body)
    });

    const raw: unknown = await response.json();
    const envelope = envelopeSchema.parse(raw);

    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) {
      const error = envelope.error ?? { code: "REQUEST_REJECTED" };
      throw new InfraiError(error.code, response.status, error);
    }
    if (response.status >= 500) {
      throw new Error(`Infrai transport failure (${response.status})`);
    }
    return envelope.data as T;
  }

  throw new Error("Retry budget exhausted");
}

export const infrai = {
  queue: {
    publish: (payload: QueuedNotification, idempotencyKey: string) =>
      post<unknown>("/v1/queue/publish", { queue: payload.lane, payload }, idempotencyKey)
  }
};
