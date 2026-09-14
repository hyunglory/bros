import { createServer } from "node:http";

const host = process.env.STAGING_IDENTITY_HOST ?? "127.0.0.1";
const port = Number(process.env.STAGING_IDENTITY_PORT ?? "3001");

if (host !== "127.0.0.1" || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Invalid staging identity listener configuration");
}

const server = createServer((request, response) => {
  response.setHeader("content-type", "application/json");
  response.setHeader("cache-control", "no-store");
  response.end(
    JSON.stringify({
      actor: request.headers["x-bros-actor"] ?? null,
      authorizationPresent: request.headers.authorization !== undefined,
      proxyTokenValid:
        Boolean(process.env.BROS_PROXY_AUTH_TOKEN) &&
        request.headers["x-bros-proxy-token"] === process.env.BROS_PROXY_AUTH_TOKEN,
    }),
  );
});

server.listen(port, host);

const stop = () => server.close(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
