import { describe, expect, it, vi } from 'vitest';
import { inspectDashManifest, parseDashMetadata } from '../src/dash-metadata.js';

const manifestUrl = 'https://pb3.rplay.live/example/manifest.mpd';

describe('DASH metadata', () => {
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
