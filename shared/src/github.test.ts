import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import type { FetchLike } from "./engine/adapter";
import { GitHubStore, gitBlobSha, pull, push, type GitHubSettings, type SyncData } from "./github";
import { DEFAULT_PROVIDERS, PRESET_AGENTS, PRESET_CREWS } from "./presets";
import type { Conversation } from "./types";

test("gitBlobSha matches git hash-object", () => {
  for (const s of ["", "hello\n", "émoji ⚡ and 日本語\n", "x".repeat(10_000)]) {
    const expected = execFileSync("git", ["hash-object", "--stdin"], { input: s }).toString().trim();
    assert.equal(gitBlobSha(s), expected);
  }
});

/** In-memory stand-in for the GitHub contents API. */
function fakeGitHub() {
  const files = new Map<string, string>(); // path -> content
  let commits = 0;
  const fetchImpl: FetchLike = async (url, init) => {
    const m = url.match(/\/repos\/me\/data\/contents\/(.+)$/);
    const json = (status: number, body: unknown) => ({
      ok: status < 300,
      status,
      body: null,
      text: async () => JSON.stringify(body),
      json: async () => body,
    });
    if (!m) return json(404, {});
    const path = decodeURIComponent(m[1]);
    const method = init?.method ?? "GET";
    if (method === "GET") {
      if (files.has(path)) {
        const content = files.get(path)!;
        return json(200, {
          sha: gitBlobSha(content),
          encoding: "base64",
          content: Buffer.from(content).toString("base64"),
        });
      }
      const children = [...files.keys()].filter((p) => p.startsWith(`${path}/`));
      if (children.length === 0) return json(404, {});
      return json(
        200,
        children.map((p) => ({ name: p.slice(path.length + 1), type: "file", sha: gitBlobSha(files.get(p)!) })),
      );
    }
    const body = JSON.parse(init!.body!) as { content?: string; sha?: string };
    const current = files.get(path);
    if (current !== undefined && body.sha !== gitBlobSha(current)) return json(409, {});
    commits++;
    if (method === "DELETE") {
      files.delete(path);
      return json(200, {});
    }
    const content = Buffer.from(body.content!, "base64").toString("utf8");
    files.set(path, content);
    return json(201, { content: { sha: gitBlobSha(content) } });
  };
  return { files, fetchImpl, commits: () => commits };
}

const settings: GitHubSettings = { enabled: true, repo: "me/data", token: "t", folder: "crewbit" };

function conv(id: string, updatedAt: number, text = "hi"): Conversation {
  return {
    id,
    title: text,
    crewId: "solo-bit",
    createdAt: 1,
    updatedAt,
    messages: [{ id: `m-${id}`, role: "user", text, createdAt: 1 }],
  };
}

function device(conversations: Conversation[] = [], apiKey = "") {
  const data: SyncData = {
    agents: PRESET_AGENTS,
    crews: PRESET_CREWS,
    providers: DEFAULT_PROVIDERS.map((p) => ({ ...p, apiKey })),
    conversations,
  };
  return { data, shas: {} as Record<string, string> };
}

test("two devices stay in sync, keys never leave the device", async () => {
  const gh = fakeGitHub();
  const a = device([conv("c1", 10)], "secret-a");
  const b = device([], "secret-b");

  // Device A pushes everything.
  const storeA = new GitHubStore(settings, gh.fetchImpl, a.shas);
  a.data = await pull(storeA, a.data);
  await push(storeA, a.data);
  assert.ok(gh.files.has("crewbit/agents.json"));
  assert.ok(gh.files.has("crewbit/conversations/c1.json"));
  for (const content of gh.files.values()) assert.ok(!content.includes("secret-a"));

  // Pushing again with no changes writes nothing.
  const before = gh.commits();
  assert.equal(await push(storeA, a.data), 0);
  assert.equal(gh.commits(), before);

  // Device B pulls A's conversation and keeps its own key.
  const storeB = new GitHubStore(settings, gh.fetchImpl, b.shas);
  b.data = await pull(storeB, b.data);
  assert.deepEqual(b.data.conversations.map((c) => c.id), ["c1"]);
  assert.equal(b.data.providers[0].apiKey, "secret-b");
  assert.equal(await push(storeB, b.data), 0);

  // B edits an agent and continues the conversation; A picks both up.
  b.data = {
    ...b.data,
    agents: b.data.agents.map((x) => (x.id === "bit" ? { ...x, name: "Bitty" } : x)),
    conversations: [conv("c1", 20, "updated")],
  };
  await push(storeB, b.data);
  a.data = await pull(storeA, a.data);
  assert.equal(a.data.agents.find((x) => x.id === "bit")?.name, "Bitty");
  assert.equal(a.data.conversations[0].title, "updated");

  // A deletes the conversation; B sees it disappear.
  a.data = { ...a.data, conversations: [] };
  await push(storeA, a.data);
  assert.ok(!gh.files.has("crewbit/conversations/c1.json"));
  b.data = await pull(storeB, b.data);
  assert.equal(b.data.conversations.length, 0);
});

test("a newer local conversation wins over an older remote copy", async () => {
  const gh = fakeGitHub();
  const a = device([conv("c1", 10, "old")]);
  const storeA = new GitHubStore(settings, gh.fetchImpl, a.shas);
  await push(storeA, a.data);

  const b = device([conv("c1", 50, "newer")]);
  const storeB = new GitHubStore(settings, gh.fetchImpl, b.shas);
  b.data = await pull(storeB, b.data);
  assert.equal(b.data.conversations[0].title, "newer");
  await push(storeB, b.data);
  assert.match(gh.files.get("crewbit/conversations/c1.json")!, /newer/);
});
