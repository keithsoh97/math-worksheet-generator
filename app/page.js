'use client'
import { useState, useRef, useEffect } from 'react'

const DIFFICULTY_OPTIONS = [
  { val: 'easy', label: 'Easy only' },
  { val: 'mixed-easy', label: 'Mostly easy' },
  { val: 'mixed', label: 'Even mix' },
  { val: 'mixed-hard', label: 'Mostly hard' },
  { val: 'hard', label: 'Hard only' },
]

const LEVEL_OPTIONS = [
  'O-Level E Math',
  'O-Level A Math',
  'A-Level H2 Math',
]

const TOPIC_CHIPS = [
  'Differentiation — Quotient Rule',
  'Differentiation — Product Rule',
  'Differentiation — Chain Rule',
  'Differentiation — Trigo',
  'Integration — Reverse Chain Rule',
  'Integration — Trigo',
  'Algebra — Factorisation',
  'Algebra — Algebraic Fractions',
  'Quadratic Equations',
  'Surds',
]

export default function Home() {
  const [level, setLevel] = useState('O-Level A Math')
  const [count, setCount] = useState(10)
  const [difficulty, setDifficulty] = useState('mixed-easy')
  const [extra, setExtra] = useState('')
  const [file, setFile] = useState(null)
  const [description, setDescription] = useState('')
  const [includeAnswers, setIncludeAnswers] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const fileRef = useRef()

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('worksheet_history')
      if (saved) setHistory(JSON.parse(saved))
    } catch {}
  }, [])

  const saveToHistory = (entry) => {
    try {
      const updated = [entry, ...history].slice(0, 50) // keep last 50
      setHistory(updated)
      localStorage.setItem('worksheet_history', JSON.stringify(updated))
    } catch {}
  }

  const clearHistory = () => {
    setHistory([])
    localStorage.removeItem('worksheet_history')
  }

  const loadFromHistory = (entry) => {
    setLevel(entry.level)
    setCount(entry.count)
    setDifficulty(entry.difficulty)
    setDescription(entry.description)
    setExtra(entry.extra || '')
    setIncludeAnswers(entry.includeAnswers || false)
    setShowHistory(false)
  }

  const handleFile = (f) => {
    if (!f) return
    const allowed = ['image/jpeg','image/png','image/webp','image/gif','application/pdf',
      'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!allowed.includes(f.type)) {
      setError('Please upload an image, PDF, or Word document.')
      return
    }
    setFile(f)
    setError('')
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }

  const handleGenerate = async () => {
    if (!description.trim() && !file) {
      setError('Please provide a description or upload a sample file.')
      return
    }
    setLoading(true)
    setError('')
    setStatus('Reading your input...')

    try {
      const formData = new FormData()
      formData.append('level', level)
      formData.append('count', count)
      formData.append('difficulty', difficulty)
      formData.append('extra', extra)
      formData.append('description', description)
      formData.append('includeAnswers', includeAnswers ? 'true' : 'false')
      if (file) formData.append('file', file)

      setStatus('Generating questions with AI...')
      const res = await fetch('/api/generate', { method: 'POST', body: formData })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Something went wrong')
      }

      setStatus('Building your Word document...')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${level.replace(/\s+/g,'-')}_Worksheet.docx`
      a.click()
      URL.revokeObjectURL(url)

      // Save to history
      saveToHistory({
        id: Date.now(),
        date: new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        level,
        count,
        difficulty,
        description,
        extra,
        includeAnswers,
      })

      setStatus('✓ Done! Your worksheet has been downloaded.')
    } catch (e) {
      setError(e.message)
      setStatus('')
    }
    setLoading(false)
  }

  const diffLabel = {
    'easy': 'Easy only',
    'mixed-easy': 'Mostly easy',
    'mixed': 'Even mix',
    'mixed-hard': 'Mostly hard',
    'hard': 'Hard only',
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Math Worksheet Generator</h1>
            <p className="text-sm text-gray-500 mt-1">Upload sample questions or describe what you want — get a Word doc instantly.</p>
          </div>
          <button onClick={() => setShowHistory(!showHistory)}
            className="relative flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-600">
            🕓 History
            {history.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-blue-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{history.length > 9 ? '9+' : history.length}</span>
            )}
          </button>
        </div>

        {/* History Panel */}
        {showHistory && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">Recent Worksheets</h2>
              {history.length > 0 && (
                <button onClick={clearHistory} className="text-xs text-red-400 hover:text-red-600">Clear all</button>
              )}
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No history yet — generate your first worksheet!</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {history.map(entry => (
                  <button key={entry.id} onClick={() => loadFromHistory(entry)}
                    className="w-full text-left px-3 py-2.5 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-all group">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-800 group-hover:text-blue-700 leading-snug">{entry.description?.slice(0, 60) || 'No description'}{entry.description?.length > 60 ? '…' : ''}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-gray-400">{entry.level}</span>
                          <span className="text-xs text-gray-300">·</span>
                          <span className="text-xs text-gray-400">{entry.count} Qs</span>
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

          {/* Level + Count */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Level</label>
              <select value={level} onChange={e => setLevel(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-gray-400">
                {LEVEL_OPTIONS.map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">No. of Questions</label>
              <input type="number" min={1} max={30} value={count} onChange={e => setCount(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-gray-400" />
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Difficulty Mix</label>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTY_OPTIONS.map(d => (
                <button key={d.val} onClick={() => setDifficulty(d.val)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    difficulty === d.val ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                  }`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Upload */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Upload Sample Questions <span className="normal-case font-normal">(image, PDF, or Word doc)</span>
            </label>
            <div onClick={() => fileRef.current.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                dragOver ? 'border-blue-400 bg-blue-50' : file ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}>
              <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx"
                onChange={e => handleFile(e.target.files[0])} />
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-green-600 text-sm font-medium">✓ {file.name}</span>
                  <button onClick={e => { e.stopPropagation(); setFile(null) }}
                    className="text-xs text-gray-400 hover:text-red-400 ml-2">Remove</button>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-400">Drag & drop or click to upload</p>
                  <p className="text-xs text-gray-300 mt-1">JPG, PNG, PDF, DOC, DOCX · Handwritten OK</p>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Description / Instructions</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Differentiation using Quotient Rule with trigo functions in numerator"
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-gray-400 resize-none" />
            {/* Topic chips */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {TOPIC_CHIPS.map(t => (
                <button key={t} onClick={() => setDescription(t)}
                  className="text-xs px-2.5 py-1 rounded-full border border-dashed border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-all">
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Extra */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Extra Instructions <span className="normal-case font-normal">(optional)</span>
            </label>
            <textarea value={extra} onChange={e => setExtra(e.target.value)}
              placeholder="e.g. Avoid negative coefficients. Keep denominators simple."
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-gray-400 resize-none" />
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

          {/* Error */}
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          {/* Status */}
          {status && (
            <p className={`text-sm px-3 py-2 rounded-lg ${status.startsWith('✓') ? 'text-green-700 bg-green-50' : 'text-blue-600 bg-blue-50'}`}>
              {!status.startsWith('✓') && <span className="inline-block mr-2 animate-spin">⏳</span>}
              {status}
            </p>
          )}

          {/* Button */}
          <button onClick={handleGenerate} disabled={loading}
            className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            {loading ? 'Generating...' : `Generate Word Doc ${includeAnswers ? '(with Answers)' : ''} ↓`}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">Powered by Claude AI · For tuition use</p>
      </div>
    </div>
  )
}
