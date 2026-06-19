import { join } from "node:path";
import { homedir } from "node:os";

const DB_PATH = join(homedir(), ".local/share/opencode/opencode.db");
const PROVIDER_ID = "opencode-go";

const LIMITS = {
  session: 12,
  weekly: 30,
  monthly: 60,
} as const;

interface CostRecord {
  createdMs: number;
  cost: number;
  model: string;
}

/** 尝试加载 SQLite，优先 node:sqlite，回退 bun:sqlite (OpenCode 内嵌 Bun) */
async function getDatabase(): Promise<unknown | null> {
  // 优先 node:sqlite (Node 22.5+)
  try {
    const mod = await import("node:sqlite");
    return new (mod.DatabaseSync as new (path: string) => unknown)(DB_PATH);
  } catch {}
  // 回退 bun:sqlite (Bun runtime，OpenCode 编译可执行文件)
  try {
    const bunSqlite = "bun:sqlite";
    const mod = await (import(bunSqlite) as any);
    return new mod.Database(DB_PATH);
  } catch {}
  return null;
}

/** 查询所有 Go 套餐用量记录 */
function queryRecords(db: unknown): CostRecord[] {
  const DatabaseSync = db as { prepare: (sql: string) => { all: (...args: unknown[]) => unknown[] } };
  const stmt = DatabaseSync.prepare(`
    SELECT
      CAST(COALESCE(json_extract(data, '$.time.created'), time_created) AS INTEGER) AS createdMs,
      CAST(json_extract(data, '$.cost') AS REAL) AS cost,
      json_extract(data, '$.model') AS model
    FROM message
    WHERE json_valid(data)
      AND json_extract(data, '$.providerID') = ?
      AND json_extract(data, '$.role') = 'assistant'
      AND json_type(data, '$.cost') IN ('integer', 'real')
    ORDER BY createdMs ASC
  `);

  const rows = stmt.all(PROVIDER_ID) as Array<{ createdMs: number | null; cost: number | null; model: string | null }>;
  const records: CostRecord[] = [];

  for (const row of rows) {
    const createdMs = row.createdMs;
    const cost = row.cost;
    if (createdMs === null || createdMs <= 0) continue;
    if (cost === null || cost < 0) continue;
    records.push({
      createdMs,
      cost,
      model: row.model ?? "unknown",
    });
  }

  return records;
}

/** 关闭数据库 */
function closeDatabase(db: unknown): void {
  try {
    (db as { close: () => void }).close();
  } catch {
    // ignore
  }
}

/** Session 窗口：最近 5 小时 */
function aggregateSession(records: CostRecord[], nowMs: number): number {
  const cutoff = nowMs - 5 * 60 * 60 * 1000;
  let total = 0;
  for (const r of records) {
    if (r.createdMs >= cutoff) total += r.cost;
  }
  return total;
}

/** UTC 周一 00:00 作为本周起点 */
function startOfUtcWeek(nowMs: number): number {
  const d = new Date(nowMs);
  const day = d.getUTCDay();
  const offset = day === 0 ? 6 : day - 1; // 周一 = 0
  d.setUTCDate(d.getUTCDate() - offset);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

/** Weekly 窗口：本周一到下周一 */
function aggregateWeekly(records: CostRecord[], nowMs: number): number {
  const start = startOfUtcWeek(nowMs);
  const end = start + 7 * 24 * 60 * 60 * 1000;
  let total = 0;
  for (const r of records) {
    if (r.createdMs >= start && r.createdMs < end) total += r.cost;
  }
  return total;
}

/** Monthly 窗口：以最早请求日期为锚点 */
function aggregateMonthly(records: CostRecord[], nowMs: number): number {
  if (records.length === 0) return 0;
  const anchor = new Date(records[0].createdMs);
  const anchorDay = anchor.getUTCDate();
  const anchorHour = anchor.getUTCHours();
  const anchorMinute = anchor.getUTCMinutes();
  const anchorSecond = anchor.getUTCSeconds();

  const now = new Date(nowMs);
  let start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    anchorDay,
    anchorHour,
    anchorMinute,
    anchorSecond,
  );

  if (start > nowMs) {
    // 回退一个月
    const prev = new Date(start);
    prev.setUTCMonth(prev.getUTCMonth() - 1);
    start = prev.getTime();
  }

  const endDate = new Date(start);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  const end = endDate.getTime();

  let total = 0;
  for (const r of records) {
    if (r.createdMs >= start && r.createdMs < end) total += r.cost;
  }
  return total;
}

/** 计算百分比，0-100 封顶，保留 1 位小数 */
function percent(used: number, limit: number): string {
  if (!Number.isFinite(used) || limit <= 0) return "0.0";
  const p = Math.max(0, Math.min(100, (used / limit) * 100));
  return p.toFixed(1);
}

/** 按模型聚合 */
function byModel(records: CostRecord[]): Map<string, { count: number; cost: number }> {
  const map = new Map<string, { count: number; cost: number }>();
  for (const r of records) {
    const entry = map.get(r.model) ?? { count: 0, cost: 0 };
    entry.count++;
    entry.cost += r.cost;
    map.set(r.model, entry);
  }
  return map;
}

/** 主入口：查询并格式化用量信息 */
export async function getUsageReport(): Promise<string> {
  const db = await getDatabase();
  if (!db) {
    return "⚠️ 无法访问 SQLite 数据库，请确认 OpenCode 已安装且版本 >= 1.14";
  }

  let records: CostRecord[];
  try {
    records = queryRecords(db);
  } catch (e) {
    closeDatabase(db);
    return `⚠️ 查询数据库失败: ${(e as Error).message}`;
  }
  closeDatabase(db);

  if (records.length === 0) {
    return "📭 暂无 OpenCode Go 套餐使用记录";
  }

  const nowMs = Date.now();
  const sessionCost = aggregateSession(records, nowMs);
  const weeklyCost = aggregateWeekly(records, nowMs);
  const monthlyCost = aggregateMonthly(records, nowMs);

  const lines = [
    `⏱️ Session (5h):  $${sessionCost.toFixed(4)} / $${LIMITS.session} (${percent(sessionCost, LIMITS.session)}%)`,
    `📅 本周:         $${weeklyCost.toFixed(4)} / $${LIMITS.weekly} (${percent(weeklyCost, LIMITS.weekly)}%)`,
    `📆 本月(锚点):   $${monthlyCost.toFixed(4)} / $${LIMITS.monthly} (${percent(monthlyCost, LIMITS.monthly)}%)`,
    `📊 请求总数:     ${records.length}`,
  ];

  // 按模型统计
  const modelMap = byModel(records);
  if (modelMap.size > 0) {
    lines.push("\n📦 按模型统计:");
    const sorted = [...modelMap.entries()].sort((a, b) => b[1].cost - a[1].cost);
    for (const [model, stats] of sorted) {
      lines.push(`  ${model}: ${stats.count} 次, $${stats.cost.toFixed(4)}`);
    }
  }

  return lines.join("\n");
}
