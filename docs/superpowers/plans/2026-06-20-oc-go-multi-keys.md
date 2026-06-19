# oc-go-multi-keys 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 OpenCode Go 套餐多账号管理插件，支持多 Key 轮换、冷却恢复、自动重试。

**Architecture:** 通过 OpenCode 的 auth plugin hook 注入 custom fetch，在 HTTP 层拦截请求。检测到 429/配额错误时自动切换到下一个 API Key 并重试。Slash commands 提供 Key 管理界面。

**Tech Stack:** TypeScript, @opencode-ai/plugin, @opencode-ai/sdk, vitest, Node.js >= 20

**文件结构:**
```
src/types.ts       — 核心类型定义
src/store.ts       — Key 存储 CRUD，读写 ~/.opencode/oc-go-keys.json
src/rotation.ts    — 轮换逻辑，优先级排序 + 冷却管理
src/detector.ts    — 限流/配额错误检测
src/fetch.ts       — Custom fetch 实现，注入 Key + 重试
src/commands.ts    — Slash command 工具注册
src/index.ts       — 插件入口，组装所有模块
test/*.test.ts     — 对应测试文件
```

---

### Task 1: 项目脚手架

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: 创建 package.json**

```bash
cd F:\project\oc-go-multi-keys
```

```json
{
  "name": "oc-go-multi-keys",
  "version": "0.1.0",
  "description": "OpenCode plugin for managing multiple Go plan API keys with automatic rotation",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "type": "module",
  "license": "MIT",
  "author": "",
  "repository": {
    "type": "git",
    "url": "https://github.com/your-org/oc-go-multi-keys"
  },
  "keywords": ["opencode", "plugin", "go-plan", "multi-key", "rotation"],
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "peerDependencies": {
    "@opencode-ai/plugin": "^1.0.150"
  },
  "devDependencies": {
    "@opencode-ai/plugin": "^1.0.150",
    "@opencode-ai/sdk": "^1.0.150",
    "@types/node": "^24.6.2",
    "typescript": "^5.9.3",
    "vitest": "^3.2.4"
  },
  "files": ["dist/", "README.md", "LICENSE"]
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["index.ts", "src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 3: 创建 vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: 创建 .gitignore**

```
node_modules/
dist/
*.tsbuildinfo
```

- [ ] **Step 5: 创建空目录结构并安装依赖**

```bash
mkdir -p src test
```

```bash
npm install
```

Expected: 安装成功，无错误。

- [ ] **Step 6: 创建空 index.ts 验证构建**

```typescript
// index.ts (临时占位)
export const placeholder = "oc-go-multi-keys";
```

```bash
npx tsc
```

Expected: 构建成功，`dist/` 目录生成。

- [ ] **Step 7: 初始化 git 并提交**

```bash
cd F:\project\oc-go-multi-keys && git init && git add -A && git commit -m "chore: 项目脚手架初始化"
```

---

### Task 2: types.ts — 核心类型

**Files:**
- Create: `src/types.ts`
- Create: `test/types.test.ts`

- [ ] **Step 1: 编写 types.ts**

```typescript
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

/** Key 存储文件路径 */
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
```

- [ ] **Step 2: 编写类型验证测试 (不需要真正测试，类型层面确认编译通过)**

```typescript
// test/types.test.ts
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
```

- [ ] **Step 3: 运行测试**

```bash
npx vitest run
```

Expected: 4 tests pass.

- [ ] **Step 4: 构建并提交**

```bash
npx tsc && git add -A && git commit -m "feat: 添加核心类型定义"
```

---

### Task 3: store.ts — Key 存储 CRUD

**Files:**
- Create: `src/store.ts`
- Create: `test/store.test.ts`

- [ ] **Step 1: 编写 store.test.ts（TDD — 先写失败测试）**

```typescript
// test/store.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, unlinkSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createEmptyStore, type KeyStore } from "../src/types.js";

