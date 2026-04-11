import os
import json
import networkx as nx
import streamlit as st
from dotenv import load_dotenv

from langchain_chroma import Chroma
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from typing import TypedDict, List

# for graph visualisation
import streamlit.components.v1 as components
from pyvis.network import Network

load_dotenv()

# ── Page config ────────────────────────────────────────────────────────────────
# This must be the very first Streamlit command
st.set_page_config(
    page_title="PaperGraph AI",
    page_icon="📄",
    layout="wide"
)

# ── Shared state (cached so it loads once, not on every click) ─────────────────
@st.cache_resource
def load_resources():
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    db = Chroma(persist_directory="db/chroma_db", embedding_function=embeddings)
    model = ChatOpenAI(model="gpt-4o")
    return db, model

@st.cache_resource
def load_graph():
    graph_path = "db/knowledge_graph.json"
    if not os.path.exists(graph_path):
        return None
    with open(graph_path, "r") as f:
        data = json.load(f)
    G = nx.DiGraph()
    for edge in data["edges"]:
        G.add_edge(edge["source"], edge["target"], relation=edge["relation"])
    return G

db, model = load_resources()
G = load_graph()

# ── LangGraph pipeline (same as 6_langgraph_agents.py) ────────────────────────
class GraphState(TypedDict):
    question: str
    rewritten_question: str
    chunks: List[str]
    graph_context: str
    answer: str
    chat_history: List

def paper_agent(state: GraphState) -> GraphState:
    question = state["question"]
    history = state["chat_history"]
    if history:
        messages = [
            SystemMessage(content="""Given the chat history, rewrite the new question 
to be standalone and searchable. Return ONLY the rewritten question, nothing else.""")
        ] + history + [HumanMessage(content=f"New question: {question}")]
        result = model.invoke(messages)
        rewritten = result.content.strip()
    else:
        rewritten = question
    return {**state, "rewritten_question": rewritten}

def rag_agent(state: GraphState) -> GraphState:
    retriever = db.as_retriever(search_kwargs={"k": 5})
    docs = retriever.invoke(state["rewritten_question"])
    return {**state, "chunks": [doc.page_content for doc in docs]}

def concept_agent(state: GraphState) -> GraphState:
    if G is None:
        return {**state, "graph_context": ""}
    question = state["rewritten_question"].lower()
    triples = [
        f"{u} → {d['relation']} → {v}"
        for u, v, d in G.edges(data=True)
        if u.lower() in question or v.lower() in question
    ]
    return {**state, "graph_context": "\n".join(triples)}

def qa_agent(state: GraphState) -> GraphState:
    combined_input = f"""Answer this question: {state["question"]}

--- Retrieved document chunks ---
{chr(10).join(state["chunks"])}

--- Knowledge graph relationships ---
{state["graph_context"] if state["graph_context"] else "No graph relationships found."}

Instructions:
- Use both document chunks and graph relationships to answer
- If the graph shows a relevant relationship, mention it explicitly
- Cite which paper the information comes from when possible
- If you cannot find the answer, say so clearly
"""
    messages = [
        SystemMessage(content="You are a helpful research assistant answering questions about academic papers.")
    ] + state["chat_history"] + [HumanMessage(content=combined_input)]
    result = model.invoke(messages)
    updated_history = state["chat_history"] + [
        HumanMessage(content=state["question"]),
        AIMessage(content=result.content)
    ]
    return {**state, "answer": result.content, "chat_history": updated_history}

def rag_only_agent(state: GraphState) -> GraphState:
    """Same as qa_agent but ignores the graph — used for RAG vs GraphRAG comparison."""
    combined_input = f"""Answer this question: {state["question"]}

--- Retrieved document chunks ---
{chr(10).join(state["chunks"])}

Instructions:
- Use only the document chunks to answer
- Do not use any graph relationships
- If you cannot find the answer, say so clearly
"""
    messages = [
        SystemMessage(content="You are a helpful research assistant.")
    ] + [HumanMessage(content=combined_input)]
    result = model.invoke(messages)
    return {**state, "answer": result.content}

