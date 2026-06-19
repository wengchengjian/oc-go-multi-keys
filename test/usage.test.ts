import { describe, it, expect } from "vitest";
import { getUsageReport } from "../src/usage.js";

describe("getUsageReport", () => {
  it("返回字符串（无数据库时返回错误提示或空记录提示）", async () => {
    const result = await getUsageReport();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    // 要么是无法访问 SQLite，要么是无记录
    const valid =
      result.includes("无法访问") ||
      result.includes("暂无") ||
      result.includes("Session");
    expect(valid).toBe(true);
  });
});
