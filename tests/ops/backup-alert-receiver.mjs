import { createServer } from "node:http";

const events = [];
const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/events") {
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(events));
    return;
  }
  if (request.method !== "POST" || request.url !== "/alerts") {
    response.writeHead(404).end();
    return;
  }
  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    try {
      events.push(JSON.parse(body));
      response.writeHead(204).end();
    } catch {
      response.writeHead(400).end();
    }
  });
});
server.listen(8787, "0.0.0.0");
