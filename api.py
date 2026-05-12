"""
PaperGraph AI — FastAPI backend
Run: uvicorn api:app --reload --port 8000
"""
import os, json, asyncio, time, concurrent.futures
from typing import List, Optional
from pathlib import Path
from threading import Lock

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

import networkx as nx
from langchain_chroma import Chroma
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_core.documents import Document
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_experimental.graph_transformers import LLMGraphTransformer
from langgraph.graph import StateGraph, END
from typing import TypedDict

load_dotenv()

print("[graph-extractor] OpenAI · gpt-4o-mini")

# ── Paths ──────────────────────────────────────────────────────────────────────
DOCS_DIR = Path("docs")
DB_DIR   = Path("db")
DOCS_DIR.mkdir(exist_ok=True)
DB_DIR.mkdir(exist_ok=True)

# ── Models (module-level singletons) ──────────────────────────────────────────
_embeddings = None
_model      = None
_pipeline   = None
_usage_lock = Lock()
_session_started_at = int(time.time())
_usage_stats = {
    "questions_asked": 0,
    "input_tokens_est": 0,
    "output_tokens_est": 0,
    "last_question_at": None,
}

# Background graph building state
_graph_build_lock = Lock()
_graph_build_status = {"running": False, "progress": 0, "total": 0, "done": False}
_graph_build_cancel = False

def estimate_tokens(text: str) -> int:
    # Lightweight estimate for dashboard telemetry; avoids tokenizer dependency.
    return max(1, int(round(len(text) / 4))) if text else 0

def estimate_tokens_from_chars(char_count: int) -> int:
    return max(1, int(round(char_count / 4))) if char_count > 0 else 0

def get_embeddings():
    global _embeddings
    if _embeddings is None:
        _embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    return _embeddings

def get_model():
    global _model
    if _model is None:
        _model = ChatOpenAI(model="gpt-4o")
    return _model

def get_extraction_llm():
    """LLM used by LLMGraphTransformer for knowledge-graph triplet extraction."""
    return ChatOpenAI(model="gpt-4o-mini", temperature=0)

def get_db():
    return Chroma(persist_directory=str(DB_DIR / "chroma_db"),
                  embedding_function=get_embeddings())

def load_graph() -> Optional[nx.DiGraph]:
    path = DB_DIR / "knowledge_graph.json"
    if not path.exists():
        return None
    with open(path) as f:
        data = json.load(f)
    G = nx.DiGraph()
    for e in data["edges"]:
        G.add_edge(e["source"], e["target"], relation=e["relation"])
    for n in data.get("nodes", []):
        if n not in G:
            G.add_node(n)
    return G

# ── Ingestion ──────────────────────────────────────────────────────────────────
def parse_with_unstructured(filepaths: list) -> list:
    import unstructured_client
    from unstructured_client.models import shared, operations
    client = unstructured_client.UnstructuredClient(
        api_key_auth=os.getenv("UNSTRUCTURED_API_KEY")
    )
    docs = []
    for fp in filepaths:
        name = Path(fp).name
        ext  = name.rsplit(".", 1)[-1].lower()
        strat = shared.Strategy.HI_RES if ext in ("pdf","png","jpg","jpeg") else shared.Strategy.FAST
        with open(fp, "rb") as f:
            resp = client.general.partition(request=operations.PartitionRequest(
                partition_parameters=shared.PartitionParameters(
                    files=shared.Files(content=f.read(), file_name=name),
                    strategy=strat, infer_table_structure=True,
                    chunking_strategy="by_title",
                    max_characters=1000, new_after_n_chars=800,
                    combine_text_under_n_chars=200,
                )))
        for el in resp.elements:
            txt = el.get("text","").strip()
            if txt:
                docs.append(Document(
                    page_content=txt,
                    metadata={
                        "source": name,
                        "category": el.get("type","unknown"),
                        "parser": "unstructured"
                    }
                ))
    return docs

def parse_fallback(filepaths: list) -> list:
    from langchain_community.document_loaders import PyPDFLoader
    docs = []
    for fp in filepaths:
        try:
            for d in PyPDFLoader(fp).load():
                d.metadata["parser"] = "pypdf"
                docs.append(d)
        except Exception:
            pass
    return docs

