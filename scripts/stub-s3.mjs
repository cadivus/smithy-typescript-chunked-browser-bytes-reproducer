import http from "node:http";
import http2 from "node:http2";
import { readFileSync } from "node:fs";
import { crc32 } from "node:zlib";
import { BODIES, concat } from "../src/payload.js";

const PAGE_PORT = 8790, H1_PORT = 8791, H2_PORT = 8792;
const expected = Object.values(BODIES).map((parts) => Buffer.from(concat(parts)));
let log = [];

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,PUT,POST,OPTIONS",
  "access-control-allow-headers": "*",
  "access-control-expose-headers": "etag,x-amz-checksum-crc32,x-amz-request-id",
};
const crcB64 = (buf) => {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(crc32(buf));
  return out.toString("base64");
};

function decodeAwsChunked(raw) {
  const chunks = [];
  let pos = 0;
  for (;;) {
    const eol = raw.indexOf("\r\n", pos);
    if (eol < 0) throw new Error(`no chunk-size line at offset ${pos}`);
    const sizeText = raw.subarray(pos, eol).toString("latin1").split(";")[0];
    if (!/^[0-9a-fA-F]+$/.test(sizeText)) throw new Error(`invalid chunk size ${JSON.stringify(sizeText.slice(0, 20))} at offset ${pos}`);
    const size = parseInt(sizeText, 16);
    pos = eol + 2;
    if (size === 0) break;
    chunks.push(raw.subarray(pos, pos + size));
    pos += size;
    if (raw.subarray(pos, pos + 2).toString("latin1") !== "\r\n") throw new Error(`missing CRLF after ${size}-byte chunk at offset ${pos}`);
    pos += 2;
  }
  const trailers = {};
  for (const line of raw.subarray(pos).toString("latin1").split("\r\n")) {
    const i = line.indexOf(":");
    if (i > 0) trailers[line.slice(0, i).toLowerCase()] = line.slice(i + 1).trim();
  }
  return { body: Buffer.concat(chunks), trailers };
}

function verify(headers, raw) {
  const awsChunked = /aws-chunked/.test(headers["content-encoding"] ?? "");
  let body = raw, trailers = {};
  if (awsChunked) {
    try {
      ({ body, trailers } = decodeAwsChunked(raw));
    } catch (e) {
      return { code: "StubInvalidChunkFraming", detail: e.message, receivedBytes: raw.length, preview: raw.subarray(0, 40).toString("latin1") };
    }
  }
  const sent = trailers["x-amz-checksum-crc32"] ?? headers["x-amz-checksum-crc32"];
  const actual = crcB64(body);
  const facts = { awsChunked, trailerOrHeaderCRC32: sent ?? null, actualCRC32: actual, decodedBytes: body.length, receivedBytes: raw.length, preview: raw.subarray(0, 40).toString("latin1") };
  if (sent !== undefined && sent !== actual) return { code: "BadDigest", ...facts };
  const declared = headers["x-amz-decoded-content-length"];
  if (awsChunked && declared !== undefined && Number(declared) !== body.length) return { code: "StubDecodedLengthMismatch", declared, ...facts };
  if (!expected.some((e) => body.equals(e))) return { code: "StubPayloadMismatch", ...facts };
  return { code: "OK", ...facts };
}

function s3Handler(req, res) {
  if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
  const path = req.url.split("?")[0];
  if (path === "/__log") return res.writeHead(200, { ...cors, "content-type": "application/json" }).end(JSON.stringify(log));
  if (path === "/__reset") return (log = []), res.writeHead(204, cors).end();
  if (req.method !== "PUT") return res.writeHead(405, cors).end();
  const parts = [];
  req.on("data", (c) => parts.push(c));
  const aborted = (detail) => log.push({ path, httpVersion: req.httpVersion, code: "StubRequestAborted", detail, receivedBytes: parts.reduce((n, p) => n + p.length, 0) });
  req.on("error", (e) => aborted(e.message));
  req.on("aborted", () => aborted("client aborted/reset the request"));
  req.on("end", () => {
    const verdict = verify(req.headers, Buffer.concat(parts));
    log.push({ path, httpVersion: req.httpVersion, contentEncoding: req.headers["content-encoding"] ?? null, ...verdict });
    if (verdict.code === "OK") {
      return res.writeHead(200, { ...cors, etag: '"stub"', "x-amz-checksum-crc32": verdict.actualCRC32 }).end();
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${verdict.code}</Code><Message>${verdict.detail ?? verdict.code}</Message></Error>`;
    res.writeHead(400, { ...cors, "content-type": "application/xml" }).end(xml);
  });
}

const pageHandler = (req, res) => {
  const files = { "/": ["page/index.html", "text/html"], "/scenarios.browser.js": ["dist/scenarios.browser.js", "text/javascript"] };
  const f = files[req.url];
  if (!f) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": f[1] }).end(readFileSync(f[0]));
};

http.createServer(pageHandler).listen(PAGE_PORT, "127.0.0.1");
http.createServer(s3Handler).listen(H1_PORT, "127.0.0.1");
http2
  .createSecureServer({ key: readFileSync(".certs/key.pem"), cert: readFileSync(".certs/cert.pem"), allowHTTP1: true }, s3Handler)
  .listen(H2_PORT, "127.0.0.1");
console.log(`stub ready page=http://127.0.0.1:${PAGE_PORT} h1=http://127.0.0.1:${H1_PORT} h2=https://localhost:${H2_PORT}`);
