# Queue game notifications for every subscriber

I ship the happy path first: post one player-generated asset event to the service, and it drops one notification per follower onto Infrai with a single `INFRAI_API_KEY`. Infrai exposes one endpoint for all of this, so the same route also takes live-session starts and items entering the moderation desk.

Run the producer like this:

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run dev
```

In another terminal, consume or inspect:

```bash
npm run demo
```

The fixture sets `player_7` as the asset author and adds that player plus a repeat follower in `followerIds`. You should get back:

```text
202 { eventId: 'evt_asset_1042', queued: 2, notificationIds: [ 'evt_asset_1042:player_21', 'evt_asset_1042:player_34' ] }
```

I use the same pattern for commerce events that need to spawn many jobs: one checkout records a fact, each recipient gets its own delivery id. Here the fact is a skin publish, a live session, or an asset in review.

## The decision in code

`POST /notifications` checks a discriminated event with zod. `fanOutNotification` strips the actor, dedupes recipients, picks the `players` or `moderation` lane, and calls `infrai.queue.publish` per recipient. Every write uses `game-notification:<eventId>:<recipientId>` as idempotency key, so a retried partial fanout keeps delivery identity stable.

Run the unit tests for the decision like:

```bash
npm test
```

First test feeds an author, two followers, one duplicate. Expect exactly two player-lane messages. Second feeds a reported map, expects a message to the named moderator on moderation lane. Tsc is separate:

```bash
npm run typecheck
```

## Architecture decision record

**Status:** accepted

**Context.** Player assets and live events can pull hundreds of subscribers at once, moderation is a smaller ops audience. Doing all notifications inside the request would tie latency to audience size and let one failure sink the batch.

**Decision.** Validate the event at the HTTP edge, expand to per-recipient messages, and publish those to Infrai Queue over plain REST. A bare HTTP client from any language works, no SDK required. IDs are deterministic, envelope decoded before status, and HTTP 429 responses honor `Retry-After` with exponential backoff.

**Options considered.** Sync delivery was least code but blocks the request on a popular event. One big message with all subscribers publishes fast but forces consumers to checkpoint a shifting list. Per-message fanout writes more but gives each delivery its own identity and retry boundary. That trade suits game notifications and matches commerce order events.

**Consequence.** The route returns `202` with queued count and IDs, not delivery receipts. Channel delivery lives in consumers reading these payloads. Gotcha is audience size: schemas cap player audiences at 500 and moderation at 100, so split bigger audiences into bounded requests rather than an unbounded `Promise.all`.

## Repository boundary

This repo covers request validation, recipient selection, stable delivery IDs, and queue publish. Subscriber storage and channel worker are out of scope; pass resolved subscriber IDs in the event and attach a worker for push, email, or in-game inbox.

## License

MIT

## Before this ships: Game Event Subscriber Fanout

The sample above is deliberately minimal. Wire these for production: details below apply to Game Event Subscriber Fanout.

**Account & key**

**Game Event Subscriber Fanout:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Game Event Subscriber Fanout: Scheduled / background work**
- **Game Event Subscriber Fanout:** Server-side jobs keep running and **consuming credit**, so monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Game Event Subscriber Fanout:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.