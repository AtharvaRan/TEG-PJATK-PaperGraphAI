import warnings
warnings.filterwarnings("ignore")

from dotenv import load_dotenv
from langchain_chroma import Chroma
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

load_dotenv()

persistent_directory = "db/chroma_db"
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
db = Chroma(persist_directory=persistent_directory, embedding_function=embeddings)
model = ChatOpenAI(model="gpt-4o")
chat_history = []

def ask_question(user_question):
    print(f"\n--- You asked: {user_question} ---")

    # Step 1: Rewrite question using history
    if chat_history:
        messages = [
            SystemMessage(content="""Given the chat history, rewrite the new question to be standalone and searchable.
Return ONLY the rewritten question in one sentence.
Do not add information, examples, or lists. Just rephrase the question."""),
        ] + chat_history + [
            HumanMessage(content=f"New question: {user_question}")
        ]
        result = model.invoke(messages)
        search_question = result.content.strip()
        print(f"Searching for: {search_question}")
    else:
        search_question = user_question

    # Step 2: Retrieve relevant chunks
    retriever = db.as_retriever(search_kwargs={"k": 3})
    docs = retriever.invoke(search_question)
    print(f"Found {len(docs)} relevant documents:")
    for i, doc in enumerate(docs, 1):
        lines = doc.page_content.split('\n')[:2]
        preview = '\n'.join(lines)
        print(f"  Doc {i}: {preview}...")

    # Step 3: Build prompt
    context = "\n".join([f"- {doc.page_content}" for doc in docs])
    combined_input = f"""Based on the following documents, please answer this question: {user_question}

Documents:
{context}

Please provide a clear, helpful answer using only the information from these documents. 
If you can't find the answer, say "I don't have enough information to answer that question based on the provided documents."
"""

    # Step 4: Get answer
    messages = [
        SystemMessage(content="You are a helpful assistant that answers questions based on provided documents and conversation history."),
    ] + chat_history + [
        HumanMessage(content=combined_input)
    ]
    result = model.invoke(messages)
    answer = result.content

    # Step 5: Save to history
    chat_history.append(HumanMessage(content=user_question))
    chat_history.append(AIMessage(content=answer))

    print(f"Answer: {answer}")
    return answer

def start_chat():
    print("Ask me questions! Type 'quit' or 'exit' to stop.")
    while True:
        question = input("\nYour question: ")
        if question.lower() in ["quit", "exit", "q"]:
            print("Goodbye!")
            break
        ask_question(question)

if __name__ == "__main__":
    start_chat()