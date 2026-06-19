import { describe, it, expect } from "vitest";
import { addKey, removeKey, getActiveKey, cleanupCooldowns } from "../src/store.js";
import { createEmptyStore, type KeyStore } from "../src/types.js";

function makeStore(overrides: Partial<KeyStore> = {}): KeyStore {
  return { ...createEmptyStore(), ...overrides };
}

describe("addKey", () => {
  it("添加第一个 Key，自动设为 active 且 priority=1", () => {
    const store = makeStore();
    const result = addKey(store, { name: "主号", key: "sk-aaa", priority: 0 });
    expect(result.keys).toHaveLength(1);
    expect(result.keys[0]).toEqual({ name: "主号", key: "sk-aaa", priority: 1 });
    expect(result.active).toBe("主号");
  });

  it("添加第二个 Key 自动分配 priority=2", () => {
    const store = makeStore({
      keys: [{ name: "主号", key: "sk-aaa", priority: 1 }],
      active: "主号",
    });
    const result = addKey(store, { name: "备用", key: "sk-bbb", priority: 0 });
    expect(result.keys).toHaveLength(2);
    expect(result.keys[1].priority).toBe(2);
    expect(result.active).toBe("主号");
  });

  it("同名 Key 覆盖旧值", () => {
    const store = makeStore({
      keys: [{ name: "主号", key: "sk-old", priority: 1 }],
      active: "主号",
    });
    const result = addKey(store, { name: "主号", key: "sk-new", priority: 0 });
    expect(result.keys).toHaveLength(1);
    expect(result.keys[0].key).toBe("sk-new");
  });
});

describe("removeKey", () => {
  it("删除非活跃 Key", () => {
    const store = makeStore({
      keys: [
        { name: "主号", key: "sk-aaa", priority: 1 },
        { name: "备用", key: "sk-bbb", priority: 2 },
      ],
      active: "主号",
    });
    const result = removeKey(store, "备用");
    expect(result.keys).toHaveLength(1);
    expect(result.active).toBe("主号");
  });

  it("删除活跃 Key 自动切到下一个最高优先级", () => {
    const store = makeStore({
      keys: [
        { name: "主号", key: "sk-aaa", priority: 1 },
        { name: "备用", key: "sk-bbb", priority: 2 },
      ],
      active: "主号",
    });
    const result = removeKey(store, "主号");
    expect(result.keys).toHaveLength(1);
    expect(result.active).toBe("备用");
  });

  it("删除最后一个 Key", () => {
    const store = makeStore({
      keys: [{ name: "唯一", key: "sk-aaa", priority: 1 }],
      active: "唯一",
    });
    const result = removeKey(store, "唯一");
    expect(result.keys).toHaveLength(0);
    expect(result.active).toBe("");
  });

  it("删除不存在的 Key 不报错", () => {
    const store = makeStore({
      keys: [{ name: "主号", key: "sk-aaa", priority: 1 }],
      active: "主号",
    });
    const result = removeKey(store, "不存在");
    expect(result.keys).toHaveLength(1);
  });
});

describe("getActiveKey", () => {
  it("返回活跃 Key 的 key 值", () => {
    const store = makeStore({
      keys: [{ name: "主号", key: "sk-aaa", priority: 1 }],
      active: "主号",
    });
    expect(getActiveKey(store)).toBe("sk-aaa");
  });

  it("活跃 Key 不存在时返回空字符串", () => {
    const store = makeStore({ active: "不存在" });
    expect(getActiveKey(store)).toBe("");
  });
});

describe("cleanupCooldowns", () => {
  it("清除已过期的冷却记录", () => {
    const past = new Date(Date.now() - 120 * 60 * 1000).toISOString();
    const store = makeStore({
      cooldowns: {
        "备用": { since: past, reason: "429" },
      },
      cooldownMinutes: 60,
    });
    const result = cleanupCooldowns(store);
    expect(result.cooldowns["备用"]).toBeUndefined();
  });

  it("保留未过期的冷却记录", () => {
    const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const store = makeStore({
      cooldowns: {
        "备用": { since: recent, reason: "429" },
      },
      cooldownMinutes: 60,
    });
    const result = cleanupCooldowns(store);
    expect(result.cooldowns["备用"]).toBeDefined();
  });
});
