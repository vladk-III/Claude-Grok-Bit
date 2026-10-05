# Crewbit

A chat bot in the spirit of Grok: witty, direct, and able to search the web. It lets you
**pair several agents together**, each with its own personality, AI provider and model, so they
can research, debate, fact-check and sum up together.

- **Runs entirely on GitHub.** The web app is hosted free on GitHub Pages, and your agents and chat
  history are saved as JSON files in a private GitHub repo. No server is needed.
- **Bring your own AI keys.** Claude, OpenAI, Google Gemini, DeepSeek, OpenRouter, Fireworks,
  DeepInfra, Groq, Together, a model running on your own computer (Ollama), or any other
  OpenAI-compatible API. Mix them within one crew.
- **Web and mobile.** Use it in any browser (and "Add to Home Screen" on your phone), or build
  the native iOS/Android app in `mobile/`.

```
  Browser (GitHub Pages)  or  Mobile app
        │            │              │
        │ your keys  │              │ GitHub token
        ▼            ▼              ▼
   Claude API   DeepSeek, Gemini,   Private GitHub repo
                OpenAI, ...         agents.json, crews.json,
                                    conversations/*.json
```

## Use it on GitHub (no installs)

### 1. Turn on GitHub Pages (one time)

1. Open this repository on GitHub and go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Go to the **Actions** tab, open **Deploy web app to GitHub Pages**, and click **Run workflow**.
   After that it redeploys automatically on every push.
4. When it finishes, the app is live at **`https://<your-username>.github.io/<repo-name>/`**.
   For this repo: <https://vladk-iii.github.io/Claude-Grok-Bit/>.

### 2. Add your AI keys

Open the app → **Settings → AI providers**. Edit **Anthropic (Claude)** and paste your key, or
**Add a provider** for any other service. Keys are stored **only in that browser** and are sent
only to that provider. They are never uploaded to GitHub. Each device needs its own keys.

Then go to **Agents**, open an agent, and pick its **provider** and **model**. For non-Claude
providers, **Load list** fetches the provider's available models.

### 3. Save your agents and history to GitHub (optional, recommended)

1. Create a new **private** repository, e.g. `crewbit-data`, at <https://github.com/new>.
   Tick "Add a README file".
2. Create a token at <https://github.com/settings/personal-access-tokens/new>:
   - **Repository access**: "Only select repositories" → pick `crewbit-data`
   - **Permissions → Repository permissions → Contents**: "Read and write"
   - Set an expiry you're comfortable with, then generate and copy the token.
3. In the app: **Settings → GitHub sync**, enter `your-username/crewbit-data` and the token, and
   press **Save & sync**. The app refuses to sync to a public repo.

Every device you connect to the same repo shares the same agents, crews and chats. The app pulls
changes when it opens and when you switch back to it, and pushes a moment after each change.

**Keep the data repo private.** Your chat history is readable by anyone who can read that repo.

### The JSON format

```
crewbit/
  agents.json              { "version": 1, "agents": [ ...personalities... ] }
  crews.json               { "version": 1, "crews": [ ... ] }
  providers.json           { "version": 1, "providers": [ ...names and URLs, no keys... ] }
  conversations/<id>.json  { "version": 1, "id", "title", "crewId", "createdAt", "updatedAt",
                             "messages": [ { "role": "user" | "agent", "agentName", "model",
                                             "text", "thinking", "inputTokens", "outputTokens", ... } ] }
```

You can edit these files on GitHub (for example, to tweak a personality) and the app picks up
the change on the next sync. **Settings → Backup** downloads everything as one JSON file.

## Providers and privacy

| Provider | Notes |
|---|---|
| Anthropic (Claude) | Web search and thinking effort work only with Claude agents. |
| DeepSeek (direct) | Very cheap, but DeepSeek's privacy policy says prompts are stored in China and may be used for training. |
| Fireworks / DeepInfra / OpenRouter | Host open models such as DeepSeek V4 in the US, so your data doesn't go to DeepSeek. |
| Ollama | Runs models on your own computer, so nothing leaves it. For the web app, start it with `OLLAMA_ORIGINS=*`. |

**Browser restrictions:** in the web app, your browser talks to each provider directly. Claude
allows this, but some providers block requests from web pages; you'll see a "Couldn't reach …"
error. If that happens, use the mobile app (which has no such restriction), or run the optional
server below.

**Key safety:** keys are kept in the browser's local storage. Only enter them on devices you
trust, and set a monthly spending limit in each provider's console.

## Mobile app (iOS / Android)

The web app works well on phones; open the Pages URL and use **Add to Home Screen**. For a
native app:

```bash
npm install
npm run mobile          # scan the QR code with the Expo Go app
```

Then enter your keys and GitHub sync settings in the app's **Settings**. To publish to the App
Store or Play Store, use [EAS Build](https://docs.expo.dev/build/introduction/) (`npx eas build`
in `mobile/`).

## Run it on your computer

Requires Node 22 or newer.

```bash
npm install
npm run dev:web         # http://localhost:5173
```

### Optional server

You don't need a server. It's there if you want to keep API keys off your devices, or to reach a
provider that blocks browsers. Put keys in `.env` (see `.env.example`), run `npm run dev:server`,
and in the app choose **Settings → Where agents run → Through a Crewbit server**. Set
`CREWBIT_ACCESS_TOKEN` whenever the server is reachable from the internet. `docker build -t crewbit .`
packages the server together with the web app.

## Project layout

| Path      | What it is |
|-----------|------------|
| `shared/` | The engine that runs crews (`engine/`), provider adapters for Claude and OpenAI-compatible APIs, GitHub sync (`github.ts`), and the `useCrewbit` React hook used by both apps |
| `web/`    | Vite + React web app (deployed to GitHub Pages) |
| `mobile/` | Expo (React Native) app for iOS and Android |
| `server/` | Optional Express server that runs the same engine |

### How multi-agent turns work

For every agent turn, the engine builds a transcript from that agent's point of view. Its own
past replies are `assistant` turns. The user's messages and the other agents' replies are `user`
turns, labelled `[AgentName]:`. A "crew context" section is added to the agent's system prompt so
it knows who else is in the room. That is what lets agents on different providers and models
share one conversation.

Claude requests use adaptive thinking with the agent's effort level, prompt caching, server-side
refusal fallbacks, and Claude's built-in web search tool.

## Scripts

| Command              | Does |
|----------------------|------|
| `npm run dev:web`    | Web app with hot reload |
| `npm run dev`        | Web app + optional server |
| `npm run mobile`     | Expo dev server for the mobile app |
| `npm run build`      | Build the web app into `web/dist` |
| `npm run typecheck`  | Type-check every package |
| `npm test`           | Unit tests (engine, provider adapter, GitHub sync) |
