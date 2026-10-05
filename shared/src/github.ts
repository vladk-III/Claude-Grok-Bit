// Stores agents, crews, providers (without keys) and conversations as JSON
// files in a GitHub repository, via the GitHub REST API.
//
// Layout inside the chosen folder (default "crewbit"):
//   agents.json               { version, agents: Agent[] }
//   crews.json                { version, crews: Crew[] }
//   providers.json            { version, providers: Provider[] }   (API keys removed)
//   conversations/<id>.json   { version, ...Conversation }
//
// Sync is change-detected with git blob SHAs: `shas` remembers the SHA of each
// file as last seen on GitHub, and a local file is pushed only if its content
// hashes differently.
import type { FetchLike } from "./engine/adapter";
import { normalizeAgent } from "./presets";
import type { Agent, Conversation, Crew, Provider } from "./types";

export const DATA_VERSION = 1;

export interface GitHubSettings {
  enabled: boolean;
  /** "owner/name" of the (private!) data repository. */
  repo: string;
  /** Fine-grained personal access token with Contents read/write on that repo. */
  token: string;
  /** Folder inside the repo. */
  folder: string;
}

export const DEFAULT_GITHUB: GitHubSettings = { enabled: false, repo: "", token: "", folder: "crewbit" };

export interface SyncData {
  agents: Agent[];
  crews: Crew[];
  providers: Provider[];
  conversations: Conversation[];
}

/** Path → git blob SHA of the file as last seen on GitHub. */
export type ShaMap = Record<string, string>;

export class GitHubStore {
  constructor(
    private settings: GitHubSettings,
    private fetchImpl: FetchLike,
    /** Mutated in place as files are read and written. */
    readonly shas: ShaMap,
  ) {}

  private url(path: string): string {
    const folder = this.settings.folder.replace(/^\/+|\/+$/g, "");
    const full = folder ? `${folder}/${path}` : path;
    return `https://api.github.com/repos/${this.settings.repo}/contents/${full.split("/").map(encodeURIComponent).join("/")}`;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.settings.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    };
  }

  private async call(url: string, init: { method?: string; body?: string } = {}) {
    // Call as a plain function: browsers reject fetch invoked as a method of another object.
    const fetchImpl = this.fetchImpl;
    const res = await fetchImpl(url, { ...init, headers: this.headers() });
    if (res.status === 401) throw new Error("GitHub rejected the token. Check it in Settings → GitHub sync.");
    if (res.status === 403) {
      throw new Error("GitHub denied access. The token needs Contents: read and write on the data repo.");
    }
    return res;
  }

  /** Confirms access; returns whether the repo is private. */
  async checkRepo(): Promise<{ private: boolean }> {
    const res = await this.call(`https://api.github.com/repos/${this.settings.repo}`);
    if (res.status === 404) throw new Error(`Repository ${this.settings.repo} not found, or the token can't see it.`);
    if (!res.ok) throw new Error(`GitHub error ${res.status}`);
    return { private: Boolean(((await res.json()) as { private?: boolean }).private) };
  }

  /** Read a JSON file; null if it doesn't exist. */
  async read<T>(path: string): Promise<{ data: T; sha: string } | null> {
    const res = await this.call(this.url(path));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub error ${res.status} reading ${path}`);
    const file = (await res.json()) as { sha: string; content?: string; encoding?: string };
    let b64 = file.encoding === "base64" ? file.content ?? "" : "";
    if (!b64) {
      // Files over 1 MB come without content; fetch the blob instead.
      const blob = await this.call(
        `https://api.github.com/repos/${this.settings.repo}/git/blobs/${file.sha}`,
      );
      b64 = ((await blob.json()) as { content: string }).content;
    }
    return { data: JSON.parse(base64ToUtf8(b64)) as T, sha: file.sha };
  }

  /** Files in a folder; empty if it doesn't exist. */
  async list(dir: string): Promise<{ path: string; sha: string }[]> {
    const res = await this.call(this.url(dir));
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`GitHub error ${res.status} listing ${dir}`);
    const items = (await res.json()) as { name: string; sha: string; type: string }[];
    return Array.isArray(items)
      ? items.filter((i) => i.type === "file").map((i) => ({ path: `${dir}/${i.name}`, sha: i.sha }))
      : [];
  }

  /** Create or update a file; retries once if our SHA was stale. */
  async write(path: string, content: string, message: string): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const sha = this.shas[path];
      const res = await this.call(this.url(path), {
        method: "PUT",
        body: JSON.stringify({ message, content: utf8ToBase64(content), ...(sha ? { sha } : {}) }),
      });
      if (res.ok) {
        this.shas[path] = ((await res.json()) as { content: { sha: string } }).content.sha;
        return;
      }
      if ((res.status === 409 || res.status === 422) && attempt === 0) {
        // Changed elsewhere (or we never saw it): pick up the current SHA and overwrite.
        const current = await this.call(this.url(path));
        if (current.ok) this.shas[path] = ((await current.json()) as { sha: string }).sha;
        else delete this.shas[path];
        continue;
      }
      throw new Error(`GitHub error ${res.status} saving ${path}`);
    }
  }

  async remove(path: string, message: string): Promise<void> {
    const sha = this.shas[path];
    if (!sha) return;
    const res = await this.call(this.url(path), { method: "DELETE", body: JSON.stringify({ message, sha }) });
    if (!res.ok && res.status !== 404 && res.status !== 409 && res.status !== 422) {
      throw new Error(`GitHub error ${res.status} deleting ${path}`);
    }
    delete this.shas[path];
  }
}

