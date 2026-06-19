const ERROR_PATTERNS =
  /quota|limit|exceeded|insufficient|额度|限额|耗尽|rate.?limit|too many requests/i;

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
