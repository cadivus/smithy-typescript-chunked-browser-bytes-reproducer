import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { AwsCrc32 } from "@aws-crypto/crc32";
import { BODIES, KEY, PAYLOAD_PARTS, byteLength, concat, toBytes } from "./payload.js";

const typeOf = (v) => (typeof v === "string" ? "string" : v?.constructor?.name ?? typeof v);
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const show = (s) => s.replace(/\r/g, "\\r").replace(/\n/g, "\\n");

export function makeStream(parts = PAYLOAD_PARTS) {
  const queue = [...parts];
  return new ReadableStream({
    pull(controller) {
      queue.length ? controller.enqueue(queue.shift()) : controller.close();
    },
  });
}

export async function crc32Base64(parts) {
  const hash = new AwsCrc32();
  for (const p of parts) hash.update(toBytes(p));
  return b64(await hash.digest());
}

async function drain(stream) {
  const reader = stream.getReader();
  const chunks = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
}

function describe(chunks, sourceParts) {
  const types = [...new Set(chunks.map(typeOf))];
  const text = chunks.map((c) => (typeof c === "string" ? c : new TextDecoder().decode(c))).join("");
  const trailer = /x-amz-checksum-crc32:([^\r]*)/.exec(text)?.[1] ?? null;
  const sizeLines = [...text.matchAll(/(?:^|\r\n)([0-9a-f]+)\r\n/g)].map((m) => parseInt(m[1], 16));
  return {
    enqueuedChunkTypes: types,
    allChunksUint8Array: chunks.every((c) => c instanceof Uint8Array),
    framingPreview: show(text.slice(0, 80)) + " … " + show(text.slice(-60)),
    declaredChunkSizes: sizeLines,
    trailerChecksum: trailer,
    emptyInputChecksum: "AAAAAA==",
    sourceByteLength: byteLength(sourceParts),
  };
}

const OFFLINE = "http://127.0.0.1:1";

function client({ endpoint, region = "us-east-1", credentials, checksum, requestHandler } = {}) {
  return new S3Client({
    region,
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle: true,
    maxAttempts: 1,
    credentials: credentials ?? { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "stub-secret" },
    ...(checksum ? { requestChecksumCalculation: checksum } : {}),
    ...(requestHandler ? { requestHandler } : {}),
  });
}

export function runtimeInfo() {
  const s3 = client({ endpoint: OFFLINE });
  return {
    requestHandler: s3.config.requestHandler?.constructor?.name ?? typeof s3.config.requestHandler,
    streamHasher: s3.config.streamHasher?.name,
  };
}

/** Scenario A1: call the browser aws-chunked encoder directly, exactly as the S3 client config wires it. */
export async function encoderDirect() {
  const s3 = client({ endpoint: OFFLINE });
  const { getAwsChunkedEncodingStream, base64Encoder, bodyLengthChecker, streamHasher } = s3.config;
  const parts = [...PAYLOAD_PARTS, "naïve string chunk"];
  const encoded = getAwsChunkedEncodingStream(makeStream(parts), {
    base64Encoder,
    bodyLengthChecker,
    streamHasher,
    checksumAlgorithmFn: AwsCrc32,
    checksumLocationName: "x-amz-checksum-crc32",
  });
  let chunks;
  try {
    chunks = await drain(encoded);
  } catch (e) {
    return { error: `${e.name}: ${e.message}` };
  }
  return { ...describe(chunks, parts), trueChecksum: await crc32Base64(parts) };
}

/** Scenario A2: S3 PutObject through the real middleware stack with a handler that only captures the body. */
export async function encoderViaSdk() {
  let captured;
  const requestHandler = {
    async handle(request) {
      captured = { headers: request.headers, chunks: await drain(request.body) };
      return { response: { statusCode: 200, headers: {}, body: new Uint8Array() } };
    },
  };
  await client({ endpoint: OFFLINE, requestHandler }).send(
    new PutObjectCommand({ Bucket: "capture", Key: KEY, Body: makeStream(), ContentLength: byteLength(PAYLOAD_PARTS) })
  );
  const h = captured.headers;
  return {
    contentEncoding: h["content-encoding"],
    xAmzTrailer: h["x-amz-trailer"],
    decodedContentLength: h["x-amz-decoded-content-length"],
    ...describe(captured.chunks, PAYLOAD_PARTS),
    trueChecksum: await crc32Base64(PAYLOAD_PARTS),
  };
}

/** Scenarios B/C/D: real PutObject over the runtime's fetch. body: a key of BODIES or "bytes" (one Uint8Array); checksum: undefined | "WHEN_REQUIRED". */
export async function putObject({ endpoint, region, credentials, bucket = "stub-bucket", key = KEY, body = "stream", checksum, timeoutMs = 20000 }) {
  const s3 = client({ endpoint, region, credentials, checksum });
  let serverErrorCode = null;
  const handler = s3.config.requestHandler;
  s3.config.requestHandler = {
    async handle(request, options) {
      const out = await handler.handle(request, options);
      if (out.response.statusCode >= 300) {
        const text = await new Response(out.response.body).text();
        serverErrorCode = /<Code>([^<]+)<\/Code>/.exec(text)?.[1] ?? null;
        out.response.body = new TextEncoder().encode(text);
      }
      return out;
    },
  };
  const parts = BODIES[body] ?? PAYLOAD_PARTS;
  const Body = BODIES[body] ? makeStream(parts) : concat(parts);
  try {
    const command = new PutObjectCommand({ Bucket: bucket, Key: key, Body, ContentLength: byteLength(parts) });
    const out = await s3.send(command, { abortSignal: AbortSignal.timeout(timeoutMs) });
    return { ok: true, status: out.$metadata.httpStatusCode, checksumCRC32: out.ChecksumCRC32 ?? null, expectedCRC32: await crc32Base64(parts) };
  } catch (e) {
    const cause = e.cause ? ` (cause: ${e.cause.name ?? ""}: ${e.cause.message ?? e.cause})` : "";
    return { ok: false, error: `${e.name}: ${e.message.split("\n")[0]}${cause}`, status: e.$metadata?.httpStatusCode ?? null, serverErrorCode };
  }
}

/** Runs cases sequentially; `credentials` is applied to cases flagged with `useCredentials`. */
export async function runCases(cases, credentials) {
  const results = [];
  for (const c of cases) results.push({ id: c.id, ...(await putObject({ ...c, credentials: c.useCredentials ? credentials : undefined })) });
  return { runtime: runtimeInfo(), results };
}
