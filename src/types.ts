/** 单个 API Key 条目 */
export interface KeyEntry {
  name: string;
  key: string;
  priority: number;
}

/** 冷却记录 */
export interface CooldownRecord {
  since: string;
  reason: "429" | "quota" | "manual";
}

/** Key 存储结构 */
export interface KeyStore {
  keys: KeyEntry[];
  active: string;
  cooldownMinutes: number;
  cooldowns: Record<string, CooldownRecord>;
}

/** 默认冷却时间（分钟） */
export const DEFAULT_COOLDOWN_MINUTES = 60;

/** Key 存储文件路径（相对于 home 目录） */
export const STORE_PATH = ".opencode/oc-go-keys.json";

/** Go 套餐 API 端点 */
export const GO_BASE_URL = "https://opencode.ai/zen/go/v1";

/** Provider ID */
export const PROVIDER_ID = "oc-go";

/** 创建空 store */
export function createEmptyStore(): KeyStore {
  return {
    keys: [],
    active: "",
    cooldownMinutes: DEFAULT_COOLDOWN_MINUTES,
    cooldowns: {},
  };
}
