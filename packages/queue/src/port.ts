export const queueNames = [
  "system.test",
  "product.import",
  "identifier.resolve",
  "thumbnail.generate",
  "browser.run",
] as const;
export type QueueName = (typeof queueNames)[number];

// Queue storage carries references only; domain data and secrets remain outside the provider.
export interface QueuePayload {
  publicId: string;
}
export interface QueueJob {
  provider: string;
  providerId: string;
  data: QueuePayload;
  attempt: number;
  retryLimit: number;
  signal: AbortSignal;
}
export interface QueueReceipt {
  provider: string;
  providerId: string;
}
export interface QueueTransaction {
  executeSql(text: string, values: unknown[]): Promise<{ rows: object[] }>;
}
export interface QueuePort {
  inspect?(
    name: QueueName,
    receipt: QueueReceipt,
  ): Promise<"PENDING" | "COMPLETED" | "FAILED" | "MISSING">;
  start(): Promise<void>;
  publish(
    name: QueueName,
    data: QueuePayload,
    transaction?: QueueTransaction,
  ): Promise<QueueReceipt>;
  work(
    name: QueueName,
    handler: (job: QueueJob) => Promise<void>,
    options?: { concurrency: number },
  ): Promise<void>;
  stop(): Promise<void>;
}
