/**
 * verifyReleaseNotes.js — lấy token (git credential fill) → GET release v1.0.0
 * → kiểm tra mojibake tiếng Việt → ghi kết quả ra %TEMP%/kull-verify.json
 */
const { execFileSync } = require('child_process')
const https = require('https')
const fs = require('fs')

function getToken() {
  const out = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
  })
  const m = out.match(/^password=(.+)$/m)
  return m ? m[1] : ''
}

function getRelease(token) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: '/repos/zingky/kull-aegisub-renderer/releases/tags/v1.0.0',
        headers: {
          'User-Agent': 'kull-check',
          Authorization: 'Bearer ' + token,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
      (res) => {
        let d = ''
        res.on('data', (c) => (d += c))
        res.on('end', () => resolve(d))
      },
    )
    req.on('error', reject)
    req.end()
  })
}

async function main() {
  let result
  try {
    const token = getToken()
    if (!token) throw new Error('khong lay duoc token')
    const raw = await getRelease(token)
    const j = JSON.parse(raw)
    const b = j.body || ''
    const bad = ['Ã¢', 'Ãª', 'Ã´', 'Æ°', 'á»‡', 'á»', 'Ă©', 'Ă¡', 'Ä‚', 'Ă„']
    const hits = bad.filter((x) => b.includes(x))
    result = {
      name: j.name,
      len: b.length,
      mojibakeCount: hits.length,
      mojibakeSample: hits.slice(0, 3),
      head: b.slice(0, 320),
      tail: b.slice(-260),
    }
  } catch (e) {
    result = { error: String((e && e.message) || e) }
  }
  fs.writeFileSync(process.env.TEMP + '/kull-verify.json', JSON.stringify(result, null, 2), 'utf8')
  console.log('da ghi ket qua')
}

main()
