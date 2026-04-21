"""
PaperGraph AI — FastAPI backend
Run: uvicorn api:app --reload --port 8000
"""
import os, json, asyncio, time
from typing import List, Optional
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse, FileResponse, HTMLResponse
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

from pyvis.network import Network

load_dotenv()

# ── Paths ──────────────────────────────────────────────────────────────────────
DOCS_DIR = Path("docs")
DB_DIR   = Path("db")
DOCS_DIR.mkdir(exist_ok=True)
DB_DIR.mkdir(exist_ok=True)

# ── Models (module-level singletons) ──────────────────────────────────────────
_embeddings = None
_model      = None
_pipeline   = None

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

def rebuild_graph_sync() -> nx.DiGraph:
    """Rebuild knowledge graph from all chunks — fully synchronous."""
    raw_data = get_db()._collection.get()
    raw   = raw_data["documents"]
    metas = raw_data.get("metadatas", [{}]*len(raw))
    docs = [
        Document(page_content=c, metadata=m)
        for c, m in zip(raw, metas) if c.strip()
    ]
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    transformer = LLMGraphTransformer(
        llm=llm,
        allowed_nodes=["Model","Method","Dataset","Metric","Concept",
                       "Architecture","Paper","Task","Technology"],
        allowed_relationships=["BASED_ON","IMPROVES","USES","TRAINED_ON",
                               "EVALUATED_ON","OUTPERFORMS","INTRODUCED_BY",
                               "PART_OF","RELATED_TO","COMPARED_TO"],
        node_properties=["description"],
    )
    # Use sync version to avoid nested-event-loop issues inside FastAPI
    graph_docs = transformer.convert_to_graph_documents(docs)
    G = nx.DiGraph(); triples = []
    for gd in graph_docs:
        for n in gd.nodes: G.add_node(n.id, type=n.type)
        for r in gd.relationships:
            G.add_edge(r.source.id, r.target.id, relation=r.type)
            triples.append({"subject":r.source.id,"relation":r.type,"object":r.target.id})
    with open(DB_DIR/"knowledge_graph.json","w") as f:
        json.dump({
            "triples": triples,
            "nodes":   list(G.nodes()),
            "edges":   [{"source":u,"target":v,"relation":d["relation"]}
                        for u,v,d in G.edges(data=True)]
        }, f, indent=2)
    return G

# ── LangGraph pipeline ─────────────────────────────────────────────────────────
class GS(TypedDict):
    question: str; rewritten_question: str
    chunks: List[str]; chunk_sources: List[str]
    graph_context: str; answer: str; chat_history: List

def paper_agent(s: GS) -> GS:
    q, h = s["question"], s["chat_history"]
    if h:
        rw = get_model().invoke(
            [SystemMessage(content="Rewrite to a standalone, searchable question. Return ONLY the rewritten question.")]
            + h + [HumanMessage(content=f"New question: {q}")]
        ).content.strip()
    else: rw = q
    return {**s, "rewritten_question": rw}

def rag_agent(s: GS) -> GS:
    docs = get_db().as_retriever(search_kwargs={"k":5}).invoke(s["rewritten_question"])
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

def qa_agent(s: GS) -> GS:
    prompt = f"""Question: {s["question"]}

Document chunks:
{chr(10).join(s["chunks"])}

Graph relationships:
{s["graph_context"] or "None found."}

Rules:
- ONLY answer using the chunks and graph above
- If not found: "I couldn't find this in your uploaded documents."
- Cite the source document when possible
- If unrelated to the uploaded content: "I'm focused on your uploaded documents only."
"""
    msgs = [SystemMessage(content="You are a knowledgeable assistant strictly limited to the user's uploaded documents. Answer any question that can be answered from the provided content.")] \
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

