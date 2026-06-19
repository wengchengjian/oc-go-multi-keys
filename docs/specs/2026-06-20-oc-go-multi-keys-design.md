# OpenCode Go 套餐多账号管理插件 — 设计文档

## 概述

`oc-go-multi-keys` 是一个 OpenCode 原生插件，用于管理多个 OpenCode Go 套餐的 API Key，在额度耗尽或限流时自动轮换，无需用户手动干预。

### 背景

- OpenCode Go 套餐 $10/月提供多款模型（DeepSeek V4、GLM-5、Kimi K2.7、Qwen3.7 等），但单账号额度有限
- OpenCode 官方多账号 PR #9069 尚未合并
- 社区现有插件主要面向 Pi 生态或单一 Provider（Anthropic/OpenAI），没有专门针对 Go 套餐的 OpenCode 原生插件

### 目标

- 管理多个 Go 套餐 API Key
- 被动检测限流/配额错误，自动切换到下一个可用 Key
- 优先级轮换 + 冷却恢复
- Slash command 管理界面
- 自动重试（用户无感切换）

---

## 架构

### 整体数据流

```
OpenCode 发起 AI 请求
  │
  ▼
AI SDK ( @ai-sdk/openai-compatible )
  │
  ▼
Provider "oc-go" → auth.loader() 返回 custom fetch
  │
  ▼
custom fetch:
  1. 读取当前活跃 Key
  2. 设置 Authorization: Bearer <active-key>
  3. 请求 https://opencode.ai/zen/go/v1
  4. 检查 HTTP 状态码
     ├─ 正常 (2xx) → 返回 response
     └─ 限流 (429) / 配额耗尽 (402/403) → 轮换 Key → 重试
```

### 插件在 OpenCode 中的位置

```
opencode.json:
{
  "plugin": ["oc-go-multi-keys"],
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

- `options.apiKey` 由插件在 loader 中动态注入，不需要在 opencode.json 中硬编码
- 用户只需在插件配置文件中管理 Key

### 文件布局

```
~/.opencode/
├── opencode.json                    # OpenCode 主配置（引用插件和 provider）
└── oc-go-keys.json                  # 多 Key 存储（插件读写）

项目级（开发时）:
F:\project\oc-go-multi-keys/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts                     # 插件入口
│   ├── types.ts                     # 类型定义
│   ├── store.ts                     # Key 存储 CRUD
│   ├── rotation.ts                  # 轮换逻辑
│   ├── fetch.ts                     # Custom fetch 实现
│   ├── detector.ts                  # 限流检测
│   └── commands.ts                  # Slash command 工具
└── test/
    ├── store.test.ts
    ├── rotation.test.ts
    ├── fetch.test.ts
    └── detector.test.ts
```

---

## 组件设计

### 1. types.ts — 核心类型

```typescript
interface KeyEntry {
  name: string;        // 别名，如 "主号"、"备用1"
  key: string;         // API Key
  priority: number;    // 越小越优先
}

interface CooldownRecord {
  since: string;       // ISO 时间戳
  reason: string;      // "429" | "quota" | "manual"
}

interface KeyStore {
  keys: KeyEntry[];
  active: string;                          // 当前活跃 Key 的 name
  cooldownMinutes: number;                 // 默认 60
  cooldowns: Record<string, CooldownRecord>;
}
```

### 2. store.ts — Key 存储

- **文件位置**: `~/.opencode/oc-go-keys.json`
- **权限**: 读写 JSON，不做额外加密（跟随参考插件的惯例）
- **接口**:
  - `loadStore(): KeyStore` — 从文件读取，不存在则返回空 store
  - `saveStore(store: KeyStore): void` — 写回文件
  - `addKey(store: KeyStore, entry: KeyEntry): KeyStore` — 添加 Key，自动分配 priority（当前最大 +1）
  - `removeKey(store: KeyStore, name: string): KeyStore` — 删除 Key，若删的是 active 则自动切到最高优先级
  - `getActiveKey(store: KeyStore): string` — 返回当前活跃 Key 的 key 值

### 3. rotation.ts — 轮换逻辑

```
rotate(store: KeyStore): string | null

