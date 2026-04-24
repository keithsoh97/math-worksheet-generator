import Anthropic from '@anthropic-ai/sdk'
import { Document, Packer, Paragraph, TextRun } from 'docx'

const DIFFICULTY_LABELS = {
  'easy': 'easy only — suitable for students just learning the concept',
  'mixed-easy': 'mostly easy (70% easy, 30% medium)',
  'mixed': 'even mix of easy, medium, and hard',
  'mixed-hard': 'mostly hard (30% medium, 70% hard)',
  'hard': 'hard exam-level questions only',
}

function buildDocx(questionsText, level, topic) {
  const lines = questionsText.split('\n')
  const children = []

  children.push(new Paragraph({
    children: [new TextRun({ text: level, font: 'Arial', size: 20, color: '888888' })],
    spacing: { after: 60 }
  }))
  children.push(new Paragraph({
    children: [new TextRun({ text: topic || 'Practice Worksheet', font: 'Arial', size: 32, bold: true })],
    spacing: { after: 400 }
  }))

  for (const line of lines) {
    const isEmpty = line.trim() === ''
    children.push(new Paragraph({
      children: [new TextRun({
        text: line,
        font: line.includes('─') ? 'Courier New' : 'Arial',
        size: 24,
      })],
      spacing: { after: isEmpty ? 120 : 60 },
    }))
  }

  return new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      children
    }]
  })
}

export async function POST(req) {
  try {
    const formData = await req.formData()

    const level = formData.get('level') || 'O-Level A Math'
    const count = formData.get('count') || '10'
    const difficulty = formData.get('difficulty') || 'mixed'
    const extra = formData.get('extra') || ''
    const description = formData.get('description') || ''
    const file = formData.get('file')

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const messageContent = []

    if (file && file.size > 0) {
      const arrayBuffer = await file.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      const mime = file.type

      if (mime.startsWith('image/')) {
        const validMime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mime)
          ? mime : 'image/jpeg'
        messageContent.push({
          type: 'image',
          source: { type: 'base64', media_type: validMime, data: base64 }
        })
      } else if (mime === 'application/pdf') {
        messageContent.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 }
        })
      }
    }

    const systemPrompt = `You are a Singapore math tuition teacher generating practice questions for ${level} students.

Generate exactly ${count} numbered math practice questions.
Difficulty: ${DIFFICULTY_LABELS[difficulty] || 'even mix'}.
${extra ? `Extra instructions: ${extra}` : ''}

CRITICAL FRACTION FORMATTING RULES:
- Always display fractions in stacked form using this EXACT style:
     3x² + 2
     ────────
      x − 1
- Use ─ (U+2500) characters repeated for the bar, long enough to span numerator/denominator
- Use superscripts ² ³ ⁴ for powers
- Use √ for square roots e.g. √(3x+1)
- Use × for multiplication
- Leave ONE blank line between each question
- Number questions: 1.  2.  3. etc
- Do NOT include answers
- Output ONLY the numbered questions — no preamble, no headers, no explanation`

    const userText = description
      ? `${description}\n\nGenerate ${count} questions as described.`
      : `Generate ${count} math practice questions for ${level} based on the uploaded sample.`

    messageContent.push({ type: 'text', text: userText })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: messageContent }]
    })

    const questionsText = response.content.find(b => b.type === 'text')?.text || ''
    if (!questionsText) throw new Error('No questions generated')

    const topic = description?.slice(0, 60) || 'Practice Worksheet'
    const doc = buildDocx(questionsText, level, topic)
    const buffer = await Packer.toBuffer(doc)

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="worksheet.docx"',
      }
    })

  } catch (err) {
    console.error(err)
    return Response.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
