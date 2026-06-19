import { describe, it, expect } from "vitest";
import { rotate, manualSwitch } from "../src/rotation.js";
import { createEmptyStore, type KeyStore } from "../src/types.js";

function makeStore(overrides: Partial<KeyStore> = {}): KeyStore {
  return { ...createEmptyStore(), ...overrides };
}

describe("rotate", () => {
  it("从当前 key 轮换到下一个最高优先级 key", () => {
    const store = makeStore({
      keys: [
        { name: "主号", key: "sk-aaa", priority: 1 },
        { name: "备用", key: "sk-bbb", priority: 2 },
      ],
      active: "主号",
    });
    const result = rotate(store);
    expect(result.active).toBe("备用");
    expect(result.cooldowns["主号"]).toBeDefined();
    expect(result.cooldowns["主号"].reason).toBe("429");
  });

  it("跳过冷却中的 key，选下一个可用", () => {
    const store = makeStore({
      keys: [
        { name: "主号", key: "sk-aaa", priority: 1 },
        { name: "备用1", key: "sk-bbb", priority: 2 },
        { name: "备用2", key: "sk-ccc", priority: 3 },
      ],
      active: "主号",
      cooldowns: {
        "备用1": { since: new Date().toISOString(), reason: "429" },
      },
    });
    const result = rotate(store);
    expect(result.active).toBe("备用2");
  });

  it("全部在冷却中时，清除所有冷却并使用最高优先级 key", () => {
    const now = new Date().toISOString();
    const store = makeStore({
      keys: [
        { name: "主号", key: "sk-aaa", priority: 1 },
        { name: "备用", key: "sk-bbb", priority: 2 },
      ],
      active: "主号",
      cooldowns: {
        "主号": { since: now, reason: "429" },
        "备用": { since: now, reason: "429" },
      },
    });
    const result = rotate(store);
    expect(result.active).toBe("主号");
    expect(result.cooldowns).toEqual({});
  });

  it("只有一个 key 时，冷却后仍用自己", () => {
    const store = makeStore({
      keys: [{ name: "唯一", key: "sk-aaa", priority: 1 }],
      active: "唯一",
    });
    const result = rotate(store);
    expect(result.active).toBe("唯一");
  });

  it("空 store 不做任何事", () => {
    const store = makeStore();
    const result = rotate(store);
    expect(result.active).toBe("");
  });
});

describe("manualSwitch", () => {
  it("切换到指定 key 并清除其冷却", () => {
    const store = makeStore({
      keys: [
        { name: "主号", key: "sk-aaa", priority: 1 },
        { name: "备用", key: "sk-bbb", priority: 2 },
      ],
      active: "主号",
      cooldowns: {
        "备用": { since: new Date().toISOString(), reason: "429" },
      },
    });
    const result = manualSwitch(store, "备用");
    expect(result).not.toBeNull();
    expect(result!.active).toBe("备用");
    expect(result!.cooldowns["备用"]).toBeUndefined();
  });

  it("切换到不存在的 key 返回 null", () => {
    const store = makeStore({
      keys: [{ name: "主号", key: "sk-aaa", priority: 1 }],
      active: "主号",
    });
    const result = manualSwitch(store, "不存在");
    expect(result).toBeNull();
  });
});
