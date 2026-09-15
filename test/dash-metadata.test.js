import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { inspectDashManifest, parseDashMetadata } from '../src/dash-metadata.js';

const manifestUrl = 'https://pb3.rplay.live/example/manifest.mpd';
const templateManifest = await readFile(new URL('./fixtures/dash-template-manifest.mpd', import.meta.url), 'utf8');

function timelineManifest(segmentTemplate, representation = '') {
  return `<MPD type="static"><Period start="PT0S"><AdaptationSet contentType="video" mimeType="video/mp4">
    <Representation id="v" bandwidth="1000">${representation}${segmentTemplate}</Representation>
  </AdaptationSet></Period></MPD>`;
}

function template(attributes = '', timeline = '<S t="0" d="6" r="1"/>') {
  return `<SegmentTemplate media="part-$Number%09d$.cmfv" initialization="init.cmfv" ${attributes}>
    <SegmentTimeline>${timeline}</SegmentTimeline></SegmentTemplate>`;
}

describe('DASH metadata', () => {
  it('expands the observed 385-segment video layout and variable-duration audio', () => {
    const result = parseDashMetadata(templateManifest, manifestUrl);
    expect(result.duration).toBe(2304.266);
    expect(result.streams).toHaveLength(2);
    const [stream] = result.streams;
    expect(stream).toMatchObject({
      url: `${manifestUrl}#representation=1`, audioUrl: `${manifestUrl}#representation=4`,
      representationId: '1', audioRepresentationId: '4', bandwidth: 8320000,
      hasContentProtection: true, unavailableReason: null,
      videoSegments: { timescale: 90000, initializationUrl: 'https://pb3.rplay.live/example/drm_sample_aes_V_2init.cmfv' },
      audioSegments: { timescale: 48000, initializationUrl: 'https://pb3.rplay.live/example/drm_sample_aes_Ainit.cmfa' },
    });
    expect(stream.videoSegments.segments).toHaveLength(385);
    expect(stream.videoSegments.segments[0]).toEqual({
      url: 'https://pb3.rplay.live/example/drm_sample_aes_V_2_000000001.cmfv', timestamp: 0, duration: 6,
    });
    expect(stream.videoSegments.segments.at(-1)).toEqual({
      url: 'https://pb3.rplay.live/example/drm_sample_aes_V_2_000000385.cmfv', timestamp: 2304, duration: 24000 / 90000,
    });
    expect(stream.audioSegments.segments).toHaveLength(9);
    expect(stream.audioSegments.segments.slice(0, 5).map((segment) => segment.duration))
      .toEqual([289792, 288768, 287744, 287744, 287744].map((duration) => duration / 48000));
    expect(stream.audioSegments.segments[5].timestamp).toBe(1441792 / 48000);
    expect(stream.audioSegments.segments.at(-1).url).toContain('_000000009.cmfa');
    expect(result.relatedUrls).toContain(stream.videoSegments.initializationUrl);
    expect(result.relatedUrls).toContain(stream.videoSegments.segments.at(-1).url);
    expect(result.relatedUrls).toContain(stream.audioSegments.segments.at(-1).url);
    expect(result.relatedUrls.some((url) => url.includes('$Number'))).toBe(false);
    expect(result.streams[1].videoSegments.segments[0].url).toContain('V_1_000000001.cmfv');
  });

  it('inherits template attributes and timeline while resolving BaseURLs and concrete CDN alternatives', () => {
    const result = parseDashMetadata(`<MPD><BaseURL>media/</BaseURL><BaseURL>https://alt.rplay.live/media/</BaseURL>
      <Period><SegmentTemplate timescale="10" startNumber="7" initialization="$RepresentationID$-init.mp4"
        media="$RepresentationID$-$Bandwidth$-$Number$-$Time$.m4s"><SegmentTimeline><S d="20" r="1"/></SegmentTimeline></SegmentTemplate>
        <AdaptationSet contentType="video"><Representation id="v" bandwidth="1000">
          <BaseURL>quality/</BaseURL><SegmentTemplate startNumber="10"/></Representation>
        </AdaptationSet></Period></MPD>`, manifestUrl);
    expect(result.streams[0].unavailableReason).toBeNull();
    expect(result.streams[0].videoSegments).toEqual({
      timescale: 10, initializationUrl: 'https://pb3.rplay.live/example/media/quality/v-init.mp4',
      segments: [
        { url: 'https://pb3.rplay.live/example/media/quality/v-1000-10-0.m4s', duration: 2, timestamp: 0 },
        { url: 'https://pb3.rplay.live/example/media/quality/v-1000-11-20.m4s', duration: 2, timestamp: 2 },
      ],
    });
    expect(result.relatedUrls).toContain('https://alt.rplay.live/media/quality/v-1000-11-20.m4s');
    expect(result.relatedUrls).not.toContain('https://alt.rplay.live/media/quality/');
  });

  it('replaces an inherited timeline rather than concatenating it', () => {
    const result = parseDashMetadata(`<MPD><Period><AdaptationSet contentType="video">
      ${template('timescale="2"')}<Representation id="v">${template('', '<S d="3"/>')}</Representation>
    </AdaptationSet></Period></MPD>`, manifestUrl);
    expect(result.streams[0].videoSegments.segments).toHaveLength(1);
    expect(result.streams[0].videoSegments.segments[0].duration).toBe(1.5);
  });

  it('expands an audio timeline with all 385 variable-duration segments without assuming video durations', () => {
    const repeats = Array.from({ length: 94 }, (_, index) => `<S t="${1441792 + index * 1152000}" d="288768"/>`
      + `<S t="${1730560 + index * 1152000}" d="287744" r="2"/>`).join('');
    const audioTimeline = '<S t="0" d="289792"/><S t="289792" d="288768"/><S t="578560" d="287744" r="2"/>'
      + repeats + '<S t="109729792" d="288768"/><S t="110018560" d="287744" r="1"/>'
      + '<S t="110594048" d="10240"/>';
    const xml = templateManifest.replace(/(<SegmentTimeline>\s*)<S t="0" d="289792"\/>[\s\S]*?(<\/SegmentTimeline>)/,
      `$1${audioTimeline}$2`);
    const [stream] = parseDashMetadata(xml, manifestUrl).streams;
    expect(stream.unavailableReason).toBeNull();
    expect(stream.audioSegments.segments).toHaveLength(385);
    const final = stream.audioSegments.segments.at(-1);
    expect(final).toEqual({ url: 'https://pb3.rplay.live/example/drm_sample_aes_A_000000385.cmfa',
      timestamp: 110594048 / 48000, duration: 10240 / 48000 });
    expect(final.timestamp + final.duration).toBeCloseTo(2304.256, 6);
  });

  it.each([
    ['negative repeat', template('', '<S d="6" r="-1"/>')],
    ['fractional repeat', template('', '<S d="6" r="1.5"/>')],
    ['fractional duration', template('', '<S d="6.5"/>')],
    ['fractional timestamp', template('', '<S t="0.5" d="6"/>')],
    ['nonzero first timestamp', template('', '<S t="1" d="6"/>')],
    ['gap', template('', '<S d="6"/><S t="7" d="6"/>')],
    ['overlap', template('', '<S d="6"/><S t="5" d="6"/>')],
    ['zero duration', template('', '<S d="0"/>')],
    ['zero timescale', template('timescale="0"')],
    ['fractional timescale', template('timescale="1.5"')],
    ['time offset', template('presentationTimeOffset="1"')],
    ['invalid offset', template('presentationTimeOffset="invalid"')],
    ['fractional numbering', template('startNumber="1.5"')],
    ['unsafe numbering', template('startNumber="9007199254740991"')],
    ['unsafe timestamp arithmetic', template('', '<S d="9007199254740991" r="1"/>')],
    ['too many segments', template('', '<S d="6" r="10000"/>')],
    ['missing initialization', '<SegmentTemplate media="part-$Number$.m4s"><SegmentTimeline><S d="6"/></SegmentTimeline></SegmentTemplate>'],
    ['missing timeline', '<SegmentTemplate media="part-$Number$.m4s" initialization="init.mp4" duration="6"/>'],
    ['unknown token', template().replace('Number%09d', 'Unknown')],
    ['unsupported padding', template().replace('Number%09d', 'Number%099d')],
    ['unsafe URL scheme', template().replace('init.cmfv', 'file:///init.cmfv')],
    ['repeated media URL', template().replace('part-$Number%09d$.cmfv', 'part.cmfv')],
    ['excessive URL length', template().replace('part-', `${'x'.repeat(8192)}-`)],
  ])('keeps the template layout unsupported for %s', (_name, segment) => {
    const [stream] = parseDashMetadata(timelineManifest(segment), manifestUrl).streams;
    expect(stream.unavailableReason).toBe('dashLayoutUnsupported');
    expect(stream.videoSegments).toBeNull();
  });

  it.each([
    ['dynamic', (xml) => xml.replace('type="static"', 'type="dynamic"')],
    ['multiple periods', (xml) => xml.replace('</MPD>', '<Period/></MPD>')],
    ['nonzero period start', (xml) => xml.replace('start="PT0S"', 'start="PT1S"')],
  ])('does not expand template downloads for %s presentations', (_name, change) => {
    const result = parseDashMetadata(change(timelineManifest(template())), manifestUrl);
    expect(result.streams[0].unavailableReason).toBe('dashLayoutUnsupported');
    expect(result.streams[0].videoSegments).toBeNull();
    expect(result.relatedUrls).toEqual([manifestUrl]);
  });

  it('supports the bounded 10000-segment limit but does not expand one segment beyond it', () => {
    const [stream] = parseDashMetadata(timelineManifest(template('', '<S d="1" r="9999"/>')), manifestUrl).streams;
    expect(stream.unavailableReason).toBeNull();
    expect(stream.videoSegments.segments).toHaveLength(10000);
    const [excessive] = parseDashMetadata(timelineManifest(template('', '<S d="1" r="9999"/><S d="1"/>')), manifestUrl).streams;
    expect(excessive.unavailableReason).toBe('dashLayoutUnsupported');
  });

  it('resolves template media against the redirected manifest URL', async () => {
    const response = new Response(timelineManifest(template()));
    Object.defineProperty(response, 'url', { value: 'https://pb3.rplay.live/redirected/manifest.mpd' });
    const result = await inspectDashManifest(manifestUrl, async () => response);
    expect(result.streams[0].url).toBe('https://pb3.rplay.live/redirected/manifest.mpd#representation=v');
    expect(result.streams[0].videoSegments.segments[0].url).toBe('https://pb3.rplay.live/redirected/part-000000001.cmfv');
  });

  it('replaces an existing manifest fragment when constructing selection identities', () => {
    const url = `${manifestUrl}#previous`;
    const [stream] = parseDashMetadata(timelineManifest(template()), url).streams;
    expect(stream.url).toBe(`${manifestUrl}#representation=v`);
    const [unsupported] = parseDashMetadata(timelineManifest(template('timescale="0"')), url).streams;
    expect(unsupported.url).toBe(`${manifestUrl}#representation=v`);
  });

  it('bounds expansion across representations and omits excess concrete URLs', () => {
    const representations = Array.from({ length: 3 }, (_, index) => `<Representation id="v${index}">
      ${template('', '<S d="1" r="9999"/>').replace('part-', `v${index}-`)}</Representation>`).join('');
    const result = parseDashMetadata(`<MPD><Period><AdaptationSet contentType="video">${representations}
      </AdaptationSet></Period></MPD>`, manifestUrl);
    expect(result.streams.map((stream) => stream.unavailableReason)).toEqual([null, null, 'dashLayoutUnsupported']);
    expect(result.streams[2].videoSegments).toBeNull();
    expect(result.relatedUrls).toHaveLength(20002);
    expect(result.relatedUrls.some((url) => url.includes('/v2-'))).toBe(false);
  });

  it('includes CDN alternatives in the whole-manifest segment budget', () => {
    const bases = '<BaseURL>https://a.rplay.live/</BaseURL><BaseURL>https://b.rplay.live/</BaseURL><BaseURL>https://c.rplay.live/</BaseURL>';
    const result = parseDashMetadata(timelineManifest(template('', '<S d="1" r="9999"/>'), bases), manifestUrl);
    expect(result.streams[0].unavailableReason).toBe('dashLayoutUnsupported');
    expect(result.relatedUrls).toEqual([manifestUrl]);
  });

  it('bounds total expanded URL characters across short manifests with long media templates', () => {
    const prefix = 'x'.repeat(2000);
    const representations = Array.from({ length: 3 }, (_, index) => `<Representation id="v${index}">
      ${template('', '<S d="1" r="999"/>').replace('part-', `${prefix}-v${index}-`)}</Representation>`).join('');
    const result = parseDashMetadata(`<MPD><Period><AdaptationSet contentType="video">${representations}
      </AdaptationSet></Period></MPD>`, manifestUrl);
    expect(result.streams.map((stream) => stream.unavailableReason)).toEqual([null, null, 'dashLayoutUnsupported']);
    const expandedCharacters = result.streams.reduce((total, stream) => total + (stream.videoSegments
      ? stream.videoSegments.initializationUrl.length + stream.videoSegments.segments.reduce((sum, segment) => sum + segment.url.length, 0)
      : 0), 0);
    expect(expandedCharacters).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(result.relatedUrls.some((url) => url.includes('-v2-'))).toBe(false);
  });

  it('counts initialization URLs and duplicate CDN-expanded strings toward the character budget', () => {
    const initialization = 'i'.repeat(4000);
    const media = 'm'.repeat(4000);
    const bases = '<BaseURL>https://a.rplay.live/</BaseURL><BaseURL>https://b.rplay.live/</BaseURL>';
    const segment = template('', '<S d="1" r="519"/>').replace('init.cmfv', initialization)
      .replace('part-', `${media}-`);
    const result = parseDashMetadata(timelineManifest(segment, bases), manifestUrl);
    expect(result.streams[0].unavailableReason).toBe('dashLayoutUnsupported');
    expect(result.relatedUrls).toEqual([manifestUrl]);
  });

  it('provides downloadable quality options and pairs a complete audio track', () => {
    const { streams } = parseDashMetadata(`<MPD type="static"><Period duration="PT60S">
      <AdaptationSet contentType="video" mimeType="video/mp4" codecs="avc1.640028">
        <SegmentBase timescale="90000"/>
        <Representation id="v1080" width="1920" height="1080" bandwidth="4000000"><BaseURL>1080.cmfv</BaseURL></Representation>
        <Representation id="v720" width="1280" height="720" bandwidth="2000000"><BaseURL>720.cmfv</BaseURL></Representation>
      </AdaptationSet>
      <AdaptationSet contentType="audio" mimeType="audio/mp4" lang="ja"><Role value="main"/>
        <Representation id="ja" bandwidth="128000"><BaseURL>audio.cmfa</BaseURL><SegmentBase/></Representation>
      </AdaptationSet>
    </Period></MPD>`, manifestUrl);
    expect(streams).toHaveLength(2);
    expect(streams[0]).toMatchObject({
      representationId: 'v1080', resolution: '1920x1080', width: 1920, height: 1080,
      url: 'https://pb3.rplay.live/example/1080.cmfv', bandwidth: 4128000,
      hasExternalAudio: true, audioUrl: 'https://pb3.rplay.live/example/audio.cmfa',
      audioRepresentationId: 'ja', audioLanguage: 'ja', unavailableReason: null,
    });
    expect(streams[1].resolution).toBe('1280x720');
    expect(streams[1].unavailableReason).toBeNull();
  });

  it('keeps a clear video variant available when another variant is protected', () => {
    const { streams } = parseDashMetadata(`<MPD><Period><AdaptationSet contentType="video">
      <Representation id="clear"><BaseURL>clear.cmfv</BaseURL></Representation>
      <Representation id="protected"><ContentProtection schemeIdUri="urn:uuid:test"/><BaseURL>protected.cmfv</BaseURL></Representation>
    </AdaptationSet></Period></MPD>`, manifestUrl);
    expect(streams.map((stream) => stream.unavailableReason)).toEqual([null, null]);
    expect(streams.map((stream) => stream.hasContentProtection)).toEqual([false, true]);
  });

  it('does not mark a video as downloadable when its only audio uses an unsupported layout', () => {
    const { streams } = parseDashMetadata(`<MPD><Period>
      <AdaptationSet contentType="video"><Representation><BaseURL>video.cmfv</BaseURL></Representation></AdaptationSet>
      <AdaptationSet contentType="audio"><Representation><BaseURL>audio.cmfa</BaseURL>
        <SegmentTemplate media="audio-$Number$.m4s" initialization="init.mp4"/></Representation></AdaptationSet>
    </Period></MPD>`, manifestUrl);
    expect(streams[0].hasExternalAudio).toBe(true);
    expect(streams[0].unavailableReason).toBe('dashLayoutUnsupported');
  });

  it.each([
    ['dynamic', '<MPD type="dynamic"><Period>', '</Period></MPD>', ''],
    ['multiple periods', '<MPD><Period>', '</Period><Period/></MPD>', ''],
    ['templates', '<MPD><Period>', '</Period></MPD>', '<SegmentTemplate media="$Number$.m4s"/>'],
    ['segment lists', '<MPD><Period>', '</Period></MPD>', '<SegmentList><SegmentURL media="part.m4s"/></SegmentList>'],
    ['time offsets', '<MPD><Period>', '</Period></MPD>', '<SegmentBase presentationTimeOffset="90000" timescale="90000"/>'],
    ['separate initialization', '<MPD><Period>', '</Period></MPD>', '<SegmentBase><Initialization sourceURL="init.mp4"/></SegmentBase>'],
  ])('does not offer an incomplete download for %s', (_name, start, end, segment) => {
    const { streams } = parseDashMetadata(`${start}<AdaptationSet contentType="video">
      <Representation><BaseURL>video.cmfv</BaseURL>${segment}</Representation></AdaptationSet>${end}`, manifestUrl);
    expect(streams[0].unavailableReason).toBe('dashLayoutUnsupported');
  });

  it('resolves hierarchical BaseURLs and alternate CDNs without including license URLs', () => {
    const xml = `<d:MPD xmlns:d="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT1H2M3.5S">
      <d:BaseURL>./media/</d:BaseURL><d:BaseURL>https://alt.rplay.live/media/</d:BaseURL>
      <d:Period><d:BaseURL>period/</d:BaseURL><d:AdaptationSet>
        <d:ContentProtection schemeIdUri="urn:uuid:example"><License>https://license.example/key</License></d:ContentProtection>
        <d:Representation id="1"><d:BaseURL serviceLocation="one">video.cmfv?x=1&amp;y=2</d:BaseURL>
          <d:SegmentBase indexRange="100-200"><d:Initialization range="0-99"/></d:SegmentBase>
        </d:Representation>
        <d:Representation id="2"><d:BaseURL>other.cmfv</d:BaseURL></d:Representation>
      </d:AdaptationSet></d:Period>
    </d:MPD>`;
    const result = parseDashMetadata(xml, manifestUrl);
    expect(result.duration).toBe(3723.5);
    expect(result.hasContentProtection).toBe(true);
    expect(result.relatedUrls).toEqual(expect.arrayContaining([
      'https://pb3.rplay.live/example/media/period/video.cmfv?x=1&y=2',
      'https://alt.rplay.live/media/period/video.cmfv?x=1&y=2',
      'https://pb3.rplay.live/example/media/period/other.cmfv',
    ]));
    expect(result.relatedUrls.some((url) => url.includes('license.example'))).toBe(false);
    expect(result.relatedUrls).not.toContain('https://pb3.rplay.live/example/media/period/');
  });

  it('collects explicit SegmentList references and does not mistake comments for protection', () => {
    const result = parseDashMetadata(`<MPD><Period><AdaptationSet><Representation>
      <!-- <ContentProtection schemeIdUri="test"/> -->
      <BaseURL>segments/</BaseURL><SegmentList>
        <Initialization sourceURL="init.mp4"/>
        <SegmentURL media="one.cmfv" mediaRange="0-50"/>
        <SegmentURL media="two.cmfv"/>
      </SegmentList></Representation></AdaptationSet></Period></MPD>`, manifestUrl);
    expect(result.hasContentProtection).toBe(false);
    expect(result.relatedUrls).toEqual(expect.arrayContaining([
      'https://pb3.rplay.live/example/segments/init.mp4',
      'https://pb3.rplay.live/example/segments/one.cmfv',
      'https://pb3.rplay.live/example/segments/two.cmfv',
    ]));
    expect(result.duration).toBeNull();
  });

  it.each([
    '<html><body>Sign in</body></html>',
    '<MPD><Period></MPD>',
    '<!DOCTYPE MPD [<!ENTITY path "video.cmfv">]><MPD><BaseURL>&path;</BaseURL></MPD>',
  ])('rejects invalid or unsupported XML: %s', (xml) => {
    expect(() => parseDashMetadata(xml, manifestUrl)).toThrow();
  });

  it('reads only a redirected MPD and resolves relative media against its final URL', async () => {
    const response = new Response('<MPD><Period><AdaptationSet><Representation><BaseURL>video.cmfv</BaseURL>'
      + '</Representation></AdaptationSet></Period></MPD>');
    Object.defineProperty(response, 'url', { value: 'https://pb3.rplay.live/redirected/manifest.mpd' });
    const fetchFn = vi.fn(async () => response);
    const result = await inspectDashManifest(manifestUrl, fetchFn);
    expect(result.relatedUrls).toContain('https://pb3.rplay.live/redirected/video.cmfv');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('bounds a response even if the server returns a media file instead of a manifest', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
      cancel,
    });
    await expect(inspectDashManifest(manifestUrl, async () => new Response(body))).rejects.toThrow(/too large/);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('bounds nested CDN alternatives rather than expanding an unbounded URL product', () => {
    const alternatives = Array.from({ length: 9 }, (_, index) => `<BaseURL>${index}/</BaseURL>`).join('');
    expect(() => parseDashMetadata(`<MPD>${alternatives}<Period>${alternatives}</Period></MPD>`, manifestUrl))
      .toThrow(/BaseURL combinations/);
  });
});
