import type { KeyStore, KeyEntry } from "./types.js";

/**
 * 添加或更新 Key。
 * - 同名 Key 覆盖旧值
 * - 新 Key 自动分配 priority = 当前最大 priority + 1
 * - 第一个 Key 自动设为 active
 */
export function addKey(store: KeyStore, entry: KeyEntry): KeyStore {
  const existing = store.keys.findIndex((k) => k.name === entry.name);
  const maxPriority =
    store.keys.length > 0
      ? Math.max(...store.keys.map((k) => k.priority))
      : 0;

  const newKey: KeyEntry = {
    ...entry,
    priority: entry.priority > 0 ? entry.priority : maxPriority + 1,
  };

  let keys: KeyEntry[];
  if (existing >= 0) {
    keys = [...store.keys];
    keys[existing] = newKey;
  } else {
    keys = [...store.keys, newKey];
  }

  const active = store.active || (keys.length === 1 ? newKey.name : store.active);

  return { ...store, keys, active };
}

/**
 * 删除指定 Key。
 * - 若删除的是活跃 Key，自动切换到剩余 Key 中优先级最高的
 * - 删除不存在的 Key 不报错
 */
export function removeKey(store: KeyStore, name: string): KeyStore {
  const keys = store.keys.filter((k) => k.name !== name);
  let active = store.active;

  if (store.active === name) {
    if (keys.length > 0) {
      const sorted = [...keys].sort((a, b) => a.priority - b.priority);
      active = sorted[0].name;
    } else {
      active = "";
    }
  }

  return { ...store, keys, active };
}

/**
 * 返回当前活跃 Key 的 key 值（API Key 字符串）。
 * 找不到时返回空字符串。
 */
export function getActiveKey(store: KeyStore): string {
  const entry = store.keys.find((k) => k.name === store.active);
  return entry?.key ?? "";
}

/**
 * 清理已过期的冷却记录。
 * 冷却时间 = 当前时间 - cooldownMinutes
 */
export function cleanupCooldowns(store: KeyStore): KeyStore {
  const now = Date.now();
  const threshold = store.cooldownMinutes * 60 * 1000;
  const cooldowns = { ...store.cooldowns };

  for (const [name, record] of Object.entries(cooldowns)) {
    if (now - new Date(record.since).getTime() >= threshold) {
      delete cooldowns[name];
    }
  }

  return { ...store, cooldowns };
}
