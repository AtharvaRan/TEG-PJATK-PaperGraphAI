// API client — all calls go through Vite's proxy to localhost:8000

export interface Status {
  chunks: number
  graph_nodes: number
  graph_edges: number
  files: number
}

export interface UsageStats {
  session_started_at: number
  questions_asked: number
  input_tokens_est: number
  output_tokens_est: number
  total_tokens_est: number
  last_question_at: number | null
}

export interface UploadResult {
  files: string[]
  chunks: number
  parser: string
  categories: Record<string, number>
  message: string
}

export interface LibraryFile {
  name: string
  chunks: number
  categories: Record<string, number>
  parser: string
}

export interface GraphData {
  nodes: { id: string; label: string }[]
  edges: { source: string; target: string; label: string }[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  graph?: string
  streaming?: boolean
  scopedTo?: string   // user-message: filename when @mention scoped this question
}

export interface CompareResult {
  rag:      { answer: string; sources: string[] }
  graphrag: { answer: string; sources: string[]; graph: string }
}

// ── Status ────────────────────────────────────────────────────────────────────
export async function fetchStatus(): Promise<Status> {
  const r = await fetch('/api/status')
  if (!r.ok) throw new Error('Failed to fetch status')
  return r.json()
}

export async function fetchUsage(): Promise<UsageStats> {
  const r = await fetch('/api/usage')
  if (!r.ok) throw new Error('Failed to fetch usage stats')
  return r.json()
}

// ── Upload (SSE streaming with progress) ─────────────────────────────────────
export interface UploadProgress {
  stage: 'parsing' | 'embedding' | 'graph'
  pct: number
  detail: string
}

export async function streamUpload(
  files: File[],
  onProgress: (p: UploadProgress) => void,
  onDone: (result: UploadResult & { graph_nodes: number; graph_edges: number }) => void,
  onError: (err: string) => void,
) {
  const form = new FormData()
  files.forEach(f => form.append('files', f))

  let response: Response
  try {
    response = await fetch('/api/upload', { method: 'POST', body: form })
  } catch {
    onError('Cannot reach the API server.')
    return
  }
  if (!response.ok) {
    onError(`Upload failed: ${response.status}`)
    return
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const data = JSON.parse(line.slice(6))
        if (data.type === 'progress') onProgress(data as UploadProgress)
        if (data.type === 'done') onDone(data)
      } catch { /* ignore */ }
    }
  }
}

// ── Build graph ────────────────────────────────────────────────────────────────
export async function buildGraph(): Promise<{ nodes: number; edges: number }> {
  const r = await fetch('/api/build-graph', { method: 'POST' })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export interface GraphBuildStatus {
  running: boolean
  progress: number
  total: number
  done: boolean
  graph_nodes: number
  graph_edges: number
  pending_chunks: number
  total_chunks: number
  processed_chunks: number
}

export async function fetchGraphBuildStatus(): Promise<GraphBuildStatus> {
  const r = await fetch('/api/graph-build-status')
  if (!r.ok) throw new Error('Failed to fetch graph build status')
  return r.json()
}

// ── Library ───────────────────────────────────────────────────────────────────
export async function fetchLibrary(): Promise<LibraryFile[]> {
  const r = await fetch('/api/library')
  if (!r.ok) throw new Error('Failed to fetch library')
  const data = await r.json()
  return data.files
}

export async function deletePaper(filename: string): Promise<void> {
  const r = await fetch(`/api/library/${encodeURIComponent(filename)}`, { method: 'DELETE' })
  if (!r.ok) throw new Error(await r.text() || 'Failed to delete paper')
}

// ── Graph data ─────────────────────────────────────────────────────────────────
export async function fetchGraphData(): Promise<GraphData> {
  const r = await fetch('/api/graph')
  if (!r.ok) throw new Error('Failed to fetch graph')
  return r.json()
}

// ── Chat (streaming) ──────────────────────────────────────────────────────────
export async function streamChat(
  question: string,
  history: ChatMessage[],
  onToken: (token: string) => void,
  onDone: (sources: string[], graph: string) => void,
  onError: (err: string) => void,
  selectedPaper: string | string[] | null = null,
) {
  const body = {
    question,
    history: history.map(m => ({ role: m.role, content: m.content })),
    selected_paper: selectedPaper,
  }

  let response: Response
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e) {
    onError('Cannot reach the API server. Is it running?')
    return
  }

  if (!response.ok) {
    onError(`Server error: ${response.status}`)
    return
  }

  const reader  = response.body!.getReader()
  const decoder = new TextDecoder()
  let   buffer  = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''  // keep incomplete line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const data = JSON.parse(line.slice(6))
        if (data.type === 'token') onToken(data.content)
        if (data.type === 'done')  onDone(data.sources ?? [], data.graph ?? '')
      } catch { /* ignore malformed */ }
    }
  }
}

// ── Compare ───────────────────────────────────────────────────────────────────
export async function compareAnswers(question: string): Promise<CompareResult> {
  const r = await fetch('/api/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}
