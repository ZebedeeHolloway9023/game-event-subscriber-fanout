import assert from "node:assert/strict";
import test from "node:test";
import { fanOutNotification, type QueuedNotification } from "../src/notification_router.ts";

test("a player asset fans out once per follower and never back to its author", async () => {
  const sent: Array<{ payload: QueuedNotification; key: string }> = [];
  const result = await fanOutNotification({
    async publish(payload, key) {
      sent.push({ payload, key });
    }
  }, {
    type: "player_asset.published",
    eventId: "evt_asset_1042",
    playerId: "player_7",
    assetId: "skin_neon_fox",
    followerIds: ["player_7", "player_21", "player_34", "player_21"]
  });

  assert.equal(result.queued, 2);
  assert.deepEqual(sent.map(({ payload }) => payload.recipientId), ["player_21", "player_34"]);
  assert.ok(sent.every(({ payload }) => payload.lane === "players"));
  assert.deepEqual(sent.map(({ key }) => key), [
    "game-notification:evt_asset_1042:player_21",
    "game-notification:evt_asset_1042:player_34"
  ]);
});

test("a moderation item targets the moderation lane", async () => {
  const sent: QueuedNotification[] = [];
  await fanOutNotification({
    async publish(payload) {
      sent.push(payload);
    }
  }, {
    type: "moderation_item.queued",
    eventId: "evt_review_88",
    assetId: "map_riverside",
    reason: "player_report",
    moderatorIds: ["mod_2"]
  });

  assert.equal(sent[0]?.lane, "moderation");
  assert.equal(sent[0]?.recipientId, "mod_2");
});
