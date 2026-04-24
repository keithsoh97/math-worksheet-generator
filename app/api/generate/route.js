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
7. For whole fraction raised to a power: {\\left(\\dfrac{a}{b}\\right)^{2}}
8. BRACKET NESTING ORDER — innermost to outermost: ( ) then [ ] then { }
   - Use \\left( \\right) for innermost brackets
   - Use \\left[ \\right] for next level
   - Use \\left\\{ \\right\\} for outermost
9. Always use \\left and \\right before every bracket so they auto-size correctly.
10. For multiplication between fractions use \\times
11. Do NOT include answers in the questions section.
12. Output ONLY the numbered questions in Markdown+LaTeX — no preamble, no headers, no explanation.

${includeAnswers ? `AFTER all ${count} questions, output the following marker on its own line with nothing before or after it:
ANSWER_KEY_START
Then immediately list answers as a numbered list 1. to ${count}. Rules:
- Final answer ONLY — no working steps, no explanation
- Use the same inline LaTeX $...$ formatting
- One answer per line` : ''}`

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

    let questionsSection = markdownText
    let answersSection = ''

    if (includeAnswers && markdownText.includes('ANSWER_KEY_START')) {
      const parts = markdownText.split('ANSWER_KEY_START')
      questionsSection = parts[0].trim()
      answersSection = parts[1] ? parts[1].trim() : ''
    }

    const questionsMarkdown = `# ${level}\n\n${questionsSection}`
    const answersMarkdown = answersSection ? `# Answer Key\n\n${answersSection}` : ''

    const id = Date.now()
    const mdQPath = join(tmpdir(), `wq_${id}.md`)
    const mdAPath = join(tmpdir(), `wa_${id}.md`)
    const docxQPath = join(tmpdir(), `wq_${id}.docx`)
    const docxAPath = join(tmpdir(), `wa_${id}.docx`)
    const docxFinalPath = join(tmpdir(), `wfinal_${id}.docx`)
    const pyPath = join(tmpdir(), `fix_${id}.py`)

    writeFileSync(mdQPath, questionsMarkdown, 'utf8')
    await execAsync(`pandoc "${mdQPath}" -o "${docxQPath}" --mathml`)

    if (answersMarkdown) {
      writeFileSync(mdAPath, answersMarkdown, 'utf8')
      await execAsync(`pandoc "${mdAPath}" -o "${docxAPath}" --mathml`)
    }

    const pyScript = `
import zipfile, shutil, os, re

def extract(src, dest):
    if os.path.exists(dest): shutil.rmtree(dest)
    with zipfile.ZipFile(src, 'r') as z: z.extractall(dest)

def read_xml(path):
    with open(path, 'r', encoding='utf-8') as f: return f.read()

def write_xml(path, content):
    with open(path, 'w', encoding='utf-8') as f: f.write(content)

def repack(src_dir, output_path):
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zout:
        for root, dirs, files in os.walk(src_dir):
            for file in files:
                filepath = os.path.join(root, file)
                arcname = os.path.relpath(filepath, src_dir)
                zout.write(filepath, arcname)

def fix_styles_and_spacing(unzip_dir):
    styles_path = os.path.join(unzip_dir, 'word', 'styles.xml')
    styles = read_xml(styles_path)
    styles = re.sub(r'<w:sz w:val="24"\\s*/>', '<w:sz w:val="28"/>', styles)
    styles = re.sub(r'<w:szCs w:val="24"\\s*/>', '<w:szCs w:val="28"/>', styles)
    write_xml(styles_path, styles)
    doc_path = os.path.join(unzip_dir, 'word', 'document.xml')
    doc = read_xml(doc_path)
    def replace_spacing(m):
        ppr = m.group(0)
        ppr = re.sub(r'<w:spacing[^/]*/>', '', ppr)
        ppr = re.sub(r'<w:spacing[^>]*>.*?</w:spacing>', '', ppr, flags=re.DOTALL)
        ppr = ppr.replace('</w:pPr>', '<w:spacing w:after="360"/></w:pPr>')
        return ppr
    doc = re.sub(r'<w:pPr>.*?</w:pPr>', replace_spacing, doc, flags=re.DOTALL)
    write_xml(doc_path, doc)

q_dir = '${docxQPath}_dir'
extract('${docxQPath}', q_dir)
fix_styles_and_spacing(q_dir)
q_doc_path = os.path.join(q_dir, 'word', 'document.xml')
q_content = read_xml(q_doc_path)

has_answers = os.path.exists('${docxAPath}')

if has_answers:
    a_dir = '${docxAPath}_dir'
    extract('${docxAPath}', a_dir)
    fix_styles_and_spacing(a_dir)
    a_doc_path = os.path.join(a_dir, 'word', 'document.xml')
    a_content = read_xml(a_doc_path)

    a_body = re.search(r'<w:body>(.*)</w:body>', a_content, re.DOTALL)
    a_body_content = a_body.group(1).strip()
    a_body_content = re.sub(r'<w:sectPr>.*?</w:sectPr>', '', a_body_content, flags=re.DOTALL).strip()

    # Remove auto-numbering and inject Q1) Q2) labels
    counter = [0]
    def fix_answer_para(m):
        para = m.group(0)
        if '<w:numPr>' not in para:
            return para
        counter[0] += 1
        para = re.sub(r'<w:numPr>.*?</w:numPr>', '', para, flags=re.DOTALL)
        label = f'<w:r><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t xml:space="preserve">Q{counter[0]})   </w:t></w:r>'
        para = para.replace('</w:pPr>', f'</w:pPr>{label}', 1)
        return para

    a_body_content = re.sub(r'<w:p[ >].*?</w:p>', fix_answer_para, a_body_content, flags=re.DOTALL)

    page_break = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
    q_content = q_content.replace('</w:body>', f'{page_break}{a_body_content}</w:body>')
    write_xml(q_doc_path, q_content)
    shutil.rmtree(a_dir)
else:
    write_xml(q_doc_path, q_content)

repack(q_dir, '${docxFinalPath}')
shutil.rmtree(q_dir)
print('done')
`

    writeFileSync(pyPath, pyScript, 'utf8')
    await execAsync(`python3 "${pyPath}"`)

    const buffer = readFileSync(docxFinalPath)

    try {
      [mdQPath, mdAPath, docxQPath, docxAPath, docxFinalPath, pyPath].forEach(f => { try { unlinkSync(f) } catch {} })
    } catch {}

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${level.replace(/\s+/g, '-')}_Worksheet.docx"`,
      }
    })

  } catch (err) {
    console.error(err)
    return Response.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
