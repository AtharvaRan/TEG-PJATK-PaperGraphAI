import os
from langchain_community.document_loaders import PyPDFLoader, DirectoryLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma
from dotenv import load_dotenv

load_dotenv()

def load_documents(docs_path="docs"):
    print(f"Loading documents from {docs_path}...")
    
    if not os.path.exists(docs_path):
        raise FileNotFoundError(f"The directory {docs_path} does not exist.")
    
    loader = DirectoryLoader(
        path=docs_path,
        glob="*.pdf",
        loader_cls=PyPDFLoader
    )
    
    documents = loader.load()
    
    if len(documents) == 0:
        raise FileNotFoundError(f"No .pdf files found in {docs_path}.")
    
    # Filter out empty pages (common in PDFs)
    documents = [doc for doc in documents if doc.page_content.strip()]
    
    print(f"Loaded {len(documents)} pages from PDFs")
    for i, doc in enumerate(documents[:2]):
        print(f"\nDocument {i+1}:")
        print(f"  Source: {doc.metadata['source']}")
        print(f"  Page:   {doc.metadata['page']}")
        print(f"  Length: {len(doc.page_content)} characters")
        print(f"  Preview: {doc.page_content[:100]}...")

    return documents

def split_documents(documents, chunk_size=1000, chunk_overlap=200):
    print("\nSplitting documents into chunks...")
    
    # RecursiveCharacterTextSplitter is better than CharacterTextSplitter
    # It tries multiple separators to keep chunks near the target size
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,   # 200 overlap — matches your design doc spec
        separators=["\n\n", "\n", " ", ""]
    )
    
    chunks = text_splitter.split_documents(documents)
    print(f"Split into {len(chunks)} chunks")
    return chunks

def create_vector_store(chunks, persist_directory="db/chroma_db"):
    print("\nCreating embeddings and storing in ChromaDB...")
    
    embedding_model = OpenAIEmbeddings(model="text-embedding-3-small")
    
    print("--- Creating vector store ---")
    vectorstore = Chroma.from_documents(
        documents=chunks,
        embedding=embedding_model,
        persist_directory=persist_directory,
        collection_metadata={"hnsw:space": "cosine"}
    )
    print("--- Finished creating vector store ---")
    print(f"Saved to {persist_directory}")
    return vectorstore

def main():
    print("=== RAG Document Ingestion Pipeline ===\n")
    
    docs_path = "docs"
    persistent_directory = "db/chroma_db"
    
    if os.path.exists(persistent_directory):
        embedding_model = OpenAIEmbeddings(model="text-embedding-3-small")
        vectorstore = Chroma(
            persist_directory=persistent_directory,
            embedding_function=embedding_model
            # No collection_metadata here — just load what exists
        )
        count = vectorstore._collection.count()
        if count > 0:
            print(f"✅ Vector store already exists with {count} chunks. Skipping ingestion.")
            return vectorstore
        else:
            print("⚠️  Vector store folder exists but is empty. Re-ingesting...")
    
    print("Initializing vector store...\n")
    
    documents = load_documents(docs_path)
    chunks = split_documents(documents)
    vectorstore = create_vector_store(chunks, persistent_directory)
    
    print(f"\n✅ Ingestion complete! {vectorstore._collection.count()} chunks ready for querying.")
    return vectorstore

if __name__ == "__main__":
    main()