'use client'
import { useState, useRef } from 'react'

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

export default function Home() {
  const [level, setLevel] = useState('O-Level A Math')
  const [count, setCount] = useState(10)
  const [difficulty, setDifficulty] = useState('mixed-easy')
  const [extra, setExtra] = useState('')
  const [file, setFile] = useState(null)
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()

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
      if (file) formData.append('file', file)

      setStatus('Generating questions with AI...')
      const res = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
      })

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
      setStatus('✓ Done! Your worksheet has been downloaded.')
    } catch (e) {
      setError(e.message)
      setStatus('')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Math Worksheet Generator</h1>
          <p className="text-sm text-gray-500 mt-1">Upload sample questions or describe what you want — get a Word doc instantly.</p>
        </div>

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
                    difficulty === d.val
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
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
            <div
              onClick={() => fileRef.current.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                dragOver ? 'border-blue-400 bg-blue-50' : file ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}>
              <input ref={fileRef} type="file" className="hidden"
                accept="image/*,.pdf,.doc,.docx"
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
                  <p className="text-xs text-gray-300 mt-1">JPG, PNG, PDF, DOC, DOCX • Handwritten OK</p>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Description / Instructions
            </label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Generate similar questions to the uploaded worksheet. Focus on quotient rule with surds in the numerator."
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-gray-400 resize-none" />
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
            {loading ? 'Generating...' : 'Generate Word Doc ↓'}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">Powered by Claude AI · For tuition use</p>
      </div>
    </div>
  )
}