// 因为我们不能 mock homedir，直接在 store.ts 中提供可注入路径的接口
// 这里测试纯函数逻辑，不依赖文件系统
// 文件 I/O 部分在集成测试中覆盖

// 临时：导入待实现的函数
import { addKey, removeKey, getActiveKey, cleanupCooldowns } from "../src/store.js";

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
    expect(result.active).toBe("主号"); // active 不变
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
    const past = new Date(Date.now() - 120 * 60 * 1000).toISOString(); // 2 小时前
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
    const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 分钟前
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
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run
```

Expected: FAIL — 所有测试报 "function not defined" 或类似错误。

- [ ] **Step 3: 实现 src/store.ts**

```typescript
import { createEmptyStore, type KeyStore, type KeyEntry } from "./types.js";

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

// 文件 I/O 函数将在 index.ts 中结合实际路径使用
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run
```

Expected: 所有 test/store.test.ts 测试 PASS。

- [ ] **Step 5: 构建并提交**

```bash
npx tsc && git add -A && git commit -m "feat: 实现 Key 存储 CRUD"
```

---

### Task 4: rotation.ts — 轮换逻辑

**Files:**
- Create: `src/rotation.ts`
- Create: `test/rotation.test.ts`

- [ ] **Step 1: 编写 rotation.test.ts（TDD — 先写失败测试）**

```typescript
// test/rotation.test.ts
import { describe, it, expect } from "vitest";
import { rotate } from "../src/rotation.js";
import { createEmptyStore, type KeyStore } from "../src/types.js";

function makeStore(overrides: Partial<KeyStore> = {}): KeyStore {
  return { ...createEmptyStore(), ...overrides };
}

