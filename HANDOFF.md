# PaperGraph AI — Project Handoff

Use this doc to continue the project in a new chat with full context.

---

## Repo
- **GitHub:** https://github.com/AtharvaRan/TEG-PJATK-PaperGraphAI
- **Local:** `/Users/atharva/Documents/RAG_tutorials/`
- **Branch:** `main`

## Stack
- **Backend:** FastAPI (`api.py`) + Uvicorn on port 8000
- **Frontend:** React 18 + TypeScript + Vite + Tailwind 3 + Framer Motion 11 on port 5173
- **AI:** OpenAI GPT-4o (chat), GPT-4o-mini (graph extraction), `text-embedding-3-small`
- **Storage:** ChromaDB (vectors in `db/chroma_db`), NetworkX (graph JSON in `db/knowledge_graph.json`)
- **Graph Viz:** `react-force-graph-2d` — renders in-browser via Canvas
- **Parsing:** Unstructured.io API (with PyPDF fallback)
- **Pipeline:** LangGraph 4-agent chain (rewrite -> vector retrieve -> graph lookup -> GPT-4o synthesize)

## Structure
```
/
├── api.py                    # FastAPI backend, all endpoints + LangGraph pipeline
├── start.sh                  # Spins up backend + frontend
├── requirements.txt
├── .env.example              # OPENAI_API_KEY, UNSTRUCTURED_API_KEY
├── README.md
├── HANDOFF.md                # This file
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # Router + lifted state (chat history, messages)
│   │   ├── api.ts            # Typed fetch wrappers (streamChat, streamUpload, etc.)
│   │   ├── index.css         # Dark theme, prose-chat, thinking dots, cursor animations
│   │   ├── theme.ts          # Design tokens (indigo-violet palette)
│   │   ├── hooks/use3D.ts    # useMouseParallax, useTilt3D
│   │   ├── components/
│   │   │   ├── Sidebar.tsx        # Nav, upload zone with SSE progress, chat history list
│   │   │   ├── AppBackground.tsx  # Shared ambient bg for app shell
│   │   │   └── CosmicParallaxBg.tsx
│   │   └── pages/
│   │       ├── LandingPage.tsx    # Full marketing page with 3D mockup
│   │       ├── ChatPage.tsx       # Chat + resizable PDF viewer + @multi-mention
│   │       ├── GraphPage.tsx      # react-force-graph-2d + Build/Stop/Rebuild buttons
│   │       ├── LibraryPage.tsx    # File list + delete + search + element breakdown
│   │       └── InsightsPage.tsx   # Live metrics dashboard
│   └── package.json
└── docs/, db/, venv/         # gitignored runtime data
```

## App Pages (4 tabs)

### Chat (`ChatPage.tsx`)
- Split pane: resizable PDF viewer (drag handle, 15-75%) + chat, toggle via header button
- **@mention multi-scoping:** click `@ Scope` -> multi-select papers -> queries only retrieve from those papers
- SSE streaming with token-by-token rendering (immutable state updates — StrictMode safe)
- Thinking indicator: bouncing dots before first token, blinking cursor during streaming
- Smart auto-scroll: only scrolls to bottom if user is near bottom
- Source chips + expandable graph-context panel per message
- Bot icon avatar (Lucide `Bot`)
- Suggestion chips when no messages yet
- Double-click first user message to see chat creation timestamp

### Sidebar (`Sidebar.tsx`)
- Nav links, status indicators (chunks, graph nodes)
- **Upload zone with SSE progress:** animated gradient progress bar, stage labels (Parsing -> Embedding), elapsed timer. Graph building is NOT included in upload (on-demand only).
- **Chat history:** "Recent Chats" section shows last 10 chats from localStorage. Click to restore, hover to reveal delete. "+" button for new chat. Sorted by creation time (stable order).

