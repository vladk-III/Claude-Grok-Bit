// App state shared by the web and mobile apps: agents, crews, providers,
// conversations, persistence, GitHub sync and running crews.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyRunEvent, runOnServer, type ServerSettings } from "./client";
import type { FetchLike } from "./engine/adapter";
import { runCrew } from "./engine/run";
import { DEFAULT_GITHUB, GitHubStore, pull, push, type GitHubSettings, type ShaMap, type SyncData } from "./github";
import { DEFAULT_PROVIDERS, PRESET_AGENTS, PRESET_CREWS, newId, normalizeAgent } from "./presets";
import type { Agent, ChatMessage, Conversation, Crew, Provider, RunEvent, RunRequest } from "./types";

/** localStorage on web, AsyncStorage on mobile. */
export interface KeyValueStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
}

/** "direct": call AI providers from this device. "server": go through a Crewbit server. */
export type RunMode = "direct" | "server";

interface PersistedState {
  agents: Agent[];
  crews: Crew[];
  providers: Provider[];
  conversations: Conversation[];
  activeId: string | null;
  runMode: RunMode;
  server: ServerSettings;
  github: GitHubSettings;
}

export interface SyncStatus {
  state: "off" | "syncing" | "ok" | "error";
  message?: string;
  at?: number;
}

const STORAGE_KEY = "crewbit:v1";
const SHAS_KEY = "crewbit:github-shas";

function freshConversation(crewId: string): Conversation {
  const now = Date.now();
  return { id: newId("chat"), title: "New chat", crewId, messages: [], createdAt: now, updatedAt: now };
}

function load(raw: string, base: PersistedState): PersistedState {
  const saved = JSON.parse(raw) as Partial<PersistedState> & { connection?: { serverUrl?: string; token?: string } };
  return {
    ...base,
    ...saved,
    agents: (saved.agents ?? base.agents).map(normalizeAgent),
    providers: saved.providers?.length ? saved.providers : base.providers,
    server: saved.server ?? { url: saved.connection?.serverUrl ?? base.server.url, token: saved.connection?.token ?? "" },
    github: { ...DEFAULT_GITHUB, ...saved.github },
  };
}