def add_to_chroma(docs: list) -> int:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000, chunk_overlap=200, separators=["\n\n","\n"," ",""]
    )
    chunks = splitter.split_documents(docs)
    Chroma(
        persist_directory=str(DB_DIR/"chroma_db"),
        embedding_function=get_embeddings(),
        collection_metadata={"hnsw:space":"cosine"}
    ).add_documents(chunks)
    return len(chunks)

def rebuild_graph_sync(force: bool = False) -> nx.DiGraph:
    """
    Build/extend the knowledge graph from chunks in ChromaDB.

    Incremental by default — only extracts from chunks not yet processed,
    then merges results into the existing graph. This is what the upload
    endpoint uses, so adding paper #N+1 only pays the LLM cost for that paper.

    Pass force=True to discard the existing graph and re-extract everything
    (e.g. after changing the extraction model or the allowed_nodes list).
    """
    # 1. Snapshot ChromaDB — get IDs alongside docs so we can dedupe
    raw_data = get_db()._collection.get()
    ids   = raw_data.get("ids", [])
    raw   = raw_data["documents"]
    metas = raw_data.get("metadatas", [{}]*len(raw))

    # 2. Load existing graph + the set of chunk IDs already processed.
    #    Anything not in that set is "new" and needs the LLM.
    graph_path = DB_DIR / "knowledge_graph.json"
    G = nx.DiGraph()
    triples: list = []
    processed_ids: set = set()
    if not force and graph_path.exists():
        try:
            with open(graph_path) as f:
                prev = json.load(f)
            for n in prev.get("nodes", []):
                G.add_node(n)
            for e in prev.get("edges", []):
                G.add_edge(e["source"], e["target"], relation=e["relation"])
            triples = list(prev.get("triples", []))
            processed_ids = set(prev.get("processed_ids", []))
            # Migration for graphs built before incremental support: if the file
            # has nodes but no processed_ids, trust the existing graph and mark
            # every currently-indexed chunk as already-extracted. Avoids forcing
            # a full re-extraction on the user's next upload. Set force=True if
            # you actually want to re-process everything from scratch.
            if not processed_ids and G.number_of_nodes() > 0:
                processed_ids = set(ids)
                print(f"[graph-extractor] migrated existing graph — {len(processed_ids)} chunks marked as processed")
        except Exception as ex:
            print(f"[graph-extractor] couldn't load previous graph ({ex}) — falling back to full rebuild")
            G = nx.DiGraph(); triples = []; processed_ids = set()

    # 3. Filter to NEW chunks only
    new_docs: list = []
    new_ids:  list = []
    for cid, c, m in zip(ids, raw, metas):
        if not c.strip(): continue
        if cid in processed_ids: continue
        new_docs.append(Document(page_content=c, metadata=m))
        new_ids.append(cid)

    if not new_docs:
        print(f"[graph-extractor] up to date — {len(processed_ids)} chunks already in graph, nothing new")
        # Still rewrite the file so processed_ids stays in sync if schema migrated
        _save_graph(G, triples, processed_ids)
        return G

    total = len(new_docs)
    print(f"[graph-extractor] extracting from {total} new chunk(s) ({len(processed_ids)} already done)")

    with _graph_build_lock:
        _graph_build_status.update(running=True, progress=0, total=total, done=False)

    llm = get_extraction_llm()
    transformer = LLMGraphTransformer(
        llm=llm,
        allowed_nodes=["Model","Method","Dataset","Metric","Concept",
                       "Architecture","Paper","Task","Technology"],
        allowed_relationships=["BASED_ON","IMPROVES","USES","TRAINED_ON",
                               "EVALUATED_ON","OUTPERFORMS","INTRODUCED_BY",
                               "PART_OF","RELATED_TO","COMPARED_TO"],
        node_properties=["description"],
    )

    # 4. Parallel batch extraction — process 5 chunks concurrently.
    #    One bad LLM response shouldn't kill the rebuild; retry once, then skip.
    BATCH_SIZE = 5
    skipped = 0
    done_count = 0

    def extract_one(item):
        cid, d = item
        for attempt in range(2):
            try:
                return cid, transformer.convert_to_graph_documents([d]), None
            except Exception as ex:
                last_err = ex
        return cid, [], last_err

    global _graph_build_cancel

    for batch_start in range(0, total, BATCH_SIZE):
        # Check for cancel between batches
        if _graph_build_cancel:
            print(f"[graph-extractor] cancelled at {done_count}/{total}")
            _graph_build_cancel = False
            _save_graph(G, triples, processed_ids)
            with _graph_build_lock:
                _graph_build_status.update(running=False, done=True)
            return G

        batch = list(zip(
            new_ids[batch_start:batch_start+BATCH_SIZE],
            new_docs[batch_start:batch_start+BATCH_SIZE],
        ))
        with concurrent.futures.ThreadPoolExecutor(max_workers=BATCH_SIZE) as pool:
            results = list(pool.map(extract_one, batch))

        for cid, gd_batch, err in results:
            if err is not None:
                skipped += 1
                print(f"[graph-extractor] chunk skipped: {str(err).split(chr(10))[0][:90]}")
            else:
                for gd in gd_batch:
                    for n in gd.nodes:
                        G.add_node(n.id, type=n.type)
                    for r in gd.relationships:
                        G.add_edge(r.source.id, r.target.id, relation=r.type)
                        triples.append({"subject":r.source.id,"relation":r.type,"object":r.target.id})
            processed_ids.add(cid)
            done_count += 1

        with _graph_build_lock:
            _graph_build_status["progress"] = done_count
        print(f"[graph-extractor] {done_count}/{total} chunks processed…")

        # Save incrementally every batch so partial progress survives crashes
        _save_graph(G, triples, processed_ids)

    if skipped:
        print(f"[graph-extractor] done — {total - skipped}/{total} new chunks extracted ({skipped} skipped)")
    else:
        print(f"[graph-extractor] done — {total}/{total} new chunks extracted")

    with _graph_build_lock:
        _graph_build_status.update(running=False, done=True)

    _save_graph(G, triples, processed_ids)
    return G