### Library (`LibraryPage.tsx`)
- Lists uploaded files with chunk counts and parsed element types
- **Delete button** per paper (removes file + chunks + graph processed_ids)
- **View button** to open PDF in new tab
- **Search bar** when multiple papers exist
- Element breakdown with animated category bars

### Knowledge Graph (`GraphPage.tsx`)
- Uses `react-force-graph-2d` (Canvas-based, handles 1400+ nodes)
- Bigger nodes: default radius 10, focused 14, glow halo
- Gentle drift: simulation never fully stops, reheat every 10s
- Left panel: search concepts, click to focus
- **Build Graph button:** on-demand, not automatic on upload
- **Pending chunks indicator:** shows "X chunks pending" badge when new papers need processing
- **Stop button:** cancel mid-build, partial progress is saved
- **Rebuild button:** processes only new/unprocessed chunks (incremental)
- 5x parallel extraction with ThreadPoolExecutor

### Insights (`InsightsPage.tsx`)
- Live metrics: Papers Added, Chunks Indexed, Questions Asked, Tokens Used
- Top Papers by Chunks list
- Graph Health panel

## API Endpoints (all `localhost:8000`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | chunk/node/edge/file counts |
| GET | `/api/usage` | questions asked, tokens, timestamps |
| POST | `/api/upload` | **SSE streaming** — multipart PDF, parse + embed (no graph build) |
| POST | `/api/build-graph` | background thread, returns immediately. Poll status endpoint. |
| POST | `/api/build-graph/cancel` | signal cancel after current batch |
| GET | `/api/graph-build-status` | progress, pending chunks, node/edge counts |
| POST | `/api/chat` | SSE streaming; accepts `selected_paper` (string or string[]) |
| POST | `/api/deduplicate` | remove duplicate chunks from ChromaDB |
| GET | `/api/library` | parsed elements per file |
| DELETE | `/api/library/{filename}` | remove a paper + its chunks + processed_ids |
| GET | `/api/graph` | `{nodes, edges}` JSON for the force graph |
| GET | `/api/pdf/{filename}` | serves PDFs for the viewer |

## LangGraph Pipeline (`api.py`)

4-agent chain: `paper_agent` -> `rag_agent` -> `concept_agent` -> `qa_agent`

1. **paper_agent** — rewrites the question into a standalone search query
2. **rag_agent** — retrieves from ChromaDB (k=25, MIN_CHUNK_LEN=50, near-dupe detection, deduped to 8)
3. **concept_agent** — extracts concepts, looks up 1-hop neighbors in graph (if graph exists)
4. **qa_agent** — synthesizes final answer from chunks + graph context

Graph is optional — if not built, concept_agent returns empty context and answers still work from vector retrieval alone.

## Graph Extraction
- **Model:** GPT-4o-mini (Groq removed — rate limiting made it impractical)
- **On-demand:** not triggered by upload. User clicks "Build Graph" on the Graph page.
- **Incremental:** only processes chunks not yet in `processed_ids`
- **Parallel:** 5 chunks at a time via ThreadPoolExecutor
- **Cancellable:** stop button signals cancel, saves partial progress
- **Incremental saves:** graph persisted after every batch

## Design System
- **Palette:** indigo-violet (`#4f46e5` primary, `#7c3aed` secondary)
- **Backgrounds:** deep dark with violet tint (`#050510`, `#0d0a1c`, `#1a1230`)
- **Tokens:** defined in `theme.ts` (JS) and `index.css` (CSS vars)

## Notes
- TEG PJATK thesis project
- **Don't add `Co-Authored-By: Claude`** to commits — public repo
- Git identity: `Atharva Ranjane <atharva@Atharvas-MacBook-Pro.local>`
- Chat state (messages, history) is lifted to `App.tsx`
- Chat history uses localStorage (`papergraph_chats` key), max 10 chats, sorted by creation time

## To run
```bash
./start.sh
```
or in two terminals:
```bash
uvicorn api:app --reload --port 8000   # backend
cd frontend && npm run dev              # frontend
```
Open http://localhost:5173
