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

function getDriveImageUrl(url) {
  if (!url) return null
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
  if (match) return `https://drive.google.com/uc?export=download&id=${match[1]}`
  return url
}

export async function POST(req) {
  try {
    const formData = await req.formData()
    const level = formData.get('level') || 'Amath'
    const count = formData.get('count') || '10'
    const difficulty = formData.get('difficulty') || 'mixed'
    const extra = formData.get('extra') || ''
    const description = formData.get('description') || ''
    const includeAnswers = formData.get('includeAnswers') === 'true'
    const format = formData.get('format') || 'docx'
    const layout = formData.get('layout') || 'compact'
    const sampleImageUrl = formData.get('sampleImageUrl') || ''
    const file = formData.get('file')

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const messageContent = []

    if (file && file.size > 0) {
      const arrayBuffer = await file.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      const mime = file.type
      if (mime.startsWith('image/')) {
        const validMime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mime) ? mime : 'image/jpeg'
        messageContent.push({ type: 'image', source: { type: 'base64', media_type: validMime, data: base64 } })
      } else if (mime === 'application/pdf') {
        messageContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } })
      }
    }

    if (sampleImageUrl && (!file || file.size === 0)) {
      try {
        const directUrl = getDriveImageUrl(sampleImageUrl)
        if (directUrl) {
          const imgRes = await fetch(directUrl)
          if (imgRes.ok) {
            const imgBuffer = await imgRes.arrayBuffer()
            const base64 = Buffer.from(imgBuffer).toString('base64')
            const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
            const validMime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(contentType) ? contentType : 'image/jpeg'
            messageContent.push({ type: 'image', source: { type: 'base64', media_type: validMime, data: base64 } })
          }
        }
      } catch (e) {
        console.error('Failed to fetch sample image:', e)
      }
    }

    const systemPrompt = `You are a Singapore math tuition teacher generating practice questions for ${level} students.

Generate exactly ${count} numbered math practice questions.
Difficulty: ${DIFFICULTY_LABELS[difficulty] || 'even mix'}.
${extra ? `Extra instructions: ${extra}` : ''}
${messageContent.some(m => m.type === 'image') ? 'A sample image of questions has been provided. Use it to understand the style, format, and difficulty level required.' : ''}

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
9. Always use \\left and \\right before every bracket so they auto-size.
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
    const pdfPath = join(tmpdir(), `wfinal_${id}.pdf`)
    const pyPath = join(tmpdir(), `fix_${id}.py`)

    // PDF branch
    if (format === 'pdf') {
      const fullMd = answersMarkdown
        ? `${questionsMarkdown}\n\n\\newpage\n\n${answersMarkdown}`
        : questionsMarkdown
      writeFileSync(mdQPath, fullMd, 'utf8')
      await execAsync(`pandoc "${mdQPath}" -o "${pdfPath}" --pdf-engine=xelatex`)
      const buffer = readFileSync(pdfPath)
      try { [mdQPath, pdfPath].forEach(f => { try { unlinkSync(f) } catch {} }) } catch {}
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${level}_Worksheet.pdf"`,
        }
      })
    }

    // Word doc branch
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

def fix_styles(content):
    content = re.sub(r'<w:sz w:val="24"\\s*/>', '<w:sz w:val="28"/>', content)
    content = re.sub(r'<w:szCs w:val="24"\\s*/>', '<w:szCs w:val="28"/>', content)
    return content

def fix_spacing(content):
    def replace_spacing(m):
        ppr = m.group(0)
        ppr = re.sub(r'<w:spacing[^/]*/>', '', ppr)
        ppr = re.sub(r'<w:spacing[^>]*>.*?</w:spacing>', '', ppr, flags=re.DOTALL)
        ppr = ppr.replace('</w:pPr>', '<w:spacing w:after="360"/></w:pPr>')
        return ppr
    return re.sub(r'<w:pPr>.*?</w:pPr>', replace_spacing, content, flags=re.DOTALL)

PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
HALF_PAGE_SPACER = '<w:p><w:pPr><w:spacing w:before="5760" w:after="0"/></w:pPr></w:p>'

def inject_layout(content, layout):
    paras = re.findall(r'<w:p[ >].*?</w:p>', content, re.DOTALL)
    question_indices = [i for i, p in enumerate(paras) if '<w:numPr>' in p]
    if layout == 'compact' or not question_indices:
        return content
    result = list(paras)
    offset = 0
    for idx, qi in enumerate(question_indices):
        adjusted = qi + offset
        if layout == '1pp':
            if idx > 0:
                result.insert(adjusted, PAGE_BREAK)
                offset += 1
        elif layout == '2pp':
            if idx == 0:
                continue
            elif idx % 2 == 1:
                result.insert(adjusted, HALF_PAGE_SPACER)
                offset += 1
            else:
                result.insert(adjusted, PAGE_BREAK)
                offset += 1
    new_body = ''.join(result)
    return re.sub(r'<w:body>.*</w:body>', f'<w:body>{new_body}</w:body>', content, flags=re.DOTALL)

def fix_answer_para(content):
    counter = [0]
    def _fix(m):
        para = m.group(0)
        if '<w:numPr>' not in para:
            return para
        counter[0] += 1
        para = re.sub(r'<w:numPr>.*?</w:numPr>', '', para, flags=re.DOTALL)
        label = f'<w:r><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t xml:space="preserve">Q{counter[0]})   </w:t></w:r>'
        para = para.replace('</w:pPr>', f'</w:pPr>{label}', 1)
        return para
    return re.sub(r'<w:p[ >].*?</w:p>', _fix, content, flags=re.DOTALL)

q_dir = '${docxQPath}_dir'
extract('${docxQPath}', q_dir)
styles_path = os.path.join(q_dir, 'word', 'styles.xml')
write_xml(styles_path, fix_styles(read_xml(styles_path)))
doc_path = os.path.join(q_dir, 'word', 'document.xml')
q_content = fix_spacing(read_xml(doc_path))
q_content = inject_layout(q_content, '${layout}')

has_answers = os.path.exists('${docxAPath}')
if has_answers:
    a_dir = '${docxAPath}_dir'
    extract('${docxAPath}', a_dir)
    a_doc_path = os.path.join(a_dir, 'word', 'document.xml')
    a_content = read_xml(a_doc_path)
    a_body = re.search(r'<w:body>(.*)</w:body>', a_content, re.DOTALL)
    a_body_content = a_body.group(1).strip()
    a_body_content = re.sub(r'<w:sectPr>.*?</w:sectPr>', '', a_body_content, flags=re.DOTALL).strip()
    a_body_content = fix_answer_para(a_body_content)
    q_content = q_content.replace('</w:body>', f'{PAGE_BREAK}{a_body_content}</w:body>')
    shutil.rmtree(a_dir)

write_xml(doc_path, q_content)
repack(q_dir, '${docxFinalPath}')
shutil.rmtree(q_dir)
print('done')
`

    writeFileSync(pyPath, pyScript, 'utf8')
    await execAsync(`python3 "${pyPath}"`)
    const buffer = readFileSync(docxFinalPath)
    try { [mdQPath, mdAPath, docxQPath, docxAPath, docxFinalPath, pyPath].forEach(f => { try { unlinkSync(f) } catch {} }) } catch {}

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${level}_Worksheet.docx"`,
      }
    })

  } catch (err) {
    console.error(err)
    return Response.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}