def _save_graph(G: nx.DiGraph, triples: list, processed_ids: set) -> None:
    """Persist graph state to db/knowledge_graph.json."""
    with open(DB_DIR/"knowledge_graph.json","w") as f:
        json.dump({
            "triples": triples,
            "nodes":   list(G.nodes()),
            "edges":   [{"source":u,"target":v,"relation":d["relation"]}
                        for u,v,d in G.edges(data=True)],
            "processed_ids": sorted(processed_ids),
        }, f, indent=2)

# ── LangGraph pipeline ─────────────────────────────────────────────────────────
class GS(TypedDict):
    question: str; rewritten_question: str
    chunks: List[str]; chunk_sources: List[str]
    graph_context: str; answer: str; chat_history: List
    selected_paper: Optional[str]   # filename when @mention scopes retrieval to one paper

def paper_agent(s: GS) -> GS:
    q, h = s["question"], s["chat_history"]
    if h:
        rw = get_model().invoke(
            [SystemMessage(content="Rewrite to a standalone, searchable question. Return ONLY the rewritten question.")]
            + h + [HumanMessage(content=f"New question: {q}")]
        ).content.strip()
    else: rw = q
    return {**s, "rewritten_question": rw}

def _is_near_dupe(new_text: str, seen_texts: list[str], threshold: float = 0.6) -> bool:
    for s in seen_texts:
        short, long = (new_text, s) if len(new_text) <= len(s) else (s, new_text)
        if short in long:
            return True
        if len(set(new_text.split()) & set(s.split())) / max(len(set(new_text.split())), 1) > threshold:
            return True
    return False

MIN_CHUNK_LEN = 50

def rag_agent(s: GS) -> GS:
    search_kwargs = {"k": 25}
    sp = s.get("selected_paper")
    if sp:
        if isinstance(sp, list):
            search_kwargs["filter"] = {"source": {"$in": sp}}
        else:
            search_kwargs["filter"] = {"source": sp}
    raw_docs = get_db().as_retriever(search_kwargs=search_kwargs).invoke(s["rewritten_question"])
    docs, seen_texts = [], []
    for d in raw_docs:
        text = d.page_content.strip()
        if len(text) < MIN_CHUNK_LEN:
            continue
        normalized = " ".join(text.split())
        if _is_near_dupe(normalized, seen_texts):
            continue
        seen_texts.append(normalized)
        docs.append(d)
        if len(docs) >= 8:
            break
    return {**s,
            "chunks":        [d.page_content for d in docs],
            "chunk_sources": [d.metadata.get("source","") for d in docs]}

