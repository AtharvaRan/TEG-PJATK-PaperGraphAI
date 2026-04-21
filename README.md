# PaperGraph AI 🔬

> Chat with your research papers. Understand how ideas connect.

PaperGraph AI is a **GraphRAG** research assistant. Drop in a folder of PDFs — the system embeds every chunk into a vector store **and** extracts a concept-level knowledge graph across all your papers. Ask questions that span your entire library; answers are grounded in both similarity search and graph traversal.

<p align="center">
  <img src="https://img.shields.io/badge/python-3.10+-blue?logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-backend-009688?logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/LangGraph-agents-1a1a1a" />
  <img src="https://img.shields.io/badge/OpenAI-GPT--4o-412991?logo=openai&logoColor=white" />
  <img src="https://img.shields.io/badge/license-MIT-green" />
</p>

---

## ✨ Why this exists

Traditional RAG finds text *similar* to your question. It can't tell you that **BERT** is *based on* the **Transformer**, because that relationship is never the most similar chunk.

PaperGraph AI fixes this by running **two retrieval strategies in parallel**:

| Vector RAG | Knowledge Graph |
|---|---|
| Finds chunks by embedding similarity | Extracts `(head, relation, tail)` triples with GPT-4o-mini |
| Great for *"What does paper X say about Y?"* | Great for *"How does X relate to Z?"* |
| ChromaDB + OpenAI embeddings | NetworkX directed graph |

Both signals feed into a **4-agent LangGraph pipeline** that synthesizes the final answer.

---

## 🧠 How it works

```
                            ┌────────────────────┐
   Your PDFs ──► Upload ──►  │  Unstructured.io   │  layout-aware parsing
                            │  (Title, Table,    │  (falls back to PyPDF)
                            │   NarrativeText…)  │
                            └─────────┬──────────┘
                                      │
                 ┌────────────────────┴────────────────────┐
                 ▼                                         ▼
         ChromaDB (vectors)                  NetworkX (knowledge graph)
         chunks + embeddings                 LLMGraphTransformer
                 │                                         │
                 └────────────────┬────────────────────────┘
                                  ▼
                     ┌────────────────────────┐
                     │   LangGraph pipeline   │
                     │                        │
                     │  1. Question rewrite   │  uses chat history
                     │  2. Vector retrieval   │  top-k chunks
                     │  3. Graph lookup       │  relation triples
                     │  4. GPT-4o synthesis   │  streams token-by-token
                     └────────────────────────┘
                                  ▼
                         Answer  +  Sources
```

---

## 🚀 Features

- **💬 Chat** — streaming answers grounded in your papers
- **📚 Library viewer** — inspect every parsed element (Title, Table, NarrativeText…)
- **🕸 Knowledge graph** — force-directed visual of concept relationships across papers
- **⚖ RAG vs GraphRAG** — side-by-side comparison on the same question
- **📄 PDF inline viewer** — read the source paper next to the chat
- **🛡 Strict guardrails** — refuses out-of-scope questions; answers only from your library

---

## 🛠 Tech stack

| Layer | Choice |
|---|---|
| **Backend** | FastAPI + Uvicorn |
| **Frontend** | React 18 · TypeScript · Vite · TailwindCSS |
| **Animation** | Framer Motion · Canvas 3D |
| **Agents** | LangGraph (4-stage pipeline) |
| **LLM** | OpenAI GPT-4o + GPT-4o-mini |
| **Embeddings** | OpenAI `text-embedding-3-small` |
| **Vector store** | ChromaDB |
| **Graph extraction** | LangChain `LLMGraphTransformer` |
| **Graph store** | NetworkX |
| **Graph viz** | PyVis |
| **PDF parsing** | Unstructured.io (API) → PyPDF fallback |

---

## 📦 Getting started

### 1. Clone

```bash
git clone https://github.com/AtharvaRan/TEG-PJATK-PaperGraphAI.git
cd TEG-PJATK-PaperGraphAI
```

### 2. Backend — Python environment

```bash
python -m venv venv
source venv/bin/activate      # macOS / Linux
# venv\Scripts\activate       # Windows

pip install -r requirements.txt
```

### 3. Frontend — Node modules

```bash
cd frontend
npm install
cd ..
```

### 4. API keys

```bash
cp .env.example .env
```

Then edit `.env`:

```ini
OPENAI_API_KEY=sk-...
UNSTRUCTURED_API_KEY=...        # optional — unlocks layout-aware parsing
```

- Get an OpenAI key at [platform.openai.com](https://platform.openai.com)
- Get a free Unstructured key at [unstructured.io](https://unstructured.io) *(optional — PyPDF fallback is used otherwise)*

### 5. Run both servers

```bash
./start.sh
```

Or manually in two terminals:

```bash
# terminal 1 — backend
uvicorn api:app --reload --port 8000

# terminal 2 — frontend
cd frontend && npm run dev
```

Open **http://localhost:5173** 🚀

---

## 📁 Project structure

```
TEG-PJATK-PaperGraphAI/
│
├── api.py                    # FastAPI backend — LangGraph pipeline + endpoints
├── start.sh                  # Spins up backend + frontend
├── requirements.txt          # Python dependencies
├── .env.example              # Template for API keys
│
├── frontend/                 # React + Vite + TypeScript client
│   ├── src/
│   │   ├── pages/            # Landing, Chat, Library, Graph, Compare
│   │   ├── components/       # Sidebar, AppBackground, etc.
│   │   ├── hooks/            # use3D (mouse parallax, tilt)
│   │   ├── api.ts            # Typed fetch wrappers
│   │   └── App.tsx           # Router + shell
│   ├── package.json
│   └── vite.config.ts
│
├── docs/                     # (gitignored) your PDFs
├── db/                       # (gitignored) ChromaDB + knowledge graph JSON
└── venv/                     # (gitignored) Python virtualenv
```

---

## 🔌 API endpoints

All served from `http://localhost:8000`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/status` | Chunk / node / edge / file counts |
| `GET` | `/api/library` | Parsed elements per file |
| `POST` | `/api/upload` | Multipart PDF upload → ingest + graph build |
| `POST` | `/api/chat` | Streaming SSE chat (RAG + graph) |
| `POST` | `/api/compare` | RAG-only vs GraphRAG on the same query |
| `GET` | `/api/graph` | Raw `{nodes, edges}` JSON |
| `GET` | `/api/graph-html` | Rendered PyVis HTML (iframed in client) |
| `GET` | `/api/pdf/{filename}` | Serve a PDF for the inline viewer |

Full interactive docs at **http://localhost:8000/docs**

---

## 🔄 Rebuilding the database

The database is built incrementally as you upload. To start fresh:

```bash
rm -rf db/
```

Then re-upload your papers through the UI.

---

## 🤝 Contributing

Pull requests welcome. For major changes, open an issue first to discuss what you'd like to change.

---

## 📄 License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  Built with ❤️ for the TEG PJATK thesis project
</p>
