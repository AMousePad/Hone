import { assertSafeId, isSafeId, getJson, setJson, deletePath, listUnder } from "../storage/user-storage";
import * as hlog from "../hlog";

export interface ResourceSummary {
  id: string;
  name: string;
  builtIn: boolean;
}

export interface ResourceServiceConfig<T extends { id: string; name: string }, S extends ResourceSummary> {
  kind: string;
  prefix: string;
  builtIns: ReadonlyArray<T>;
  summarize: (item: T, builtIn: boolean) => S;
  normalize: (raw: unknown, id: string) => T | null;
  buildCopy: (source: T, newId: string, newName: string) => T;
  validateSave?: (item: T) => void;
}

export interface ResourceService<T extends { id: string; name: string }, S extends ResourceSummary> {
  list(userId: string): Promise<S[]>;
  get(userId: string, id: string): Promise<T | null>;
  getBuiltIn(id: string): T | null;
  isBuiltIn(id: string): boolean;
  save(userId: string, item: T): Promise<void>;
  delete(userId: string, id: string): Promise<void>;
  duplicate(userId: string, sourceId: string): Promise<T>;
  exists(userId: string, id: string): Promise<boolean>;
  nextId(userId: string, baseName: string): Promise<string>;
}

function slugify(input: string, fallback: string): string {
  const base = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || fallback;
}

export function createResourceService<
  T extends { id: string; name: string },
  S extends ResourceSummary
>(cfg: ResourceServiceConfig<T, S>): ResourceService<T, S> {
  const pathFor = (id: string): string => `${cfg.prefix}${id}.json`;
  const builtInIds = new Set(cfg.builtIns.map((b) => b.id));

  async function listCustomIds(userId: string): Promise<string[]> {
    const files = await listUnder(cfg.prefix, userId);
    return files
      .filter((f) => /^[^/]+\.json$/.test(f))
      .map((f) => f.replace(/\.json$/, ""))
      .filter(isSafeId);
  }

  async function loadCustom(userId: string, id: string): Promise<T | null> {
    if (!isSafeId(id)) return null;
    const raw = await getJson<unknown>(pathFor(id), userId, null);
    if (!raw) return null;
    try {
      return cfg.normalize(raw, id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      hlog.debug(userId, `${cfg.kind}: normalize "${id}" failed: ${msg}`);
      return null;
    }
  }

  async function uniqueId(userId: string, base: string): Promise<string> {
    const fallback = cfg.kind.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "item";
    const slug = slugify(base, fallback);
    const taken = new Set<string>(builtInIds);
    for (const id of await listCustomIds(userId)) taken.add(id);
    if (!taken.has(slug)) return slug;
    for (let i = 2; i < 10_000; i++) {
      const candidate = `${slug}-${i}`;
      if (!taken.has(candidate)) return candidate;
    }
    return `${slug}-${Date.now().toString(36)}`;
  }

  return {
    async list(userId) {
      const summaries: S[] = cfg.builtIns.map((b) => cfg.summarize(b, true));
      const customs: S[] = [];
      for (const id of await listCustomIds(userId)) {
        const item = await loadCustom(userId, id);
        if (item) customs.push(cfg.summarize(item, false));
      }
      customs.sort((a, b) => a.name.localeCompare(b.name));
      return [...customs, ...summaries];
    },
    async get(userId, id) {
      const builtIn = cfg.builtIns.find((b) => b.id === id);
      if (builtIn) return builtIn;
      return loadCustom(userId, id);
    },
    getBuiltIn(id) {
      return cfg.builtIns.find((b) => b.id === id) ?? null;
    },
    isBuiltIn(id) {
      return builtInIds.has(id);
    },
    async save(userId, item) {
      if (builtInIds.has(item.id)) {
        throw new Error(`Cannot overwrite built-in ${cfg.kind} "${item.id}"`);
      }
      assertSafeId(item.id);
      cfg.validateSave?.(item);
      await setJson(pathFor(item.id), item, userId);
    },
    async delete(userId, id) {
      if (builtInIds.has(id)) {
        throw new Error(`Cannot delete built-in ${cfg.kind} "${id}"`);
      }
      assertSafeId(id);
      await deletePath(pathFor(id), userId);
    },
    async duplicate(userId, sourceId) {
      const source = await this.get(userId, sourceId);
      if (!source) throw new Error(`${cfg.kind} "${sourceId}" not found`);
      const newName = `${source.name} (Copy)`;
      const newId = await uniqueId(userId, newName);
      const copy = cfg.buildCopy(source, newId, newName);
      await this.save(userId, copy);
      return copy;
    },
    async exists(userId, id) {
      if (builtInIds.has(id)) return true;
      const item = await loadCustom(userId, id);
      return item !== null;
    },
    nextId(userId, baseName) {
      return uniqueId(userId, baseName);
    },
  };
}
