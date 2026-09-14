import type { DbExecutor } from "../client.js";

// Inject the transaction executor when composing several repositories atomically.
// Keep projections explicit: internal BIGINT ids never leave this repository's public summary.
export function createPlatformRepository(db: DbExecutor) {
  const selection = db
    .selectFrom("app.platform")
    .select([
      "public_id as publicId",
      "code",
      "name",
      "platform_role as role",
      "is_active as isActive",
    ]);
  return {
    list: () => selection.orderBy("code").limit(100).execute(),
    findByPublicId: (publicId: string) =>
      selection.where("public_id", "=", publicId).executeTakeFirst(),
    setActive: (publicId: string, isActive: boolean) =>
      db
        .updateTable("app.platform")
        .set({ is_active: isActive, updated_at: new Date() })
        .where("public_id", "=", publicId)
        .returning(["public_id as publicId", "is_active as isActive"])
        .executeTakeFirst(),
  };
}
