import os
import json
import networkx as nx
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_experimental.graph_transformers import LLMGraphTransformer

load_dotenv()

GRAPH_PATH = "db/knowledge_graph.json"

def load_vectorstore():
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    db = Chroma(persist_directory="db/chroma_db", embedding_function=embeddings)
    return db

def build_knowledge_graph():
    print("=== Building Knowledge Graph with LLMGraphTransformer ===\n")

    # ── Step 1: Load all chunks from ChromaDB ─────────────────────────────────
    db = load_vectorstore()
    all_docs = db._collection.get()
    raw_chunks = all_docs["documents"]
    print(f"Found {len(raw_chunks)} chunks to process\n")

    # ── Step 2: Convert raw text chunks → LangChain Document objects ──────────
    # LLMGraphTransformer needs Document objects, not plain strings
    documents = [Document(page_content=chunk) for chunk in raw_chunks if chunk.strip()]

    # ── Step 3: Set up LLMGraphTransformer ────────────────────────────────────
    # This is the replacement for our manual GPT-4o prompt + JSON parsing.
    # LLMGraphTransformer handles all of that internally — cleaner and
    # more reliable than doing it ourselves.
    llm = ChatOpenAI(model="gpt-4o", temperature=0)

    llm_transformer = LLMGraphTransformer(
        llm=llm,

        # Tell it what kinds of things to look for in academic papers
        # If you leave this empty it extracts everything — which can get noisy
        allowed_nodes=[
            "Model", "Method", "Dataset", "Metric",
            "Concept", "Architecture", "Paper", "Task", "Technology"
        ],

        # Tell it what kinds of relationships matter
        allowed_relationships=[
            "BASED_ON", "IMPROVES", "USES", "TRAINED_ON",
            "EVALUATED_ON", "OUTPERFORMS", "INTRODUCED_BY",
            "PART_OF", "RELATED_TO", "COMPARED_TO"
        ],

        # Ask it to add a short description to each node — useful for later
        node_properties=["description"],
    )

    # ── Step 4: Extract graph documents ───────────────────────────────────────
    # This is the main call — it sends each document to GPT-4o
    # and gets back structured nodes + relationships
    print("Extracting nodes and relationships (this may take a while)...\n")
    graph_documents = llm_transformer.convert_to_graph_documents(documents)

    # ── Step 5: Build NetworkX graph from the results ─────────────────────────
    G = nx.DiGraph()
    all_triples = []

    for graph_doc in graph_documents:

        # Each node looks like: Node(id="BERT", type="Model")
        for node in graph_doc.nodes:
            G.add_node(node.id, type=node.type)

        # Each relationship looks like:
        # Relationship(source=Node("BERT"), type="BASED_ON", target=Node("Transformer"))
        for rel in graph_doc.relationships:
            source = rel.source.id
            target = rel.target.id
            relation = rel.type

            G.add_edge(source, target, relation=relation)
            all_triples.append({
                "subject":  source,
                "relation": relation,
                "object":   target
            })
            print(f"  + {source} → {relation} → {target}")

    # ── Step 6: Save to disk (same format as before — app.py unchanged) ───────
    os.makedirs("db", exist_ok=True)
    graph_data = {
        "triples": all_triples,
        "nodes":   list(G.nodes()),
        "edges":   [
            {"source": u, "target": v, "relation": d["relation"]}
            for u, v, d in G.edges(data=True)
        ]
    }
    with open(GRAPH_PATH, "w") as f:
        json.dump(graph_data, f, indent=2)

    print(f"\n✅ Knowledge graph built!")
    print(f"   Nodes (concepts):    {G.number_of_nodes()}")
    print(f"   Edges (relations):   {G.number_of_edges()}")
    print(f"   Saved to {GRAPH_PATH}")
    return G

def load_knowledge_graph():
    if not os.path.exists(GRAPH_PATH):
        print("No graph found. Run build_knowledge_graph() first.")
        return None

    with open(GRAPH_PATH, "r") as f:
        data = json.load(f)

    G = nx.DiGraph()
    for edge in data["edges"]:
        G.add_edge(edge["source"], edge["target"], relation=edge["relation"])

    print(f"✅ Loaded graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    return G

def query_graph(G, concept, depth=2):
    """Find all concepts related to a given concept within N hops."""
    concept = concept.strip()

    matched_node = None
    for node in G.nodes():
        if node.lower() == concept.lower():
            matched_node = node
            break

    if not matched_node:
        return f"Concept '{concept}' not found in graph."

    subgraph_nodes = nx.ego_graph(G, matched_node, radius=depth).nodes()
    results = []
    for u, v, data in G.edges(data=True):
        if u in subgraph_nodes or v in subgraph_nodes:
            results.append(f"{u} → {data['relation']} → {v}")

    return "\n".join(results) if results else "No relationships found."

if __name__ == "__main__":
    G = build_knowledge_graph()

    print("\n--- Test graph query ---")
    print(query_graph(G, "Transformer"))
