import json, pytest
from pathlib import Path
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

# Prevent real DB/model init at import time
with patch("api._startup_dedup"):
    from api import app, estimate_tokens, _is_near_dupe, _format_chunks

client = TestClient(app)

# ── Pure unit tests (no mocks needed) ─────────────────────────────────────────

def test_estimate_tokens():
    assert estimate_tokens("") == 0         # empty → 0 (intentional sentinel)
    assert estimate_tokens("hello") == 1    # 5 chars → 1 token
    assert estimate_tokens("a" * 400) == 100

def test_is_near_dupe_exact_substring():
    assert _is_near_dupe("foo bar", ["this is foo bar baz"]) is True

def test_is_near_dupe_distinct():
    assert _is_near_dupe("transformers architecture", ["gradient descent"]) is False

def test_format_chunks():
    out = _format_chunks(["some text"], ["paper.pdf"])
    assert "[paper]" in out
    assert "some text" in out

# ── Endpoint smoke tests ───────────────────────────────────────────────────────

@patch("api.get_db")
@patch("api.load_graph")
def test_status_endpoint(mock_graph, mock_db):
    mock_db.return_value._collection.count.return_value = 42
    mock_db.return_value._collection.get.return_value = {"metadatas": [{"source": "a.pdf"}]}
    mock_graph.return_value = None
    r = client.get("/api/status")
    assert r.status_code == 200
    assert r.json()["chunks"] == 42

def test_usage_endpoint():
    r = client.get("/api/usage")
    assert r.status_code == 200
    assert "questions_asked" in r.json()

@patch("api.get_db")
@patch("api.load_graph")
def test_graph_build_status(mock_graph, mock_db):
    mock_db.return_value._collection.count.return_value = 10
    mock_graph.return_value = None
    r = client.get("/api/graph-build-status")
    assert r.status_code == 200
    assert "pending_chunks" in r.json()

@patch("api.pipeline")
@patch("api.get_model")
def test_chat_endpoint(mock_model, mock_pipeline):
    mock_pipeline.invoke.return_value = {
        "answer": "RAG is retrieval-augmented generation.",
        "chat_history": [],
        "chunks": ["some chunk"],
        "chunk_sources": ["paper.pdf"],
        "graph_context": "",
    }

    # astream is an async generator — simulate one token chunk
    async def fake_astream(_):
        chunk = MagicMock()
        chunk.content = "RAG is retrieval-augmented generation."
        yield chunk

    mock_model.return_value.astream.side_effect = fake_astream

    r = client.post("/api/chat", json={"question": "What is RAG?", "history": []})
    assert r.status_code == 200