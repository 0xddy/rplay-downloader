// Public, synthetic test keys only. Requires local ffmpeg and ffprobe.
// CENC encryption uses FFmpeg; CBCS uses Node's AES-CBC independently of Mediabunny.
import { execFileSync } from 'node:child_process';
import { createCipheriv } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const scratch = mkdtempSync(join(tmpdir(), 'rplay-synthetic-'));
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const box = (type, ...parts) => {
  const data = Buffer.concat(parts);
  return Buffer.concat([u32(data.length + 8), Buffer.from(type), data]);
};
function boxes(data) {
  const out = [];
  for (let start = 0; start < data.length;) {
    const size = data.readUInt32BE(start);
    if (size < 8 || start + size > data.length) throw new Error('Invalid fixture box');
    out.push({ type: data.toString('ascii', start + 4, start + 8), data: data.subarray(start + 8, start + size) });
    start += size;
  }
  return out;
}

for (const [kind, kidText, keyText] of [
  ['video', '00112233445566778899aabbccddeeff', '000102030405060708090a0b0c0d0e0f'],
  ['audio', 'ffeeddccbbaa99887766554433221100', '101112131415161718191a1b1c1d1e1f'],
]) {
  const kid = Buffer.from(kidText, 'hex');
  const key = Buffer.from(keyText, 'hex');
  const source = `test/fixtures/dash-${kind}.${kind === 'video' ? 'cmfv' : 'cmfa'}`;
  const psshData = Buffer.concat([Buffer.from([0x12, 0x10]), kid]);
  const pssh = box('pssh', Buffer.alloc(4), Buffer.from('edef8ba979d64acea3c827dcd51d21ed', 'hex'), u32(psshData.length), psshData);
  for (const scheme of ['cenc', 'cbcs']) {
    const temporary = join(scratch, `${scheme}-${kind}.mp4`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-c', 'copy',
      ...(scheme === 'cenc' ? ['-encryption_scheme', 'cenc-aes-ctr', '-encryption_key', keyText, '-encryption_kid', kidText] : []),
      temporary]);
    const data = readFileSync(temporary);
    const entries = [];
    const { packets } = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_packets',
      '-show_entries', 'packet=pos,size', '-of', 'json', ...(scheme === 'cenc' ? ['-decryption_key', keyText] : []), temporary], { encoding: 'utf8' }));
    let sinf, sencFlags;
    if (scheme === 'cbcs') {
      sencFlags = 2;
      sinf = box('sinf', box('frma', Buffer.from(kind === 'video' ? 'avc1' : 'mp4a')),
        box('schm', u32(0), Buffer.from('cbcs'), u32(0x10000)),
        box('schi', box('tenc', u32(0x01000000), Buffer.from([0, 0x19, 1, 16]), kid)));
      for (const [index, packet] of packets.entries()) {
        const start = Number(packet.pos), size = Number(packet.size);
        const sample = data.subarray(start, start + size);
        const iv = Buffer.alloc(16); iv.writeUInt32BE(index + 1, 12);
        const subsamples = [];
        if (kind === 'video') {
          for (let offset = 0; offset < size;) {
            const nalSize = sample.readUInt32BE(offset);
            const clear = Math.min(32, nalSize) + 4;
            subsamples.push({ offset, clear, protectedSize: nalSize + 4 - clear });
            offset += nalSize + 4;
          }
        } else subsamples.push({ offset: 0, clear: 0, protectedSize: size });
        for (const sub of subsamples) {
          const cipher = createCipheriv('aes-128-cbc', key, iv); cipher.setAutoPadding(false);
          // CBCS pattern: encrypt one 16-byte block, leave the following nine clear.
          for (let offset = sub.offset + sub.clear; offset + 16 <= sub.offset + sub.clear + sub.protectedSize; offset += 160) {
            cipher.update(sample.subarray(offset, offset + 16)).copy(sample, offset);
          }
          cipher.final();
        }
        const count = Buffer.alloc(2); count.writeUInt16BE(subsamples.length);
        entries.push(Buffer.concat([iv, count, ...subsamples.map((sub) => {
          const b = Buffer.alloc(6); b.writeUInt16BE(sub.clear); b.writeUInt32BE(sub.protectedSize, 2); return b;
        })]));
      }
    } else {
      const sinfAt = data.indexOf(Buffer.from('sinf')) - 4;
      sinf = data.subarray(sinfAt, sinfAt + data.readUInt32BE(sinfAt));
      const sencAt = data.indexOf(Buffer.from('senc')) - 4;
      sencFlags = data.readUInt32BE(sencAt + 8);
      const count = data.readUInt32BE(sencAt + 12);
      let offset = sencAt + 16;
      for (let index = 0; index < count; index++) {
        const size = 8 + (sencFlags & 2 ? 2 + data.readUInt16BE(offset + 8) * 6 : 0);
        entries.push(data.subarray(offset, offset + size)); offset += size;
      }
    }
    // Keep the original CMAF fragmentation. Copy ciphertext sample-for-sample,
    // then place the independent encryption auxiliary data in each fragment.
    const fragmented = readFileSync(source);
    const sourcePackets = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_packets',
      '-show_entries', 'packet=pos,size', '-of', 'json', source], { encoding: 'utf8' })).packets;
    if (sourcePackets.length !== packets.length || entries.length !== packets.length) throw new Error('Packet count changed');
    for (const [index, packet] of sourcePackets.entries()) {
      if (packet.size !== packets[index].size) throw new Error('Packet size changed');
      data.copy(fragmented, Number(packet.pos), Number(packets[index].pos), Number(packets[index].pos) + Number(packet.size));
    }
    const roots = boxes(fragmented);
    let sampleOffset = 0;
    function rewrite(entry) {
      let payload = entry.data;
      if (entry.type === 'traf') {
        const children = boxes(payload);
        const run = children.find((child) => child.type === 'trun');
        const count = run.data.readUInt32BE(4);
        const senc = box('senc', u32(sencFlags), u32(count), ...entries.slice(sampleOffset, sampleOffset + count));
        sampleOffset += count;
        if (!(run.data.readUInt32BE(0) & 1)) throw new Error('Fixture must have a trun data offset');
        run.data.writeInt32BE(run.data.readInt32BE(8) + senc.length, 8);
        payload = Buffer.concat([...children.map((child) => box(child.type, child.data)), senc]);
      } else if (['moov', 'trak', 'mdia', 'minf', 'stbl', 'moof'].includes(entry.type)) {
        payload = Buffer.concat(boxes(payload).map(rewrite));
        if (entry.type === 'moov') payload = Buffer.concat([payload, pssh]);
      } else if (entry.type === 'stsd') {
        const sampleEntries = boxes(payload.subarray(8));
        if (sampleEntries.length !== 1) throw new Error('Expected one sample entry');
        const original = sampleEntries[0];
        payload = Buffer.concat([payload.subarray(0, 8), box(kind === 'video' ? 'encv' : 'enca', original.data, sinf)]);
      }
      return box(entry.type, payload);
    }
    writeFileSync(`test/fixtures/${scheme}-${kind}.mp4`, Buffer.concat(roots.filter((entry) => !['mfra', 'sidx'].includes(entry.type)).map(rewrite)));
  }
}
console.log('Created four synthetic CENC/CBCS test fixtures.');
