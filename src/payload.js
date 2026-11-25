const bytes = (n) => new Uint8Array(n).map((_, i) => i % 251);
const tail = new TextEncoder().encode("héllo wörld\n");

/** Real S3 rejects aws-chunked chunks < 8 KiB unless last (InvalidChunkSizeError), so the main payload uses 8 KiB chunks. */
export const BODIES = {
  stream: [bytes(8192), bytes(8192), tail],
  "small-stream": [bytes(1024), bytes(100), tail],
  "string-stream": ["a".repeat(8192), "b".repeat(8192), "end\n"],
};
export const PAYLOAD_PARTS = BODIES.stream;
export const KEY = "reproducer.bin";

export const toBytes = (p) => (typeof p === "string" ? new TextEncoder().encode(p) : p);
export const byteLength = (parts) => parts.reduce((n, p) => n + toBytes(p).byteLength, 0);
export function concat(parts) {
  const out = new Uint8Array(byteLength(parts));
  let o = 0;
  for (const p of parts.map(toBytes)) out.set(p, o), (o += p.byteLength);
  return out;
}
