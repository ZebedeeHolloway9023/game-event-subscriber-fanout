export {};

const response = await fetch("http://localhost:3000/notifications", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    type: "player_asset.published",
    eventId: "evt_asset_1042",
    playerId: "player_7",
    assetId: "skin_neon_fox",
    followerIds: ["player_7", "player_21", "player_34", "player_21"]
  })
});

console.log(response.status, await response.json());
