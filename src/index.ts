import type { Plugin } from "@opencode-ai/plugin";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createEmptyStore, type KeyStore, PROVIDER_ID, GO_BASE_URL, STORE_PATH } from "./types.js";
import { getActiveKey, cleanupCooldowns } from "./store.js";
import { createGoFetch } from "./fetch.js";
import { buildCommands, type StoreIO } from "./commands.js";

function storeFilePath(): string {
  return join(homedir(), STORE_PATH);
}

function loadStore(): KeyStore {
  const filePath = storeFilePath();
  try {
    if (!existsSync(filePath)) {
      return createEmptyStore();
    }
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as KeyStore;
    return cleanupCooldowns(parsed);
  } catch {
    return createEmptyStore();
  }
}

function saveStore(store: KeyStore): void {
  const filePath = storeFilePath();
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(store, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

export const OcGoMultiKeys: Plugin = async () => {
  const store = loadStore();
  const io: StoreIO = {
    load: loadStore,
    save: (s) => {
      Object.assign(store, s);
      saveStore(store);
    },
  };

  const onRotate = (newActive: string) => {
    saveStore(store);
    console.log(`[oc-go-multi-keys] 🔀 已自动切换到 "${newActive}"`);
  };

  return {
    auth: {
      provider: PROVIDER_ID,
      async loader(_getAuth, _provider) {
        return {
          apiKey: getActiveKey(store) || "placeholder",
          baseURL: GO_BASE_URL,
          fetch: createGoFetch(store, onRotate),
        };
      },
      methods: [
        {
          type: "api" as const,
          label: "OpenCode Go Plan API Key",
        },
      ],
    },
    tool: buildCommands(io),
  };
};

export default OcGoMultiKeys;
