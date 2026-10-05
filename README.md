# Crewbit

A Claude-powered chat bot in the spirit of Grok: witty, direct, and able to search the web. It
also lets you **pair several agents together**, each with its own prompt and model, so they can
research, debate, fact-check and sum up together.

It runs as a **web app** (installable as a PWA) and a **mobile app** for iOS and Android (Expo /
React Native). Both talk to one small Node server that holds your Anthropic API key.

```
┌──────────────┐   ┌───────────────┐
│ Web (React)  │   │ Mobile (Expo) │      agents, crews and chats are
└──────┬───────┘   └──────┬────────┘      stored on the device
       │  POST /api/run (SSE stream)
       └─────────┬────────┘
          ┌──────▼───────┐            ┌─────────────────┐
          │ Node server  │──────────▶ │ Claude API      │
          │ (orchestrator)│ per agent │ (+ web search)  │
          └──────────────┘            └─────────────────┘
```

## Features

- **Agents**: personas with a name, emoji, colour, system prompt, model (Claude Opus 5.5 by
  default; Sonnet 5.5, Haiku 4.5 or Fable 5.1), effort level, and optional web search.
- **Crews**: combine agents. Three turn-taking modes:
  - **Relay**: agents answer one after another; each sees the earlier answers.
  - **Parallel**: everyone answers independently at the same time.
  - **Roundtable**: agents discuss in turn for 1-5 rounds, which works well for debates.
  - Optional **synthesiser**: one agent reads everything and writes the final answer.
- Streaming replies, collapsible thinking summaries, web-search queries shown inline, and a Stop
  button that also stops generation on the server.
- Built-in agents: **Bit** (the Grok-style witty one), Researcher, Skeptic, Coder, Muse and Judge.
  Built-in crews: Just Bit, Fact-check squad, Debate club and Brainstorm.
- Your API key never leaves the server. You can set an optional access token so a deployed
  server isn't open to everyone.

## Quick start

Requires Node 20+.

```bash
npm install
cp .env.example .env        # then put your ANTHROPIC_API_KEY in .env
npm run dev                 # server on :8787, web app on http://localhost:5173
```

### Mobile app

```bash
cp mobile/.env.example mobile/.env   # set EXPO_PUBLIC_CREWBIT_SERVER_URL
npm run mobile                       # then scan the QR code with Expo Go
```

On a physical phone the server URL must be your computer's LAN address (for example
`http://192.168.1.20:8787`), not `localhost`. The Android emulator uses `http://10.0.2.2:8787`.
You can also change the URL in the app under **Settings**.

To ship to the App Store or Play Store, use [EAS Build](https://docs.expo.dev/build/introduction/)
(`npx eas build` inside `mobile/`) and point the app at your deployed server.

## Deploying the web app + server

The server serves the built web app, so you only need one service:

```bash
npm run build && npm start          # http://localhost:8787
# or
docker build -t crewbit . && docker run -p 8787:8787 \
  -e ANTHROPIC_API_KEY=sk-ant-... -e CREWBIT_ACCESS_TOKEN=pick-a-secret crewbit
```

**Set `CREWBIT_ACCESS_TOKEN` on any server reachable from the internet.** Without it, anyone who
finds the URL can spend your API credits. Users enter the same token under **Settings** in the
web or mobile app.

## Project layout

| Path      | What it is |
|-----------|------------|
| `shared/` | Types, built-in agents/crews, the streaming client, and the `useCrewbit` React hook used by both apps |
| `server/` | Express server. `orchestrator.ts` runs crews; `transcript.ts` builds each agent's view of the conversation |
| `web/`    | Vite + React web app |
| `mobile/` | Expo (React Native) app for iOS and Android |

### How multi-agent turns work

The server is stateless: each request carries the agents, the crew settings and the history.
For every agent turn, the server builds a transcript from that agent's point of view. Its own
past replies are `assistant` turns. The user's messages and the other agents' replies are `user`
turns, labelled `[AgentName]:`. A "crew context" section is appended to the agent's system prompt
so it knows who else is in the room and how turns work. Each agent can therefore use a different
model and prompt while sharing one conversation.

Requests use adaptive thinking with the agent's effort level, prompt caching, and server-side
refusal fallbacks (`fallbacks: "default"`). Web search uses Claude's built-in `web_search` tool.

## Scripts

| Command             | Does |
|---------------------|------|
| `npm run dev`       | Server + web app with hot reload |
| `npm run mobile`    | Expo dev server for the mobile app |
| `npm run build`     | Build the web app into `web/dist` |
| `npm start`         | Run the server (serves `web/dist` if built) |
| `npm run typecheck` | Type-check every package |
| `npm test`          | Server unit tests |

## Ideas for next steps

- Image/file attachments (Claude supports images and PDFs)
- User accounts and server-side chat sync
- Per-agent tools (calculators, your own APIs) via tool use
- Voice input on mobile
