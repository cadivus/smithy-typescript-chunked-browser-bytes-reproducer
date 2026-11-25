# Results for smithy `main` @ `56723ea17952eef716a7f3bc14ba8607ad04409d`

- @aws-sdk/client-s3 3.1177.0; generated 2026-11-25T13:27:20.031Z; part ALL
- Bundle check: @smithy/core roots in browser bundle = node_modules/@smithy/core; marker = [{"ref":"main","sha":"56723ea17952eef716a7f3bc14ba8607ad04409d"}]; fix fingerprint present = false

## A. Encoder output (browser bundle, no network)

| | direct encoder call | via S3 PutObject middleware |
|---|---|---|
| enqueued chunk types | string | string |
| all chunks Uint8Array | false | false |
| declared chunk sizes | 8192, 8192, 14, 19, 0 | 8192, 8192, 14, 0 |
| source byte length | 16417 | 16398 |
| trailer checksum (CRC32) | AAAAAA== | AAAAAA== |
| true checksum (CRC32) | QBoVwA== | dgq1EQ== |
| framing preview | `2000\r\n0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27, … 13\r\nnaïve string chunk\r\n0\r\nx-amz-checksum-crc32:AAAAAA==\r\n\r\n` | `2000\r\n0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27, … 195,182,114,108,100,10\r\n0\r\nx-amz-checksum-crc32:AAAAAA==\r\n\r\n` |

Runtime config in bundle: {"requestHandler":"_FetchHttpHandler","streamHasher":"blobHasher2"}. The direct call adds a non-ASCII string chunk ("naïve string chunk", 18 chars / 19 UTF-8 bytes).

## B/C/D. PutObject over each runtime's fetch

