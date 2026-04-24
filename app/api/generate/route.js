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
    const includeAnswers = formData.get('includeAnswers') === 'true'
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

OUTPUT FORMAT — Markdown with LaTeX math. Follow these rules exactly:

1. Number each question: "1.", "2." etc.
2. Leave a blank line between questions.
3. Write ALL math using inline LaTeX $...$ only — do NOT use $$...$$ display blocks.
4. For fractions use \\dfrac{numerator}{denominator} e.g. $\\dfrac{x+1}{2}$
5. For square roots use \\sqrt{...}
6. For powers use ^{...} e.g. x^{2}, (2x+1)^{3}
7. For whole fraction raised to a power: ${'{'}\\left(\\dfrac{a}{b}\\right)^{2}{'}'}
8. BRACKET NESTING ORDER — innermost to outermost: ( ) then [ ] then { }
   - Use \\left( \\right) for innermost brackets
   - Use \\left[ \\right] for next level
   - Use \\left\\{ \\right\\} for outermost
9. Always use \\left and \\right before every bracket so they auto-size correctly.
10. For multiplication between fractions use \\times
11. Do NOT include answers in the questions section.
12. Output ONLY the numbered questions in Markdown+LaTeX — no preamble, no headers, no explanation.

${includeAnswers ? `AFTER all ${count} questions, add this EXACTLY on its own line:
\\newpage
## Answer Key
Then list answers numbered 1 to ${count}. Rules for answers:
- Final answer ONLY — no working steps, no explanation
- Use the same inline LaTeX $...$ formatting
- Keep each answer on one line` : ''}`

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

    const fullMarkdown = `# ${level}\n\n${markdownText}`

    const id = Date.now()
    const mdPath = join(tmpdir(), `worksheet_${id}.md`)
    const docxPath = join(tmpdir(), `worksheet_${id}.docx`)
    const docxFinalPath = join(tmpdir(), `worksheet_final_${id}.docx`)
    const pyPath = join(tmpdir(), `fix_spacing_${id}.py`)

    writeFileSync(mdPath, fullMarkdown, 'utf8')

    // Step 1: pandoc converts markdown to docx
    await execAsync(`pandoc "${mdPath}" -o "${docxPath}" --mathml`)

    // Step 2: Python post-processor fixes spacing (360 twips = 0.25 inch)
    const pyScript = `
import zipfile, shutil, os, re

unzip_dir = '/tmp/docx_${id}'
if os.path.exists(unzip_dir):
    shutil.rmtree(unzip_dir)
with zipfile.ZipFile('${docxPath}', 'r') as z:
    z.extractall(unzip_dir)

doc_path = os.path.join(unzip_dir, 'word', 'document.xml')
with open(doc_path, 'r', encoding='utf-8') as f:
    content = f.read()

def replace_spacing(m):
    ppr = m.group(0)
    ppr = re.sub(r'<w:spacing[^/]*/>', '', ppr)
    ppr = re.sub(r'<w:spacing[^>]*>.*?</w:spacing>', '', ppr, flags=re.DOTALL)
    ppr = ppr.replace('</w:pPr>', '<w:spacing w:after="360"/></w:pPr>')
    return ppr

content = re.sub(r'<w:pPr>.*?</w:pPr>', replace_spacing, content, flags=re.DOTALL)

with open(doc_path, 'w', encoding='utf-8') as f:
    f.write(content)

with zipfile.ZipFile('${docxFinalPath}', 'w', zipfile.ZIP_DEFLATED) as zout:
    for root, dirs, files in os.walk(unzip_dir):
        for file in files:
            filepath = os.path.join(root, file)
            arcname = os.path.relpath(filepath, unzip_dir)
            zout.write(filepath, arcname)

shutil.rmtree(unzip_dir)
print('spacing done')
`
    writeFileSync(pyPath, pyScript, 'utf8')
    await execAsync(`python3 "${pyPath}"`)

    const buffer = readFileSync(docxFinalPath)

    // Cleanup
    try {
      unlinkSync(mdPath)
      unlinkSync(docxPath)
      unlinkSync(docxFinalPath)
      unlinkSync(pyPath)
    } catch {}

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
