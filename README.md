# oc-go-multi-keys

OpenCode 插件，管理多个 [OpenCode Go](https://opencode.ai/go) 套餐 API Key，额度耗尽时自动轮换。

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

在 OpenCode 对话中使用 slash commands：

```
go_keys_add 主号 sk-your-go-plan-key
go_keys_add 备用 sk-another-key
```

### 3. 设置模型

```json
{
  "model": "oc-go/deepseek-v4-pro"
}
```

Go 套餐支持的模型：`deepseek-v4-pro`、`deepseek-v4-flash`、`glm-5.1`、`kimi-k2.7`、`qwen3.7-max` 等。

## 命令

| 命令 | 说明 |
|------|------|
| `go_keys_add <name> <key>` | 添加 API Key |
| `go_keys_rm <name>` | 删除 API Key |
| `go_keys_list` | 列出所有 Key 及冷却状态 |
| `go_keys_switch <name>` | 手动切换 Key |
| `go_keys_cooldown [minutes]` | 查看/设置冷却时间（默认 60 分钟） |
| `go_keys_reset` | 清除所有冷却状态 |

## 工作原理

1. 插件在 Auth loader 中注入自定义 `fetch`，拦截所有 API 请求
2. 每个请求自动携带当前活跃的 API Key
3. 检测到 429 / 配额耗尽错误 → 自动切换到下一个 Key 并重试
4. 被限流的 Key 进入冷却期（默认 60 分钟），到期自动恢复
5. 优先级轮换：priority 数字越小越优先使用

## 本地开发

```bash
git clone https://github.com/your-org/oc-go-multi-keys.git
cd oc-go-multi-keys
npm install
npm test        # 运行测试
npm run build   # 构建
```

## 许可

MIT
