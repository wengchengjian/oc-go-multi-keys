import { tool } from "@opencode-ai/plugin";
import type { KeyStore } from "./types.js";
import { addKey, removeKey, getActiveKey, cleanupCooldowns } from "./store.js";
import { manualSwitch } from "./rotation.js";

export type StoreIO = {
  load(): KeyStore;
  save(store: KeyStore): void;
};

export function buildCommands(io?: StoreIO) {
  const load = io?.load ?? (() => ({ keys: [], active: "", cooldownMinutes: 60, cooldowns: {} } as KeyStore));
  const save = io?.save ?? (() => {});

  return {
    go_keys_add: tool({
      description: "添加一个 OpenCode Go 套餐的 API Key",
      args: {
        name: tool.schema.string("Key 的别名，如 '主号'、'备用1'"),
        key: tool.schema.string("API Key 值"),
      },
      async execute(args) {
        const store = cleanupCooldowns(load());
        const updated = addKey(store, {
          name: args.name,
          key: args.key,
          priority: 0,
        });
        save(updated);
        return `✅ 已添加 Key "${args.name}"，当前活跃 Key: ${updated.active}\n共 ${updated.keys.length} 个 Key`;
      },
    }),

    go_keys_rm: tool({
      description: "删除一个 API Key",
      args: {
        name: tool.schema.string("要删除的 Key 别名"),
      },
      async execute(args) {
        const store = cleanupCooldowns(load());
        const updated = removeKey(store, args.name);
        save(updated);
        return `🗑️ 已删除 Key "${args.name}"，当前活跃 Key: ${updated.active || "无"}`;
      },
    }),

    go_keys_list: tool({
      description: "列出所有 Go 套餐 API Key 及状态",
      args: {},
      async execute() {
        const store = cleanupCooldowns(load());
        save(store);
        if (store.keys.length === 0) {
          return "📭 尚未添加任何 Key，请使用 go_keys_add 添加。";
        }
        const now = Date.now();
        const threshold = store.cooldownMinutes * 60 * 1000;
        const lines = store.keys.map((k) => {
          const isActive = k.name === store.active ? "🟢" : "⚪";
          const cd = store.cooldowns[k.name];
          let status = "可用";
          if (cd) {
            const elapsed = now - new Date(cd.since).getTime();
            if (elapsed < threshold) {
              const remaining = Math.ceil((threshold - elapsed) / 60000);
              status = `冷却中 (${remaining}分钟后恢复) - ${cd.reason}`;
            }
          }
          return `${isActive} [P${k.priority}] ${k.name} — ${status}`;
        });
        return `⏱️ 冷却: ${store.cooldownMinutes}min | 📦 ${store.keys.length} Keys\n\n${lines.join("\n")}`;
      },
    }),

    go_keys_switch: tool({
      description: "手动切换到指定的 API Key",
      args: {
        name: tool.schema.string("要切换到的 Key 别名"),
      },
      async execute(args) {
        const store = cleanupCooldowns(load());
        const result = manualSwitch(store, args.name);
        if (!result) {
          return `❌ 未找到 Key "${args.name}"`;
        }
        save(result);
        return `🔀 已切换到 "${args.name}"`;
      },
    }),

    go_keys_cooldown: tool({
      description: "设置或查看冷却时间（分钟）",
      args: {
        minutes: tool.schema.number("冷却时间（分钟），不填则查看当前值").optional(),
      },
      async execute(args) {
        const store = cleanupCooldowns(load());
        if (args.minutes !== undefined) {
          store.cooldownMinutes = args.minutes;
          save(store);
          return `⏱️ 冷却时间已设为 ${args.minutes} 分钟`;
        }
        return `⏱️ 当前冷却时间: ${store.cooldownMinutes} 分钟`;
      },
    }),

    go_keys_reset: tool({
      description: "清除所有 Key 的冷却状态",
      args: {},
      async execute() {
        const store = cleanupCooldowns(load());
        store.cooldowns = {};
        save(store);
        return "🔄 已清除所有冷却状态";
      },
    }),
  };
}
