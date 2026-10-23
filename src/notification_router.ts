import { z } from "zod";

const playerAssetEvent = z.object({
  type: z.literal("player_asset.published"),
  eventId: z.string().min(1),
  playerId: z.string().min(1),
  assetId: z.string().min(1),
  followerIds: z.array(z.string().min(1)).max(500)
});

const liveEvent = z.object({
  type: z.literal("live_event.started"),
  eventId: z.string().min(1),
  hostPlayerId: z.string().min(1),
  sessionId: z.string().min(1),
  watcherIds: z.array(z.string().min(1)).max(500)
});

const moderationEvent = z.object({
  type: z.literal("moderation_item.queued"),
  eventId: z.string().min(1),
  assetId: z.string().min(1),
  reason: z.enum(["player_report", "automated_review"]),
  moderatorIds: z.array(z.string().min(1)).max(100)
});

export const notificationEventSchema = z.discriminatedUnion("type", [
  playerAssetEvent,
  liveEvent,
  moderationEvent
]);

export type NotificationEvent = z.infer<typeof notificationEventSchema>;

export type QueuedNotification = {
  notificationId: string;
  recipientId: string;
  lane: "players" | "moderation";
  event: NotificationEvent;
};

export type NotificationPublisher = {
  publish(payload: QueuedNotification, idempotencyKey: string): Promise<unknown>;
};

function recipientsFor(event: NotificationEvent): string[] {
  if (event.type === "player_asset.published") {
    return event.followerIds.filter((id) => id !== event.playerId);
  }
  if (event.type === "live_event.started") {
    return event.watcherIds.filter((id) => id !== event.hostPlayerId);
  }
  return event.moderatorIds;
}

export async function fanOutNotification(
  publisher: NotificationPublisher,
  event: NotificationEvent
): Promise<{ eventId: string; queued: number; notificationIds: string[] }> {
  const recipientIds = [...new Set(recipientsFor(event))];
  const lane = event.type === "moderation_item.queued" ? "moderation" : "players";
  const notificationIds = recipientIds.map((recipientId) => `${event.eventId}:${recipientId}`);

  await Promise.all(recipientIds.map((recipientId, index) => {
    const notificationId = notificationIds[index];
    return publisher.publish(
      { notificationId, recipientId, lane, event },
      `game-notification:${notificationId}`
    );
  }));

  return { eventId: event.eventId, queued: recipientIds.length, notificationIds };
}
