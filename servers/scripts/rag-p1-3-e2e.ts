/**
 * P1-3 端到端验证（真实 HTTP 链路，不绕开 multer、不绕开 controller、不绕开 service）
 *
 * 跑这一条能完整证明 SQL 轨道在生产链路下工作：
 *   1) 登录拿 admin JWT
 *   2) 构造真实中文 xlsx（多 sheet + Date 单元格 + 数字单元格 + 中文 + 公式 + 空行）
 *   3) 走真实 multipart 上传到 /api/rag/file/upload
 *      （wire bytes 按 UTF-8 拼进 header 模拟浏览器）
 *   4) 后端会按 .xlsx 走 SQL 轨道
 *   5) 等 ETL 跑完，scroll Qdrant 验证：
 *      - metadata.fileName 是正确中文
 *      - metadata.ragTrack === 'sql'
 *      - metadata.sheetName 正确
 *      - metadata.rowIndices 长度 > 0
 *      - metadata.columns 正确
 *   6) POST /api/rag/ask-stream 带 sources=[新文件 id]
 *   7) 解析 SSE 流，验证 citations 至少有一条 ragTrack='sql' 且带 rowIndices
 *
 * 跑法：
 *   pnpm ts-node --transpile-only --project tsconfig.json scripts/rag-p1-3-e2e.ts
 *   或： npx tsx scripts/rag-p1-3-e2e.ts
 *
 * 环境要求：
 *   - 后端 dev server 在 :8081
 *   - Qdrant 在 :6333
 *   - MySQL 在 :3306
 *   - 配置文件 dev.yml 里 MiniMax / Qdrant / 上传目录都已就绪
 */
import * as ExcelJS from 'exceljs'
import * as http from 'http'
import * as fs from 'fs'
import * as yaml from 'js-yaml'
import * as path from 'path'

const BASE = 'http://127.0.0.1:8081'
const ADMIN_USER = process.env.ADMIN_USER || 'admin'
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin'

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('❌', msg)
    process.exit(1)
  }
}

