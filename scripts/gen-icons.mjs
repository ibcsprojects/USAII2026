// Generates simple GreenPages leaf icons (16/48/128) as PNGs with zero deps.
// A rounded green tile with a lighter leaf/page glyph. Run: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(__dirname, '../public/icons')
mkdirSync(outDir, { recursive: true })

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([t, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function png(size, draw) {
  const px = Buffer.alloc(size * size * 4)
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    px[i] = r
    px[i + 1] = g
    px[i + 2] = b
    px[i + 3] = a
  }
  draw(set, size)
  // add filter byte (0) per row
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function draw(set, s) {
  const r = s * 0.22 // corner radius
  const inRounded = (x, y) => {
    const cx = Math.min(x, s - 1 - x)
    const cy = Math.min(y, s - 1 - y)
    if (cx >= r || cy >= r) return true
    const dx = r - cx
    const dy = r - cy
    return dx * dx + dy * dy <= r * r
  }
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      if (!inRounded(x, y)) continue
      // vertical gradient green tile
      const t = y / s
      const R = Math.round(34 - 14 * t)
      const G = Math.round(197 - 60 * t)
      const B = Math.round(94 - 30 * t)
      set(x, y, R, G, B)
    }
  }
  // simple leaf: an ellipse + midrib, lighter
  const cx = s * 0.5
  const cy = s * 0.5
  const a = s * 0.3
  const b = s * 0.42
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      // rotate -45deg
      const dx = x - cx
      const dy = y - cy
      const rx = (dx + dy) * Math.SQRT1_2
      const ry = (dy - dx) * Math.SQRT1_2
      const e = (rx * rx) / (a * a) + (ry * ry) / (b * b)
      if (e <= 1) {
        set(x, y, 220, 252, 231)
      }
    }
  }
  // midrib line
  for (let i = -Math.floor(s * 0.32); i < Math.floor(s * 0.32); i++) {
    const x = Math.round(cx + i * Math.SQRT1_2)
    const y = Math.round(cy - i * Math.SQRT1_2)
    set(x, y, 22, 101, 52)
    if (s >= 48) set(x, y + 1, 22, 101, 52)
  }
}

for (const size of [16, 48, 128]) {
  writeFileSync(resolve(outDir, `icon${size}.png`), png(size, draw))
  console.log(`wrote icon${size}.png`)
}
