// A minimal ZIP writer. Three reasons it exists rather than a dependency or a
// shell out:
//   - gws-connect has no dependencies and the build tooling should not be the
//     thing that introduces the first one.
//   - Compress-Archive on Windows drops the unix permission bits, and the
//     macOS bundle ships two binaries that have to arrive executable.
//   - Fixed timestamps make a rebuild byte-identical, so it is obvious whether
//     a bundle actually changed.
import { deflateRawSync, crc32 } from 'node:zlib'

// 1980-01-01 00:00:00 in DOS date/time. Any fixed value works; this is the
// earliest one the format can express.
const DOS_TIME = 0
const DOS_DATE = 33

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const END_SIG = 0x06054b50

const DEFLATED = 8
const STORED = 0

function entryOf ({ name, data, mode = 0o644 }) {
  if (!name) throw new Error('zip entry needs a name')
  const body = Buffer.isBuffer(data) ? data : Buffer.from(data ?? '')
  const compressed = deflateRawSync(body, { level: 9 })
  // Storing beats deflating when deflating made it bigger - tiny files do that.
  const useDeflate = compressed.length < body.length
  return {
    name: Buffer.from(name.replace(/\\/g, '/'), 'utf8'),
    crc: crc32(body),
    size: body.length,
    payload: useDeflate ? compressed : body,
    method: useDeflate ? DEFLATED : STORED,
    mode
  }
}

function localHeader (e) {
  const head = Buffer.alloc(30)
  head.writeUInt32LE(LOCAL_SIG, 0)
  head.writeUInt16LE(20, 4) // version needed
  head.writeUInt16LE(0, 6) // flags
  head.writeUInt16LE(e.method, 8)
  head.writeUInt16LE(DOS_TIME, 10)
  head.writeUInt16LE(DOS_DATE, 12)
  head.writeUInt32LE(e.crc, 14)
  head.writeUInt32LE(e.payload.length, 18)
  head.writeUInt32LE(e.size, 22)
  head.writeUInt16LE(e.name.length, 26)
  head.writeUInt16LE(0, 28) // extra field length
  return head
}

function centralHeader (e, offset) {
  const head = Buffer.alloc(46)
  head.writeUInt32LE(CENTRAL_SIG, 0)
  head.writeUInt16LE(0x031e, 4) // made by: unix, so the mode below is honoured
  head.writeUInt16LE(20, 6)
  head.writeUInt16LE(0, 8)
  head.writeUInt16LE(e.method, 10)
  head.writeUInt16LE(DOS_TIME, 12)
  head.writeUInt16LE(DOS_DATE, 14)
  head.writeUInt32LE(e.crc, 16)
  head.writeUInt32LE(e.payload.length, 20)
  head.writeUInt32LE(e.size, 24)
  head.writeUInt16LE(e.name.length, 28)
  head.writeUInt16LE(0, 30) // extra
  head.writeUInt16LE(0, 32) // comment
  head.writeUInt16LE(0, 34) // disk
  head.writeUInt16LE(0, 36) // internal attrs
  // External attrs: unix mode in the high 16 bits, 0o100000 marks a regular file.
  head.writeUInt32LE((((0o100000 | e.mode) & 0xffff) << 16) >>> 0, 38)
  head.writeUInt32LE(offset, 42)
  return head
}

export function zip (entries) {
  const prepared = entries.map(entryOf)
  const chunks = []
  const central = []
  let offset = 0

  for (const e of prepared) {
    const head = localHeader(e)
    central.push(centralHeader(e, offset))
    chunks.push(head, e.name, e.payload)
    offset += head.length + e.name.length + e.payload.length
  }

  const centralStart = offset
  for (let i = 0; i < prepared.length; i += 1) {
    chunks.push(central[i], prepared[i].name)
    offset += central[i].length + prepared[i].name.length
  }

  const end = Buffer.alloc(22)
  end.writeUInt32LE(END_SIG, 0)
  end.writeUInt16LE(0, 4) // disk
  end.writeUInt16LE(0, 6) // disk with central directory
  end.writeUInt16LE(prepared.length, 8)
  end.writeUInt16LE(prepared.length, 10)
  end.writeUInt32LE(offset - centralStart, 12)
  end.writeUInt32LE(centralStart, 16)
  end.writeUInt16LE(0, 20) // comment length
  chunks.push(end)

  return Buffer.concat(chunks)
}