// ---------------------------------------------------------------------------
// File contents

const CONV_DIR = "conversations";

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

/** The files that represent the local state. */
export function toFiles(data: SyncData): Record<string, string> {
  const files: Record<string, string> = {
    "agents.json": stringify({ version: DATA_VERSION, agents: data.agents }),
    "crews.json": stringify({ version: DATA_VERSION, crews: data.crews }),
    "providers.json": stringify({
      version: DATA_VERSION,
      providers: data.providers.map(({ apiKey: _key, ...rest }) => rest),
    }),
  };
  for (const c of data.conversations) {
    if (c.messages.length > 0) files[`${CONV_DIR}/${c.id}.json`] = stringify({ version: DATA_VERSION, ...c });
  }
  return files;
}

/** Pull remote changes into local data. Remote wins for agents/crews/providers. */
export async function pull(store: GitHubStore, local: SyncData): Promise<SyncData> {
  const next: SyncData = { ...local, conversations: [...local.conversations] };

  const agents = await store.read<{ agents: Agent[] }>("agents.json");
  if (agents && agents.sha !== store.shas["agents.json"]) next.agents = agents.data.agents.map(normalizeAgent);
  const crews = await store.read<{ crews: Crew[] }>("crews.json");
  if (crews && crews.sha !== store.shas["crews.json"]) next.crews = crews.data.crews;
  const providers = await store.read<{ providers: Omit<Provider, "apiKey">[] }>("providers.json");
  if (providers && providers.sha !== store.shas["providers.json"]) {
    // Keys never leave the device; keep the local key for each provider.
    const keys = new Map(local.providers.map((p) => [p.id, p.apiKey]));
    next.providers = providers.data.providers.map((p) => ({ ...p, apiKey: keys.get(p.id) ?? "" }));
  }
  for (const [path, file] of [
    ["agents.json", agents],
    ["crews.json", crews],
    ["providers.json", providers],
  ] as const) {
    if (file) store.shas[path] = file.sha;
    else delete store.shas[path];
  }

  const remote = await store.list(CONV_DIR);
  const remotePaths = new Set(remote.map((r) => r.path));
  const byId = new Map(next.conversations.map((c) => [c.id, c]));

  // Deleted on another device: we had synced it, and it's gone now.
  for (const path of Object.keys(store.shas)) {
    if (path.startsWith(`${CONV_DIR}/`) && !remotePaths.has(path)) {
      byId.delete(idFromPath(path));
      delete store.shas[path];
    }
  }

  await Promise.all(
    remote
      .filter((r) => r.sha !== store.shas[r.path])
      .map(async (r) => {
        const file = await store.read<Conversation & { version?: number }>(r.path);
        if (!file) return;
        const { version: _v, ...conv } = file.data;
        const mine = byId.get(conv.id);
        if (!mine || mine.updatedAt <= conv.updatedAt) byId.set(conv.id, conv);
        store.shas[r.path] = file.sha;
      }),
  );

  next.conversations = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  return next;
}

/** Push local changes. Returns the number of files written or deleted. */
export async function push(store: GitHubStore, local: SyncData): Promise<number> {
  const files = toFiles(local);
  let changes = 0;
  for (const [path, content] of Object.entries(files)) {
    if (store.shas[path] === gitBlobSha(content)) continue;
    await store.write(path, content, `Crewbit: update ${path}`);
    changes++;
  }
  for (const path of Object.keys(store.shas)) {
    if (path.startsWith(`${CONV_DIR}/`) && !(path in files)) {
      await store.remove(path, `Crewbit: delete ${path}`);
      changes++;
    }
  }
  return changes;
}

function idFromPath(path: string): string {
  return path.slice(CONV_DIR.length + 1).replace(/\.json$/, "");
}

// ---------------------------------------------------------------------------
// Encoding helpers (work in browsers, React Native and Node)

function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function base64ToUtf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** The SHA git assigns to a file with this content ("blob <len>\0<content>"). */
export function gitBlobSha(content: string): string {
  const body = new TextEncoder().encode(content);
  const header = new TextEncoder().encode(`blob ${body.length}\0`);
  const all = new Uint8Array(header.length + body.length);
  all.set(header);
  all.set(body, header.length);
  return sha1Hex(all);
}

/** Plain SHA-1 (React Native has no crypto.subtle). */
function sha1Hex(data: Uint8Array): string {
  const len = data.length;
  const words = new Uint32Array((((len + 8) >> 6) + 1) * 16);
  for (let i = 0; i < len; i++) words[i >> 2] |= data[i] << (24 - (i % 4) * 8);
  words[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
  words[words.length - 1] = len * 8;
  words[words.length - 2] = Math.floor((len * 8) / 0x100000000);

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));
  for (let i = 0; i < words.length; i += 16) {
    for (let t = 0; t < 16; t++) w[t] = words[i + t];
    for (let t = 16; t < 80; t++) w[t] = rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let t = 0; t < 80; t++) {
      const f = t < 20 ? (b & c) | (~b & d) : t < 40 ? b ^ c ^ d : t < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
      const k = t < 20 ? 0x5a827999 : t < 40 ? 0x6ed9eba1 : t < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const temp = (rotl(a, 5) + f + e + k + w[t]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30) >>> 0;
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((h) => h.toString(16).padStart(8, "0")).join("");
}
