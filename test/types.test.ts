import { describe, it, expect } from "vitest";
import { createEmptyStore, DEFAULT_COOLDOWN_MINUTES, GO_BASE_URL, PROVIDER_ID } from "../src/types.js";

describe("createEmptyStore", () => {
  it("返回空的 KeyStore", () => {
    const store = createEmptyStore();
    expect(store.keys).toEqual([]);
    expect(store.active).toBe("");
    expect(store.cooldownMinutes).toBe(DEFAULT_COOLDOWN_MINUTES);
    expect(store.cooldowns).toEqual({});
  });
});

describe("常量", () => {
  it("DEFAULT_COOLDOWN_MINUTES 为 60", () => {
    expect(DEFAULT_COOLDOWN_MINUTES).toBe(60);
  });

  it("GO_BASE_URL 指向 opencode.ai", () => {
    expect(GO_BASE_URL).toContain("opencode.ai");
  });

  it("PROVIDER_ID 为 oc-go", () => {
    expect(PROVIDER_ID).toBe("oc-go");
  });
});