1. 将当前 active key 加入 cooldowns，记录当前时间
2. 从 keys 中过滤掉冷却中的 key（冷却时间 < cooldownMinutes 视为冷却中）
3. 按 priority 升序排列剩余的可用 key
4. 取第一个作为新 active
5. 如果全部在冷却中 → 清除所有冷却，取 priority 最小的作为 active
6. 更新 store.active，写回文件
7. 返回新的 key 值（调用方用于重试）
```

**额外**：每次 `loadStore()` 时自动清理已过期的 cooldown 记录。

### 4. fetch.ts — Custom Fetch

```typescript
async function createCustomFetch(store: KeyStore) {
  return async (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
    const key = getActiveKey(store);
    
    // 注入 API Key
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${key}`);
    
    let response = await fetch(input, { ...init, headers });
    
    // 检测限流/配额错误
    if (isQuotaError(response)) {
      const nextKey = rotate(store);
      if (nextKey) {
        // 用新 Key 重试
        headers.set("Authorization", `Bearer ${nextKey}`);
        response = await fetch(input, { ...init, headers });
      }
    }
    
    return response;
  };
}
```

- 重试只做一次，避免无限循环
- 不做 SSE→JSON 转换（Go 套餐用 OpenAI 兼容格式，OpenCode 原生支持）

### 5. detector.ts — 错误检测

检测策略（匹配 HTTP 状态码 + 响应体内容）：

```typescript
function isQuotaError(response: Response): Promise<boolean> {
  // 1. 先看状态码
  if (response.status === 429) return true;       // 限流
  if (response.status === 402) return true;       // 配额耗尽
  
  // 2. 403/400 需要进一步检查响应体关键词
  if (response.status === 403 || response.status === 400) {
    const body = await response.clone().text();
    const lower = body.toLowerCase();
    return /quota|limit|exceeded|insufficient|额度|限额|耗尽|rate.?limit/i.test(lower);
  }
  
  return false;
}
```

### 6. commands.ts — Slash Commands

每个 command 注册为一个 OpenCode tool：

| Command | 参数 | 行为 |
|---------|------|------|
| `go_keys_add` | `name: string`, `key: string` | 添加 Key，自动分配 priority |
| `go_keys_rm` | `name: string` | 删除 Key |
| `go_keys_list` | — | 列出所有 Key、优先级、活跃标记、冷却状态 |
| `go_keys_switch` | `name: string` | 手动切换到指定 Key，清除该 Key 的冷却 |
| `go_keys_cooldown` | `minutes: number` | 设置冷却时长（默认 60） |
| `go_keys_reset` | — | 清除全部冷却状态 |

### 7. index.ts — 插件入口

```typescript
import type { Plugin } from "@opencode-ai/plugin";

export const OcGoMultiKeys: Plugin = async ({ client }) => {
  const store = loadStore();

  return {
    auth: {
      provider: "oc-go",
      async loader(_getAuth, _provider) {
        return {
          apiKey: getActiveKey(store),
          baseURL: "https://opencode.ai/zen/go/v1",
          fetch: await createCustomFetch(store),
        };
      },
    },
    tool: {
      go_keys_add: tool({ /* ... */ }),
      go_keys_rm: tool({ /* ... */ }),
      go_keys_list: tool({ /* ... */ }),
      go_keys_switch: tool({ /* ... */ }),
      go_keys_cooldown: tool({ /* ... */ }),
      go_keys_reset: tool({ /* ... */ }),
    },
  };
};

export default OcGoMultiKeys;
```

---

## 错误处理

| 场景 | 处理 |
|------|------|
| `oc-go-keys.json` 不存在 | 创建空 store，所有管理命令引导用户先添加 Key |
| active key 无效（文件损坏） | 自动切到第一个可用 key |
| 全部 key 耗尽（均在冷却） | 清除所有冷却，强制使用最高优先级 key |
| fetch 网络错误（非限流） | 透传错误，不触发轮换 |
| 并发请求同时触发轮换 | 使用内存锁（Promise-based mutex），确保只有一个轮换在执行 |

## 测试策略

- **store.test.ts**: 测试 JSON 读写、增删 Key、active 切换
- **rotation.test.ts**: 测试优先级排序、冷却过滤、全耗尽回退、过期冷却清理
- **detector.test.ts**: 测试各种 HTTP 状态码和响应体的识别
- **fetch.test.ts**: 用 mock HTTP server 测试 custom fetch 的 key 注入和重试流程

---

## 风险

| 风险 | 缓解 |
|------|------|
| OpenCode plugin SDK 版本兼容性 | 锁定 `@opencode-ai/plugin` peerDependency 版本范围 |
| Go 套餐 API 变更 | baseURL 可配置，不做硬编码 |
| 多 key 账户被封 | 不做激进的自动切换，冷却机制避免短时间大量切换 |
| custom fetch 与 AI SDK 的兼容性 | 参考 `opencode-openai-codex-auth` 已验证的模式 |

---

## 后续扩展

- 支持环境变量方式配置 key（CI/CD 场景）
- 支持主动额度探测（Go 套餐出查询 API 后）
- 用量统计展示
