// App state shared by the web and mobile apps: agents, crews, conversations,
// connection settings, persistence and running a crew against the server.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyRunEvent, streamRun, type ConnectionSettings, type FetchLike } from "./client";
import { PRESET_AGENTS, PRESET_CREWS, newId } from "./presets";
import type { Agent, ChatMessage, Crew } from "./types";

export interface Conversation {
  id: string;
  title: string;
  crewId: string;
  messages: ChatMessage[];
  updatedAt: number;
}

/** localStorage on web, AsyncStorage on mobile. */
export interface KeyValueStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
}

interface PersistedState {
  agents: Agent[];
  crews: Crew[];
  conversations: Conversation[];
  activeId: string | null;
  connection: ConnectionSettings;
}

const STORAGE_KEY = "crewbit:v1";

function freshConversation(crewId: string): Conversation {
  return { id: newId("chat"), title: "New chat", crewId, messages: [], updatedAt: Date.now() };
}

export function useCrewbit(options: {
  storage: KeyValueStorage;
  fetch: FetchLike;
  defaultConnection: ConnectionSettings;
}) {
  const { storage, fetch: fetchImpl, defaultConnection } = options;
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<PersistedState>(() => ({
    agents: PRESET_AGENTS,
    crews: PRESET_CREWS,
    conversations: [],
    activeId: null,
    connection: defaultConnection,
  }));
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await storage.getItem(STORAGE_KEY);
        if (raw && !cancelled) {
          const saved = JSON.parse(raw) as Partial<PersistedState>;
          setState((s) => ({ ...s, ...saved, connection: { ...s.connection, ...saved.connection } }));
        }
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

  const active = useMemo(
    () => state.conversations.find((c) => c.id === state.activeId) ?? null,
    [state.conversations, state.activeId],
  );
  const activeCrew = useMemo(
    () => state.crews.find((c) => c.id === active?.crewId) ?? state.crews[0] ?? null,
    [state.crews, active],
  );

  const patchConversation = useCallback((id: string, fn: (c: Conversation) => Conversation) => {
    setState((s) => ({
      ...s,
      conversations: s.conversations.map((c) => (c.id === id ? fn(c) : c)),
    }));
  }, []);

  const newConversation = useCallback(
    (crewId?: string) => {
      const conv = freshConversation(crewId ?? activeCrew?.id ?? state.crews[0]?.id ?? "");
      setState((s) => ({ ...s, conversations: [conv, ...s.conversations], activeId: conv.id }));
      return conv.id;
    },
    [activeCrew, state.crews],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || runningId) return;
      setError(null);

      let conv = active;
      if (!conv) {
        conv = freshConversation(activeCrew?.id ?? state.crews[0]?.id ?? "");
        const created = conv;
        setState((s) => ({ ...s, conversations: [created, ...s.conversations], activeId: created.id }));
      }
      const crew = state.crews.find((c) => c.id === conv.crewId) ?? activeCrew;
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
      const agents = state.agents.filter((a) => needed.has(a.id));
      const controller = new AbortController();
      abortRef.current = controller;
      setRunningId(convId);
      try {
        await streamRun(
          fetchImpl,
          state.connection,
          {
            agents,
            crew: {
              agentIds: crew.agentIds.filter((id) => agents.some((a) => a.id === id)),
              mode: crew.mode,
              rounds: crew.rounds,
              synthesizerId: agents.some((a) => a.id === crew.synthesizerId) ? crew.synthesizerId : undefined,
            },
            history,
          },
          (event) => {
            if (event.type === "error" && !event.turnId) setError(event.message);
            patchConversation(convId, (c) => ({
              ...c,
              messages: applyRunEvent(c.messages, event),
              updatedAt: Date.now(),
            }));
          },
          controller.signal,
        );
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        abortRef.current = null;
        setRunningId(null);
      }
    },
    [active, activeCrew, fetchImpl, patchConversation, runningId, state.agents, state.connection, state.crews],
  );

  return {
    loaded,
    agents: state.agents,
    crews: state.crews,
    conversations: state.conversations,
    connection: state.connection,
    active,
    activeCrew,
    running: runningId !== null,
    error,
    clearError: () => setError(null),
    send,
    stop,
    newConversation,
    selectConversation: (id: string | null) => setState((s) => ({ ...s, activeId: id })),
    deleteConversation: (id: string) =>
      setState((s) => ({
        ...s,
        conversations: s.conversations.filter((c) => c.id !== id),
        activeId: s.activeId === id ? null : s.activeId,
      })),
    setConversationCrew: (convId: string, crewId: string) =>
      patchConversation(convId, (c) => ({ ...c, crewId })),
    saveAgent: (agent: Agent) =>
      setState((s) => ({
        ...s,
        agents: s.agents.some((a) => a.id === agent.id)
          ? s.agents.map((a) => (a.id === agent.id ? agent : a))
          : [...s.agents, agent],
      })),
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
    saveCrew: (crew: Crew) =>
      setState((s) => ({
        ...s,
        crews: s.crews.some((c) => c.id === crew.id)
          ? s.crews.map((c) => (c.id === crew.id ? crew : c))
          : [...s.crews, crew],
      })),
    deleteCrew: (id: string) => setState((s) => ({ ...s, crews: s.crews.filter((c) => c.id !== id) })),
    setConnection: (connection: ConnectionSettings) => setState((s) => ({ ...s, connection })),
    resetPresets: () => setState((s) => ({ ...s, agents: PRESET_AGENTS, crews: PRESET_CREWS })),
  };
}

export type CrewbitState = ReturnType<typeof useCrewbit>;
