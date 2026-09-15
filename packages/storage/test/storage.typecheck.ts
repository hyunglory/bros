import type { ObjectStorage } from "../src/index.js";

export async function writeWorkerArtifact(
  storage: ObjectStorage,
  key: string,
  body: Uint8Array,
): Promise<Uint8Array> {
  await storage.putObject({ body, key });
  const stream = await storage.getObject(key);
  await storage.listObjects("automation");
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }
    chunks.push(result.value);
  }

  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
