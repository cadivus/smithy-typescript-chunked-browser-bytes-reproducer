# smithy-typescript: browser aws-chunked encoder bytes reproducer

This repo reproduces a bug in `@smithy/core`'s **browser** aws-chunked encoder,
`packages/core/src/submodules/serde/util-stream/getAwsChunkedEncodingStream.browser.ts`,
and checks the fix against it:

- Fix branch: [`cadivus/smithy-typescript@wasm/aws-chunked-browser-bytes`](https://github.com/cadivus/smithy-typescript/tree/wasm/aws-chunked-browser-bytes)
  (code commit [`d18a3d5ed6`](https://github.com/cadivus/smithy-typescript/commit/d18a3d5ed658460b4a4abbdba13c5547d7b8fce4), tip `46acf0bf85` adds a README)
- Broken baseline: the fork's `main` (`56723ea17`). This is the merge-base and matches upstream `smithy-lang/smithy-typescript` `main` at that point.

## The bug

`@aws-sdk/middleware-flexible-checksums` wraps a streaming body in `getAwsChunkedEncodingStream`.
This happens for S3 `PutObject` with a `ReadableStream` body under the default
`requestChecksumCalculation: "WHEN_SUPPORTED"`, which has been the default since client-s3 v3.729.0.
The browser build of `@smithy/core` routes that call to the browser encoder. On `main` it has two bugs:

1. **It enqueues strings, not bytes.** The encoder runs ``controller.enqueue(`${size}\r\n${value}\r\n`)``, so a
   `Uint8Array` chunk becomes the text `"0,1,2,3,…"`. Strict fetch implementations reject the body
   (`ReadableStream used as a Request or Response body must produce Uint8Array values`, or the runtime's own
   wording). Lenient ones send the corrupted text.
2. **The trailer checksum is computed over zero bytes.** The browser `streamHasher` is the Blob hasher. When it
   gets a `ReadableStream` it reads nothing, so the trailer is always the checksum of empty input
   (CRC32 `AAAAAA==`) and S3 answers `BadDigest`.
3. *(Latent.)* The chunk size is `bodyLengthChecker(value)` instead of the UTF-8 byte length. With the
   bodyLengthChecker the SDK actually wires in, this is **not observable**: it already returns UTF-8 bytes
   (scenario A shows 19 on both refs). It only matters for custom checkers.

The fix enqueues `Uint8Array`s only and hashes the bytes it actually streams. It also skips empty chunks and
forwards `cancel()`.

## Where the code runs, and who is affected (measured)

Measured with `@aws-sdk/client-s3` **3.1177.0**. The full table is below, and raw data is in [`results/`](results/).

| environment | main (broken) | fix |
|---|---|---|
| **Chromium 159**, S3 or any HTTP/1.1 endpoint | `TypeError: Failed to fetch` (`net::ERR_ALPN_NEGOTIATION_FAILED`). Chrome only streams request bodies over HTTP/2+, and nothing is sent. | same, so the fix can't help |
| **Chromium 159**, HTTP/2 endpoint | `Failed to fetch` (`net::ERR_FAILED`), 0 body bytes reach the server | ✅ 200, trailer verified |
| **Firefox 159** | sends the literal text `[object ReadableStream]` (no streaming-body support). S3 returns `400 IncompleteBody`. | same, the bug is not in smithy |
| **WebKit** | not run (host lacks system libraries) | – |
| **Deno 2.9.6** (fetch, browser bundle) | `TypeError: fetch failed: expected typed ArrayBufferView` (h2: `stream error … unexpected internal error`) | ✅ 200 on stub h1/h2 and real S3 |
| **Bun 1.4.5** | sends the corrupted body. S3 returns `400 IncompleteBody`, or `400 BadDigest` (trailer `AAAAAA==`) for ASCII string chunks. | ✅ 200 on stub and real S3 |
| **Cloudflare workerd** (`wrangler dev`, resolves the browser build itself) | same as Bun: `IncompleteBody` / `BadDigest` | ✅ 200 on stub and real S3 |
| **Node 22 native fetch** running the browser bundle | `InvalidArgumentError: invalid transfer-encoding header` (undici refuses the middleware's header). The encoder is never reached. | same (separate issue) |

### The real-browser question

**In a real browser the bug cannot cause a failed S3 upload today**, because browsers can't send a streaming
upload to S3 at all:

- Chrome needs HTTP/2 for `ReadableStream` request bodies (`duplex: "half"` is set by `FetchHttpHandler`). The
  S3 endpoint (`s3.us-west-2.amazonaws.com`) only negotiates `http/1.1` (checked via ALPN), so Chrome fails with
  `ERR_ALPN_NEGOTIATION_FAILED` before sending anything, on both refs.
- Firefox has no streaming-body support and stringifies the stream, on both refs.

The bug **is** observable in a real browser when it talks to an **HTTP/2** S3-compatible endpoint, such as
a proxy, S3-compatible storage, or the local h2 stub here. Chromium then aborts the upload on `main`
(`Failed to fetch`) and succeeds with the fix. It is also observable in non-browser fetch runtimes that load
the browser build: Deno (rejects the upload), Bun and Cloudflare workerd (send corrupt data, which S3 rejects).
In all of those the fix makes real S3 uploads succeed.

**Workaround on `main`:** `requestChecksumCalculation: "WHEN_REQUIRED"` skips the encoder. It succeeds against
the stub everywhere the transport allows streaming, and against real S3 in Bun and Node (scenario D).

## How to run

Prerequisites: Node 22+ with `corepack` (the smithy repo uses Yarn 4) and git. `npm ci` installs Bun, Deno,
wrangler and Playwright as npm packages. You also need Playwright browsers: `npx playwright install chromium
firefox` (WebKit also needs `sudo npx playwright install-deps`). AWS credentials are optional. If the default
credential chain resolves, the real-S3 cases run in `us-west-2`.

```sh
npm ci
./use-smithy.sh main          # or: fix | <any branch/tag/sha of the fork>
./run.sh                      # all scenarios; or ./run.sh A|B|C|D
./compare.sh                  # runs main then fix, writes results/comparison.md
REAL_S3=0 ./run.sh            # never touch AWS
```

- `use-smithy.sh` clones the fork into `.smithy/` (gitignored; override with `SMITHY_FORK_URL`), checks out
  the ref, builds only `packages/core`, packs it and installs it over `node_modules/@smithy/core`. It prints
  the active ref and SHA.
- `run.sh` bundles `src/scenarios.js` for the browser with esbuild. Before running, it prints a bundle check:
  the bundled `@smithy/core` path, the ref/SHA marker, and whether the fix's code fingerprint is in the bundle.
- Results go to `results/<ref>.md` and `results/<ref>.json` (`results/<ref>-<part>.*` for a single part).

Scenarios:

- **A**: no network. Runs the browser bundle with a capturing request handler, plus the encoder directly.
  Prints the enqueued chunk types, the framing, and the trailer checksum next to the true checksum.
- **B**: headless Chromium/Firefox/WebKit via Playwright. A page does `PutObject` with a `ReadableStream`
  body against `scripts/stub-s3.mjs` over HTTP/1.1 and over HTTP/2 (self-signed TLS). The stub decodes
  aws-chunked and verifies the framing, the decoded length, the payload and the CRC32 trailer. The same page
  also runs against real S3.
- **C**: the same bundle in Deno, Bun and Node fetch, and in workerd through `wrangler dev`. Each runs against
  the stub and real S3.
- **D**: the `WHEN_REQUIRED` workaround. A `Uint8Array` body is included as a control everywhere.

Bodies: `ReadableStream<Uint8Array>` (2×8 KiB plus a UTF-8 tail), ASCII string chunks, and small (<8 KiB)
chunks.

For real S3, each run creates one bucket `smithy-chunked-repro-<ts>-<rand>` and deletes its objects and the
bucket in a `finally` block. It records `HeadBucket → NotFound` as cleanup proof. No credentials or account
IDs are written to the outputs.

## Results (main `56723ea17` vs fix `46acf0bf85`)

Full table: [`results/comparison.md`](results/comparison.md). Per-ref detail with exact errors:
[`results/main.md`](results/main.md), [`results/fix.md`](results/fix.md).

**A. Encoder output (no network)**

| | main | fix |
|---|---|---|
| enqueued chunk types | `string` | `Uint8Array` |
| trailer CRC32 (true value) | `AAAAAA==` (`dgq1EQ==`) | `dgq1EQ==` (`dgq1EQ==`) |
| data framing | `2000\r\n0,1,2,3,4,5,6,…` | `2000\r\n` + raw bytes |
| declared size of a 18-char / 19-byte string chunk | 19 | 19 |

**B/C/D. `PutObject` with `ReadableStream<Uint8Array>` (8 KiB chunks), `WHEN_SUPPORTED` unless noted**

| runtime | target | main | fix |
|---|---|---|---|
| Chromium 159 | stub HTTP/1.1 | ❌ `ERR_ALPN_NEGOTIATION_FAILED` | ❌ `ERR_ALPN_NEGOTIATION_FAILED` |
| Chromium 159 | stub HTTP/2 | ❌ `Failed to fetch`, 0 bytes received | ✅ 200 |
| Chromium 159 | real S3 | ❌ `ERR_ALPN_NEGOTIATION_FAILED` | ❌ `ERR_ALPN_NEGOTIATION_FAILED` |
| Firefox 159 | stub h1/h2 | ❌ body = `[object ReadableStream]` | ❌ same |
| Firefox 159 | real S3 | ❌ 400 IncompleteBody | ❌ 400 IncompleteBody |
| Deno 2.9.6 | stub h1 / real S3 | ❌ `expected typed ArrayBufferView` | ✅ 200 |
| Deno 2.9.6 | stub h2 | ❌ `stream error … internal error` | ✅ 200 |
| Bun 1.4.5 | stub | ❌ invalid framing, body `0,1,2,3,…` | ✅ 200 |
| Bun 1.4.5 | real S3 | ❌ 400 IncompleteBody (string chunks: 400 BadDigest) | ✅ 200 |
| workerd | stub | ❌ invalid framing (string chunks: BadDigest `AAAAAA==`) | ✅ 200 |
| workerd | real S3 | ❌ 400 IncompleteBody (string chunks: 400 BadDigest) | ✅ 200 |
| Node 22 fetch | all | ❌ `invalid transfer-encoding header` | ❌ same |
| D `WHEN_REQUIRED` | stub (Chromium h2, Deno, Bun, workerd, Node) | ✅ 200 | ✅ 200 |
| D `WHEN_REQUIRED` | real S3 (Bun, Node) | ✅ 200 | ✅ 200 |
| D `WHEN_REQUIRED` | real S3 (Deno, workerd, Firefox) | ❌ 403 SignatureDoesNotMatch | ❌ same |

Real-S3 cleanup proof for the recorded runs: buckets `smithy-chunked-repro-1795613240267-nd1v3c` (main) and
`smithy-chunked-repro-1795613252426-fyaqgt` (fix) were deleted, and `HeadBucket` returned NotFound (HTTP 404).

## Why the fix is not a breaking change

Summary of the separate analysis (`report.md`, written alongside the fix):

- `getAwsChunkedEncodingStream` has been `@internal` since aws-sdk-js-v3#4593. The `@public` types
  `GetAwsChunkedEncodingStream` and `GetAwsChunkedEncodingStreamOptions` are unchanged, and the changeset is
  a `patch`.
- No working behavior changes. The old browser output was rejected by strict fetch implementations or
  corrupted binary data, and its checksum trailer was always wrong. This repo shows both. The only case that
  worked (pure-string chunks, no checksum) produces byte-identical output after the fix.
- It brings the browser path to parity with Node. Node's twin had the same "stringify stream data" bug, fixed
  in aws-sdk-js-v3#4711 (2023). Later PRs (#1838, #2273) left the browser code untouched.
- Residual behavior changes: a custom `streamHasher` is no longer invoked on the browser path. Unsupported
  chunk types now throw a `TypeError` instead of being stringified. Empty chunks are skipped (as on Node
  since #1838), and `cancel()` is forwarded (this overlaps open smithy-typescript#2371).

## Open issues (not fixed here)

- **S3 rejects aws-chunked chunks smaller than 8 KiB** (`403 InvalidChunkSizeError`, except the last chunk).
  The browser encoder does not rechunk, so a source stream with small chunks fails even with the fix. This is
  visible in the "chunks < 8 KiB" rows.
- Node's native fetch with the browser build: the middleware's `transfer-encoding` header is rejected by
  undici.
- The browser build's XML error parser needs `DOMParser`, which Bun and workerd lack. S3 errors surface there
  as `ReferenceError: DOMParser is not defined`, so the harness reads the raw response to report the real
  code.
- `WHEN_REQUIRED` with a stream body returns `SignatureDoesNotMatch` from real S3 in Deno, workerd and
  Firefox, because the transport doesn't send the signed `content-length`.
- WebKit was not measured.
