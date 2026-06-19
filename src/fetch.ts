import type { KeyStore } from "./types.js";
import { isQuotaError } from "./detector.js";
import { rotate } from "./rotation.js";

/**
 * 创建一个自定义 fetch 函数，自动注入 API Key 并在限流时轮换重试。
 */
export function createGoFetch(
  store: KeyStore,
  onRotate: (newActive: string) => void,
  syncStore?: () => void,
): (input: Request | string | URL, init?: RequestInit) => Promise<Response> {
  let rotating = false;

  return async (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
    syncStore?.();  // 同步 CLI 端修改
    const headers = new Headers(init?.headers);
    const activeEntry = store.keys.find((k) => k.name === store.active);
    if (activeEntry) {
      headers.set("Authorization", `Bearer ${activeEntry.key}`);
    }

    let response: Response;
    try {
      response = await fetch(input, { ...init, headers });
    } catch (_e) {
      // 网络错误直接抛出，不轮换
      throw _e;
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