def concept_agent(s: GS) -> GS:
    G = load_graph()
    if not G: return {**s, "graph_context":""}
    q = s["rewritten_question"].lower()
    triples = [f"{u} → {d['relation']} → {v}"
               for u,v,d in G.edges(data=True)
               if u.lower() in q or v.lower() in q]
    return {**s, "graph_context": "\n".join(triples)}

def _format_chunks(chunks: list[str], sources: list[str]) -> str:
    labeled = []
    for i, (chunk, src) in enumerate(zip(chunks, sources)):
        name = src.replace('.pdf', '') if src else f"Source {i+1}"
        labeled.append(f"[{name}]\n{chunk}")
    return "\n\n---\n\n".join(labeled) if labeled else "(no chunks retrieved)"

SYSTEM_PROMPT = """You are a brilliant research assistant who makes academic papers easy to understand. Your personality:

- You explain concepts clearly and engagingly, like a knowledgeable friend
- Use **bold** for key terms, concepts, and important phrases
- Structure answers with headings (##), bullet points, and numbered lists for readability
- When citing sources, reference the paper by name (e.g. "According to *Rag.pdf*..."), NEVER say "chunk" or "document chunk" — the user doesn't know what chunks are
- Give thorough, insightful answers — don't just repeat the text, synthesize and explain it
- If the question is about a concept in the papers, define it first, then go deeper
- Keep a warm, helpful tone — not robotic
- You ONLY discuss the user's uploaded papers. For off-topic requests, say: "I'm your research assistant for the uploaded papers — I can help you understand, summarize, compare, or analyze what's in them. What would you like to know?"
"""

def qa_agent(s: GS) -> GS:
    has_context = bool(s["chunks"]) or bool(s["graph_context"])
    formatted = _format_chunks(s["chunks"], s["chunk_sources"])
    prompt = f"""Question: {s["question"]}

Sources:
{formatted}

Graph relationships:
{s["graph_context"] or "(none)"}

{"You HAVE source content above. Answer the question using it. Synthesize a clear, detailed, well-formatted answer." if has_context else "No content was retrieved. Tell the user you couldn't find relevant information and suggest they rephrase."}
"""
    msgs = [SystemMessage(content=SYSTEM_PROMPT)] \
           + s["chat_history"] + [HumanMessage(content=prompt)]
    res  = get_model().invoke(msgs)
    hist = s["chat_history"] + [HumanMessage(content=s["question"]), AIMessage(content=res.content)]
    return {**s, "answer": res.content, "chat_history": hist}

def build_pipeline():
    wf = StateGraph(GS)
    for nm, fn in [("paper",paper_agent),("rag",rag_agent),
                   ("concept",concept_agent),("qa",qa_agent)]:
        wf.add_node(nm, fn)
    wf.set_entry_point("paper")
    wf.add_edge("paper","rag"); wf.add_edge("rag","concept")
    wf.add_edge("concept","qa"); wf.add_edge("qa", END)
    return wf.compile()

pipeline = build_pipeline()

# ── Auto-deduplicate on startup ───────────────────────────────────────────────
def _startup_dedup():
    try:
        db = get_db()
        raw = db._collection.get(include=["documents"])
        ids = raw.get("ids", [])
        docs = raw.get("documents", [])
        seen, to_delete = {}, []
        for i, doc in enumerate(docs):
            key = " ".join(doc.split())[:300]
            if key in seen:
                to_delete.append(ids[i])
            else:
                seen[key] = ids[i]
        if to_delete:
            for b in range(0, len(to_delete), 500):
                db._collection.delete(ids=to_delete[b:b+500])
            print(f"[startup-dedup] removed {len(to_delete)} duplicate chunks, {len(ids) - len(to_delete)} remaining")
        else:
            print(f"[startup-dedup] no duplicates found ({len(ids)} chunks)")
    except Exception as e:
        print(f"[startup-dedup] skipped: {e}")

_startup_dedup()

