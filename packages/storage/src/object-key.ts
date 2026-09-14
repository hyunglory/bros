import { StorageError } from "./port.js";

const MAX_KEY_LENGTH = 1_024;
const MAX_SEGMENT_LENGTH = 128;
const portableSegmentPattern = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const windowsReservedNamePattern = /^(?:AUX|CON|NUL|PRN|COM[1-9]|LPT[1-9])(?:\.|$)/i;

export function validateObjectKey(key: string): string {
  if (key.length === 0 || key.length > MAX_KEY_LENGTH || key.includes("\\")) {
    throw invalidObjectKey();
  }

  const segments = key.split("/");
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment.length > MAX_SEGMENT_LENGTH ||
        segment === "." ||
        segment === ".." ||
        !portableSegmentPattern.test(segment) ||
        windowsReservedNamePattern.test(segment),
    )
  ) {
    throw invalidObjectKey();
  }

  return key;
}

export function buildObjectKey(...segments: readonly string[]): string {
  return validateObjectKey(segments.join("/"));
}

function invalidObjectKey(): StorageError {
  return new StorageError(
    "INVALID_OBJECT_KEY",
    "Object key must contain only portable relative path segments",
  );
}
