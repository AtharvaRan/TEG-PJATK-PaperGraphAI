import os
import json
import networkx as nx
from typing import TypedDict, List
from dotenv import load_dotenv

from langchain_chroma import Chroma
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langgraph.graph import StateGraph, END

load_dotenv()

# ── Shared state that flows between all agents ─────────────────────────────────
# Think of this as a baton passed from agent to agent.
# Each agent reads what it needs and adds its own results.

class GraphState(TypedDict):
    question: str               # the user's original question
    rewritten_question: str     # history-aware rewrite of the question
    chunks: List[str]           # top-k chunks from ChromaDB
    graph_context: str          # relationships from NetworkX
    answer: str                 # final answer
    chat_history: List          # full conversation history

# ── Load shared resources once at startup ─────────────────────────────────────
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
db = Chroma(persist_directory="db/chroma_db", embedding_function=embeddings)
model = ChatOpenAI(model="gpt-4o")

def load_graph():
    graph_path = "db/knowledge_graph.json"
    if not os.path.exists(graph_path):
        print("⚠️  No knowledge graph found. Run 5_concept_agent.py first.")
        return None
    with open(graph_path, "r") as f:
        data = json.load(f)
    G = nx.DiGraph()
    for edge in data["edges"]:
        G.add_edge(edge["source"], edge["target"], relation=edge["relation"])
    print(f"✅ Graph loaded: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    return G

G = load_graph()

# ── Agent 1: Paper Agent ───────────────────────────────────────────────────────
# Rewrites the question to be standalone using chat history.
# If it's the first question, passes it through unchanged.

def paper_agent(state: GraphState) -> GraphState:
    print("\n[Paper Agent] Rewriting question...")
    question = state["question"]
    history = state["chat_history"]

    if history:
        messages = [
            SystemMessage(content="""Given the chat history, rewrite the new question 
to be standalone and searchable. Return ONLY the rewritten question, nothing else.""")
        ] + history + [
            HumanMessage(content=f"New question: {question}")
        ]
        result = model.invoke(messages)
        rewritten = result.content.strip()
    else:
        rewritten = question

    print(f"[Paper Agent] Rewritten: {rewritten}")
    return {**state, "rewritten_question": rewritten}

# ── Agent 2: RAG Agent ─────────────────────────────────────────────────────────
# Takes the rewritten question and retrieves the top-5 most
# relevant chunks from ChromaDB using cosine similarity.

def rag_agent(state: GraphState) -> GraphState:
    print("\n[RAG Agent] Retrieving chunks from ChromaDB...")
    question = state["rewritten_question"]

    retriever = db.as_retriever(search_kwargs={"k": 5})
    docs = retriever.invoke(question)
    chunks = [doc.page_content for doc in docs]

    print(f"[RAG Agent] Retrieved {len(chunks)} chunks")
    return {**state, "chunks": chunks}

# ── Agent 3: Concept Agent ─────────────────────────────────────────────────────
# Looks up the rewritten question in the knowledge graph.
# Finds any nodes (concepts) mentioned in the question and
# returns their relationships as extra context.

def concept_agent(state: GraphState) -> GraphState:
    print("\n[Concept Agent] Querying knowledge graph...")

    if G is None:
        print("[Concept Agent] No graph available, skipping.")
        return {**state, "graph_context": ""}

    question = state["rewritten_question"].lower()
    relevant_triples = []

    for u, v, data in G.edges(data=True):
        if u.lower() in question or v.lower() in question:
            relevant_triples.append(f"{u} → {data['relation']} → {v}")

    graph_context = "\n".join(relevant_triples) if relevant_triples else ""
    
    if graph_context:
        print(f"[Concept Agent] Found {len(relevant_triples)} relevant relationships")
    else:
        print("[Concept Agent] No graph relationships found for this question")

    return {**state, "graph_context": graph_context}

# ── Agent 4: QA Agent ──────────────────────────────────────────────────────────
# The final agent. Takes everything — chunks, graph context,
# chat history — and writes the answer using GPT-4o.

def qa_agent(state: GraphState) -> GraphState:
    print("\n[QA Agent] Generating answer...")

    rag_context = "\n\n".join(state["chunks"])
    graph_context = state["graph_context"]
    history = state["chat_history"]
    question = state["question"]

    combined_input = f"""Answer this question: {question}

--- Retrieved document chunks ---
{rag_context}

--- Knowledge graph relationships ---
{graph_context if graph_context else "No graph relationships found."}

Instructions:
- Use both document chunks and graph relationships to answer
- If the graph shows a relevant relationship, mention it explicitly  
- Cite which paper the information comes from when possible
- If you cannot find the answer, say so clearly
"""

    messages = [
        SystemMessage(content="You are a helpful research assistant answering questions about academic papers.")
    ] + history + [
        HumanMessage(content=combined_input)
    ]

    result = model.invoke(messages)
    answer = result.content

    # Save this turn to history
    updated_history = history + [
        HumanMessage(content=question),
        AIMessage(content=answer)
    ]

    print(f"[QA Agent] Answer generated")
    return {**state, "answer": answer, "chat_history": updated_history}

# ── Build the LangGraph pipeline ───────────────────────────────────────────────
# This is the "orchestration" part — defining the order agents run in.
# paper_agent → rag_agent → concept_agent → qa_agent → END

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

# ── Chat loop ──────────────────────────────────────────────────────────────────
def start_chat():
    pipeline = build_pipeline()
    chat_history = []

    print("=== PaperGraph AI — Multi-Agent Pipeline ===")
    print("Type 'quit' to exit\n")

    while True:
        question = input("Your question: ").strip()
        if question.lower() in ["quit", "exit", "q"]:
            print("Goodbye!")
            break

        # Run the full pipeline
        result = pipeline.invoke({
            "question": question,
            "rewritten_question": "",
            "chunks": [],
            "graph_context": "",
            "answer": "",
            "chat_history": chat_history
        })

        # Update history for next turn
        chat_history = result["chat_history"]

        print(f"\n{'='*50}")
        print(f"Answer: {result['answer']}")
        print(f"{'='*50}\n")

if __name__ == "__main__":
    start_chat()