# ── FastAPI app ────────────────────────────────────────────────────────────────
app = FastAPI(title="PaperGraph AI", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
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


@app.post("/api/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    saved = []
    for f in files:
        dest = DOCS_DIR / f.filename
        with open(dest, "wb") as fp:
            fp.write(await f.read())
        saved.append(str(dest))

    # Parse
    loop = asyncio.get_event_loop()
    if os.getenv("UNSTRUCTURED_API_KEY"):
        docs = await loop.run_in_executor(None, parse_with_unstructured, saved)
        parser = "unstructured"
    else:
        docs = await loop.run_in_executor(None, parse_fallback, saved)
        parser = "pypdf"

    # Embed
    n_chunks = await loop.run_in_executor(None, add_to_chroma, docs)

    # Count categories (from Unstructured metadata)
    from collections import Counter
    cats = Counter(d.metadata.get("category","unknown") for d in docs)

    return {
        "files":      [f.filename for f in files],
        "chunks":     n_chunks,
        "parser":     parser,
        "categories": dict(cats),
        "message":    f"Processed {len(files)} file(s) → {n_chunks} chunks via {parser}"
    }


@app.post("/api/build-graph")
async def build_graph_endpoint():
    loop = asyncio.get_event_loop()
    G = await loop.run_in_executor(None, rebuild_graph_sync)
    return {"nodes": G.number_of_nodes(), "edges": G.number_of_edges()}


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
            })

        state = await loop.run_in_executor(None, run_pipeline)

        # Build streaming messages
        msgs = [
            SystemMessage(content="You are a knowledgeable assistant strictly limited to the user's uploaded documents. Answer any question that can be answered from the provided content. Do not use outside knowledge."),
        ] + lc_history + [
            HumanMessage(content=f"""Answer: {body.question}

Document chunks:
{chr(10).join(state['chunks'])}

Graph relationships:
{state['graph_context'] or 'None'}

Rules:
- ONLY answer using the chunks and graph above
- If not found: "I couldn't find this in your uploaded documents."
- Cite the source document when possible
- If unrelated to the uploaded content: "I'm focused on your uploaded documents only."
""")
        ]

        # Stream tokens
        model = get_model()
        async for chunk in model.astream(msgs):
            if chunk.content:
                yield f"data: {json.dumps({'type':'token','content':chunk.content})}\n\n"

        # Send metadata
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


@app.get("/api/graph")
def get_graph_data():
    G = load_graph()
    if not G:
        return {"nodes":[], "edges":[]}
    nodes = [{"id":n, "label":n} for n in G.nodes()]
    edges = [{"source":u,"target":v,"label":d.get("relation","")}
             for u,v,d in G.edges(data=True)]
    return {"nodes":nodes, "edges":edges}


@app.get("/api/graph/html")
def get_graph_html(node: str = ""):
    G = load_graph()
    if not G:
        return HTMLResponse("<html><body style='font-family:sans-serif;padding:2rem;color:#6b7280'>No graph built yet.</body></html>")

    net = Network(height="100%", width="100%", directed=True,
                  bgcolor="#0f172a", font_color="#f1f5f9")
    net.barnes_hut(gravity=-6000, central_gravity=0.3, spring_length=140)

    display = G if not node else G.subgraph(nx.ego_graph(G, node, radius=2).nodes()) if node in G else G

    for n in display.nodes():
        sel = (n == node)
        net.add_node(n, label=n,
                     color="#818cf8" if sel else "#334155",
                     size=30 if sel else 18,
                     font={"size":13,"color":"#f1f5f9"})
    for u,v,d in display.edges(data=True):
        net.add_edge(u,v,label=d.get("relation",""),
                     color="#475569",font={"size":10,"color":"#94a3b8"})

    path = DB_DIR / "graph.html"
    net.save_graph(str(path))

    # Patch the HTML to fill the page properly
    html = path.read_text()
    html = html.replace("<body>","<body style='margin:0;overflow:hidden;'>")
    html = html.replace(
        'style="width: 100%;',
        'style="width: 100%; height: 100vh;'
    )
    return HTMLResponse(html)


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