@st.cache_resource
def build_pipeline():
    workflow = StateGraph(GraphState)
    workflow.add_node("paper_agent", paper_agent)
    workflow.add_node("rag_agent", rag_agent)
    workflow.add_node("concept_agent", concept_agent)
    workflow.add_node("qa_agent", qa_agent)
    workflow.set_entry_point("paper_agent")
    workflow.add_edge("paper_agent", "rag_agent")
    workflow.add_edge("rag_agent", "concept_agent")
    workflow.add_edge("concept_agent", "qa_agent")
    workflow.add_edge("qa_agent", END)
    return workflow.compile()

pipeline = build_pipeline()

# ── Sidebar ────────────────────────────────────────────────────────────────────
# In Streamlit, the sidebar is the left panel
with st.sidebar:
    st.title("📄 PaperGraph AI")
    st.caption("Academic paper analysis with GraphRAG")
    st.divider()

    # Show DB status
    chunk_count = db._collection.count()
    st.metric("Chunks in ChromaDB", chunk_count)
    if G:
        st.metric("Graph nodes", G.number_of_nodes())
        st.metric("Graph edges", G.number_of_edges())
    else:
        st.warning("No knowledge graph found. Run 5_concept_agent.py first.")

    st.divider()

    # Upload section
    st.subheader("Upload papers")
    uploaded_files = st.file_uploader(
        "Drop PDFs here",
        type="pdf",
        accept_multiple_files=True
    )

    if uploaded_files:
        if st.button("Ingest uploaded PDFs", type="primary"):
            os.makedirs("docs", exist_ok=True)
            for file in uploaded_files:
                path = os.path.join("docs", file.name)
                with open(path, "wb") as f:
                    f.write(file.getbuffer())
            st.success(f"Saved {len(uploaded_files)} PDF(s) to docs/")
            st.info("Now run 1_ingestion.py and 5_concept_agent.py to process them.")

# ── Main tabs ──────────────────────────────────────────────────────────────────
# Tabs are the four sections at the top of the page
tab1, tab2, tab3, tab4 = st.tabs([
    "💬 Chat",
    "🕸️ Graph viewer",
    "⚖️ RAG vs GraphRAG",
    "📚 About"
])

# ══════════════════════════════════════════════════════════════════════════════
# TAB 1 — Chat
# ══════════════════════════════════════════════════════════════════════════════
with tab1:
    st.header("Ask a question")

    # st.session_state is Streamlit's way of remembering things between clicks
    if "chat_history" not in st.session_state:
        st.session_state.chat_history = []
    if "messages_display" not in st.session_state:
        st.session_state.messages_display = []

    # Show previous messages
    for msg in st.session_state.messages_display:
        with st.chat_message(msg["role"]):
            st.write(msg["content"])

    # Chat input box at the bottom
    user_input = st.chat_input("Ask anything about your papers...")

    if user_input:
        # Show user message immediately
        with st.chat_message("user"):
            st.write(user_input)
        st.session_state.messages_display.append({"role": "user", "content": user_input})

        # Run the pipeline
        with st.chat_message("assistant"):
            with st.spinner("Thinking..."):
                result = pipeline.invoke({
                    "question": user_input,
                    "rewritten_question": "",
                    "chunks": [],
                    "graph_context": "",
                    "answer": "",
                    "chat_history": st.session_state.chat_history
                })
            st.write(result["answer"])

            # Show which graph relationships were used (if any)
            if result["graph_context"]:
                with st.expander("Graph relationships used"):
                    st.code(result["graph_context"])

        st.session_state.chat_history = result["chat_history"]
        st.session_state.messages_display.append({
            "role": "assistant",
            "content": result["answer"]
        })

    if st.session_state.messages_display:
        if st.button("Clear chat"):
            st.session_state.chat_history = []
            st.session_state.messages_display = []
            st.rerun()