# ── FastAPI app ────────────────────────────────────────────────────────────────
app = FastAPI(title="PaperGraph AI", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request/Response models ────────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    question: str
    history: List[ChatMessage] = []
    selected_paper: Optional[str | list[str]] = None

class CompareRequest(BaseModel):
    question: str

# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/api/status")
def get_status():
    db = get_db()
    G  = load_graph()
    try:
        sources = set(
            m.get("source","") for m in
            db._collection.get(include=["metadatas"])["metadatas"]
            if m.get("source","")
        )
    except Exception:
        sources = set()
    return {
        "chunks":      db._collection.count(),
        "graph_nodes": G.number_of_nodes() if G else 0,
        "graph_edges": G.number_of_edges() if G else 0,
        "files":       len(sources),
    }


@app.get("/api/usage")
def get_usage():
    with _usage_lock:
        input_est = _usage_stats["input_tokens_est"]
        output_est = _usage_stats["output_tokens_est"]
        questions = _usage_stats["questions_asked"]
        last_q = _usage_stats["last_question_at"]
    return {
        "session_started_at": _session_started_at,
        "questions_asked": questions,
        "input_tokens_est": input_est,
        "output_tokens_est": output_est,
        "total_tokens_est": input_est + output_est,
        "last_question_at": last_q,
    }


@app.post("/api/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    saved = []
    filenames = [f.filename for f in files]
    for f in files:
        dest = DOCS_DIR / f.filename
        with open(dest, "wb") as fp:
            fp.write(await f.read())
        saved.append(str(dest))

    def progress(stage: str, pct: int, detail: str = ""):
        return f"data: {json.dumps({'type':'progress','stage':stage,'pct':pct,'detail':detail})}\n\n"

    async def generate():
        loop = asyncio.get_event_loop()

        yield progress("parsing", 10, f"Parsing {len(files)} file(s)…")

        if os.getenv("UNSTRUCTURED_API_KEY"):
            docs = await loop.run_in_executor(None, parse_with_unstructured, saved)
            parser = "unstructured"
        else:
            docs = await loop.run_in_executor(None, parse_fallback, saved)
            parser = "pypdf"

        yield progress("embedding", 50, f"{len(docs)} elements → embedding…")

        n_chunks = await loop.run_in_executor(None, add_to_chroma, docs)

        from collections import Counter
        cats = Counter(d.metadata.get("category","unknown") for d in docs)

        G = load_graph()
        yield f"data: {json.dumps({'type':'done','files':filenames,'chunks':n_chunks,'parser':parser,'categories':dict(cats),'graph_nodes':G.number_of_nodes() if G else 0,'graph_edges':G.number_of_edges() if G else 0})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/api/graph-build-status")
def graph_build_status():
    """Poll this to check background graph building progress + pending chunks."""
    with _graph_build_lock:
        s = dict(_graph_build_status)
    G = load_graph()
    s["graph_nodes"] = G.number_of_nodes() if G else 0
    s["graph_edges"] = G.number_of_edges() if G else 0

    # Count how many chunks haven't been processed yet
    try:
        db = get_db()
        total_chunks = db._collection.count()
        graph_path = DB_DIR / "knowledge_graph.json"
        processed = 0
        if graph_path.exists():
            with open(graph_path) as f:
                data = json.load(f)
            processed = len(data.get("processed_ids", []))
        s["pending_chunks"] = max(0, total_chunks - processed)
        s["total_chunks"] = total_chunks
        s["processed_chunks"] = processed
    except Exception:
        s["pending_chunks"] = 0
        s["total_chunks"] = 0
        s["processed_chunks"] = 0

    return s


@app.post("/api/build-graph")
async def build_graph_endpoint(force: bool = False):
    """
    Kicks off graph building in a background thread and returns immediately.
    Poll /api/graph-build-status for progress.
    """
    import threading
    with _graph_build_lock:
        if _graph_build_status["running"]:
            return {"status": "already_running"}
    threading.Thread(target=rebuild_graph_sync, args=(force,), daemon=True).start()
    return {"status": "started"}


@app.post("/api/build-graph/cancel")
def cancel_graph_build():
    """Signal the background graph builder to stop after the current batch."""
    global _graph_build_cancel
    with _graph_build_lock:
        if not _graph_build_status["running"]:
            return {"status": "not_running"}
    _graph_build_cancel = True
    return {"status": "cancelling"}


@app.post("/api/deduplicate")
async def deduplicate_chunks():
    """Remove duplicate chunks from ChromaDB, keeping one copy of each."""
    loop = asyncio.get_event_loop()

    def run_dedup():
        db = get_db()
        raw = db._collection.get(include=["documents", "metadatas"])
        ids = raw.get("ids", [])
        docs = raw.get("documents", [])
        metas = raw.get("metadatas", [])

        seen = {}
        ids_to_delete = []
        for i, doc in enumerate(docs):
            key = " ".join(doc.split())[:300]
            if key in seen:
                ids_to_delete.append(ids[i])
            else:
                seen[key] = ids[i]

        if ids_to_delete:
            for batch_start in range(0, len(ids_to_delete), 500):
                batch = ids_to_delete[batch_start:batch_start + 500]
                db._collection.delete(ids=batch)

        return {"removed": len(ids_to_delete), "remaining": len(ids) - len(ids_to_delete)}

    result = await loop.run_in_executor(None, run_dedup)
    return result


@app.post("/api/chat")
async def chat_endpoint(body: ChatRequest):
    # Convert history
    lc_history = []
    for m in body.history:
        if m.role == "user":
            lc_history.append(HumanMessage(content=m.content))
        elif m.role == "assistant":
            lc_history.append(AIMessage(content=m.content))

    async def generate():
        loop = asyncio.get_event_loop()
        output_chars = 0

        # Run pipeline (sync) in executor to get context
        def run_pipeline():
            return pipeline.invoke({
                "question": body.question,
                "rewritten_question": "",
                "chunks": [],
                "chunk_sources": [],
                "graph_context": "",
                "answer": "",
                "chat_history": lc_history,
                "selected_paper": body.selected_paper,
            })

        state = await loop.run_in_executor(None, run_pipeline)

        # Build streaming messages
        scope_note = ""
        if body.selected_paper:
            papers = body.selected_paper if isinstance(body.selected_paper, list) else [body.selected_paper]
            names = ", ".join(f"**{p}**" for p in papers)
            scope_note = f"\n- The user has scoped this question to: {names}. Only answer from chunks of those paper(s)."

        has_context = bool(state['chunks']) or bool(state['graph_context'])
        formatted = _format_chunks(state['chunks'], state['chunk_sources'])
        msgs = [
            SystemMessage(content=SYSTEM_PROMPT),
        ] + lc_history + [
            HumanMessage(content=f"""Answer: {body.question}

Sources:
{formatted}

Graph relationships:
{state['graph_context'] or '(none)'}

{"You HAVE source content above. Answer the question using it. Synthesize a clear, detailed, well-formatted answer." if has_context else "No content was retrieved. Tell the user you couldn't find relevant information and suggest they rephrase."}{scope_note}
""")
        ]

        # Session telemetry for user-facing dashboard.
        prompt_text = "\n".join(m.content for m in msgs if hasattr(m, "content") and m.content)
        input_tokens_est = estimate_tokens(prompt_text)
        with _usage_lock:
            _usage_stats["questions_asked"] += 1
            _usage_stats["input_tokens_est"] += input_tokens_est
            _usage_stats["last_question_at"] = int(time.time())

        # Stream tokens
        model = get_model()
        async for chunk in model.astream(msgs):
            if chunk.content:
                output_chars += len(chunk.content)
                yield f"data: {json.dumps({'type':'token','content':chunk.content})}\n\n"

        # Send metadata
        output_tokens_est = estimate_tokens_from_chars(output_chars)
        with _usage_lock:
            _usage_stats["output_tokens_est"] += output_tokens_est
        unique_sources = list(dict.fromkeys(s for s in state["chunk_sources"] if s))
        yield f"data: {json.dumps({'type':'done','sources':unique_sources,'graph':state['graph_context']})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"}
    )


