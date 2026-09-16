import { createHash } from "node:crypto";
import type { SourceIdentifierType } from "./source-product.js";
import { compatibleIdentifierNorm } from "./identifier-compatibility.js";
const gtinTypes = new Set(["GTIN", "EAN", "UPC"]);
// Keep the P2 key as well as the comparison key so old and new writers wait on
// the same identity. Sort every key before taking any lock to avoid a cycle.
export function compatibleIdentityLockKeys(
  identifiers: readonly { type: string; normalizedValue: string }[],
): string[] {
  const keys = new Set<string>();
  for (const identifier of identifiers) {
    if (identifier.type === "BRAND_CODE") continue;
    const family = gtinTypes.has(identifier.type) ? "GTIN" : identifier.type;
    const representations = [identifier.normalizedValue];
    const compatible = compatibleIdentifierNorm(
      identifier.type as SourceIdentifierType,
      identifier.normalizedValue,
    );
    if (compatible !== undefined && compatible !== identifier.normalizedValue)
      representations.push(compatible);
    for (const norm of representations)
      keys.add(
        createHash("sha256")
          .update(JSON.stringify(["bros/master-identity/v1", family, norm]))
          .digest()
          .readBigInt64BE()
          .toString(),
      );
  }
  return [...keys].sort((left, right) =>
    BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0,
  );
}