# ══════════════════════════════════════════════════════════════════════════════
# TAB 2 — Graph viewer
# ══════════════════════════════════════════════════════════════════════════════
with tab2:
    st.header("Knowledge graph")

    if G is None:
        st.warning("No graph found. Run 5_concept_agent.py first.")
    else:
        st.caption(f"{G.number_of_nodes()} concepts · {G.number_of_edges()} relationships")

        # Filter by concept
        all_nodes = sorted(G.nodes())
        selected = st.selectbox(
            "Focus on a concept (optional)",
            ["Show full graph"] + all_nodes
        )

        # Build the visual graph using pyvis
        net = Network(height="500px", width="100%", directed=True, bgcolor="#0e1117", font_color="white")
        net.barnes_hut()

        if selected == "Show full graph":
            display_graph = G
        else:
            # Show only the neighbourhood of the selected node
            neighbor_nodes = nx.ego_graph(G, selected, radius=2).nodes()
            display_graph = G.subgraph(neighbor_nodes)

        for node in display_graph.nodes():
            color = "#1D9E75" if node == selected else "#378ADD"
            net.add_node(node, label=node, color=color, size=20)

        for u, v, data in display_graph.edges(data=True):
            net.add_edge(u, v, label=data.get("relation", ""), color="#888780")

        # Save and render
        path = os.path.join(os.getcwd(), "db", "graph.html")
        net.save_graph(path)
        with open(path, "r") as f:
            html = f.read()
        components.html(html, height=520)

        # Also show as a table
        with st.expander("View all relationships as table"):
            import pandas as pd
            rows = [{"Subject": u, "Relation": d["relation"], "Object": v}
                    for u, v, d in G.edges(data=True)]
            st.dataframe(pd.DataFrame(rows), use_container_width=True)

# ══════════════════════════════════════════════════════════════════════════════
# TAB 3 — RAG vs GraphRAG comparison
# ══════════════════════════════════════════════════════════════════════════════
with tab3:
    st.header("RAG vs GraphRAG")
    st.caption("Ask the same question two ways and compare the answers side by side.")

    compare_question = st.text_input("Enter a question to compare", 
                                      placeholder="e.g. How does BERT relate to the Transformer?")

    if st.button("Compare", type="primary") and compare_question:
        col1, col2 = st.columns(2)

        # Run both in parallel display
        with col1:
            st.subheader("RAG only")
            st.caption("Uses document chunks only — no graph")
            with st.spinner("Running RAG..."):
                rag_result = pipeline.invoke({
                    "question": compare_question,
                    "rewritten_question": compare_question,
                    "chunks": [],
                    "graph_context": "",  # force empty graph context
                    "answer": "",
                    "chat_history": []
                })
                # Override with RAG-only answer
                rag_state = rag_only_agent({
                    "question": compare_question,
                    "rewritten_question": compare_question,
                    "chunks": rag_result["chunks"],
                    "graph_context": "",
                    "answer": "",
                    "chat_history": []
                })
            st.write(rag_state["answer"])

        with col2:
            st.subheader("GraphRAG")
            st.caption("Uses document chunks + knowledge graph")
            with st.spinner("Running GraphRAG..."):
                graph_result = pipeline.invoke({
                    "question": compare_question,
                    "rewritten_question": compare_question,
                    "chunks": [],
                    "graph_context": "",
                    "answer": "",
                    "chat_history": []
                })
            st.write(graph_result["answer"])

            if graph_result["graph_context"]:
                with st.expander("Graph relationships used"):
                    st.code(graph_result["graph_context"])

# ══════════════════════════════════════════════════════════════════════════════
# TAB 4 — About
# ══════════════════════════════════════════════════════════════════════════════
with tab4:
    st.header("About PaperGraph AI")
    st.markdown("""
    PaperGraph AI combines two approaches to answer questions about academic papers:

    **RAG (Retrieval-Augmented Generation)**  
    Splits papers into chunks, stores them in ChromaDB, and retrieves the most 
    relevant ones when you ask a question.

    **GraphRAG**  
    Extracts concept relationships from papers (e.g. BERT → based on → Transformer) 
    and stores them as a knowledge graph. This lets the system answer relationship 
    questions that RAG alone would miss.

    **Pipeline**  
    Every question flows through 4 agents in order:
    1. Paper Agent — rewrites your question to be standalone
    2. RAG Agent — retrieves top-5 chunks from ChromaDB  
    3. Concept Agent — finds relevant graph relationships
    4. QA Agent — combines everything and writes the answer

**Run order**

    python 1_ingestion.py
    python 5_concept_agent.py
    streamlit run app.py
""")