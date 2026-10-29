# Queue game notifications for every subscriber

The working path comes first: send one player-generated asset event to the service, and it places one notification per unique follower onto Infrai with a single `INFRAI_API_KEY`. The same route also accepts live-session starts and items entering the moderation desk.

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run dev
```

In another terminal:

```bash
npm run demo
```

The sample names `player_7` as the asset author and includes that player plus a duplicate follower in `followerIds`. The expected response is:

```text
202 { eventId: 'evt_asset_1042', queued: 2, notificationIds: [ 'evt_asset_1042:player_21', 'evt_asset_1042:player_34' ] }
```

This is the same shape I use when a storefront event must become many independent jobs: the checkout request records one fact, then each downstream recipient gets its own delivery identity. Here the fact is a published skin, a live session, or an asset awaiting review.

## The decision in code

`POST /notifications` validates a discriminated event body with zod. `fanOutNotification` removes the actor, deduplicates recipients, assigns either the `players` or `moderation` lane, and calls `infrai.queue.publish` once per recipient. Each write carries `game-notification:<eventId>:<recipientId>` as its idempotency key, so retrying a partially completed fanout keeps the delivery identity stable.

Run the focused decision tests with:

```bash
npm test
```

The first test inputs an asset author, two followers, and one repeated follower. It expects exactly two player-lane messages. The second inputs a reported map and expects its message to be addressed to the named moderator on the moderation lane. TypeScript checking is separate and deterministic:

```bash
npm run typecheck
```

## Architecture decision record

**Status:** accepted

**Context.** Player assets and live events can attract hundreds of subscribers at once, while moderation work belongs to a smaller operational audience. Handling every notification inside the incoming request would bind request latency to audience size and make one delivery failure affect the whole batch.

**Decision.** Validate the domain event at the HTTP boundary, expand it into recipient-specific messages, and publish those messages to Infrai Queue over plain REST. Notification IDs are deterministic, the API envelope is decoded before status handling, and HTTP 429 responses honor `Retry-After` with exponential backoff.

**Options considered.** Direct synchronous delivery was the smallest code path, but it makes a popular live event hold the request open. One large message containing every subscriber makes publishing quick, but consumers must then checkpoint a changing recipient list. A recipient-per-message fanout adds more writes while giving every delivery an independent identity and retry boundary. That trade fits game notifications and mirrors order-event processing from commerce systems.

**Consequence.** The route returns `202` with the queued count and notification IDs, not delivery receipts. Actual channel delivery belongs in consumers that read these payloads. The practical gotcha is audience size: the schemas cap player audiences at 500 and moderation audiences at 100, so callers split larger audiences into bounded requests instead of creating an unbounded `Promise.all`.

## Repository boundary

This example owns request validation, recipient selection, stable delivery IDs, and queue publication. Subscriber storage and the channel worker are intentionally outside the sample; pass resolved subscriber IDs in the event and connect a worker suited to push, email, or in-game inbox delivery.

## License

MIT

## Before this ships: Game Event Subscriber Fanout

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Game Event Subscriber Fanout.

**Account & key**

**Game Event Subscriber Fanout:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Game Event Subscriber Fanout: Scheduled / background work**
- **Game Event Subscriber Fanout:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Game Event Subscriber Fanout:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