@app.get("/api/library")
def get_library():
    try:
        raw = get_db()._collection.get(include=["metadatas"])
        metas = raw["metadatas"]
    except Exception:
        return {"files": []}

    from collections import defaultdict, Counter
    file_info = defaultdict(lambda: {"chunks":0,"categories":Counter(),"parser":"unknown"})
    for m in metas:
        src = m.get("source","unknown")
        file_info[src]["chunks"] += 1
        file_info[src]["categories"][m.get("category","unknown")] += 1
        file_info[src]["parser"] = m.get("parser","unknown")

    return {
        "files": [
            {
                "name":       name,
                "chunks":     info["chunks"],
                "categories": dict(info["categories"]),
                "parser":     info["parser"],
            }
            for name, info in sorted(file_info.items())
        ]
    }


@app.delete("/api/library/{filename}")
def delete_paper(filename: str):
    """
    Delete a paper from the library:
      1. Remove the PDF/file from docs/
      2. Remove all chunks with metadata.source==filename from ChromaDB
      3. Remove those chunk IDs from knowledge_graph.json's processed_ids
         (so re-uploading the same file picks up fresh extraction)
    The graph itself is left intact — concept nodes are typically shared across
    papers, so we don't aggressively prune. Run /api/build-graph?force=true if
    you want to fully regenerate from the remaining chunks.
    """
    deleted = {"file": False, "chunks": 0, "processed_ids": 0}

    # 1. Delete file from docs/
    file_path = DOCS_DIR / filename
    if file_path.exists():
        try:
            file_path.unlink()
            deleted["file"] = True
        except Exception as ex:
            raise HTTPException(status_code=500, detail=f"couldn't remove file: {ex}")

    # 2. Delete matching chunks from Chroma
    db = get_db()
    try:
        snap = db._collection.get(where={"source": filename}, include=["metadatas"])
        ids_to_drop = snap.get("ids", []) or []
        if ids_to_drop:
            db._collection.delete(ids=ids_to_drop)
            deleted["chunks"] = len(ids_to_drop)
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"couldn't remove chunks: {ex}")

    # 3. Sync processed_ids in the graph JSON so re-uploads aren't silently skipped
    graph_path = DB_DIR / "knowledge_graph.json"
    if graph_path.exists() and ids_to_drop:
        try:
            with open(graph_path) as f:
                data = json.load(f)
            before = set(data.get("processed_ids", []))
            after  = before - set(ids_to_drop)
            if len(after) != len(before):
                data["processed_ids"] = sorted(after)
                with open(graph_path, "w") as f:
                    json.dump(data, f, indent=2)
                deleted["processed_ids"] = len(before) - len(after)
        except Exception as ex:
            print(f"[delete] couldn't update processed_ids: {ex}")

    if not deleted["file"] and deleted["chunks"] == 0:
        raise HTTPException(status_code=404, detail=f"'{filename}' not found in library")

    return {"deleted": filename, **deleted}


