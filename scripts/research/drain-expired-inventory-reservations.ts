import { randomUUID } from "node:crypto";
import { SupabaseInventoryReservationSweeper } from "../../server/research/inventory-reservation/sweeper";

const execute = process.argv.includes("--execute");
const rawLimit = process.argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length);
const limit = rawLimit === undefined ? 50 : Number(rawLimit);
const actorId = process.env.INVENTORY_SWEEPER_ACTOR_ID ?? "";

if (!execute) {
  console.log("Dry run only. No inventory holds were changed.");
  console.log(
    "Set INVENTORY_SWEEPER_ACTOR_ID and rerun with --execute [--limit=1..100].",
  );
  process.exit(0);
}

const at = new Date().toISOString();
const runKey = `inventory-expiry-sweep:${at}:${randomUUID()}`;
const result = await new SupabaseInventoryReservationSweeper().drain({
  actorId,
  at,
  limit,
  runKey,
});

console.log(
  JSON.stringify(
    {
      action: result.action,
      claimedCount: result.claimedCount,
      memberBatchCount: result.memberBatchCount,
      reservationIds: result.reservationIds,
      completedAt: at,
    },
    null,
    2,
  ),
);
