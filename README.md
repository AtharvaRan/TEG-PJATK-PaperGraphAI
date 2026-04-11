# PaperGraph AI

An AI research assistant that lets you chat with your academic paper library. It combines **semantic vector search** with a **knowledge graph** to answer questions that traditional RAG alone can't handle.

---

## What makes it different

Most RAG tools find relevant text by similarity. PaperGraph AI goes further — it also extracts concept relationships from your papers and stores them as a knowledge graph. When you ask *"How does BERT relate to the Transformer?"*, it doesn't just find similar text, it traverses the graph and finds the actual connection.

---

## How it works

```
Your PDFs
   │
   ├── 1_ingestion.py ──────────► ChromaDB (vector store)
   │   chunks + embeds papers         ↓ RAG Agent searches here
   │
   └── 5_concept_agent.py ──────► knowledge_graph.json
       extracts concept triples        ↓ Concept Agent searches here
                    │
                    ▼
              app.py (Streamlit UI)
                    │
         ┌──────────┴──────────┐
         │  4-agent pipeline   │
         │                     │
         │  1. Paper Agent     │  rewrites your question using chat history
         │  2. RAG Agent       │  retrieves top-5 chunks from ChromaDB
         │  3. Concept Agent   │  finds graph relationships
         │  4. QA Agent        │  synthesises the final answer (GPT-4o)
         └─────────────────────┘
```

---

## Features

- **Chat** — ask anything about your papers in natural language
- **Knowledge Graph viewer** — explore concept relationships visually
- **RAG vs GraphRAG comparison** — run the same question both ways side by side
- **Multi-turn conversation** — remembers context across questions
- **PDF upload** — drop papers directly in the sidebar

---

## Stack

| Layer | Technology |
|---|---|
| UI | Streamlit |
| Agents & pipeline | LangGraph |
| LLM | OpenAI GPT-4o |
| Embeddings | OpenAI text-embedding-3-small |
| Vector store | ChromaDB |
| Knowledge graph extraction | LangChain LLMGraphTransformer |
| Graph storage & traversal | NetworkX |
| Graph visualisation | PyVis |
| Document parsing | Unstructured |

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/your-username/papergraph-ai.git
cd papergraph-ai
```

### 2. Create a virtual environment

```bash
python -m venv venv
source venv/bin/activate        # Mac/Linux
venv\Scripts\activate           # Windows
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Add your API key

```bash
cp .env.example .env
```

Open `.env` and add your key:
```
OPENAI_API_KEY=your_key_here
```

Get one at [platform.openai.com](https://platform.openai.com)

### 5. Add your papers

```bash
mkdir docs
# drop your PDF files into the docs/ folder
```

### 6. Run the pipeline

```bash
# Step 1 — chunk and embed your papers into ChromaDB
python 1_ingestion.py

# Step 2 — extract concepts and build the knowledge graph
python 5_concept_agent.py

# Step 3 — launch the app
streamlit run app.py
```

The app opens at `http://localhost:8501`

---

## Project structure

```
papergraph-ai/
│
├── app.py                  # Streamlit UI + 4-agent LangGraph pipeline
├── 1_ingestion.py          # PDF → chunks → ChromaDB
├── 5_concept_agent.py      # chunks → knowledge graph (LLMGraphTransformer)
├── 6_langgraph_agents.py   # standalone terminal version of the pipeline
│
├── .streamlit/
│   └── config.toml         # UI theme
│
├── .env.example            # template — copy to .env and add your key
├── requirements.txt
└── README.md
```

> `docs/` (your PDFs), `db/` (ChromaDB + graph), and `.env` are all gitignored.
> Every user builds their own local database from their own papers.

---

## Rebuilding the database

If you add new papers, re-run both steps:

```bash
python 1_ingestion.py
python 5_concept_agent.py
```

---

## Deploying to Streamlit Cloud

1. Push to GitHub
2. Go to [share.streamlit.io](https://share.streamlit.io)
3. Connect your repo
4. Under **Secrets**, add:
   ```
   OPENAI_API_KEY = "your_key_here"
   ```
5. Deploy — you get a public URL instantly
