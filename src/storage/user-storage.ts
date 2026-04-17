declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;

export function isSafeId(id: string): boolean {
  return SAFE_ID.test(id);
}

export function assertSafeId(id: string): void {
  if (!SAFE_ID.test(id)) {
    throw new Error(`Invalid id "${id}"`);
  }
}

export async function getJson<T>(
  path: string,
  userId: string,
  fallback: T
): Promise<T> {
  return spindle.userStorage.getJson<T>(path, { fallback, userId });
}

export async function setJson<T>(
  path: string,
  value: T,
  userId: string,
  indent?: number
): Promise<void> {
  await spindle.userStorage.setJson(path, value, indent === undefined ? { userId } : { userId, indent });
}

export async function deletePath(path: string, userId: string): Promise<void> {
  await spindle.userStorage.delete(path, userId);
}

export async function listUnder(prefix: string, userId: string): Promise<string[]> {
  try {
    const files = await spindle.userStorage.list(prefix, userId);
    return files.map((f) => f.replace(/\\/g, "/"));
  } catch {
    return [];
  }
}
