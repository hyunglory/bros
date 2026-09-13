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
  start(): Promise<void>;
  publish(
    name: QueueName,
    data: QueuePayload,
    transaction?: QueueTransaction,
  ): Promise<QueueReceipt>;
  work(name: QueueName, handler: (job: QueueJob) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
}
