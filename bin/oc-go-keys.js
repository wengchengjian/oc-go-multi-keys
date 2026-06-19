#!/usr/bin/env node
// oc-go-keys: OpenCode Go plan multi-key manager CLI
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const STORE_PATH = join(homedir(), ".opencode/oc-go-keys.json");
const COOLDOWN_MINUTES = 60;

function load() {
  try {
    if (!existsSync(STORE_PATH)) return { keys: [], active: "", cooldowns: {} };
    return JSON.parse(readFileSync(STORE_PATH, "utf-8"));
  } catch { return { keys: [], active: "", cooldowns: {} }; }
}

function save(s) {
  const d = dirname(STORE_PATH);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(s, null, 2), { mode: 0o600 });
}

function list() {
  const s = load();
  if (!s.keys.length) { console.log("No keys configured."); return; }
  const now = Date.now();
  const th = (s.cooldownMinutes || COOLDOWN_MINUTES) * 60 * 1000;
  for (const k of s.keys) {
    const active = k.name === s.active ? "*" : " ";
    const cd = s.cooldowns[k.name];
    let st = "available";
    if (cd) {
      const el = now - new Date(cd.since).getTime();
      if (el < th) st = `cooling (${Math.ceil((th - el) / 60000)}m left) - ${cd.reason}`;
    }
    console.log(` [${active}] P${k.priority} ${k.name} — ${st}`);
  }
  console.log(`\ncooldown: ${s.cooldownMinutes || COOLDOWN_MINUTES}m | ${s.keys.length} keys`);
}

function add(name, key) {
  const s = load();
  const existing = s.keys.findIndex(k => k.name === name);
  const maxP = s.keys.length ? Math.max(...s.keys.map(k => k.priority)) : 0;
  const entry = { name, key, priority: maxP + 1 };
  if (existing >= 0) s.keys[existing] = entry;
  else s.keys.push(entry);
  if (!s.active) s.active = name;
  save(s);
  console.log(`Added "${name}", active: ${s.active} (${s.keys.length} keys)`);
}

function remove(name) {
  const s = load();
  s.keys = s.keys.filter(k => k.name !== name);
  if (s.active === name) s.active = s.keys.length ? [...s.keys].sort((a, b) => a.priority - b.priority)[0].name : "";
  save(s);
  console.log(`Removed "${name}", active: ${s.active || "none"}`);
}

function switchKey(name) {
  const s = load();
  if (!s.keys.find(k => k.name === name)) { console.log(`Key "${name}" not found`); return; }
  s.active = name;
  delete s.cooldowns[name];
  save(s);
  console.log(`Switched to "${name}"`);
}

function cooldown(min) {
  const s = load();
  if (min) { s.cooldownMinutes = parseInt(min); save(s); console.log(`Cooldown set to ${s.cooldownMinutes}m`); }
  else console.log(`Cooldown: ${s.cooldownMinutes || COOLDOWN_MINUTES}m`);
}

function reset() {
  const s = load();
  s.cooldowns = {};
  save(s);
  console.log("All cooldowns cleared");
}

// CLI routing
const cmd = process.argv[2];
const args = process.argv.slice(3);

switch (cmd) {
  case "list":
    list();
    break;
  case "add":
    if (args.length < 2) { console.log("Usage: oc-go-keys add <name> <key>"); process.exit(1); }
    add(args[0], args.slice(1).join(""));
    break;
  case "rm":
    if (!args[0]) { console.log("Usage: oc-go-keys rm <name>"); process.exit(1); }
    remove(args[0]);
    break;
  case "switch":
    if (!args[0]) { console.log("Usage: oc-go-keys switch <name>"); process.exit(1); }
    switchKey(args[0]);
    break;
  case "cooldown":
    cooldown(args[0]);
    break;
  case "reset":
    reset();
    break;
  default:
    console.log(`oc-go-keys — OpenCode Go plan multi-key manager

Usage:
  oc-go-keys list              List all keys and status
  oc-go-keys add <name> <key>  Add a new API key
  oc-go-keys rm <name>         Remove a key
  oc-go-keys switch <name>     Switch active key
  oc-go-keys cooldown [min]    Show/set cooldown minutes
  oc-go-keys reset             Clear all cooldowns`);
}
