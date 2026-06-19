import { describe, it, expect } from "vitest";
import { isQuotaError, detectErrorFromText } from "../src/detector.js";

describe("isQuotaError — HTTP 状态码检测", () => {
  it("429 返回 true", async () => {
    const res = new Response("", { status: 429 });
    expect(await isQuotaError(res)).toBe(true);
  });

  it("402 返回 true", async () => {
    const res = new Response("", { status: 402 });
    expect(await isQuotaError(res)).toBe(true);
  });

  it("200 返回 false", async () => {
    const res = new Response("", { status: 200 });
    expect(await isQuotaError(res)).toBe(false);
  });

  it("500 返回 false", async () => {
    const res = new Response("", { status: 500 });
    expect(await isQuotaError(res)).toBe(false);
  });
});

describe("isQuotaError — 响应体关键词检测 (403)", () => {
  it("403 + 'quota exceeded' 返回 true", async () => {
    const res = new Response(
      JSON.stringify({ error: { message: "quota exceeded" } }),
      { status: 403 },
    );
    expect(await isQuotaError(res)).toBe(true);
  });

  it("403 + 'rate limit' 返回 true", async () => {
    const res = new Response(
      JSON.stringify({ error: { message: "rate limit reached" } }),
      { status: 403 },
    );
    expect(await isQuotaError(res)).toBe(true);
  });

  it("403 + '额度不足' 返回 true", async () => {
    const res = new Response(
      JSON.stringify({ error: { message: "额度不足" } }),
      { status: 403 },
    );
    expect(await isQuotaError(res)).toBe(true);
  });

  it("403 + 普通错误消息 返回 false", async () => {
    const res = new Response(
      JSON.stringify({ error: { message: "invalid model" } }),
      { status: 403 },
    );
    expect(await isQuotaError(res)).toBe(false);
  });
});

describe("isQuotaError — 响应体关键词检测 (400)", () => {
  it("400 + 'insufficient quota' 返回 true", async () => {
    const res = new Response(
      JSON.stringify({ error: { code: "insufficient_quota" } }),
      { status: 400 },
    );
    expect(await isQuotaError(res)).toBe(true);
  });

  it("400 + 普通错误 返回 false", async () => {
    const res = new Response(
      JSON.stringify({ error: { code: "invalid_request" } }),
      { status: 400 },
    );
    expect(await isQuotaError(res)).toBe(false);
  });
});

describe("detectErrorFromText — 文本关键词检测", () => {
  it("匹配 'rate limit'", () => {
    expect(detectErrorFromText("Error: rate limit exceeded")).toBe(true);
  });

  it("匹配 'too many requests'", () => {
    expect(detectErrorFromText("too many requests, try again later")).toBe(true);
  });

  it("匹配中文 '额度耗尽'", () => {
    expect(detectErrorFromText("您的额度已耗尽")).toBe(true);
  });

  it("不匹配无关文本", () => {
    expect(detectErrorFromText("model not found")).toBe(false);
  });
});
