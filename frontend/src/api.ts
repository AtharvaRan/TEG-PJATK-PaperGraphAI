// API client — all calls go through Vite's proxy to localhost:8000

export interface Status {
  chunks: number
  graph_nodes: number
  graph_edges: number
  files: number
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

// ── Upload ─────────────────────────────────────────────────────────────────────
export async function uploadFiles(files: File[]): Promise<UploadResult> {
  const form = new FormData()
  files.forEach(f => form.append('files', f))
  const r = await fetch('/api/upload', { method: 'POST', body: form })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

// ── Build graph ────────────────────────────────────────────────────────────────
export async function buildGraph(): Promise<{ nodes: number; edges: number }> {
  const r = await fetch('/api/build-graph', { method: 'POST' })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

// ── Library ───────────────────────────────────────────────────────────────────
export async function fetchLibrary(): Promise<LibraryFile[]> {
  const r = await fetch('/api/library')
  if (!r.ok) throw new Error('Failed to fetch library')
  const data = await r.json()
  return data.files
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
  onError: (err: string) => void
) {
  const body = {
    question,
    history: history.map(m => ({ role: m.role, content: m.content })),
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