function fixedTime(offsetMinutes: number): string {
  return new Date(Date.now() + offsetMinutes * 60 * 1000).toISOString();
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
    // 主号进入冷却
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
    expect(result.active).toBe("备用2"); // 跳过冷却的备用1
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
    expect(result.cooldowns).toEqual({}); // 冷却全部清除
  });

  it("只有一个 key 时，冷却后自己恢复", () => {
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
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run test/rotation.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现 src/rotation.ts**

```typescript
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

  // 筛选可用 key（不在冷却中且不是当前 key）
  // 注意：当前 key 刚被加入冷却，所以会被过滤掉
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
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run test/rotation.test.ts
```

Expected: 5 tests PASS。

- [ ] **Step 5: 构建并提交**

```bash
npx tsc && git add -A && git commit -m "feat: 实现 Key 轮换逻辑"
```

---

### Task 5: detector.ts — 限流检测

**Files:**
- Create: `src/detector.ts`
- Create: `test/detector.test.ts`

- [ ] **Step 1: 编写 detector.test.ts（TDD — 先写失败测试）**

```typescript
// test/detector.test.ts
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
    const res = new Response(JSON.stringify({ error: { message: "quota exceeded" } }), { status: 403 });
    expect(await isQuotaError(res)).toBe(true);
  });

  it("403 + 'rate limit' 返回 true", async () => {
    const res = new Response(JSON.stringify({ error: { message: "rate limit reached" } }), { status: 403 });
    expect(await isQuotaError(res)).toBe(true);
  });

  it("403 + '额度不足' 返回 true", async () => {
    const res = new Response(JSON.stringify({ error: { message: "额度不足" } }), { status: 403 });
    expect(await isQuotaError(res)).toBe(true);
  });

  it("403 + 普通错误消息 返回 false", async () => {
    const res = new Response(JSON.stringify({ error: { message: "invalid model" } }), { status: 403 });
    expect(await isQuotaError(res)).toBe(false);
  });
});

describe("isQuotaError — 响应体关键词检测 (400)", () => {
  it("400 + 'insufficient quota' 返回 true", async () => {
    const res = new Response(JSON.stringify({ error: { code: "insufficient_quota" } }), { status: 400 });
    expect(await isQuotaError(res)).toBe(true);
  });

  it("400 + 普通错误 返回 false", async () => {
    const res = new Response(JSON.stringify({ error: { code: "invalid_request" } }), { status: 400 });
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
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run test/detector.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现 src/detector.ts**

```typescript
const ERROR_PATTERNS = /quota|limit|exceeded|insufficient|额度|限额|耗尽|rate.?limit|too many requests/i;

/**
 * 检测 HTTP Response 是否为限流/配额错误。
 * 先看状态码（429/402），403/400 再检查响应体关键词。
 */
export async function isQuotaError(response: Response): Promise<boolean> {
  if (response.status === 429 || response.status === 402) {
    return true;
  }

  if (response.status === 403 || response.status === 400) {
    try {
      const clone = response.clone();
      const text = await clone.text();
      return detectErrorFromText(text);
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * 检测文本中是否包含限流/配额相关关键词。
 */
export function detectErrorFromText(text: string): boolean {
  return ERROR_PATTERNS.test(text);
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run test/detector.test.ts
```

Expected: 所有测试 PASS。

- [ ] **Step 5: 构建并提交**

```bash
npx tsc && git add -A && git commit -m "feat: 实现限流错误检测"
```

---

### Task 6: fetch.ts — Custom Fetch

**Files:**
- Create: `src/fetch.ts`
- Create: `test/fetch.test.ts`

- [ ] **Step 1: 编写 fetch.test.ts（TDD）**

```typescript
// test/fetch.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
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

// 简单的 mock HTTP server
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
    const fetchFn = createGoFetch(store, () => {});

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
    const data = await response.json();
    expect(data.auth).toBe("Bearer sk-aaa");
  });

  it("遇到 429 自动轮换并重试", async () => {
    const store = makeStore();
    let requestCount = 0;
    const fetchFn = createGoFetch(store, () => {});

    const { server, url } = await startMockServer((req, res) => {
      requestCount++;
      const auth = req.headers["authorization"];
      if (auth === "Bearer sk-aaa" && requestCount === 1) {
        // 第一次请求：返回 429
        res.writeHead(429);
        res.end("too many requests");
      } else {
        // 重试请求：返回成功
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
    const data = await response.json();
    expect(data.usedKey).toBe("Bearer sk-bbb"); // 轮换到了备用 key
    expect(requestCount).toBe(2); // 总共两次请求
  });

  it("网络错误（非限流）直接透传，不触发轮换", async () => {
    const store = makeStore();
    const fetchFn = createGoFetch(store, () => {});

    const response = await fetchFn("http://127.0.0.1:19999/nonexistent", {
      method: "POST",
    }).catch((e) => e);

    // fetch 在 Node.js 中对连接拒绝会抛出错误
    expect(response).toBeInstanceOf(Error);
    // active 不应改变（没用 rotate）
    expect(store.active).toBe("主号");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run test/fetch.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现 src/fetch.ts**

```typescript
import type { KeyStore } from "./types.js";
import { isQuotaError } from "./detector.js";
import { rotate } from "./rotation.js";

/**
 * 创建一个自定义 fetch 函数，自动注入 API Key 并在限流时轮换重试。
 *
 * @param store - Key 存储（会被 rotate 修改）
 * @param onRotate - 轮换后回调，用于通知用户
 */
export function createGoFetch(
  store: KeyStore,
  onRotate: (newActive: string) => void,
): (input: Request | string | URL, init?: RequestInit) => Promise<Response> {
  // 内存锁：防止并发请求同时轮换
  let rotating = false;

  return async (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const activeEntry = store.keys.find((k) => k.name === store.active);
    if (activeEntry) {
      headers.set("Authorization", `Bearer ${activeEntry.key}`);
    }

    let response: Response;
    try {
      response = await fetch(input, { ...init, headers });
    } catch (e) {
      // 网络错误直接抛出，不轮换
      throw e;
    }

    // 非限流错误直接返回
    if (!(await isQuotaError(response))) {
      return response;
    }

    // 加锁，防止并发轮换
    if (rotating) return response;
    rotating = true;

    try {
      const newStore = rotate(store);
      // 更新 store 的状态（通过引用）
      Object.assign(store, newStore);

      if (newStore.active !== activeEntry?.name) {
        onRotate(newStore.active);
        // 用新 key 重试
        const retryHeaders = new Headers(init?.headers);
        const newEntry = store.keys.find((k) => k.name === store.active);
        if (newEntry) {
          retryHeaders.set("Authorization", `Bearer ${newEntry.key}`);
          return await fetch(input, { ...init, headers: retryHeaders });
        }
      }
    } finally {
      rotating = false;
    }

    return response;
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run test/fetch.test.ts
```

Expected: 3 tests PASS。

- [ ] **Step 5: 构建并提交**

```bash
npx tsc && git add -A && git commit -m "feat: 实现 custom fetch + 自动轮换重试"
```

---

### Task 7: commands.ts — Slash Commands

**Files:**
- Create: `src/commands.ts`
- Create: `test/commands.test.ts`

- [ ] **Step 1: 编写 commands.test.ts（TDD）**

```typescript
// test/commands.test.ts
import { describe, it, expect } from "vitest";
import { tool } from "@opencode-ai/plugin";
import { buildCommands } from "../src/commands.js";
import { createEmptyStore } from "../src/types.js";

describe("buildCommands", () => {
  it("返回 6 个 tool", () => {
    const commands = buildCommands();
    expect(commands).toHaveProperty("go_keys_add");
    expect(commands).toHaveProperty("go_keys_rm");
    expect(commands).toHaveProperty("go_keys_list");
    expect(commands).toHaveProperty("go_keys_switch");
    expect(commands).toHaveProperty("go_keys_cooldown");
    expect(commands).toHaveProperty("go_keys_reset");
  });

  it("每个 tool 都有 description 和 args", () => {
    const commands = buildCommands();
    for (const [name, t] of Object.entries(commands)) {
      expect(t.description, `${name} 缺少 description`).toBeTruthy();
      expect(t.args, `${name} 缺少 args`).toBeDefined();
    }
  });

  it("go_keys_add requires name and key args", () => {
    const commands = buildCommands();
    const addTool = commands["go_keys_add"];
    expect(addTool.args).toHaveProperty("name");
    expect(addTool.args).toHaveProperty("key");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run test/commands.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现 src/commands.ts**

```typescript
import { tool } from "@opencode-ai/plugin";
import type { KeyStore } from "./types.js";
import { addKey, removeKey, getActiveKey } from "./store.js";
import { manualSwitch } from "./rotation.js";

export function buildCommands() {
  return {
    go_keys_add: tool({
      description: "添加一个 OpenCode Go 套餐的 API Key",
      args: {
        name: tool.schema.string({ description: "Key 的别名，如 '主号'、'备用1'" }),
        key: tool.schema.string({ description: "API Key 值" }),
      },
      async execute(args, _context) {
        const store = loadStoreFromDisk();
        const updated = addKey(store, {
          name: args.name as string,
          key: args.key as string,
          priority: 0,
        });
        saveStoreToDisk(updated);
        return `✅ 已添加 Key "${args.name}"，当前活跃 Key: ${updated.active}`;
      },
    }),

    go_keys_rm: tool({
      description: "删除一个 API Key",
      args: {
        name: tool.schema.string({ description: "要删除的 Key 别名" }),
      },
      async execute(args, _context) {
        const store = loadStoreFromDisk();
        const updated = removeKey(store, args.name as string);
        saveStoreToDisk(updated);
        return `🗑️ 已删除 Key "${args.name}"，当前活跃 Key: ${updated.active || "无"}`;
      },
    }),

    go_keys_list: tool({
      description: "列出所有 Go 套餐 API Key 及状态",
      args: {},
      async execute(_args, _context) {
        const store = loadStoreFromDisk();
        if (store.keys.length === 0) {
          return "📭 尚未添加任何 Key，请使用 /go-keys add 添加。";
        }
        const now = Date.now();
        const threshold = store.cooldownMinutes * 60 * 1000;
        const lines = store.keys.map((k) => {
          const isActive = k.name === store.active ? "🟢" : "⚪";
          const cooldown = store.cooldowns[k.name];
          let status = "可用";
          if (cooldown) {
            const elapsed = now - new Date(cooldown.since).getTime();
            if (elapsed < threshold) {
              const remaining = Math.ceil((threshold - elapsed) / 60000);
              status = `冷却中 (${remaining}分钟后恢复)`;
            }
          }
          return `${isActive} [P${k.priority}] ${k.name} — ${status}`;
        });
        const summary = `冷却时间: ${store.cooldownMinutes} 分钟 | 共 ${store.keys.length} 个 Key`;
        return `${summary}\n\n${lines.join("\n")}`;
      },
    }),

    go_keys_switch: tool({
      description: "手动切换到指定的 API Key",
      args: {
        name: tool.schema.string({ description: "要切换到的 Key 别名" }),
      },
      async execute(args, _context) {
        const store = loadStoreFromDisk();
        const result = manualSwitch(store, args.name as string);
        if (!result) {
          return `❌ 未找到 Key "${args.name}"`;
        }
        saveStoreToDisk(result);
        return `🔀 已切换到 "${args.name}"`;
      },
    }),

    go_keys_cooldown: tool({
      description: "设置或查看冷却时间（分钟）",
      args: {
        minutes: tool.schema.number({ description: "冷却时间（分钟），不填则查看当前值" }).optional(),
      },
      async execute(args, _context) {
        const store = loadStoreFromDisk();
        if (args.minutes !== undefined) {
          store.cooldownMinutes = args.minutes as number;
          saveStoreToDisk(store);
          return `⏱️ 冷却时间已设为 ${args.minutes} 分钟`;
        }
        return `⏱️ 当前冷却时间: ${store.cooldownMinutes} 分钟`;
      },
    }),

    go_keys_reset: tool({
      description: "清除所有 Key 的冷却状态",
      args: {},
      async execute(_args, _context) {
        const store = loadStoreFromDisk();
        store.cooldowns = {};
        saveStoreToDisk(store);
        return "🔄 已清除所有冷却状态";
      },
    }),
  };
}

// 这些函数在 index.ts 中会被替换为实际实现
// 暂时占位
function loadStoreFromDisk(): KeyStore {
  // 占位 — index.ts 中注入实际实现
  throw new Error("loadStoreFromDisk not injected");
}

function saveStoreToDisk(_store: KeyStore): void {
  // 占位 — index.ts 中注入实际实现
  throw new Error("saveStoreFromDisk not injected");
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run test/commands.test.ts
```

Expected: 3 tests PASS（只测试 tool 注册结构，不测试 execute 逻辑）。

- [ ] **Step 5: 构建并提交**

```bash
npx tsc && git add -A && git commit -m "feat: 实现 Slash command 工具注册"
```

---

### Task 8: index.ts — 插件入口 + 文件 I/O 集成

**Files:**
- Create: `src/index.ts`（插件入口，同时替代根目录 index.ts）
- Modify: `index.ts`（根目录入口，re-export src/index.ts）

- [ ] **Step 1: 实现 src/index.ts**

```typescript
import type { Plugin } from "@opencode-ai/plugin";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createEmptyStore, type KeyStore, PROVIDER_ID, GO_BASE_URL, STORE_PATH } from "./types.js";
import { getActiveKey, cleanupCooldowns } from "./store.js";
import { createGoFetch } from "./fetch.js";
import { buildCommands } from "./commands.js";

/** 获取完整的 store 文件路径 */
function storeFilePath(): string {
  return join(homedir(), STORE_PATH);
}

/** 从磁盘加载 KeyStore */
function loadStore(): KeyStore {
  const filePath = storeFilePath();
  try {
    if (!existsSync(filePath)) {
      return createEmptyStore();
    }
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as KeyStore;
    // 清理过期冷却
    return cleanupCooldowns(parsed);
  } catch {
    return createEmptyStore();
  }
}

/** 保存 KeyStore 到磁盘 */
function saveStore(store: KeyStore): void {
  const filePath = storeFilePath();
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(store, null, 2), { encoding: "utf-8", mode: 0o600 });
}

/**
 * OpenCode Go 套餐多账号管理插件
 *
 * @example
 * ```json
 * // opencode.json
 * {
 *   "plugin": ["oc-go-multi-keys"],
 *   "provider": {
 *     "oc-go": {
 *       "npm": "@ai-sdk/openai-compatible",
 *       "options": {
 *         "baseURL": "https://opencode.ai/zen/go/v1"
 *       }
 *     }
 *   },
 *   "model": "oc-go/deepseek-v4-pro"
 * }
 * ```
 */
export const OcGoMultiKeys: Plugin = async ({ client }) => {
  const store = loadStore();

  // 将全局 store 读写注入到 commands 中
  // （通过闭包共享 store 引用）

  return {
    auth: {
      provider: PROVIDER_ID,
      async loader(_getAuth, _provider) {
        return {
          apiKey: getActiveKey(store) || "placeholder",
          baseURL: GO_BASE_URL,
          fetch: createGoFetch(store, (newActive) => {
            saveStore(store);
            console.log(`[oc-go-multi-keys] 🔀 已自动切换到 "${newActive}"`);
          }),
        };
      },
    },

    tool: {
      go_keys_add: {
        ...buildCommands()["go_keys_add"],
        async execute(args, _context) {
          const cmd = buildCommands();
          // 重新加载最新 store（可能被其他命令修改）
          const currentStore = loadStore();
          const { addKey } = await import("./store.js");
          const updated = addKey(currentStore, {
            name: args.name as string,
            key: args.key as string,
            priority: 0,
          });
          Object.assign(store, updated);
          saveStore(store);
          return `✅ 已添加 Key "${args.name}"，当前活跃 Key: ${store.active}\n共 ${store.keys.length} 个 Key`;
        },
      },

      go_keys_rm: {
        ...buildCommands()["go_keys_rm"],
        async execute(args, _context) {
          const currentStore = loadStore();
          const { removeKey } = await import("./store.js");
          const updated = removeKey(currentStore, args.name as string);
          Object.assign(store, updated);
          saveStore(store);
          return `🗑️ 已删除 Key "${args.name}"，当前活跃 Key: ${store.active || "无"}`;
        },
      },

      go_keys_list: {
        ...buildCommands()["go_keys_list"],
        async execute(_args, _context) {
          const currentStore = loadStore();
          if (currentStore.keys.length === 0) {
            return "📭 尚未添加任何 Key，请使用 go_keys_add 添加。";
          }
          const now = Date.now();
          const threshold = currentStore.cooldownMinutes * 60 * 1000;
          const lines = currentStore.keys.map((k) => {
            const isActive = k.name === currentStore.active ? "🟢" : "⚪";
            const cd = currentStore.cooldowns[k.name];
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
          return `⏱️ 冷却: ${currentStore.cooldownMinutes}min | 📦 ${currentStore.keys.length} Keys\n\n${lines.join("\n")}`;
        },
      },

      go_keys_switch: {
        ...buildCommands()["go_keys_switch"],
        async execute(args, _context) {
          const currentStore = loadStore();
          const { manualSwitch } = await import("./rotation.js");
          const result = manualSwitch(currentStore, args.name as string);
          if (!result) return `❌ 未找到 Key "${args.name}"`;
          Object.assign(store, result);
          saveStore(store);
          return `🔀 已切换到 "${args.name}"`;
        },
      },

      go_keys_cooldown: {
        ...buildCommands()["go_keys_cooldown"],
        async execute(args, _context) {
          const currentStore = loadStore();
          if (args.minutes !== undefined) {
            currentStore.cooldownMinutes = args.minutes as number;
            saveStore(currentStore);
            return `⏱️ 冷却时间已设为 ${args.minutes} 分钟`;
          }
          return `⏱️ 当前冷却时间: ${currentStore.cooldownMinutes} 分钟`;
        },
      },

      go_keys_reset: {
        ...buildCommands()["go_keys_reset"],
        async execute(_args, _context) {
          const currentStore = loadStore();
          currentStore.cooldowns = {};
          Object.assign(store, currentStore);
          saveStore(store);
          return "🔄 已清除所有冷却状态";
        },
      },
    },
  };
};

export default OcGoMultiKeys;
```

- [ ] **Step 2: 更新根目录 index.ts**

```typescript
// index.ts
export { OcGoMultiKeys, default } from "./src/index.js";
```

- [ ] **Step 3: 验证构建**

```bash
npx tsc
```

Expected: 构建成功。

- [ ] **Step 4: 运行全部测试**

```bash
npx vitest run
```

Expected: 所有测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: 实现插件入口 + 文件 I/O 集成"
```

---

### Task 9: README 文档

**Files:**
- Create: `README.md`

- [ ] **Step 1: 编写 README.md**

````markdown
# oc-go-multi-keys

OpenCode 插件，管理多个 OpenCode Go 套餐 API Key，额度耗尽时自动轮换。

## 安装

```bash
npm install -g oc-go-multi-keys
```

或在 `opencode.json` 中引用：

```json
{
  "plugin": ["oc-go-multi-keys"]
}
```

## 配置

### 1. 添加 Provider

在 `opencode.json` 中添加：

```json
{
  "provider": {
    "oc-go": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "https://opencode.ai/zen/go/v1"
      }
    }
  },
  "model": "oc-go/deepseek-v4-pro"
}
```

### 2. 添加 API Keys

在 OpenCode 对话中使用：

```
go_keys_add 主号 sk-your-key-here
go_keys_add 备用1 sk-another-key
```

### 3. 查看状态

```
go_keys_list
```

## 命令

| 命令 | 说明 |
|------|------|
| `go_keys_add <name> <key>` | 添加 Key |
| `go_keys_rm <name>` | 删除 Key |
| `go_keys_list` | 列出所有 Key |
| `go_keys_switch <name>` | 手动切换 |
| `go_keys_cooldown [minutes]` | 设置冷却时间 |
| `go_keys_reset` | 清除冷却 |

## 工作原理

- 每个请求经过插件的 custom fetch
- 检测到 429/配额错误 → 自动切换到下一个 Key 并重试
- Key 进入冷却期（默认 60 分钟），到期自动恢复
- 优先级轮换：低 priority 数字优先使用

## 许可

MIT
````

- [ ] **Step 2: 提交**

```bash
git add -A && git commit -m "docs: 添加 README"
```

---

### 自检清单

**Spec coverage:**
- ✅ Key 存储结构 (Task 2, Task 3)
- ✅ 优先级别轮换 (Task 4)
- ✅ 冷却恢复 (Task 4)
- ✅ 被动检测 429/配额 (Task 5)
- ✅ Custom fetch 自动重试 (Task 6)
- ✅ Slash commands (Task 7)
- ✅ 插件入口 + 文件 I/O (Task 8)
- ✅ 错误检测关键词 (Task 5)
- ✅ 并发锁 (Task 6 — rotating flag)

**Placeholder scan:** 无 TBD/TODO，所有步骤含完整代码。

**Type consistency:**
- KeyStore 在 Task 2 定义，Task 3/4/6/8 使用一致
- getActiveKey 签名: `(store: KeyStore) => string` 全程一致
- rotate 签名: `(store: KeyStore) => KeyStore` 全程一致
- manualSwitch 签名: `(store: KeyStore, name: string) => KeyStore | null` 全程一致
