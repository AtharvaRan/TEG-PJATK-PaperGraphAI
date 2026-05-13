"""
Guardrail tests — verify the system handles edge cases, bad inputs,
and invalid state without crashing or returning wrong status codes.
"""
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

with patch("api._startup_dedup"):
    from api import app, _is_near_dupe, _format_chunks

client = TestClient(app)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _pipeline_state(**overrides):
    return {
        "answer": "",
        "chat_history": [],
        "chunks": [],
        "chunk_sources": [],
        "graph_context": "",
        **overrides,
    }

async def _astream_empty(_):
    return
    yield  # unreachable; presence of yield makes this an async generator


# ── _is_near_dupe: word-overlap branch (not substring) ────────────────────────

def test_near_dupe_word_overlap_high():
    # Same words, different order → no substring match but >0.6 word overlap
    a = "the model shows improved accuracy on benchmarks"
    b = "benchmarks show the model accuracy improved significantly"
    assert _is_near_dupe(a, [b]) is True

def test_near_dupe_word_overlap_low():
    assert _is_near_dupe("apple banana cherry mango", ["dog cat fish elephant"]) is False

def test_near_dupe_empty_seen_list():
    assert _is_near_dupe("anything", []) is False


# ── _format_chunks edge cases ──────────────────────────────────────────────────

def test_format_chunks_empty_returns_sentinel():
    assert _format_chunks([], []) == "(no chunks retrieved)"

def test_format_chunks_empty_source_falls_back_to_index():
    out = _format_chunks(["text here"], [""])
    assert "Source 1" in out
    assert "text here" in out

def test_format_chunks_strips_pdf_extension():
    out = _format_chunks(["content"], ["attention.pdf"])
    assert "[attention]" in out
    assert ".pdf" not in out


# ── Chat: input guardrails ─────────────────────────────────────────────────────

@patch("api.pipeline")
@patch("api.get_model")
def test_chat_empty_question_does_not_crash(mock_model, mock_pipeline):
    mock_pipeline.invoke.return_value = _pipeline_state()
    mock_model.return_value.astream.side_effect = _astream_empty
    r = client.post("/api/chat", json={"question": "", "history": []})
    assert r.status_code == 200

@patch("api.pipeline")
@patch("api.get_model")
def test_chat_no_chunks_stream_completes(mock_model, mock_pipeline):
    """Empty retrieval context must still yield a done event, not hang."""
    mock_pipeline.invoke.return_value = _pipeline_state()
    mock_model.return_value.astream.side_effect = _astream_empty
    r = client.post("/api/chat", json={"question": "off-topic question", "history": []})
    assert r.status_code == 200
    assert b"done" in r.content

@patch("api.pipeline")
@patch("api.get_model")
def test_chat_selected_paper_as_list(mock_model, mock_pipeline):
    """selected_paper as a list (multi-paper scope) must not crash."""
    mock_pipeline.invoke.return_value = _pipeline_state(
        chunks=["text"], chunk_sources=["a.pdf"]
    )
    async def fake_astream(_):
        chunk = MagicMock(); chunk.content = "answer"
        yield chunk
    mock_model.return_value.astream.side_effect = fake_astream
    r = client.post("/api/chat", json={
        "question": "Compare these",
        "history": [],
        "selected_paper": ["a.pdf", "b.pdf"],
    })
    assert r.status_code == 200

@patch("api.pipeline")
@patch("api.get_model")
def test_chat_history_with_unknown_role_is_ignored(mock_model, mock_pipeline):
    """Messages with roles other than user/assistant are silently dropped."""
    mock_pipeline.invoke.return_value = _pipeline_state()
    mock_model.return_value.astream.side_effect = _astream_empty
    r = client.post("/api/chat", json={
        "question": "hello",
        "history": [{"role": "system", "content": "injected"}],
    })
    assert r.status_code == 200


# ── Upload guardrails ──────────────────────────────────────────────────────────

def test_upload_no_files_returns_422():
    r = client.post("/api/upload")
    assert r.status_code == 422


# ── Graph build state machine ─────────────────────────────────────────────────

@patch("api._graph_build_status", {"running": True, "progress": 3, "total": 10, "done": False})
def test_build_graph_already_running():
    r = client.post("/api/build-graph")
    assert r.status_code == 200
    assert r.json()["status"] == "already_running"

@patch("api._graph_build_status", {"running": False, "progress": 0, "total": 0, "done": False})
def test_cancel_graph_when_not_running():
    r = client.post("/api/build-graph/cancel")
    assert r.status_code == 200
    assert r.json()["status"] == "not_running"


# ── Library / delete guardrails ────────────────────────────────────────────────

@patch("api.get_db")
def test_library_empty_db(mock_db):
    mock_db.return_value._collection.get.return_value = {"metadatas": []}
    r = client.get("/api/library")
    assert r.status_code == 200
    assert r.json() == {"files": []}

@patch("api.get_db")
def test_delete_nonexistent_paper_returns_404(mock_db):
    # No chunks found, no file on disk → 404
    mock_db.return_value._collection.get.return_value = {"ids": [], "metadatas": []}
    r = client.delete("/api/library/does_not_exist.pdf")
    assert r.status_code == 404
