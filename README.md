<div align="center">

  <h1 align="center">
    <img src="frontend-nextjs/public/assets/ubair-logo.png" alt="Ubair OS Logo" width="130" height="130" />
    <br/>
    UBAIR OS
  </h1>

  ### The Autonomous Neural Workspace for High-Velocity Builders & Thinkers

  [![Next.js 16](https://img.shields.io/badge/Next.js_16-Turbopack-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
  [![React 19](https://img.shields.io/badge/React_19-TypeScript-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
  [![FastAPI](https://img.shields.io/badge/FastAPI-Async_Gateway-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
  [![Supabase](https://img.shields.io/badge/Supabase-pgvector-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
  [![Tailwind](https://img.shields.io/badge/Tailwind_CSS-Styling-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
  [![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg?style=for-the-badge)](LICENSE)

  <p align="center">
    <b>Ubair OS</b> is a multi-modal AI workspace that combines a four-tier chat failover mesh, Cerebras-powered web search synthesis, Gemini multimodal vision, and vector-grounded memory (RAG) — all served from the Vercel Edge Network on a resilient, zero-cost cloud mesh.
  </p>

  <p align="center">
    <a href="https://ubair-os.vercel.app"><strong>🚀 Launch Production Workspace →</strong></a>
    &nbsp;•&nbsp;
    <a href="#-architecture"><strong>🏗️ Architecture</strong></a>
    &nbsp;•&nbsp;
    <a href="#-local-development-setup"><strong>⚙️ Run Locally</strong></a>
    &nbsp;•&nbsp;
    <a href="#-engineering-challenges--solutions"><strong>🧠 Engineering Decisions</strong></a>
  </p>

</div>

---

## 📑 Table of Contents

- [Why Ubair OS](#-why-ubair-os)
- [Demo](#-demo)
- [Feature Overview](#-feature-overview)
- [Architecture](#-architecture)
- [Engineering Challenges & Solutions](#-engineering-challenges--solutions)
- [Workstations](#-flagship-workstations)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Local Development Setup](#-local-development-setup)
- [Environment Variables](#-environment-variables)
- [Deployment](#-deployment)
- [Security & Privacy](#-security--privacy)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [Author](#-author)
- [License](#-license)

---

## 💡 Why Ubair OS

Most AI tools are a single chat box tied to a single model. When that model rate-limits, the conversation dies. Memory is shallow, search is slow, and the UI is an afterthought.

Ubair OS was built over **12+ months** to answer one question: *what if an AI workspace stayed fast, remembered context, and never went down — even on free-tier infrastructure?*

| Problem with typical AI tools | How Ubair OS handles it |
| --- | --- |
| One provider outage = dead chat | Four-tier chat failover mesh (Groq → Mistral AI → OpenRouter → Gemini) that preserves context mid-stream |
| Slow, shallow web-grounded answers | Dedicated Cerebras engine for web search synthesis and query expansion |
| Text-only assistants | Gemini multimodal vision for file attachments, screenshots, and document RAG indexing |
| Context lost between sessions | Per-project vector memory using Supabase + pgvector |
| Free-tier cold starts (~50s) | Keep-alive cron mesh keeps the gateway warm |
| Heavy, janky animations | Offscreen-canvas sprite rendering for smooth 60–120 FPS |
| Intrusive tracking & permissions | Client-side ambient state, no tracking banners |

---

## 🎬 Demo

<div align="center">

  <img src="docs/assets/hero-gateway.png" alt="Ubair OS Hero Gateway" width="850" />

  <br/><br/>

  | Neural Chat Stream | Workspace Canvas |
  | :---: | :---: |
  | <img src="docs/assets/neural-chat.png" alt="Neural Chat" width="420" /> | <img src="docs/assets/workspace-ambient.png" alt="Workspace" width="420" /> |

  | Ambient Founder Inbox | Mobile Viewport Ergonomics |
  | :---: | :---: |
  | <img src="docs/assets/ambient-inbox.png" alt="Ambient Inbox" width="420" /> | <img src="docs/assets/mobile-responsive.png" alt="Mobile Ergonomics" width="420" /> |

</div>

---

## ✨ Feature Overview

- 🤖 **Multi-model chat** with real-time token streaming over SSE
- 🔁 **Four-tier chat failover mesh** — Groq, Mistral AI, OpenRouter, and Gemini — switching automatically on `429` / `503` without breaking the stream
- 🔎 **Web Search Synthesis & Query Expansion** powered by Cerebras wafer-scale inference (1,800+ tokens/sec) for fast web retrieval
- 👁️ **Multimodal Vision** on Google Gemini: file attachment analysis, screenshot understanding, and document RAG indexing
- 🧠 **Vector RAG memory** — upload documents, chat with them, isolated per project
- ⚔️ **Assessment Arena & Forge** — multi-model cognitive evaluation, Socratic defense, and architectural reasoning on the core reasoning fleet
- 🌐 **Vercel Edge Network** — global CDN serving the Next.js 16 frontend
- 🗂️ **Project workspaces** with isolated memory, documents, and context vaults
- 🎨 **Image Studio** and **Slate** workstations
- 💻 **Syntax-highlighted code blocks** across 20+ languages with one-click copy
- 🔔 **Founder inbox** for release notes and broadcasts (pin / read / dismiss)
- 🌌 **120 FPS canvas particle engine** using offscreen sprite blitting
- 📱 **Mobile-first ergonomics** with safe-area aware input dock
- 🔐 **Google OAuth 2.0** sign-in — no passwords stored
- ⏳ **Ephemeral Quick Chat** with automatic 24-hour client memory purge

---

## 🧱 Architecture

Ubair OS separates workloads by purpose instead of pushing everything through one model: a **chat failover mesh** for conversation, a **dedicated search engine** (Cerebras), a **dedicated vision engine** (Gemini), a **vector memory layer** (Supabase), and the **Vercel Edge Network** serving the frontend ahead of the FastAPI gateway.

### System Overview

```mermaid
flowchart TD
    A["🖥️ Client Browser<br/>Offscreen Canvas Engine"] --> VE

    subgraph EDGE["🌐 Vercel Edge Network"]
        VE["Next.js 16 (App Router)<br/>Global CDN Delivery"]
    end

    VE --> B["⚡ FastAPI Async Gateway (Render)<br/>SSE Streaming · OAuth Session Tokens"]
    K["⏰ Cron-job.org Keep-Alive<br/>ping every 300s"] -.->|"keeps warm"| B

    subgraph CHAT["💬 Chat Failover Mesh (4 Tiers)"]
        T1["Tier 1 · Groq<br/>Ultra-low latency LPU streaming"]
        T2["Tier 2 · Mistral AI<br/>Architectural reasoning & code"]
        T3["Tier 3 · OpenRouter<br/>Universal open-source failover"]
        T4["Tier 4 · Google Gemini<br/>Long-context safety net"]
        T1 -->|"429 / 503"| T2
        T2 -->|"429 / 503"| T3
        T3 -->|"unavailable"| T4
    end

    subgraph SEARCH["🔎 Web Search Pipeline"]
        S1["Cerebras<br/>Query expansion & synthesis<br/>wafer-scale inference"]
    end

    subgraph VISION["👁️ Multimodal Vision"]
        V1["Google Gemini<br/>Attachments · Screenshots<br/>Document RAG indexing"]
    end

    subgraph DATA["🗄️ Persistence & Memory"]
        D1[("Supabase<br/>PostgreSQL + pgvector RAG<br/>Row Level Security")]
    end

    B --> T1
    B --> S1
    B --> V1
    B --> D1
    V1 -.->|"document RAG indexing"| D1
```

### Chat Failover Flow

```mermaid
sequenceDiagram
    participant U as User
    participant G as FastAPI Gateway
    participant P1 as Groq (Tier 1)
    participant P2 as Mistral AI (Tier 2)
    participant P3 as OpenRouter (Tier 3)
    participant P4 as Gemini (Tier 4)

    U->>G: Send message (SSE stream opens)
    G->>P1: Stream completion request
    P1--xG: 429 Rate Limited
    G->>P2: Retry with same context
    P2--xG: 429 / 503
    G->>P3: Retry with same context
    P3--xG: Upstream Unavailable
    G->>P4: Retry with same context
    P4-->>G: Token stream (Resolved)
    G-->>U: Continuous SSE stream (no reconnect)

    Note over G,P4: Worst-case path. Normally the gateway stops at the first tier that responds.
    Note over G,P4: Cerebras (search) and Gemini Vision are isolated dedicated pipelines, not chat retry targets.
```

### ASCII Overview

```text
                      +----------------------------------------------+
                      |      CLIENT BROWSER                          |
                      |  60-120 FPS Offscreen Canvas Engine          |
                      +----------------------------------------------+
                                              |
                                              v
                      +----------------------------------------------+
                      |      VERCEL EDGE NETWORK                     |
                      |  Next.js 16 (App Router)                     |
                      |  Global CDN Delivery                         |
                      +----------------------------------------------+
                                              |
                                              v
                      +----------------------------------------------+
                      |     FASTAPI ASYNC GATEWAY (Render)           |
                      |  SSE Pipelines · OAuth Session Tokens        |
                      |  Keep-alive: Cron-job.org ping every 300s    |
                      +----------------------------------------------+
                                              |
                     +------------------------+----------------------+
                     |                                               |
                     v                                               v
+------------------------------------------+    +------------------------------------------+
|    CHAT FAILOVER MESH (4 TIERS)          |    |   DEDICATED PIPELINES (ISOLATED)         |
|  Tier 1: Groq (LPU Streaming)            |    |  Search : Cerebras (Query Expansion      |
|  Tier 2: Mistral AI (Logic & Code)       |    |           & Web Search Synthesis)        |
|  Tier 3: OpenRouter (Open-Source)        |    |  Vision : Gemini (Attachments,           |
|  Tier 4: Gemini (Long-Context Net)       |    |           Screenshots, Doc RAG Index)    |
+------------------------------------------+    +------------------------------------------+
                     |                                               |
                     +------------------------+----------------------+
                                              |
                                              v
                      +----------------------------------------------+
                      |        PERSISTENCE & MEMORY                  |
                      |  Supabase PostgreSQL + pgvector RAG          |
                      |  Row Level Security                          |
                      +----------------------------------------------+
```

---

## 🧠 Engineering Challenges & Solutions

This section documents the real problems hit while building Ubair OS and how each was solved.

### 1. Free-tier cold starts
**Problem:** Serverless free tiers spin down idle instances, causing ~50-second cold boots on the first request.
**Solution:** A cron-based keep-alive mesh pings the FastAPI gateway every 300 seconds, and workloads are partitioned into independent instances to stay within monthly hour limits.

### 2. Provider rate limits killing conversations
**Problem:** A single LLM provider returning `429` or `503` would end the user's stream.
**Solution:** A self-healing router walks a four-tier chat mesh — Groq, Mistral AI, OpenRouter, and Gemini. Each hop preserves the conversation tree, RAG context, and execution state, so the SSE stream continues uninterrupted.

### 3. One model can't be best at everything
**Problem:** Chat, web search synthesis, and vision have very different latency and capability needs. Forcing them through one model made all three worse.
**Solution:** Workloads are split into dedicated pipelines: the chat mesh for conversation, Cerebras for search synthesis and query expansion, and Gemini for multimodal vision. Each runs on the engine best suited to it.

### 4. Keeping the free-tier backend focused on API work
**Problem:** A free-tier backend has limited capacity, and serving UI assets from it would waste that capacity.
**Solution:** The Next.js 16 frontend is served from the Vercel Edge Network (global CDN), so the Render-hosted FastAPI gateway only handles API, streaming, and inference orchestration traffic.

### 5. Particle rendering performance
**Problem:** Computing radial gradients per particle per frame throttles the CPU, especially on mobile.
**Solution:** Particles are pre-rendered once into offscreen sprites and blitted each frame with 3D perspective transforms (`pitch`, `yaw`, `rotation`) — heavy math moves out of the hot loop.

### 6. Hydration mismatches
**Problem:** Time-based greetings render differently on server and client, causing React hydration errors.
**Solution:** Greetings and tenure milestones are computed client-side after hydration, which also removes the need for extra database roundtrips or permission prompts.

### 7. Mobile gesture-bar collisions
**Problem:** Input controls overlapped system gesture areas on phones.
**Solution:** A dedicated safe-area padded input dock and compacting header layout.

---

## 🧰 Flagship Workstations

| Workstation | What it does |
| --- | --- |
| **Neural Chat** | Streaming multi-model chat with markdown, syntax-highlighted code, web search synthesis, search navigation, and audio synthesis triggers |
| **Workspace Canvas** | Project isolation with dedicated vector memory, custom documents, and persistent context vaults |
| **Assessment Arena & Forge** | Multi-model cognitive evaluation, Socratic defense, and architectural reasoning powered by the core reasoning fleet |
| **Image Studio** | Image generation and editing workstation |
| **Slate** | Lightweight scratch workspace for notes and ideas |
| **Founder Inbox** | Release notes, direct broadcasts, and milestones with local pin / read / dismiss controls |

---

## 🔬 Tech Stack

| Layer | Technologies | Purpose |
| --- | --- | --- |
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript | SSR, Turbopack bundling, strict type safety |
| **Styling** | Tailwind CSS, custom Canvas 2D engine | Dark-tier design with high-FPS particle physics |
| **API Gateway** | Python 3.11, FastAPI, Uvicorn, AsyncIO | Async streaming and multipart form handling |
| **Auth** | NextAuth.js, Google OAuth 2.0 | Isolated user sessions, zero password footprint |
| **Vector DB** | Supabase, PostgreSQL, pgvector | Document embeddings, user tiers, feedback storage |
| **Chat Inference Mesh** | Groq (Chat LPU), Mistral AI (Reasoning), OpenRouter (Mesh), Google Gemini (Context Fallback) | Four-tier failover mesh for primary chat |
| **Search Compute** | Cerebras | Web search synthesis and query expansion |
| **Multimodal Vision** | Google Gemini | Attachment analysis, screenshots, and document RAG indexing |
| **Edge Network** | Vercel Edge Network (Global CDN) | Global delivery for the Next.js 16 frontend |
| **Hosting & Orchestration** | Vercel (Edge UI), Render (FastAPI Gateway), Cron-job.org (Keep-alive mesh) | 24/7 deployment with keep-alive orchestration |

---

## 📁 Project Structure

```text
ubair-os/
├── frontend-nextjs/        # Next.js 16 app (App Router)
│   └── public/assets/      # Logo and static assets
├── backend/                # FastAPI async gateway
│   ├── app/
│   │   └── main.py         # Application entry point
│   └── requirements.txt
├── docs/
│   └── assets/             # README screenshots and diagrams
├── LICENSE
└── README.md
```

---

## 🚀 Local Development Setup

### Prerequisites

- **Node.js** v18.18 or higher
- **Python** v3.10 or higher
- **Git**
- A **Supabase** project, a **Google OAuth** client, and API keys for Groq, Cerebras, Mistral AI, OpenRouter, and Gemini

### 1. Clone the repository

```bash
git clone https://github.com/Md-Salik-Ubair/ubair-os.git
cd ubair-os
```

### 2. Start the frontend

```bash
cd frontend-nextjs
npm install
```

Create `frontend-nextjs/.env.local` (see [Environment Variables](#-environment-variables)), then:

```bash
npm run dev
```

### 3. Start the backend

Open a second terminal in the project root:

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# Linux / macOS
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Open **http://localhost:3000** — you're in.

---

## 🔑 Environment Variables

**Frontend** — `frontend-nextjs/.env.local`

| Variable | Description |
| --- | --- |
| `NEXTAUTH_URL` | Base URL of the app (`http://localhost:3000` locally) |
| `NEXTAUTH_SECRET` | Random secret used by NextAuth to sign sessions |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `NEXT_PUBLIC_API_URL` | Backend gateway URL (`http://localhost:8000` locally) |

**Backend** — `backend/.env`

| Variable | Description |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (**never expose to the client**) |
| `GROQ_API_KEY` | Chat Tier 1 — ultra-low latency LPU streaming |
| `MISTRAL_API_KEY` | Chat Tier 2 — architectural reasoning and code generation |
| `OPENROUTER_API_KEY` | Chat Tier 3 — universal open-source failover mesh |
| `GEMINI_API_KEY` | Chat Tier 4 fallback, plus the dedicated multimodal vision engine |
| `CEREBRAS_API_KEY` | Dedicated engine for web search synthesis and query expansion |

> 💡 Generate a `NEXTAUTH_SECRET` with `openssl rand -base64 32`.

---

## 🌍 Deployment

| Component | Platform | Notes |
| --- | --- | --- |
| Frontend | **Vercel Edge** | Connect the repo, set root directory to `frontend-nextjs`, add env vars |
| Backend | **Render Web Service** | Web service running `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Keep-alive | **Cron-job.org** | Ping the gateway every 300 seconds to avoid cold starts |

---

## 🔒 Security & Privacy

- **Transport security:** The frontend is served over HTTPS from the Vercel Edge Network.
- **Session isolation:** Workspaces, conversations, and uploaded documents are bound to authenticated Google OAuth identities.
- **Row Level Security:** Supabase RLS policies restrict data access per user.
- **No public model training:** User code, documents, and prompts are not sold or submitted to public training datasets.
- **Ephemeral Quick Chat:** Sessions follow an automated 24-hour client memory purge.
- **Secrets stay server-side:** Service keys and provider API keys live only in backend environment variables.

---

## 🧭 Roadmap

- [x] Four-tier chat failover mesh (Groq → Mistral AI → OpenRouter → Gemini)
- [x] Cerebras-powered web search synthesis & query expansion
- [x] Gemini multimodal vision pipeline
- [x] Vector RAG memory with per-project isolation
- [x] Offscreen canvas particle engine (60–120 FPS)
- [x] Mobile-optimized input dock & gesture safety
- [x] Founder notification inbox with persistent broadcast channel
- [ ] Autonomous tool-use execution agent (Web Search & Code Interpreter)
- [ ] Multi-document batch embedding pipelines

---

## 🤝 Contributing

Contributions, issues, and feature ideas are welcome.

1. Fork the repository
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "feat: add your feature"`
4. Push the branch: `git push origin feature/your-feature`
5. Open a Pull Request

---

## 👨‍💻 Author

<div align="center">

**Md Salik Ubair**
B.Tech CSE (AI/ML) • Full-Stack Python Developer

[![GitHub](https://img.shields.io/badge/GitHub-Md--Salik--Ubair-181717?style=for-the-badge&logo=github)](https://github.com/Md-Salik-Ubair)

</div>

> *"Ubair OS was not built in a weekend hackathon. It was born out of 12+ months of continuous engineering, hundreds of late-night debugging sessions, resolving silent hook misalignments, and solving free-tier cloud limits. The mission was singular: to create a sovereign, fast, and beautiful intelligence tool built by a developer, for developers. This repository stands as living proof of what relentless focus can produce."*

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.

<div align="center">

⭐ **If Ubair OS helped or inspired you, consider starring the repo.** ⭐

</div>