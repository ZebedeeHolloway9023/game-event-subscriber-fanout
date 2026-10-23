import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { infrai, InfraiError } from "./infrai_queue.ts";
import { fanOutNotification, notificationEventSchema } from "./notification_router.ts";

const port = Number(process.env.PORT ?? 3000);

function reply(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/notifications") {
    reply(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const event = notificationEventSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const result = await fanOutNotification({
      publish: (payload, idempotencyKey) => infrai.queue.publish(payload, idempotencyKey)
    }, event);
    reply(response, 202, result);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      reply(response, 400, { error: "Invalid notification event" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      reply(response, status, { error: error.code });
      return;
    }
    console.error(error);
    reply(response, 500, { error: "Notification dispatch failed" });
  }
});

server.listen(port, () => {
  console.log(`Game notification service listening on http://localhost:${port}`);
});
