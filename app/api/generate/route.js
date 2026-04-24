import Anthropic from '@anthropic-ai/sdk'
import { writeFileSync, readFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const DIFFICULTY_LABELS = {
  'easy': 'easy only — suitable for students just learning the concept',
  'mixed-easy': 'mostly easy (70% easy, 30% medium)',
  'mixed': 'even mix of easy, medium, and hard',
  'mixed-hard': 'mostly hard (30% medium, 70% hard)',
  'hard': 'hard exam-level questions only',
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

    // Attach uploaded file if present
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

OUTPUT FORMAT — Markdown with LaTeX math. Follow these rules exactly:

1. Number each question: "1.", "2." etc.
2. Leave a blank line between questions.
3. Write all math expressions using LaTeX inside $...$ (inline) or $$...$$ (display/block).
4. For fractions always use \\dfrac{numerator}{denominator} inside display math $$ $$.
5. For square roots use \\sqrt{...}
6. For powers use ^{...} e.g. x^{2}, (2x+1)^{3}
7. For the whole fraction raised to a power: {\\left(\\dfrac{a}{b}\\right)^{2}}
8. BRACKET NESTING ORDER — innermost to outermost: ( ) then [ ] then { }
   - Use \\left( \\right) for innermost
   - Use \\left[ \\right] for next level
   - Use \\left\\{ \\right\\} for outermost
9. Always use \\left and \\right before every bracket so they auto-size correctly.
10. For multiplication between fractions use \\times
11. Do NOT include answers.
12. Output ONLY the numbered questions in Markdown+LaTeX — no preamble, no headers, no explanation.`

    const userText = description
      ? `${description}\n\nGenerate ${count} questions as described.`
      : `Generate ${count} math practice questions for ${level} based on the uploaded sample.`

    messageContent.push({ type: 'text', text: userText })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: messageContent }]
    })

    const markdownText = response.content.find(b => b.type === 'text')?.text || ''
    if (!markdownText) throw new Error('No questions generated')

    // Add title header to markdown
    const topic = description?.slice(0, 60) || 'Practice Worksheet'
    const fullMarkdown = `# ${level}\n\n## ${topic}\n\n${markdownText}`

    // Write markdown to temp file
    const id = Date.now()
    const mdPath = join(tmpdir(), `worksheet_${id}.md`)
    const docxPath = join(tmpdir(), `worksheet_${id}.docx`)

    writeFileSync(mdPath, fullMarkdown, 'utf8')

    // Convert with pandoc using mathml for Word equation compatibility
    await execAsync(`pandoc "${mdPath}" -o "${docxPath}" --mathml`)

    const buffer = readFileSync(docxPath)

    // Cleanup temp files
    try { unlinkSync(mdPath); unlinkSync(docxPath) } catch {}

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${level.replace(/\s+/g,'-')}_Worksheet.docx"`,
      }
    })

  } catch (err) {
    console.error(err)
    return Response.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
