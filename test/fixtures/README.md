# DASH fixtures

These two-second fixtures contain only an FFmpeg-generated test pattern and a
440 Hz sine wave. They do not contain downloaded or user media. The tests read
the committed files and do not require FFmpeg to be installed.

`cenc-*.mp4` and `cbcs-*.mp4` encrypt the same samples with public synthetic
keys. Regenerate them with `node scripts/generate-drm-fixtures.mjs` (FFmpeg
and ffprobe required). CENC encryption is produced by FFmpeg; CBCS uses
Node's AES-CBC, with one encrypted block followed by nine clear blocks and
per-NAL subsample metadata. Both preserve the original CMAF fragmentation.
The fixture generator contains the test KIDs and keys; no site keys or device
credentials are included. Tests compare all decrypted audio/video packets
against the original clear files. The browser CDM signs real challenges using
an ephemeral synthetic RSA identity; the simulated license server independently
wraps content keys and signs each response. No companion service is used.

To regenerate from the repository root:

```sh
ffmpeg -f lavfi -i 'testsrc2=size=160x90:rate=10:duration=2' -an -c:v libx264 -preset ultrafast -pix_fmt yuv420p -g 10 -bf 0 -movflags '+frag_keyframe+empty_moov+default_base_moof' -f mp4 test/fixtures/dash-video.cmfv
ffmpeg -f lavfi -i 'sine=frequency=440:sample_rate=48000:duration=2' -vn -c:a aac -b:a 64k -movflags '+frag_keyframe+empty_moov+default_base_moof' -f mp4 test/fixtures/dash-audio.cmfa
```
