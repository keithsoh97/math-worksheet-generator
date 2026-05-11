'use client'
import { useState, useRef, useEffect } from 'react'

const DIFFICULTY_OPTIONS = [
  { val: 'easy', label: 'Easy only' },
  { val: 'mixed-easy', label: 'Mostly easy' },
  { val: 'mixed', label: 'Even mix' },
  { val: 'mixed-hard', label: 'Mostly hard' },
  { val: 'hard', label: 'Hard only' },
]

const LEVELS = [
  { val: 'Emath', label: 'E Math' },
  { val: 'Amath', label: 'A Math' },
]

const LAYOUT_OPTIONS = [
  { val: 'compact', label: 'Compact', sub: 'All together' },
  { val: '2pp', label: '2 per page', sub: 'Split evenly' },
  { val: '1pp', label: '1 per page', sub: 'Full page each' },
]

const SHEET_ID = '1OnBUAPbVgeiTchJXuYbOcjH3Dq95idgyfCiJYWXSMxc'

export default function Home() {
  const [level, setLevel] = useState('Amath')
  const [difficulty, setDifficulty] = useState('mixed-easy')
  const [extra, setExtra] = useState('')
  const [file, setFile] = useState(null)
  const [includeAnswers, setIncludeAnswers] = useState(false)
  const [layout, setLayout] = useState('compact')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [topicData, setTopicData] = useState({})
  const [topicsLoading, setTopicsLoading] = useState(true)
  const [activeTopic, setActiveTopic] = useState(null)
  const [queue, setQueue] = useState([])
  const [customText, setCustomText] = useState('')
  const fileRef = useRef()

  useEffect(() => {
    const fetchTopics = async () => {
      try {
        setTopicsLoading(true)
        const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`
        const res = await fetch(url)
        const csv = await res.text()
        const rows = csv.trim().split('\n').slice(1)
        const data = {}
        for (const row of rows) {
          const cols = row.match(/(".*?"|[^",\n]+|(?<=,)(?=,))/g) || row.split(',')
          const clean = cols.map(c => c ? c.replace(/^"|"$/g, '').trim() : '')
          const [lvl, topic, subtopic, desc, imageUrl] = clean
          if (!lvl || !topic || !subtopic) continue
          if (!data[lvl]) data[lvl] = {}
          if (!data[lvl][topic]) data[lvl][topic] = {}
          data[lvl][topic][subtopic] = { desc: desc || `${topic} — ${subtopic}`, imageUrl: imageUrl || '' }
        }
        setTopicData(data)
      } catch (e) {
        console.error('Failed to load topics:', e)
      } finally {
        setTopicsLoading(false)
      }
    }
    fetchTopics()
  }, [])

  useEffect(() => { setQueue([]); setActiveTopic(null) }, [level])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('worksheet_history')
      if (saved) setHistory(JSON.parse(saved))
    } catch {}
  }, [])

  const saveToHistory = (entry) => {
    try {
      const updated = [entry, ...history].slice(0, 50)
      setHistory(updated)
      localStorage.setItem('worksheet_history', JSON.stringify(updated))
    } catch {}
  }

  const clearHistory = () => { setHistory([]); localStorage.removeItem('worksheet_history') }

  const loadFromHistory = (entry) => {
    setLevel(entry.level); setDifficulty(entry.difficulty)
    setExtra(entry.extra || ''); setIncludeAnswers(entry.includeAnswers || false)
    setLayout(entry.layout || 'compact'); setQueue(entry.queue || [])
    setShowHistory(false)
  }

  const handleFile = (f) => {
    if (!f) return
    const allowed = ['image/jpeg','image/png','image/webp','image/gif','application/pdf',
      'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!allowed.includes(f.type)) { setError('Please upload an image, PDF, or Word document.'); return }
    setFile(f); setError('')
  }

  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }

  const addToQueue = (topic, subtopic, desc, imageUrl) => {
    const id = Date.now() + Math.random()
    setQueue(prev => [...prev, { id, topic, subtopic, desc, imageUrl: imageUrl || '', count: 5 }])
  }

  const addCustomToQueue = () => {
    if (!customText.trim()) return
    const id = Date.now() + Math.random()
    setQueue(prev => [...prev, { id, topic: '__custom__', subtopic: '', desc: customText.trim(), imageUrl: '', count: 5 }])
    setCustomText('')
  }

  const removeFromQueue = (id) => setQueue(prev => prev.filter(q => q.id !== id))

  const updateQueueCount = (id, count) => {
    setQueue(prev => prev.map(q => q.id === id ? { ...q, count: parseInt(count) || 1 } : q))
  }

  const totalQuestions = queue.reduce((sum, q) => sum + (parseInt(q.count) || 0), 0)
  const currentTopics = topicData[level] || {}
  const activeSubtopics = activeTopic && activeTopic !== '__custom__' ? currentTopics[activeTopic] || {} : {}

  const handleGenerate = async (fmt) => {
    if (queue.length === 0 && !file) { setError('Please add at least one topic to the queue.'); return }
    setLoading(true); setError(''); setStatus('Reading your input...')
    try {
      const formData = new FormData()
      formData.append('level', level); formData.append('difficulty', difficulty)
      formData.append('extra', extra)
      formData.append('includeAnswers', includeAnswers ? 'true' : 'false')
      formData.append('format', fmt); formData.append('layout', layout)
      formData.append('queue', JSON.stringify(queue))
      if (file) formData.append('file', file)
      setStatus('Generating questions with AI...')
      const res = await fetch('/api/generate', { method: 'POST', body: formData })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Something went wrong') }
      setStatus('Building your document...')
      const blob = await res.blob()
      const ext = fmt === 'pdf' ? 'pdf' : 'docx'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${level}_Worksheet.${ext}`; a.click()
      URL.revokeObjectURL(url)
      saveToHistory({ id: Date.now(), date: new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), level, difficulty, extra, includeAnswers, layout, queue })
      setStatus(`✓ Done! Your ${ext.toUpperCase()} has been downloaded.`)
    } catch (e) { setError(e.message); setStatus('') }
    setLoading(false)
  }

  const handleBoth = async () => {
    if (queue.length === 0 && !file) { setError('Please add at least one topic to the queue.'); return }
    setLoading(true); setError('')
    try {
      for (const fmt of ['docx', 'pdf']) {
        setStatus(`Generating ${fmt === 'docx' ? 'Word Doc' : 'PDF'}...`)
        const formData = new FormData()
        formData.append('level', level); formData.append('difficulty', difficulty)
        formData.append('extra', extra)
        formData.append('includeAnswers', includeAnswers ? 'true' : 'false')
        formData.append('format', fmt); formData.append('layout', layout)
        formData.append('queue', JSON.stringify(queue))
        if (file) formData.append('file', file)
        const res = await fetch('/api/generate', { method: 'POST', body: formData })
        if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Something went wrong') }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `${level}_Worksheet.${fmt}`; a.click()
        URL.revokeObjectURL(url)
      }
      saveToHistory({ id: Date.now(), date: new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), level, difficulty, extra, includeAnswers, layout, queue })
      setStatus('✓ Done! Both files downloaded.')
    } catch (e) { setError(e.message); setStatus('') }
    setLoading(false)
  }

  const diffLabel = { 'easy':'Easy only','mixed-easy':'Mostly easy','mixed':'Even mix','mixed-hard':'Mostly hard','hard':'Hard only' }

  const LayoutPreview = ({ val }) => {
    if (val === 'compact') return (
      <div className="w-10 h-14 border border-gray-300 rounded mx-auto mb-2 flex flex-col justify-start p-1 gap-0.5">
        {[80,90,70,85,75,88,72,80].map((w,i) => <div key={i} className="h-0.5 rounded bg-gray-300" style={{width:`${w}%`}}/>)}
      </div>
    )
    if (val === '2pp') return (
      <div className="w-10 h-14 border border-gray-300 rounded mx-auto mb-2 overflow-hidden">
        <div className="h-1/2 border-b border-dashed border-gray-300 flex flex-col justify-start p-1 gap-0.5">
          {[85,70,75].map((w,i) => <div key={i} className="h-0.5 rounded bg-gray-300" style={{width:`${w}%`}}/>)}
        </div>
        <div className="h-1/2 flex flex-col justify-start p-1 gap-0.5">
          {[85,70,75].map((w,i) => <div key={i} className="h-0.5 rounded bg-gray-300" style={{width:`${w}%`}}/>)}
        </div>
      </div>
    )
    return (
      <div className="w-10 h-14 border border-gray-300 rounded mx-auto mb-2 flex flex-col justify-start p-1 gap-0.5">
        {[85,70,75].map((w,i) => <div key={i} className="h-0.5 rounded bg-gray-300" style={{width:`${w}%`}}/>)}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto">

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Math Worksheet Generator</h1>
            <p className="text-sm text-gray-500 mt-1">Build your question queue, set counts, download as Word or PDF.</p>
          </div>
          <button onClick={() => setShowHistory(!showHistory)}
            className="relative flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-600">
            🕓 History
            {history.length > 0 && <span className="absolute -top-1.5 -right-1.5 bg-blue-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{history.length > 9 ? '9+' : history.length}</span>}
          </button>
        </div>

        {showHistory && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">Recent Worksheets</h2>
              {history.length > 0 && <button onClick={clearHistory} className="text-xs text-red-400 hover:text-red-600">Clear all</button>}
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No history yet!</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {history.map(entry => (
                  <button key={entry.id} onClick={() => loadFromHistory(entry)}
                    className="w-full text-left px-3 py-2.5 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-all group">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-800 group-hover:text-blue-700 leading-snug">
                          {entry.queue?.map(q => q.topic === '__custom__' ? 'Custom' : `${q.topic}${q.subtopic && q.subtopic !== 'Any subtopic' ? ` (${q.subtopic})` : ''}`).join(', ') || 'No topics'}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-gray-400">{entry.level}</span>
                          <span className="text-xs text-gray-300">·</span>
                          <span className="text-xs text-gray-400">{entry.queue?.reduce((s,q) => s+(parseInt(q.count)||0), 0)} Qs</span>
                          <span className="text-xs text-gray-300">·</span>
                          <span className="text-xs text-gray-400">{diffLabel[entry.difficulty]}</span>
                          {entry.includeAnswers && <span className="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full">+ Answers</span>}
                        </div>
                      </div>
                      <span className="text-xs text-gray-300 whitespace-nowrap shrink-0">{entry.date}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">

          {/* Level */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Level</label>
            <div className="grid grid-cols-2 gap-3">
              {LEVELS.map(l => (
                <button key={l.val} onClick={() => setLevel(l.val)}
                  className={`py-4 rounded-xl border-2 font-bold text-lg transition-all ${level === l.val ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-400 hover:border-gray-400 hover:text-gray-600'}`}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Difficulty Mix</label>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTY_OPTIONS.map(d => (
                <button key={d.val} onClick={() => setDifficulty(d.val)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${difficulty === d.val ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Topic Queue Builder */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Question Queue <span className="normal-case font-normal text-gray-400">— click topic → subtopic to add</span>
            </label>
            <div className="border border-gray-200 rounded-xl p-3">
              {topicsLoading ? (
                <p className="text-sm text-gray-400 text-center py-2">⏳ Loading topics...</p>
              ) : Object.keys(currentTopics).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-2">No topics found. Check your Google Sheet is set to public.</p>
              ) : (
                <>
                  {/* Step 1 topic chips */}
                  <p className="text-xs text-gray-400 mb-2">Step 1 — Select a topic:</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {Object.keys(currentTopics).map(topic => (
                      <button key={topic} onClick={() => setActiveTopic(activeTopic === topic ? null : topic)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${activeTopic === topic ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                        {topic}
                      </button>
                    ))}
                    <button onClick={() => setActiveTopic(activeTopic === '__custom__' ? null : '__custom__')}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border border-dashed transition-all ${activeTopic === '__custom__' ? 'bg-yellow-50 text-yellow-700 border-yellow-300' : 'bg-white text-gray-400 border-gray-300 hover:bg-yellow-50 hover:text-yellow-600 hover:border-yellow-300'}`}>
                      ✏️ Custom
                    </button>
                  </div>

                  {/* Step 2 subtopics */}
                  {activeTopic && activeTopic !== '__custom__' && (
                    <div className="bg-gray-50 rounded-xl p-3 mb-3">
                      <p className="text-xs text-gray-400 mb-2">Step 2 — Pick a subtopic to add to queue:</p>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => addToQueue(activeTopic, 'Any subtopic', activeTopic, '')}
                          className="px-3 py-1 rounded-full text-xs border bg-blue-50 text-blue-600 border-blue-200 font-medium hover:bg-blue-100">
                          + Any subtopic
                        </button>
                        {Object.entries(activeSubtopics).map(([sub, val]) => (
                          <button key={sub} onClick={() => addToQueue(activeTopic, sub, val.desc, val.imageUrl)}
                            className="px-3 py-1 rounded-full text-xs border border-dashed border-gray-300 bg-white text-gray-500 hover:bg-gray-100 transition-all">
                            + {sub}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Custom input */}
                  {activeTopic === '__custom__' && (
                    <div className="bg-yellow-50 rounded-xl p-3 mb-3 border border-yellow-200">
                      <p className="text-xs text-yellow-700 mb-2">Describe what you want:</p>
                      <textarea value={customText} onChange={e => setCustomText(e.target.value)}
                        placeholder="e.g. Quotient Rule with surds in numerator, requiring simplification..."
                        rows={2}
                        className="w-full border border-yellow-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none resize-none bg-white mb-2" />
                      <button onClick={addCustomToQueue}
                        className="px-4 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700">
                        + Add to queue
                      </button>
                    </div>
                  )}

                  {/* Queue list */}
                  {queue.length > 0 ? (
                    <div className="space-y-2 border-t border-gray-100 pt-3">
                      {queue.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">
                              {item.topic === '__custom__' ? '✏️ Custom' : item.topic}
                            </p>
                            <p className="text-xs text-blue-600 truncate">
                              {item.topic === '__custom__' ? item.desc : item.subtopic}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-xs text-gray-400">Qs:</span>
                            <input type="number" min={1} max={20} value={item.count}
                              onChange={e => updateQueueCount(item.id, e.target.value)}
                              className="w-12 border border-gray-200 rounded-lg px-1.5 py-1 text-sm text-center focus:outline-none focus:border-gray-400" />
                          </div>
                          <button onClick={() => removeFromQueue(item.id)}
                            className="text-gray-300 hover:text-red-400 text-xl leading-none shrink-0">×</button>
                        </div>
                      ))}
                      <div className="flex items-center justify-between bg-blue-50 rounded-xl px-3 py-2">
                        <span className="text-xs text-blue-600">Total questions</span>
                        <span className="text-sm font-bold text-blue-700">{totalQuestions} across {queue.length} section{queue.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-300 text-center py-2 border-t border-gray-100 pt-3">
                      Queue is empty — select a topic and subtopic above to add
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Remarks <span className="normal-case font-normal text-gray-400">(optional — applies to all sections)</span>
            </label>
            <textarea value={extra} onChange={e => setExtra(e.target.value)}
              placeholder="e.g. Avoid negative coefficients. Keep denominators simple."
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-gray-400 resize-none" />
          </div>

          {/* Upload */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Upload Sample <span className="normal-case font-normal text-gray-400">(image, PDF, Word — optional)</span>
            </label>
            <div onClick={() => fileRef.current.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${dragOver ? 'border-blue-400 bg-blue-50' : file ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}>
              <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx" onChange={e => handleFile(e.target.files[0])} />
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-green-600 text-sm font-medium">✓ {file.name}</span>
                  <button onClick={e => { e.stopPropagation(); setFile(null) }} className="text-xs text-gray-400 hover:text-red-400 ml-2">Remove</button>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-400">Drag & drop or click to upload</p>
                  <p className="text-xs text-gray-300 mt-1">JPG, PNG, PDF, DOC, DOCX · Handwritten OK</p>
                </div>
              )}
            </div>
          </div>

          {/* Page Layout */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Page Layout</label>
            <div className="grid grid-cols-3 gap-3">
              {LAYOUT_OPTIONS.map(l => (
                <button key={l.val} onClick={() => setLayout(l.val)}
                  className={`rounded-xl border-2 py-3 px-2 text-center transition-all ${layout === l.val ? 'border-gray-900 bg-gray-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                  <LayoutPreview val={l.val} />
                  <p className={`text-xs font-medium ${layout === l.val ? 'text-gray-900' : 'text-gray-500'}`}>{l.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{l.sub}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Answer Key Toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-700">Include Answer Key</p>
              <p className="text-xs text-gray-400 mt-0.5">Answers added on a separate page after questions</p>
            </div>
            <button onClick={() => setIncludeAnswers(!includeAnswers)}
              className={`relative w-11 h-6 rounded-full transition-all ${includeAnswers ? 'bg-blue-500' : 'bg-gray-200'}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${includeAnswers ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {status && (
            <p className={`text-sm px-3 py-2 rounded-lg ${status.startsWith('✓') ? 'text-green-700 bg-green-50' : 'text-blue-600 bg-blue-50'}`}>
              {!status.startsWith('✓') && <span className="inline-block mr-2 animate-spin">⏳</span>}
              {status}
            </p>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => handleGenerate('docx')} disabled={loading}
              className="py-3 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              ↓ Word Doc
            </button>
            <button onClick={() => handleGenerate('pdf')} disabled={loading}
              className="py-3 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              ↓ PDF
            </button>
            <button onClick={handleBoth} disabled={loading}
              className="py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              ↓ Both
            </button>
          </div>

        </div>
        <p className="text-center text-xs text-gray-400 mt-4">Powered by Claude AI · For tuition use</p>
      </div>
    </div>
  )
}
