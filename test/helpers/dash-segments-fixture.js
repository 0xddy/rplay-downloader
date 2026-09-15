function boxes(bytes, start = 0, end = bytes.length) {
  const result = [];
  for (let offset = start; offset < end;) {
    let size = bytes.readUInt32BE(offset);
    const headerSize = size === 1 ? 16 : 8;
    if (size === 1) size = Number(bytes.readBigUInt64BE(offset + 8));
    if (size === 0) size = end - offset;
    if (size < headerSize || offset + size > end) throw new Error('Invalid fixture MP4 box');
    result.push({ offset, size, headerSize, type: bytes.toString('ascii', offset + 4, offset + 8) });
    offset += size;
  }
  return result;
}

function child(bytes, parent, type) {
  return boxes(bytes, parent.offset + parent.headerSize, parent.offset + parent.size).find((box) => box.type === type);
}

function sampleDuration(bytes, traf, trexDuration) {
  const tfhd = child(bytes, traf, 'tfhd');
  const flags = bytes.readUInt32BE(tfhd.offset + tfhd.headerSize) & 0xffffff;
  let cursor = tfhd.offset + tfhd.headerSize + 8;
  if (flags & 1) cursor += 8;
  if (flags & 2) cursor += 4;
  return flags & 8 ? bytes.readUInt32BE(cursor) : trexDuration;
}

function fragmentDuration(bytes, traf, defaultDuration) {
  let duration = 0;
  for (const trun of boxes(bytes, traf.offset + traf.headerSize, traf.offset + traf.size).filter((box) => box.type === 'trun')) {
    const flags = bytes.readUInt32BE(trun.offset + trun.headerSize) & 0xffffff;
    const count = bytes.readUInt32BE(trun.offset + trun.headerSize + 4);
    let cursor = trun.offset + trun.headerSize + 8;
    if (flags & 1) cursor += 4;
    if (flags & 4) cursor += 4;
    for (let index = 0; index < count; index++) {
      duration += flags & 0x100 ? bytes.readUInt32BE(cursor) : defaultDuration;
      if (flags & 0x100) cursor += 4;
      if (flags & 0x200) cursor += 4;
      if (flags & 0x400) cursor += 4;
      if (flags & 0x800) cursor += 4;
    }
  }
  return duration;
}

// This is deliberately a fixture-only splitter: each input has one track and
// relative moof addressing, so every moof+mdat remains independently readable.
export function splitDashTrack(bytes, name, baseUrl) {
  const top = boxes(bytes);
  const moov = top.find((box) => box.type === 'moov');
  const trak = child(bytes, moov, 'trak');
  const mdhd = child(bytes, child(bytes, trak, 'mdia'), 'mdhd');
  const version = bytes[mdhd.offset + mdhd.headerSize];
  const timescale = bytes.readUInt32BE(mdhd.offset + mdhd.headerSize + (version === 1 ? 20 : 12));
  const trex = child(bytes, child(bytes, moov, 'mvex'), 'trex');
  const trexDuration = bytes.readUInt32BE(trex.offset + trex.headerSize + 12);
  const fragments = top.filter((box) => box.type === 'moof');
  const initialization = bytes.subarray(0, fragments[0].offset);
  const segments = fragments.map((moof, index) => {
    const traf = child(bytes, moof, 'traf');
    const tfdt = child(bytes, traf, 'tfdt');
    const tfdtVersion = bytes[tfdt.offset + tfdt.headerSize];
    const timestamp = tfdtVersion === 1
      ? Number(bytes.readBigUInt64BE(tfdt.offset + tfdt.headerSize + 4))
      : bytes.readUInt32BE(tfdt.offset + tfdt.headerSize + 4);
    const ticks = fragmentDuration(bytes, traf, sampleDuration(bytes, traf, trexDuration));
    const end = fragments[index + 1]?.offset ?? top.find((box) => box.type === 'mfra')?.offset ?? bytes.length;
    return { bytes: bytes.subarray(moof.offset, end), ticks, timestamp,
      url: `${baseUrl}${name}_${String(index + 1).padStart(9, '0')}.cmf${name === 'audio' ? 'a' : 'v'}` };
  });
  return { initialization, initializationUrl: `${baseUrl}${name}init.cmf${name === 'audio' ? 'a' : 'v'}`,
    timescale, segments };
}

export function segmentedDashFixture(video, audio, baseUrl, scheme = null) {
  const videoTrack = splitDashTrack(video, 'video', baseUrl);
  const audioTrack = splitDashTrack(audio, 'audio', baseUrl);
  const adaptation = (track, type, id) => `<AdaptationSet mimeType="${type}/mp4">`
    + (scheme ? `<ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="${scheme}"/>` : '')
    + `<SegmentTemplate timescale="${track.timescale}" startNumber="1"/>`
    + `<Representation id="${id}" bandwidth="${type === 'video' ? 224000 : 128000}" `
    + (type === 'video' ? 'width="160" height="90" codecs="avc1.42c00a"' : 'codecs="mp4a.40.2" audioSamplingRate="48000"')
    + `><SegmentTemplate media="${type}_$Number%09d$.cmf${type === 'video' ? 'v' : 'a'}" `
    + `initialization="${type}init.cmf${type === 'video' ? 'v' : 'a'}"><SegmentTimeline>`
    + track.segments.map((segment) => `<S t="${segment.timestamp}" d="${segment.ticks}"/>`).join('')
    + '</SegmentTimeline></SegmentTemplate></Representation></AdaptationSet>';
  const duration = Math.max(...[videoTrack, audioTrack].map((track) => {
    const last = track.segments.at(-1);
    return (last.timestamp + last.ticks) / track.timescale;
  }));
  const manifest = `<?xml version="1.0"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" `
    + `mediaPresentationDuration="PT${duration}S"><Period start="PT0S" duration="PT${duration}S">`
    + adaptation(videoTrack, 'video', 'v1') + adaptation(audioTrack, 'audio', 'a1') + '</Period></MPD>';
  const resources = new Map([videoTrack, audioTrack].flatMap((track) => [
    [track.initializationUrl, track.initialization], ...track.segments.map((segment) => [segment.url, segment.bytes]),
  ]));
  return { manifest, resources, videoTrack, audioTrack, duration };
}

export function withAudioPrimingEdit(bytes, mediaTime = 1024) {
  const top = boxes(bytes);
  const moov = top.find((box) => box.type === 'moov');
  const trak = child(bytes, moov, 'trak');
  const mvhd = child(bytes, moov, 'mvhd');
  const timescale = bytes.readUInt32BE(mvhd.offset + mvhd.headerSize + (bytes[mvhd.offset + mvhd.headerSize] === 1 ? 20 : 12));
  const edts = Buffer.alloc(36);
  edts.writeUInt32BE(36, 0); edts.write('edts', 4);
  edts.writeUInt32BE(28, 8); edts.write('elst', 12);
  edts.writeUInt32BE(1, 20); // One edit, version 0.
  edts.writeUInt32BE(Math.round(2.022 * timescale), 24);
  edts.writeInt32BE(mediaTime, 28); edts.writeInt16BE(1, 32);
  const insertAt = trak.offset + trak.size;
  const result = Buffer.concat([bytes.subarray(0, insertAt), edts, bytes.subarray(insertAt,
    top.find((box) => box.type === 'mfra')?.offset ?? bytes.length)]);
  result.writeUInt32BE(moov.size + edts.length, moov.offset);
  result.writeUInt32BE(trak.size + edts.length, trak.offset);
  return result;
}