| scenario | runtime | target | body | checksum calc | outcome |
|---|---|---|---|---|---|
| B/C | chromium 159.0.8154.6 | stub HTTP/1.1 | ReadableStream<Uint8Array> | WHEN_SUPPORTED | ❌ TypeError: Failed to fetch; net: net::ERR_ALPN_NEGOTIATION_FAILED; stub: request never completed at the stub |
| B/C | chromium 159.0.8154.6 | stub HTTP/1.1 | ReadableStream<string> (ASCII) | WHEN_SUPPORTED | ❌ TypeError: Failed to fetch; net: net::ERR_ALPN_NEGOTIATION_FAILED; stub: request never completed at the stub |
| B/C | chromium 159.0.8154.6 | stub HTTP/1.1 | ReadableStream<Uint8Array>, chunks < 8 KiB | WHEN_SUPPORTED | ❌ TypeError: Failed to fetch; net: net::ERR_ALPN_NEGOTIATION_FAILED; stub: request never completed at the stub |
| D | chromium 159.0.8154.6 | stub HTTP/1.1 | ReadableStream<Uint8Array> | WHEN_REQUIRED | ❌ TypeError: Failed to fetch; net: net::ERR_ALPN_NEGOTIATION_FAILED; stub: request never completed at the stub |
| control | chromium 159.0.8154.6 | stub HTTP/1.1 | Uint8Array | WHEN_SUPPORTED | ✅ 200 (stub saw HTTP/1.1, bytes+checksum verified) |
| B/C | chromium 159.0.8154.6 | stub HTTP/2 (TLS) | ReadableStream<Uint8Array> | WHEN_SUPPORTED | ❌ TypeError: Failed to fetch; net: net::ERR_FAILED; stub HTTP/2.0: StubInvalidChunkFraming – no chunk-size line at offset 0, received 0 B starting "" |
| B/C | chromium 159.0.8154.6 | stub HTTP/2 (TLS) | ReadableStream<string> (ASCII) | WHEN_SUPPORTED | ❌ TypeError: Failed to fetch; net: net::ERR_FAILED; stub HTTP/2.0: StubInvalidChunkFraming – no chunk-size line at offset 0, received 0 B starting "" |
| B/C | chromium 159.0.8154.6 | stub HTTP/2 (TLS) | ReadableStream<Uint8Array>, chunks < 8 KiB | WHEN_SUPPORTED | ❌ TypeError: Failed to fetch; net: net::ERR_FAILED; stub HTTP/2.0: StubInvalidChunkFraming – no chunk-size line at offset 0, received 0 B starting "" |
| D | chromium 159.0.8154.6 | stub HTTP/2 (TLS) | ReadableStream<Uint8Array> | WHEN_REQUIRED | ✅ 200 (stub saw HTTP/2.0, bytes+checksum verified) |
| control | chromium 159.0.8154.6 | stub HTTP/2 (TLS) | Uint8Array | WHEN_SUPPORTED | ✅ 200 (stub saw HTTP/2.0, bytes+checksum verified) |
| B/C | chromium 159.0.8154.6 | real S3 | ReadableStream<Uint8Array> | WHEN_SUPPORTED | ❌ TypeError: Failed to fetch; net: net::ERR_ALPN_NEGOTIATION_FAILED; S3: no object |
| B/C | chromium 159.0.8154.6 | real S3 | ReadableStream<string> (ASCII) | WHEN_SUPPORTED | ❌ TypeError: Failed to fetch; net: net::ERR_ALPN_NEGOTIATION_FAILED; S3: no object |
| B/C | chromium 159.0.8154.6 | real S3 | ReadableStream<Uint8Array>, chunks < 8 KiB | WHEN_SUPPORTED | ❌ TypeError: Failed to fetch; net: net::ERR_ALPN_NEGOTIATION_FAILED; S3: no object |
| D | chromium 159.0.8154.6 | real S3 | ReadableStream<Uint8Array> | WHEN_REQUIRED | ❌ TypeError: Failed to fetch; net: net::ERR_ALPN_NEGOTIATION_FAILED; S3: no object |
| control | chromium 159.0.8154.6 | real S3 | Uint8Array | WHEN_SUPPORTED | ✅ 200 (object stored, bytes match) |
| B/C | firefox 159.0 | stub HTTP/1.1 | ReadableStream<Uint8Array> | WHEN_SUPPORTED | ❌ StubInvalidChunkFraming: no chunk-size line at offset 0; server code StubInvalidChunkFraming; stub HTTP/1.1: StubInvalidChunkFraming – no chunk-size line at offset 0, received 23 B starting "[object ReadableStream]" |
| B/C | firefox 159.0 | stub HTTP/1.1 | ReadableStream<string> (ASCII) | WHEN_SUPPORTED | ❌ StubInvalidChunkFraming: no chunk-size line at offset 0; server code StubInvalidChunkFraming; stub HTTP/1.1: StubInvalidChunkFraming – no chunk-size line at offset 0, received 23 B starting "[object ReadableStream]" |
| B/C | firefox 159.0 | stub HTTP/1.1 | ReadableStream<Uint8Array>, chunks < 8 KiB | WHEN_SUPPORTED | ❌ StubInvalidChunkFraming: no chunk-size line at offset 0; server code StubInvalidChunkFraming; stub HTTP/1.1: StubInvalidChunkFraming – no chunk-size line at offset 0, received 23 B starting "[object ReadableStream]" |
| D | firefox 159.0 | stub HTTP/1.1 | ReadableStream<Uint8Array> | WHEN_REQUIRED | ❌ StubPayloadMismatch: StubPayloadMismatch; server code StubPayloadMismatch; stub HTTP/1.1: StubPayloadMismatch, received 23 B starting "[object ReadableStream]" |
| control | firefox 159.0 | stub HTTP/1.1 | Uint8Array | WHEN_SUPPORTED | ✅ 200 (stub saw HTTP/1.1, bytes+checksum verified) |
| B/C | firefox 159.0 | stub HTTP/2 (TLS) | ReadableStream<Uint8Array> | WHEN_SUPPORTED | ❌ StubInvalidChunkFraming: no chunk-size line at offset 0; server code StubInvalidChunkFraming; stub HTTP/2.0: StubInvalidChunkFraming – no chunk-size line at offset 0, received 23 B starting "[object ReadableStream]" |
| B/C | firefox 159.0 | stub HTTP/2 (TLS) | ReadableStream<string> (ASCII) | WHEN_SUPPORTED | ❌ StubInvalidChunkFraming: no chunk-size line at offset 0; server code StubInvalidChunkFraming; stub HTTP/2.0: StubInvalidChunkFraming – no chunk-size line at offset 0, received 23 B starting "[object ReadableStream]" |
| B/C | firefox 159.0 | stub HTTP/2 (TLS) | ReadableStream<Uint8Array>, chunks < 8 KiB | WHEN_SUPPORTED | ❌ StubInvalidChunkFraming: no chunk-size line at offset 0; server code StubInvalidChunkFraming; stub HTTP/2.0: StubInvalidChunkFraming – no chunk-size line at offset 0, received 23 B starting "[object ReadableStream]" |
| D | firefox 159.0 | stub HTTP/2 (TLS) | ReadableStream<Uint8Array> | WHEN_REQUIRED | ❌ StubPayloadMismatch: StubPayloadMismatch; server code StubPayloadMismatch; stub HTTP/2.0: StubPayloadMismatch, received 23 B starting "[object ReadableStream]" |
| control | firefox 159.0 | stub HTTP/2 (TLS) | Uint8Array | WHEN_SUPPORTED | ✅ 200 (stub saw HTTP/2.0, bytes+checksum verified) |
| B/C | firefox 159.0 | real S3 | ReadableStream<Uint8Array> | WHEN_SUPPORTED | ❌ IncompleteBody: The request body terminated unexpectedly; server code IncompleteBody; S3: no object |
| B/C | firefox 159.0 | real S3 | ReadableStream<string> (ASCII) | WHEN_SUPPORTED | ❌ IncompleteBody: The request body terminated unexpectedly; server code IncompleteBody; S3: no object |
| B/C | firefox 159.0 | real S3 | ReadableStream<Uint8Array>, chunks < 8 KiB | WHEN_SUPPORTED | ❌ IncompleteBody: The request body terminated unexpectedly; server code IncompleteBody; S3: no object |
| D | firefox 159.0 | real S3 | ReadableStream<Uint8Array> | WHEN_REQUIRED | ❌ SignatureDoesNotMatch: The request signature we calculated does not match the signature you provided. Check your key and signing method.; server code SignatureDoesNotMatch; S3: no object |
| control | firefox 159.0 | real S3 | Uint8Array | WHEN_SUPPORTED | ✅ 200 (object stored, bytes match) |
| B | webkit | - | - | - | not run: host is missing system libraries (sudo npx playwright install-deps) |
| B/C | deno 2.9.6 | stub HTTP/1.1 | ReadableStream<Uint8Array> | WHEN_SUPPORTED | ❌ TypeError: fetch failed (cause: Error: expected typed ArrayBufferView); stub: request never completed at the stub |
| B/C | deno 2.9.6 | stub HTTP/1.1 | ReadableStream<string> (ASCII) | WHEN_SUPPORTED | ❌ TypeError: fetch failed (cause: Error: expected typed ArrayBufferView); stub: request never completed at the stub |
| B/C | deno 2.9.6 | stub HTTP/1.1 | ReadableStream<Uint8Array>, chunks < 8 KiB | WHEN_SUPPORTED | ❌ TypeError: fetch failed (cause: Error: expected typed ArrayBufferView); stub: request never completed at the stub |
| D | deno 2.9.6 | stub HTTP/1.1 | ReadableStream<Uint8Array> | WHEN_REQUIRED | ✅ 200 (stub saw HTTP/1.1, bytes+checksum verified) |
| control | deno 2.9.6 | stub HTTP/1.1 | Uint8Array | WHEN_SUPPORTED | ✅ 200 (stub saw HTTP/1.1, bytes+checksum verified) |
| B/C | deno 2.9.6 | stub HTTP/2 (TLS) | ReadableStream<Uint8Array> | WHEN_SUPPORTED | ❌ TypeError: fetch failed (cause: Error: stream error sent by user: unexpected internal error encountered); stub: request never completed at the stub |
| B/C | deno 2.9.6 | stub HTTP/2 (TLS) | ReadableStream<string> (ASCII) | WHEN_SUPPORTED | ❌ TypeError: fetch failed (cause: Error: stream error sent by user: unexpected internal error encountered); stub: request never completed at the stub |
| B/C | deno 2.9.6 | stub HTTP/2 (TLS) | ReadableStream<Uint8Array>, chunks < 8 KiB | WHEN_SUPPORTED | ❌ TypeError: fetch failed (cause: Error: stream error sent by user: unexpected internal error encountered); stub: request never completed at the stub |
| D | deno 2.9.6 | stub HTTP/2 (TLS) | ReadableStream<Uint8Array> | WHEN_REQUIRED | ✅ 200 (stub saw HTTP/2.0, bytes+checksum verified) |
| control | deno 2.9.6 | stub HTTP/2 (TLS) | Uint8Array | WHEN_SUPPORTED | ✅ 200 (stub saw HTTP/2.0, bytes+checksum verified) |
| B/C | deno 2.9.6 | real S3 | ReadableStream<Uint8Array> | WHEN_SUPPORTED | ❌ TypeError: fetch failed (cause: Error: expected typed ArrayBufferView); S3: no object |
| B/C | deno 2.9.6 | real S3 | ReadableStream<string> (ASCII) | WHEN_SUPPORTED | ❌ TypeError: fetch failed (cause: Error: expected typed ArrayBufferView); S3: no object |
| B/C | deno 2.9.6 | real S3 | ReadableStream<Uint8Array>, chunks < 8 KiB | WHEN_SUPPORTED | ❌ TypeError: fetch failed (cause: Error: expected typed ArrayBufferView); S3: no object |
| D | deno 2.9.6 | real S3 | ReadableStream<Uint8Array> | WHEN_REQUIRED | ❌ ReferenceError: DOMParser is not defined; server code SignatureDoesNotMatch; S3: no object |
| control | deno 2.9.6 | real S3 | Uint8Array | WHEN_SUPPORTED | ✅ 200 (object stored, bytes match) |
| B/C | bun 1.4.5 | stub HTTP/1.1 | ReadableStream<Uint8Array> | WHEN_SUPPORTED | ❌ ReferenceError: DOMParser is not defined; server code StubInvalidChunkFraming; stub HTTP/1.1: StubInvalidChunkFraming – missing CRLF after 8192-byte chunk at offset 8198, received 58384 B starting "2000\r\n0,1,2,3,4,5,6,7,8," |
| B/C | bun 1.4.5 | stub HTTP/1.1 | ReadableStream<string> (ASCII) | WHEN_SUPPORTED | ❌ ReferenceError: DOMParser is not defined; server code BadDigest; stub HTTP/1.1: BadDigest (trailer AAAAAA==, actual GiYyRA==), received 16445 B starting "2000\r\naaaaaaaaaaaaaaaaaa" |
| B/C | bun 1.4.5 | stub HTTP/1.1 | ReadableStream<Uint8Array>, chunks < 8 KiB | WHEN_SUPPORTED | ❌ ReferenceError: DOMParser is not defined; server code StubInvalidChunkFraming; stub HTTP/1.1: StubInvalidChunkFraming – missing CRLF after 1024-byte chunk at offset 1029, received 4021 B starting "400\r\n0,1,2,3,4,5,6,7,8,9" |
| D | bun 1.4.5 | stub HTTP/1.1 | ReadableStream<Uint8Array> | WHEN_REQUIRED | ✅ 200 (stub saw HTTP/1.1, bytes+checksum verified) |
| control | bun 1.4.5 | stub HTTP/1.1 | Uint8Array | WHEN_SUPPORTED | ✅ 200 (stub saw HTTP/1.1, bytes+checksum verified) |
| B/C | bun 1.4.5 | stub HTTP/2 (TLS) | ReadableStream<Uint8Array> | WHEN_SUPPORTED | ❌ ReferenceError: DOMParser is not defined; server code StubInvalidChunkFraming; stub HTTP/1.1: StubInvalidChunkFraming – missing CRLF after 8192-byte chunk at offset 8198, received 58384 B starting "2000\r\n0,1,2,3,4,5,6,7,8," |
| B/C | bun 1.4.5 | stub HTTP/2 (TLS) | ReadableStream<string> (ASCII) | WHEN_SUPPORTED | ❌ ReferenceError: DOMParser is not defined; server code BadDigest; stub HTTP/1.1: BadDigest (trailer AAAAAA==, actual GiYyRA==), received 16445 B starting "2000\r\naaaaaaaaaaaaaaaaaa" |
| B/C | bun 1.4.5 | stub HTTP/2 (TLS) | ReadableStream<Uint8Array>, chunks < 8 KiB | WHEN_SUPPORTED | ❌ ReferenceError: DOMParser is not defined; server code StubInvalidChunkFraming; stub HTTP/1.1: StubInvalidChunkFraming – missing CRLF after 1024-byte chunk at offset 1029, received 4021 B starting "400\r\n0,1,2,3,4,5,6,7,8,9" |
| D | bun 1.4.5 | stub HTTP/2 (TLS) | ReadableStream<Uint8Array> | WHEN_REQUIRED | ✅ 200 (stub saw HTTP/1.1, bytes+checksum verified) |
| control | bun 1.4.5 | stub HTTP/2 (TLS) | Uint8Array | WHEN_SUPPORTED | ✅ 200 (stub saw HTTP/1.1, bytes+checksum verified) |
| B/C | bun 1.4.5 | real S3 | ReadableStream<Uint8Array> | WHEN_SUPPORTED | ❌ ReferenceError: DOMParser is not defined; server code IncompleteBody; S3: no object |
| B/C | bun 1.4.5 | real S3 | ReadableStream<string> (ASCII) | WHEN_SUPPORTED | ❌ ReferenceError: DOMParser is not defined; server code BadDigest; S3: no object |
| B/C | bun 1.4.5 | real S3 | ReadableStream<Uint8Array>, chunks < 8 KiB | WHEN_SUPPORTED | ❌ ReferenceError: DOMParser is not defined; server code IncompleteBody; S3: no object |
| D | bun 1.4.5 | real S3 | ReadableStream<Uint8Array> | WHEN_REQUIRED | ✅ 200 (object stored, bytes match) |
| control | bun 1.4.5 | real S3 | Uint8Array | WHEN_SUPPORTED | ✅ 200 (object stored, bytes match) |
| B/C | node 22.22.1 | stub HTTP/1.1 | ReadableStream<Uint8Array> | WHEN_SUPPORTED | ❌ TypeError: fetch failed (cause: InvalidArgumentError: invalid transfer-encoding header); stub: request never completed at the stub |
| B/C | node 22.22.1 | stub HTTP/1.1 | ReadableStream<string> (ASCII) | WHEN_SUPPORTED | ❌ TypeError: fetch failed (cause: InvalidArgumentError: invalid transfer-encoding header); stub: request never completed at the stub |
| B/C | node 22.22.1 | stub HTTP/1.1 | ReadableStream<Uint8Array>, chunks < 8 KiB | WHEN_SUPPORTED | ❌ TypeError: fetch failed (cause: InvalidArgumentError: invalid transfer-encoding header); stub: request never completed at the stub |
| D | node 22.22.1 | stub HTTP/1.1 | ReadableStream<Uint8Array> | WHEN_REQUIRED | ✅ 200 (stub saw HTTP/1.1, bytes+checksum verified) |
| control | node 22.22.1 | stub HTTP/1.1 | Uint8Array | WHEN_SUPPORTED | ✅ 200 (stub saw HTTP/1.1, bytes+checksum verified) |
| B/C | node 22.22.1 | stub HTTP/2 (TLS) | ReadableStream<Uint8Array> | WHEN_SUPPORTED | ❌ TypeError: fetch failed (cause: InvalidArgumentError: invalid transfer-encoding header); stub: request never completed at the stub |
| B/C | node 22.22.1 | stub HTTP/2 (TLS) | ReadableStream<string> (ASCII) | WHEN_SUPPORTED | ❌ TypeError: fetch failed (cause: InvalidArgumentError: invalid transfer-encoding header); stub: request never completed at the stub |
| B/C | node 22.22.1 | stub HTTP/2 (TLS) | ReadableStream<Uint8Array>, chunks < 8 KiB | WHEN_SUPPORTED | ❌ TypeError: fetch failed (cause: InvalidArgumentError: invalid transfer-encoding header); stub: request never completed at the stub |
| D | node 22.22.1 | stub HTTP/2 (TLS) | ReadableStream<Uint8Array> | WHEN_REQUIRED | ✅ 200 (stub saw HTTP/1.1, bytes+checksum verified) |
| control | node 22.22.1 | stub HTTP/2 (TLS) | Uint8Array | WHEN_SUPPORTED | ✅ 200 (stub saw HTTP/1.1, bytes+checksum verified) |
| B/C | node 22.22.1 | real S3 | ReadableStream<Uint8Array> | WHEN_SUPPORTED | ❌ TypeError: fetch failed (cause: InvalidArgumentError: invalid transfer-encoding header); S3: no object |
| B/C | node 22.22.1 | real S3 | ReadableStream<string> (ASCII) | WHEN_SUPPORTED | ❌ TypeError: fetch failed (cause: InvalidArgumentError: invalid transfer-encoding header); S3: no object |
| B/C | node 22.22.1 | real S3 | ReadableStream<Uint8Array>, chunks < 8 KiB | WHEN_SUPPORTED | ❌ TypeError: fetch failed (cause: InvalidArgumentError: invalid transfer-encoding header); S3: no object |
| D | node 22.22.1 | real S3 | ReadableStream<Uint8Array> | WHEN_REQUIRED | ✅ 200 (object stored, bytes match) |
| control | node 22.22.1 | real S3 | Uint8Array | WHEN_SUPPORTED | ✅ 200 (object stored, bytes match) |
| B/C | workerd (wrangler 4.168.0 dev) | stub HTTP/1.1 | ReadableStream<Uint8Array> | WHEN_SUPPORTED | ❌ ReferenceError: DOMParser is not defined; server code StubInvalidChunkFraming; stub HTTP/1.1: StubInvalidChunkFraming – missing CRLF after 8192-byte chunk at offset 8198, received 58384 B starting "2000\r\n0,1,2,3,4,5,6,7,8," |
| B/C | workerd (wrangler 4.168.0 dev) | stub HTTP/1.1 | ReadableStream<string> (ASCII) | WHEN_SUPPORTED | ❌ ReferenceError: DOMParser is not defined; server code BadDigest; stub HTTP/1.1: BadDigest (trailer AAAAAA==, actual GiYyRA==), received 16445 B starting "2000\r\naaaaaaaaaaaaaaaaaa" |
| B/C | workerd (wrangler 4.168.0 dev) | stub HTTP/1.1 | ReadableStream<Uint8Array>, chunks < 8 KiB | WHEN_SUPPORTED | ❌ ReferenceError: DOMParser is not defined; server code StubInvalidChunkFraming; stub HTTP/1.1: StubInvalidChunkFraming – missing CRLF after 1024-byte chunk at offset 1029, received 4021 B starting "400\r\n0,1,2,3,4,5,6,7,8,9" |
| D | workerd (wrangler 4.168.0 dev) | stub HTTP/1.1 | ReadableStream<Uint8Array> | WHEN_REQUIRED | ✅ 200 (stub saw HTTP/1.1, bytes+checksum verified) |
| control | workerd (wrangler 4.168.0 dev) | stub HTTP/1.1 | Uint8Array | WHEN_SUPPORTED | ✅ 200 (stub saw HTTP/1.1, bytes+checksum verified) |
| B/C | workerd (wrangler 4.168.0 dev) | stub HTTP/2 (TLS) | ReadableStream<Uint8Array> | WHEN_SUPPORTED | ❌ ReferenceError: DOMParser is not defined; server code StubInvalidChunkFraming; stub HTTP/1.1: StubInvalidChunkFraming – missing CRLF after 8192-byte chunk at offset 8198, received 58384 B starting "2000\r\n0,1,2,3,4,5,6,7,8," |
| B/C | workerd (wrangler 4.168.0 dev) | stub HTTP/2 (TLS) | ReadableStream<string> (ASCII) | WHEN_SUPPORTED | ❌ ReferenceError: DOMParser is not defined; server code BadDigest; stub HTTP/1.1: BadDigest (trailer AAAAAA==, actual GiYyRA==), received 16445 B starting "2000\r\naaaaaaaaaaaaaaaaaa" |
| B/C | workerd (wrangler 4.168.0 dev) | stub HTTP/2 (TLS) | ReadableStream<Uint8Array>, chunks < 8 KiB | WHEN_SUPPORTED | ❌ ReferenceError: DOMParser is not defined; server code StubInvalidChunkFraming; stub HTTP/1.1: StubInvalidChunkFraming – missing CRLF after 1024-byte chunk at offset 1029, received 4021 B starting "400\r\n0,1,2,3,4,5,6,7,8,9" |
| D | workerd (wrangler 4.168.0 dev) | stub HTTP/2 (TLS) | ReadableStream<Uint8Array> | WHEN_REQUIRED | ✅ 200 (stub saw HTTP/1.1, bytes+checksum verified) |
| control | workerd (wrangler 4.168.0 dev) | stub HTTP/2 (TLS) | Uint8Array | WHEN_SUPPORTED | ✅ 200 (stub saw HTTP/1.1, bytes+checksum verified) |
| B/C | workerd (wrangler 4.168.0 dev) | real S3 | ReadableStream<Uint8Array> | WHEN_SUPPORTED | ❌ ReferenceError: DOMParser is not defined; server code IncompleteBody; S3: no object |
| B/C | workerd (wrangler 4.168.0 dev) | real S3 | ReadableStream<string> (ASCII) | WHEN_SUPPORTED | ❌ ReferenceError: DOMParser is not defined; server code BadDigest; S3: no object |
| B/C | workerd (wrangler 4.168.0 dev) | real S3 | ReadableStream<Uint8Array>, chunks < 8 KiB | WHEN_SUPPORTED | ❌ ReferenceError: DOMParser is not defined; server code IncompleteBody; S3: no object |
| D | workerd (wrangler 4.168.0 dev) | real S3 | ReadableStream<Uint8Array> | WHEN_REQUIRED | ❌ ReferenceError: DOMParser is not defined; server code SignatureDoesNotMatch; S3: no object |
| control | workerd (wrangler 4.168.0 dev) | real S3 | Uint8Array | WHEN_SUPPORTED | ✅ 200 (object stored, bytes match) |

## Browser console errors

- chromium 159.0.8154.6: `Failed to load resource: net::ERR_ALPN_NEGOTIATION_FAILED`; `Failed to load resource: net::ERR_FAILED`

## Real S3 cleanup

Bucket `smithy-chunked-repro-1795613240267-nd1v3c` (us-west-2): 8 objects deleted, bucket deleted; HeadBucket -> NotFound (HTTP 404).
