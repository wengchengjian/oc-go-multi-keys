import type { KeyStore } from "./types.js";

/**
 * 轮换到下一个可用的 API Key。
 *
 * 规则：
 * 1. 将当前 active key 加入冷却（reason="429"）
 * 2. 按 priority 升序选择第一个不在冷却中的 key
 * 3. 如果全部在冷却中，清除所有冷却，选 priority 最小的
 * 4. 更新 active 并返回新 store
 */
export function rotate(store: KeyStore): KeyStore {
  if (store.keys.length === 0) return store;

  const now = new Date().toISOString();
  const cooldowns = {
    ...store.cooldowns,
    [store.active]: { since: now, reason: "429" as const },
  };

  // 筛选可用 key（不在冷却中）
  const available = store.keys.filter((k) => !cooldowns[k.name]);

  if (available.length > 0) {
    const sorted = [...available].sort((a, b) => a.priority - b.priority);
    return { ...store, active: sorted[0].name, cooldowns };
  }

  // 全部在冷却中 → 清除冷却，用最高优先级
  const sorted = [...store.keys].sort((a, b) => a.priority - b.priority);
  return { ...store, active: sorted[0].name, cooldowns: {} };
}

/**
 * 手动切换到指定 key，清除该 key 的冷却。
 */
export function manualSwitch(store: KeyStore, name: string): KeyStore | null {
  if (!store.keys.find((k) => k.name === name)) return null;
  const cooldowns = { ...store.cooldowns };
  delete cooldowns[name];
  return { ...store, active: name, cooldowns };
}