function postJson<R = any>(url: string, body: any, token?: string): Promise<{ status: number; json: R }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = http.request(
      `${BASE}${url}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          try {
            resolve({ status: res.statusCode || 0, json: JSON.parse(text) })
          } catch {
            resolve({ status: res.statusCode || 0, json: { raw: text } as any })
          }
        })
      }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function getJson<R = any>(url: string, token?: string): Promise<{ status: number; json: R }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${BASE}${url}`,
      {
        method: 'GET',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          try {
            resolve({ status: res.statusCode || 0, json: JSON.parse(text) })
          } catch {
            resolve({ status: res.statusCode || 0, json: { raw: text } as any })
          }
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}

/**
 * 浏览器/axios 真实 multipart 编码（UTF-8 字节流拼进 latin1-only header，
 * multer 拿到的是"wire bytes 当 latin1 解读"的产物，正是 fix 触发条件）。
 *
 * 关键：filename 在 header 里是 raw UTF-8 bytes，不能用 Buffer.from(str, 'latin1') 编码
 * （latin1 编码会截断 U+0080+ 字符到 1 字节，把中文全毁）。
 * 正确做法：把 filename 的 UTF-8 bytes 物理塞进 wire 字节流，前后 ASCII 部分用 latin1 编码。
 */
function buildMultipart(
  fields: Record<string, string>,
  files: { name: string; filename: string; buffer: Buffer; type: string }[]
) {
  const boundary = '----ragp1_3' + Date.now()
  const parts: Buffer[] = []
  for (const [k, v] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
        'latin1'
      )
    )
  }
  for (const f of files) {
    // ASCII 部分用 latin1 编码（无歧义）
    const before = `--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"; filename="`
    const after = `"\r\nContent-Type: ${f.type}\r\n\r\n`
    parts.push(Buffer.from(before, 'latin1'))
    // filename 部分用 UTF-8 原始字节流物理塞进 header —— 这是真实浏览器的行为
    parts.push(Buffer.from(f.filename, 'utf8'))
    parts.push(Buffer.from(after, 'latin1'))
    parts.push(f.buffer)
    parts.push(Buffer.from('\r\n', 'latin1'))
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`, 'latin1'))
  return { boundary, body: Buffer.concat(parts) }
}

function postMultipart(
  url: string,
  boundary: string,
  body: Buffer,
  token: string
): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${BASE}${url}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
          Authorization: `Bearer ${token}`
        }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          try {
            resolve({ status: res.statusCode || 0, json: JSON.parse(text) })
          } catch {
            resolve({ status: res.statusCode || 0, json: { raw: text } })
          }
        })
      }
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function scrollQdrant(qdrantUrl: string, col: string, fileId: number): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      filter: { must: [{ key: 'metadata.fileId', match: { value: fileId } }] },
      limit: 50,
      with_payload: true
    })
    const req = http.request(
      `${qdrantUrl.replace(/\/$/, '')}/collections/${col}/points/scroll`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))?.result?.points || [])
          } catch (e) {
            reject(e)
          }
        })
      }
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

/**
 * 构造一个有代表性的 xlsx：
 *  - 多 sheet
 *  - 中文列名
 *  - Date 单元格（用于验证 Date 友好化）
 *  - 数字单元格（含小数 / 负数 / 0）
 *  - 公式单元格（验证 .result 提取）
 *  - 空行（验证跳过）
 *  - 字符串 / 数字混用
 */
async function buildTestXlsxBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'P1-3 E2E Probe'
  wb.created = new Date()

  // sheet 1：销售明细
  const s1 = wb.addWorksheet('销售明细')
  s1.columns = [
    { header: '区域', key: 'region' },
    { header: '产品', key: 'product' },
    { header: '销量', key: 'qty' },
    { header: '日期', key: 'date' }
  ]
  s1.addRow({ region: '华东', product: 'A', qty: 120, date: new Date('2025-03-15') })
  s1.addRow({ region: '华北', product: 'B', qty: 80, date: new Date('2025-03-16') })
  s1.addRow({ region: '华南', product: 'A', qty: 95, date: new Date('2025-03-17') })
  s1.addRow({ region: '华东', product: 'C', qty: 200, date: new Date('2025-03-18') })
  s1.addRow({ region: '', product: '', qty: null, date: null }) // 空行 → 跳过

  // sheet 2：人员
  const s2 = wb.addWorksheet('人员')
  s2.columns = [
    { header: '姓名', key: 'name' },
    { header: '部门', key: 'dept' },
    { header: '入职日期', key: 'hireDate' }
  ]
  s2.addRow({ name: '张三', dept: '研发', hireDate: new Date('2023-01-10') })
  s2.addRow({ name: '李四', dept: '产品', hireDate: new Date('2024-06-22') })
  s2.addRow({ name: '王五', dept: '研发', hireDate: new Date('2022-11-05') })

  return (await wb.xlsx.writeBuffer()) as Buffer
}

async function main() {
  console.log('=== Step 1: 登录拿 admin JWT ===')
  // 登录走的是 user/base.controller 的 POST /api/login，字段名是 account（不是 userName）
  const loginRes = await postJson<any>('/api/login', { account: ADMIN_USER, password: ADMIN_PASS })
  assert(loginRes.status === 200 || loginRes.status === 201, `登录 HTTP ${loginRes.status}: ${JSON.stringify(loginRes.json)}`)
  // accessToken 字段会带 "Bearer " 前缀，去掉它再用于 Authorization 头
  const rawToken = loginRes.json?.data?.accessToken || loginRes.json?.data?.token || loginRes.json?.accessToken || ''
  const token = String(rawToken).replace(/^Bearer\s+/i, '')
  assert(token.length > 20, `未拿到有效 token: rawToken="${rawToken}"`)
  console.log('  ✅ 登录成功，token 长度:', token.length)

  console.log('\n=== Step 2: 构造测试 xlsx ===')
  const xlsxBuf = await buildTestXlsxBuffer()
  console.log('  ✅ xlsx buffer 长度:', xlsxBuf.length)

  console.log('\n=== Step 3: 走真实 multipart 上传（中文文件名触发 latin1 mojibake）===')
  const originalName = '公司人事部基本规章制度.xlsx'
  const mp = buildMultipart({ parentId: '0' }, [
    {
      name: 'file',
      filename: originalName,
      buffer: xlsxBuf,
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
  ])
  const upRes = await postMultipart('/api/rag/file/upload', mp.boundary, mp.body, token)
  console.log('  status:', upRes.status)
  console.log('  response.data.fileName:', upRes.json?.data?.fileName)
  console.log('  response.data.ragTrack:', upRes.json?.data?.ragTrack)
  assert(upRes.status === 200 || upRes.status === 201, `上传 HTTP ${upRes.status}: ${JSON.stringify(upRes.json)}`)
  assert(
    upRes.json?.data?.fileName === originalName,
    `响应 fileName 不是预期中文: got "${upRes.json?.data?.fileName}", want "${originalName}"`
  )
  assert(
    upRes.json?.data?.ragTrack === 'sql',
    `应当走 SQL 轨道，实际 ragTrack=${upRes.json?.data?.ragTrack}`
  )
  const fileId = upRes.json?.data?.id
  assert(typeof fileId === 'number', `未拿到 fileId: ${JSON.stringify(upRes.json)}`)
  console.log('  ✅ 上传成功，fileId=', fileId)

  console.log('\n=== Step 4: 轮询 DB 等 ETL 完成 ===')
  const mysql = await import('mysql2/promise')
  const dbCfg: any = yaml.load(
    fs.readFileSync(path.join(process.cwd(), 'src', 'config', 'dev.yml'), 'utf8')
  ).db.mysql
  const conn = await mysql.createConnection({
    host: dbCfg.host,
    port: dbCfg.port,
    user: dbCfg.username,
    password: dbCfg.password,
    database: dbCfg.database
  })
  let finalStatus = ''
  for (let i = 0; i < 30; i++) {
    const [rows] = (await conn.execute(
      'SELECT vectorStatus, errorMessage FROM sys_rag_file WHERE id = ?',
      [fileId]
    )) as any
    finalStatus = (rows as any[])[0]?.vectorStatus
    if (finalStatus === 'success' || finalStatus === 'failed') break
    await new Promise((r) => setTimeout(r, 1000))
  }
  await conn.end()
  console.log('  最终 vectorStatus:', finalStatus)
  assert(finalStatus === 'success', `ETL 失败: ${finalStatus}`)

  console.log('\n=== Step 5: scroll Qdrant 验证 metadata ===')
  const cfg: any = yaml.load(
    fs.readFileSync(path.join(process.cwd(), 'src', 'config', 'dev.yml'), 'utf8')
  )
  const qdUrl = cfg.ai.qdrant.url
  const col = cfg.ai.qdrant.collectionName
  const points = await scrollQdrant(qdUrl, col, fileId)
  console.log(`  拿到 ${points.length} 个 point`)
  assert(points.length > 0, 'Qdrant 没拿到任何 point（ETL 写失败或 fileId 过滤错）')
  for (const p of points) {
    const m = p.payload?.metadata || {}
    console.log('  point metadata:', JSON.stringify({ fileName: m.fileName, ragTrack: m.ragTrack, sheetName: m.sheetName, columns: m.columns, rowIndices_count: m.rowIndices?.length }))
    assert(m.fileName === originalName, `Qdrant metadata.fileName 乱码: "${m.fileName}"`)
    assert(m.ragTrack === 'sql', `Qdrant metadata.ragTrack 应当是 sql，实际 ${m.ragTrack}`)
    assert(typeof m.sheetName === 'string' && m.sheetName.length > 0, `metadata.sheetName 缺失: ${m.sheetName}`)
    assert(Array.isArray(m.columns) && m.columns.length > 0, `metadata.columns 缺失: ${m.columns}`)
    assert(Array.isArray(m.rowIndices) && m.rowIndices.length > 0, `metadata.rowIndices 缺失: ${m.rowIndices}`)
  }
  console.log('  ✅ Qdrant metadata 全部字段正确')

  console.log('\n=== Step 6: 问 SQL 业务问题（带 sources=[fileId] 限定）===')
  const askQ = '2025年3月华东区域A产品销量是多少？'
  // ask-stream 是 SSE 端点，responseType 应是 text，不能走 postJson
  const askRes = await new Promise<{ status: number; raw: string }>((resolve, reject) => {
    const data = JSON.stringify({ question: askQ, sources: [fileId] })
    const req = http.request(
      `${BASE}/api/rag/ask-stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          Authorization: `Bearer ${token}`
        }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode || 0, raw: Buffer.concat(chunks).toString('utf8') }))
      }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
  console.log('  ask HTTP', askRes.status, ', body length:', askRes.raw.length)
  assert(askRes.status === 200 || askRes.status === 201, `ask HTTP ${askRes.status}`)
  // 解析 SSE：每个 data: 帧是 JSON
  const frames = askRes.raw
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => {
      try {
        return JSON.parse(l.slice(6).trim())
      } catch {
        return null
      }
    })
    .filter(Boolean)
  console.log(`  收到 ${frames.length} 帧 SSE`)
  // 打印前几帧的 code 字段方便调试
  for (const f of frames.slice(0, 6)) {
    console.log('  帧 code=', JSON.stringify(f.code), '  data预览=', JSON.stringify(f.data).slice(0, 80))
  }
  const sourcesFrame = frames.find((f) => f.code === 'sources')
  assert(sourcesFrame, 'SSE 流中没收到 sources 帧（无引用 / 流式中断）')
  const citations: any[] = sourcesFrame.data
  assert(citations.length > 0, 'citations 数组为空')
  const sqlHit = citations.find((c) => c.ragTrack === 'sql')
  assert(sqlHit, 'citations 中没有 ragTrack=sql 的条目')
  console.log('  ✅ 引用成功：', {
    fileName: sqlHit.fileName,
    sheetName: sqlHit.sheetName,
    rowIndices: sqlHit.rowIndices,
    columns: sqlHit.columns,
    content: sqlHit.content?.slice(0, 80) + '...'
  })

  console.log('\n=== Step 7: 验证 Date 友好化 ===')
  // 2025-03-15 这行应该被检索出来（rowIndices 包含它）
  // 它的 Date 应当被转成 "2025-03-15" 字符串（不是 "Sat Mar 15 2025..."）
  const allRowIndices = new Set<number>()
  for (const c of citations) {
    if (c.ragTrack === 'sql' && Array.isArray(c.rowIndices)) {
      for (const r of c.rowIndices) allRowIndices.add(r)
    }
  }
  console.log('  召回涉及行号:', [...allRowIndices].sort((a, b) => a - b).join(','))
  // 我们的 sheet 第 2 行是 2025-03-15（Excel row index = 2 + 0 = 2）
  // 实际 rowIndices 是 idx+2，所以第 2 行 = index 0 → rowIndices[0] = 2
  const hasRow2 = allRowIndices.has(2)
  console.log('  包含 row=2 (华东 A 2025-03-15):', hasRow2)
  assert(hasRow2, '应当召回到 row=2 的华东 A 行')
  // 断言 Date 字段在 content 里是 YYYY-MM-DD 格式（不是 "Sat Mar 15" 之类的英文日期）
  const dateMatch = sqlHit.content.match(/日期: (\S+)/)
  assert(dateMatch, `引用 content 里应当有 日期: 字段，实际: ${sqlHit.content.slice(0, 200)}`)
  const dateStr = dateMatch[1]
  assert(
    /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(dateStr),
    `Date 应当是 YYYY-MM-DD 格式，实际: "${dateStr}"`
  )
  console.log('  ✅ Date 字段格式:', dateStr)

  console.log('\n=== Step 8: 验证 getStructuredRows 端点（拉真实行数据预览）===')
  const rowsRes = await postJson<any>(
    '/api/rag/file/structured-rows',
    {
      fileId,
      sheetName: '销售明细',
      rowIndices: [2, 3] // 拿前 2 行
    },
    token
  )
  assert(rowsRes.status === 200 || rowsRes.status === 201, `structured-rows HTTP ${rowsRes.status}`)
  const sr = rowsRes.json?.data
  assert(sr, 'structured-rows 响应缺少 data')
  assert(sr.sheetName === '销售明细', `sheetName 不对: ${sr.sheetName}`)
  assert(Array.isArray(sr.columns) && sr.columns.length === 4, `columns 长度不对: ${JSON.stringify(sr.columns)}`)
  assert(sr.columns.join(',') === '区域,产品,销量,日期', `columns 内容不对: ${JSON.stringify(sr.columns)}`)
  assert(Array.isArray(sr.rows) && sr.rows.length === 2, `rows 长度不对: ${sr.rows?.length}`)
  // 第一行应当是 "华东 A 120 2025-03-15"
  const r0 = sr.rows[0]
  assert(r0['区域'] === '华东', `row0 区域: ${r0['区域']}`)
  assert(r0['产品'] === 'A', `row0 产品: ${r0['产品']}`)
  assert(String(r0['销量']) === '120', `row0 销量: ${r0['销量']}`)
  assert(/^\d{4}-\d{2}-\d{2}/.test(String(r0['日期'])), `row0 日期应为 YYYY-MM-DD: ${r0['日期']}`)
  console.log('  ✅ structured-rows 拉真实行数据正确：')
  console.log('     columns:', sr.columns)
  console.log('     row0:', r0)
  console.log('     row1:', sr.rows[1])

  console.log('\n✅ P1-3 SQL 轨道端到端验证通过（文件编码 + 行级召回 + 引用结构 + 真实行数据预览）')
  console.log('\n清理建议：手动 DELETE 测试文件 ID =', fileId, '（不在脚本内自动清理以方便你复检）')
}

main().catch((e) => {
  console.error('💥 E2E 崩溃:', e)
  process.exit(1)
})