export function useCrewbit(options: {
  storage: KeyValueStorage;
  fetch: FetchLike;
  defaultRunMode?: RunMode;
  defaultServerUrl?: string;
}) {
  const { storage, fetch: fetchImpl } = options;
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<PersistedState>(() => ({
    agents: PRESET_AGENTS,
    crews: PRESET_CREWS,
    providers: DEFAULT_PROVIDERS,
    conversations: [],
    activeId: null,
    runMode: options.defaultRunMode ?? "direct",
    server: { url: options.defaultServerUrl ?? "", token: "" },
    github: DEFAULT_GITHUB,
  }));
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncStatus>({ state: "off" });
  const abortRef = useRef<AbortController | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const shasRef = useRef<ShaMap>({});
  const syncChain = useRef<Promise<unknown>>(Promise.resolve());

  // ---- persistence --------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await storage.getItem(STORAGE_KEY);
        if (raw && !cancelled) setState((s) => load(raw, s));
        const shas = await storage.getItem(SHAS_KEY);
        if (shas) shasRef.current = JSON.parse(shas) as ShaMap;
      } catch {
        /* corrupt or unavailable storage: start fresh */
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [storage]);

  // Save (debounced, so streaming tokens don't hammer storage).
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      try {
        void storage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        /* storage full or unavailable */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [state, loaded, storage]);

  // ---- GitHub sync --------------------------------------------------------

  const syncData = (s: PersistedState): SyncData => ({
    agents: s.agents,
    crews: s.crews,
    providers: s.providers,
    conversations: s.conversations,
  });

  /** Run a sync job after any job already in flight; jobs never overlap. */
  const enqueue = useCallback(
    (job: (store: GitHubStore) => Promise<void>) => {
      const gh = stateRef.current.github;
      if (!gh.enabled || !gh.repo || !gh.token) return Promise.resolve();
      const run = async () => {
        setSync({ state: "syncing" });
        try {
          await job(new GitHubStore(gh, fetchImpl, shasRef.current));
          setSync({ state: "ok", at: Date.now() });
        } catch (err) {
          setSync({ state: "error", message: err instanceof Error ? err.message : String(err), at: Date.now() });
        }
        try {
          await storage.setItem(SHAS_KEY, JSON.stringify(shasRef.current));
        } catch {
          /* ignore */
        }
      };
      const next = syncChain.current.then(run, run);
      syncChain.current = next;
      return next;
    },
    [fetchImpl, storage],
  );

  /** Pull changes from GitHub, then push local changes. */
  const syncNow = useCallback(
    () =>
      enqueue(async (store) => {
        const merged = await pull(store, syncData(stateRef.current));
        setState((s) => ({
          ...s,
          ...merged,
          activeId: merged.conversations.some((c) => c.id === s.activeId) ? s.activeId : null,
        }));
        await push(store, merged);
      }),
    [enqueue],
  );

  // Pull once on start and whenever sync settings change.
  const ghKey = `${state.github.enabled}|${state.github.repo}|${state.github.token}|${state.github.folder}`;
  useEffect(() => {
    if (!loaded) return;
    if (!state.github.enabled) {
      setSync({ state: "off" });
      return;
    }
    void syncNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, ghKey]);

  // Push local changes a moment after they happen (not mid-run).
  useEffect(() => {
    if (!loaded || runningId || !state.github.enabled) return;
    const t = setTimeout(() => void enqueue((store) => push(store, syncData(stateRef.current)).then(() => {})), 2500);
    return () => clearTimeout(t);
  }, [loaded, runningId, state.agents, state.crews, state.providers, state.conversations, state.github.enabled, enqueue]);

  // ---- conversations & runs -----------------------------------------------

  const active = useMemo(
    () => state.conversations.find((c) => c.id === state.activeId) ?? null,
    [state.conversations, state.activeId],
  );
  const activeCrew = useMemo(
    () => state.crews.find((c) => c.id === active?.crewId) ?? state.crews[0] ?? null,
    [state.crews, active],
  );

  const patchConversation = useCallback((id: string, fn: (c: Conversation) => Conversation) => {
    setState((s) => ({ ...s, conversations: s.conversations.map((c) => (c.id === id ? fn(c) : c)) }));
  }, []);

  const newConversation = useCallback(
    (crewId?: string) => {
      const conv = freshConversation(crewId ?? activeCrew?.id ?? state.crews[0]?.id ?? "");
      setState((s) => ({ ...s, conversations: [conv, ...s.conversations], activeId: conv.id }));
      return conv.id;
    },
    [activeCrew, state.crews],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      const s = stateRef.current;
      if (!trimmed || runningId) return;
      setError(null);

      let conv = s.conversations.find((c) => c.id === s.activeId) ?? null;
      if (!conv) {
        const created = freshConversation(activeCrew?.id ?? s.crews[0]?.id ?? "");
        conv = created;
        setState((x) => ({ ...x, conversations: [created, ...x.conversations], activeId: created.id }));
      }
      const crew = s.crews.find((c) => c.id === conv.crewId) ?? activeCrew;
      if (!crew) {
        setError("Create a crew first.");
        return;
      }

      const userMsg: ChatMessage = { id: newId("msg"), role: "user", text: trimmed, createdAt: Date.now() };
      const history = [...conv.messages, userMsg];
      const convId = conv.id;
      patchConversation(convId, (c) => ({
        ...c,
        messages: history,
        title: c.messages.length === 0 ? trimmed.slice(0, 60) : c.title,
        updatedAt: Date.now(),
      }));

      const needed = new Set([...crew.agentIds, ...(crew.synthesizerId ? [crew.synthesizerId] : [])]);
      const agents = s.agents.filter((a) => needed.has(a.id));
      const usedProviders = new Set(agents.map((a) => a.provider));
      const request: RunRequest = {
        agents,
        providers: s.providers.filter((p) => usedProviders.has(p.id)),
        crew: {
          agentIds: crew.agentIds.filter((id) => agents.some((a) => a.id === id)),
          mode: crew.mode,
          rounds: crew.rounds,
          synthesizerId: agents.some((a) => a.id === crew.synthesizerId) ? crew.synthesizerId : undefined,
        },
        history,
      };
      const onEvent = (event: RunEvent) => {
        if (event.type === "error" && !event.turnId) setError(event.message);
        patchConversation(convId, (c) => ({ ...c, messages: applyRunEvent(c.messages, event), updatedAt: Date.now() }));
      };

      const controller = new AbortController();
      abortRef.current = controller;
      setRunningId(convId);
      try {
        if (s.runMode === "server") {
          await runOnServer(fetchImpl, s.server, request, onEvent, controller.signal);
        } else {
          await runCrew(request, onEvent, controller.signal, fetchImpl);
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        abortRef.current = null;
        setRunningId(null);
      }
    },
    [activeCrew, fetchImpl, patchConversation, runningId],
  );

  const upsert = <T extends { id: string }>(list: T[], item: T) =>
    list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];

  return {
    loaded,
    agents: state.agents,
    crews: state.crews,
    providers: state.providers,
    conversations: state.conversations,
    runMode: state.runMode,
    server: state.server,
    github: state.github,
    active,
    activeCrew,
    running: runningId !== null,
    error,
    sync,
    fetch: fetchImpl,
    clearError: () => setError(null),
    send,
    stop,
    newConversation,
    syncNow,
    selectConversation: (id: string | null) => setState((s) => ({ ...s, activeId: id })),
    deleteConversation: (id: string) =>
      setState((s) => ({
        ...s,
        conversations: s.conversations.filter((c) => c.id !== id),
        activeId: s.activeId === id ? null : s.activeId,
      })),
    setConversationCrew: (convId: string, crewId: string) => patchConversation(convId, (c) => ({ ...c, crewId })),
    saveAgent: (agent: Agent) => setState((s) => ({ ...s, agents: upsert(s.agents, agent) })),
    deleteAgent: (id: string) =>
      setState((s) => ({
        ...s,
        agents: s.agents.filter((a) => a.id !== id),
        crews: s.crews.map((c) => ({
          ...c,
          agentIds: c.agentIds.filter((x) => x !== id),
          synthesizerId: c.synthesizerId === id ? undefined : c.synthesizerId,
        })),
      })),
    saveCrew: (crew: Crew) => setState((s) => ({ ...s, crews: upsert(s.crews, crew) })),
    deleteCrew: (id: string) => setState((s) => ({ ...s, crews: s.crews.filter((c) => c.id !== id) })),
    saveProvider: (provider: Provider) => setState((s) => ({ ...s, providers: upsert(s.providers, provider) })),
    deleteProvider: (id: string) => setState((s) => ({ ...s, providers: s.providers.filter((p) => p.id !== id) })),
    setRunMode: (runMode: RunMode) => setState((s) => ({ ...s, runMode })),
    setServer: (server: ServerSettings) => setState((s) => ({ ...s, server })),
    setGitHub: (github: GitHubSettings) => {
      // A different repo or folder starts from a clean slate.
      const old = stateRef.current.github;
      if (old.repo !== github.repo || old.folder !== github.folder) shasRef.current = {};
      setState((s) => ({ ...s, github }));
    },
    resetPresets: () => setState((s) => ({ ...s, agents: PRESET_AGENTS, crews: PRESET_CREWS })),
    /** Agents, crews, providers (without keys) and chats, for a backup file. */
    exportData: () => {
      const s = stateRef.current;
      return {
        app: "crewbit",
        version: 1,
        exportedAt: new Date().toISOString(),
        agents: s.agents,
        crews: s.crews,
        providers: s.providers.map(({ apiKey: _k, ...p }) => p),
        conversations: s.conversations,
      };
    },
    importData: (data: Partial<SyncData>) =>
      setState((s) => {
        const keys = new Map(s.providers.map((p) => [p.id, p.apiKey]));
        const convs = new Map(s.conversations.map((c) => [c.id, c]));
        for (const c of data.conversations ?? []) convs.set(c.id, c);
        return {
          ...s,
          agents: data.agents?.map(normalizeAgent) ?? s.agents,
          crews: data.crews ?? s.crews,
          providers: data.providers?.map((p) => ({ ...p, apiKey: keys.get(p.id) ?? "" })) ?? s.providers,
          conversations: [...convs.values()].sort((a, b) => b.updatedAt - a.updatedAt),
        };
      }),
  };
}

export type CrewbitState = ReturnType<typeof useCrewbit>;
