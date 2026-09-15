/**
 * 关键词库存储 —— 三档自适应,接口不变:
 *   1. Upstash REST(配了 UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN 时,Vercel 生产用)
 *   2. 本地文件 .data/keyword-bank.json(本地开发用;Vercel 文件系统只读,自动跳过)
 *   3. 内存(兜底,行为与旧版一致:重新部署即清零)
 *
 * 所有读写在 try/catch 内降级,存储层故障不影响润色主流程。
 */

export interface KeywordEntry {
  keyword: string;
  count: number; // 出现次数(跨JD)
  firstSeen: number;
  lastSeen: number;
  jobTitles: string[];
}

type Bank = Map<string, KeywordEntry>;

interface Store {
  load(): Promise<Bank>;
  save(bank: Bank): Promise<void>;
}

// ---------------------------------------------------------------- 内存

function memoryStore(): Store {
  const bank: Bank = new Map();
  return {
    async load() {
      return bank;
    },
    async save(next) {
      // Map 引用已被 load 侧原地修改,这里仅保持接口一致
      void next;
    },
  };
}

// ---------------------------------------------------------------- 文件

const DATA_FILE = `${process.cwd()}/.data/keyword-bank.json`;

function fileStore(): Store {
  return {
    async load() {
      try {
        const { readFile } = await import("fs/promises");
        const raw = JSON.parse(await readFile(DATA_FILE, "utf-8")) as KeywordEntry[];
        return new Map(raw.map((e) => [e.keyword, e]));
      } catch {
        return new Map();
      }
    },
    async save(bank) {
      try {
        const { writeFile, mkdir } = await import("fs/promises");
        await mkdir(`${process.cwd()}/.data`, { recursive: true });
        await writeFile(DATA_FILE, JSON.stringify([...bank.values()], null, 0), "utf-8");
      } catch (e) {
        console.error("[kwStore] 文件写入失败,退化为内存模式:", e);
      }
    },
  };
}

// ---------------------------------------------------------------- Upstash REST

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const UPSTASH_KEY = "resume-polisher:keyword-bank";

function upstashStore(): Store {
  async function redis(command: string[]): Promise<string | null> {
    const res = await fetch(`${UPSTASH_URL}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(3_000),
    });
    const data = (await res.json()) as { result?: string | null };
    return data.result ?? null;
  }
  return {
    async load() {
      try {
        const raw = await redis(["GET", UPSTASH_KEY]);
        if (!raw) return new Map();
        const parsed = JSON.parse(raw) as KeywordEntry[];
        return new Map(parsed.map((e) => [e.keyword, e]));
      } catch (e) {
        console.error("[kwStore] Upstash 读取失败,退化为空库:", e);
        return new Map();
      }
    },
    async save(bank) {
      try {
        await redis(["SET", UPSTASH_KEY, JSON.stringify([...bank.values()])]);
      } catch (e) {
        console.error("[kwStore] Upstash 写入失败:", e);
      }
    },
  };
}

// ---------------------------------------------------------------- 门面

function pickStore(): Store {
  if (UPSTASH_URL && UPSTASH_TOKEN) return upstashStore();
  if (!process.env.VERCEL) return fileStore();
  return memoryStore();
}

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  storePromise ??= Promise.resolve(pickStore());
  return storePromise;
}

/** 合并一批关键词(旧 keyword-bank route 的逻辑迁到这里) */
export async function addKeywords(keywords: string[], jobTitle?: string): Promise<number> {
  const store = await getStore();
  const bank = await store.load();
  const now = Date.now();
  for (const kw of keywords) {
    const key = kw?.trim();
    if (!key) continue;
    const existing = bank.get(key);
    if (existing) {
      existing.count++;
      existing.lastSeen = now;
      if (jobTitle && !existing.jobTitles.includes(jobTitle)) existing.jobTitles.push(jobTitle);
    } else {
      bank.set(key, { keyword: key, count: 1, firstSeen: now, lastSeen: now, jobTitles: jobTitle ? [jobTitle] : [] });
    }
  }
  await store.save(bank);
  return bank.size;
}

export async function listKeywords(sort: "count" | "recent", limit: number): Promise<{ entries: KeywordEntry[]; total: number }> {
  const store = await getStore();
  const bank = await store.load();
  const entries = [...bank.values()].sort((a, b) => (sort === "count" ? b.count - a.count : b.lastSeen - a.lastSeen));
  return { entries: entries.slice(0, limit), total: bank.size };
}

export async function clearKeywords(): Promise<void> {
  const store = await getStore();
  await store.save(new Map());
}

/** 跨岗位高频词,注入 agent 起草 prompt(市场在反复要求的词 = 通用加分项) */
export async function topKeywordHints(limit = 12): Promise<string[]> {
  try {
    const { entries } = await listKeywords("count", limit);
    return entries.map((e) => e.keyword);
  } catch {
    return [];
  }
}