@app.get("/api/graph")
def get_graph_data():
    G = load_graph()
    if not G:
        return {"nodes":[], "edges":[]}
    nodes = [{"id":n, "label":n} for n in G.nodes()]
    edges = [{"source":u,"target":v,"label":d.get("relation","")}
             for u,v,d in G.edges(data=True)]
    return {"nodes":nodes, "edges":edges}


@app.get("/api/pdf/{filename}")
def serve_pdf(filename: str):
    path = DOCS_DIR / filename
    if not path.exists():
        raise HTTPException(404, "PDF not found")
    return FileResponse(str(path), media_type="application/pdf")


@app.post("/api/compare")
async def compare_endpoint(body: CompareRequest):
    loop = asyncio.get_event_loop()
    q = body.question

    def run_rag_only():
        base = pipeline.invoke({"question":q,"rewritten_question":q,"chunks":[],
                                "chunk_sources":[],"graph_context":"","answer":"","chat_history":[]})
        # Answer without graph
        prompt = f"Answer using ONLY these chunks:\n\n{chr(10).join(base['chunks'])}\n\nQ: {q}"
        res = get_model().invoke([SystemMessage(content="Research assistant. Chunks only."),
                                  HumanMessage(content=prompt)])
        return {"answer": res.content, "sources": list(dict.fromkeys(s for s in base["chunk_sources"] if s))}

    def run_graphrag():
        state = pipeline.invoke({"question":q,"rewritten_question":q,"chunks":[],
                                 "chunk_sources":[],"graph_context":"","answer":"","chat_history":[]})
        return {"answer": state["answer"],
                "sources": list(dict.fromkeys(s for s in state["chunk_sources"] if s)),
                "graph": state["graph_context"]}

    rag_result, graph_result = await asyncio.gather(
        loop.run_in_executor(None, run_rag_only),
        loop.run_in_executor(None, run_graphrag),
    )
    return {"rag": rag_result, "graphrag": graph_result}
