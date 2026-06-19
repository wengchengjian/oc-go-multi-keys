import { describe, it, expect, afterEach } from "vitest";
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { createGoFetch } from "../src/fetch.js";
import { createEmptyStore, type KeyStore } from "../src/types.js";
import type { AddressInfo } from "node:net";

function makeStore(overrides: Partial<KeyStore> = {}): KeyStore {
  return {
    ...createEmptyStore(),
    keys: [
      { name: "主号", key: "sk-aaa", priority: 1 },
      { name: "备用", key: "sk-bbb", priority: 2 },
    ],
    active: "主号",
    ...overrides,
  };
}

function startMockServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ server: Server; url: string }> {
  const server = createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

describe("createGoFetch", () => {
  let servers: Server[] = [];

  afterEach(() => {
    servers.forEach((s) => s.close());
    servers = [];
  });

  it("注入 Authorization header", async () => {
    const store = makeStore();
    const rotatedNames: string[] = [];
    const fetchFn = createGoFetch(store, (name) => rotatedNames.push(name));

    const { server, url } = await startMockServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ auth: req.headers["authorization"] }));
    });
    servers.push(server);

    const response = await fetchFn(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "test" }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { auth: string };
    expect(data.auth).toBe("Bearer sk-aaa");
    expect(rotatedNames).toHaveLength(0);
  });

  it("遇到 429 自动轮换并重试", async () => {
    const store = makeStore();
    let requestCount = 0;
    const rotatedNames: string[] = [];
    const fetchFn = createGoFetch(store, (name) => rotatedNames.push(name));

    const { server, url } = await startMockServer((req, res) => {
      requestCount++;
      const auth = req.headers["authorization"];
      if (auth === "Bearer sk-aaa" && requestCount === 1) {
        res.writeHead(429);
        res.end("too many requests");
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, usedKey: auth }));
      }
    });
    servers.push(server);

    const response = await fetchFn(`${url}/v1/chat/completions`, {
      method: "POST",
      body: JSON.stringify({ model: "test" }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { usedKey: string };
    expect(data.usedKey).toBe("Bearer sk-bbb");
    expect(requestCount).toBe(2);
    expect(rotatedNames).toEqual(["备用"]);
  });

  it("网络错误（非限流）直接透传，不触发轮换", async () => {
    const store = makeStore();
    const rotatedNames: string[] = [];
    const fetchFn = createGoFetch(store, (name) => rotatedNames.push(name));

    let err: Error | null = null;
    try {
      await fetchFn("http://127.0.0.1:19999/nonexistent", { method: "POST" });
    } catch (e) {
      err = e as Error;
    }

    expect(err).toBeInstanceOf(Error);
    expect(store.active).toBe("主号");
    expect(rotatedNames).toHaveLength(0);
  });
});
