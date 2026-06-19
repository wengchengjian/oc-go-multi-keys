# oc-go-multi-keys

OpenCode 插件，管理多个 [OpenCode Go](https://opencode.ai/go) 套餐 API Key，额度耗尽时自动轮换。

## 安装

### 1. 安装插件

把 `oc-go-multi-keys.js` 放到 `~/.config/opencode/plugins/`（自动加载）：

```bash
cp oc-go-multi-keys.js ~/.config/opencode/plugins/
```

### 2. 安装命令文件

```bash
mkdir -p ~/.config/opencode/commands
cp commands/*.md ~/.config/opencode/commands/
```

### 3. 安装 CLI（可选）

```bash
npm link
```

之后可在终端或 OpenCode 中用 `!oc-go-keys` 直接管理 key，不经过 AI。

## 使用方式

### CLI（终端 / OpenCode `!` 前缀）

```bash
!oc-go-keys add 主号 sk-xxx    # 添加 key
!oc-go-keys list               # 列出所有 key 及冷却状态
!oc-go-keys switch 备用         # 手动切换
!oc-go-keys rm 旧号             # 删除
!oc-go-keys cooldown 90         # 设冷却 90 分钟
!oc-go-keys reset               # 清冷却
```

### Slash commands（对话内）

| 命令 | 说明 |
|------|------|
| `/go-keys-add <name> <key>` | 添加 API Key |
| `/go-keys-list` | 列出所有 Key 及冷却状态 |
| `/go-keys-switch <name>` | 手动切换 Key |
| `/go-keys-rm <name>` | 删除 Key |
| `/go-keys-cooldown [minutes]` | 查看/设置冷却时间 |
| `/go-keys-reset` | 清除所有冷却 |

### AI 工具（直接对话）

在对话中说 "列出 Go key"、"添加一个 key xxx" 等，AI 自动调用对应工具。

## 配置

**无需添加自定义 Provider。** 插件直接拦截 OpenCode 内置的 `opencode-go` provider，模型不变：

```json
{
  "model": "opencode-go/deepseek-v4-pro"
}
```

Key 存储在 `~/.opencode/oc-go-keys.json`。

## 工作原理

1. 插件在 Auth loader 中注入自定义 `fetch`，拦截所有 `opencode-go` 请求
2. 每个请求自动携带当前活跃的 API Key
3. 检测到 429 / 配额耗尽 → 自动切换到下一个 Key 并重试
4. 被限流的 Key 进入冷却期（默认 60 分钟），到期自动恢复
5. 优先级轮换：priority 数字越小越优先
6. CLI 修改 key 后，下次请求自动同步磁盘变更

## 本地开发

```bash
git clone https://github.com/wengchengjian/oc-go-multi-keys.git
cd oc-go-multi-keys
npm install
npm test        # 42 个测试
npm run build   # 构建
```

## 许可

MIT
