const clip = (s, n = 160) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function outcome(row) {
  if (row.launchError) return { ok: null, text: `not run: ${row.launchError}` };
  const stub = typeof row.stub === "object" ? row.stub : null;
  const serverOk = stub ? stub.code === "OK" : row.stored ? row.stored.endsWith("match") : true;
  if (row.ok && serverOk) return { ok: true, text: `✅ ${row.status}${stub ? ` (stub saw HTTP/${stub.httpVersion}, bytes+checksum verified)` : row.stored ? ` (${row.stored})` : ""}` };
  const parts = [];
  if (row.error) parts.push(row.error);
  if (row.serverErrorCode) parts.push(`server code ${row.serverErrorCode}`);
  if (row.netError) parts.push(`net: ${row.netError}`);
  if (stub) {
    const crc = stub.code === "BadDigest" ? ` (trailer ${stub.trailerOrHeaderCRC32}, actual ${stub.actualCRC32})` : "";
    const body = stub.receivedBytes !== undefined ? `, received ${stub.receivedBytes} B starting ${JSON.stringify(stub.preview.slice(0, 24))}` : "";
    parts.push(`stub HTTP/${stub.httpVersion}: ${stub.code}${stub.detail ? ` – ${stub.detail}` : ""}${crc}${body}`);
  }
  else if (row.stub) parts.push(`stub: ${row.stub}`);
  if (row.stored) parts.push(`S3: ${row.stored}`);
  return { ok: false, text: `❌ ${clip(parts.join("; "), 400)}` };
}

const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");

export function shortOutcome(row) {
  if (row.launchError) return "not run";
  const { ok } = outcome(row);
  if (ok) return `✅ ${row.status}`;
  const stub = typeof row.stub === "object" ? row.stub : null;
  if (stub) return `❌ stub: ${stub.code}${stub.code === "BadDigest" ? ` (trailer ${stub.trailerOrHeaderCRC32})` : ""}, got ${JSON.stringify(stub.preview?.slice(0, 14) ?? "")}`;
  if (row.serverErrorCode) return `❌ S3 ${row.status} ${row.serverErrorCode}`;
  if (row.netError) return `❌ ${row.netError}`;
  return `❌ ${clip(/cause: (.*)\)$/.exec(row.error ?? "")?.[1] ?? row.error ?? row.stored ?? "?", 80)}`;
}

export function renderComparison(main, fix) {
  const key = (r) => [r.runtime, r.target, r.bodyLabel, r.checksum ?? "WHEN_SUPPORTED"].join("|");
  const fixRows = new Map(fix.rows.map((r) => [key(r), r]));
  const lines = [
    "# main vs fix",
    "",
    `- main = \`${main.smithy.sha}\`, fix = \`${fix.smithy.sha}\`, @aws-sdk/client-s3 ${main.clientS3}`,
    "",
    "## A. Encoder output (no network, browser bundle)",
    "",
    "| | main | fix |",
    "|---|---|---|",
  ];
  for (const [label, f] of [
    ["enqueued chunk types", (a) => a.viaSdk.enqueuedChunkTypes.join(", ")],
    ["trailer CRC32 (true value)", (a) => `${a.viaSdk.trailerChecksum} (${a.viaSdk.trueChecksum})`],
    ["declared size of string chunk \"naïve string chunk\" (18 chars, 19 UTF-8 bytes)", (a) => `${a.direct.declaredChunkSizes.at(-2)}`],
    ["data framing starts", (a) => `\`${esc(a.viaSdk.framingPreview.slice(0, 22))}\``],
  ]) lines.push(`| ${label} | ${f(main.A)} | ${f(fix.A)} |`);
  lines.push("", "## B/C/D. PutObject", "", "| scenario | runtime | target | body | checksum calc | main | fix |", "|---|---|---|---|---|---|---|");
  for (const m of main.rows) {
    const f = fixRows.get(key(m)) ?? {};
    lines.push(`| ${m.scenario} | ${esc(m.runtime)} | ${m.target} | ${m.bodyLabel ?? "-"} | ${m.checksum ?? (m.bodyLabel ? "WHEN_SUPPORTED" : "-")} | ${esc(shortOutcome(m))} | ${esc(f.runtime ? shortOutcome(f) : "-")} |`);
  }
  for (const [name, r] of [["main", main], ["fix", fix]]) {
    if (r.cleanup) lines.push("", `Real S3 cleanup (${name} run): bucket \`${r.cleanup.bucket}\`, ${r.cleanup.objectsDeleted} objects deleted, bucket deleted, ${r.cleanup.proof}.`);
  }
  return lines.join("\n") + "\n";
}

export function renderMarkdown(r) {
  const lines = [
    `# Results for smithy \`${r.smithy.ref}\` @ \`${r.smithy.sha}\``,
    "",
    `- @aws-sdk/client-s3 ${r.clientS3}; generated ${r.generatedAt}; part ${r.part}`,
    `- Bundle check: @smithy/core roots in browser bundle = ${r.bundleCheck.smithyCoreRootsInBundle.join(", ")}; marker = ${JSON.stringify(r.bundleCheck.activeSmithy)}; fix fingerprint present = ${r.bundleCheck.bundleHasFixFingerprint}`,
  ];
  if (r.A) {
    const a = r.A;
    lines.push("", "## A. Encoder output (browser bundle, no network)", "", "| | direct encoder call | via S3 PutObject middleware |", "|---|---|---|");
    const row = (label, f) => lines.push(`| ${label} | ${esc(f(a.direct))} | ${esc(f(a.viaSdk))} |`);
    row("enqueued chunk types", (x) => x.error ?? x.enqueuedChunkTypes.join(", "));
    row("all chunks Uint8Array", (x) => x.allChunksUint8Array);
    row("declared chunk sizes", (x) => x.declaredChunkSizes?.join(", "));
    row("source byte length", (x) => x.sourceByteLength);
    row("trailer checksum (CRC32)", (x) => x.trailerChecksum);
    row("true checksum (CRC32)", (x) => x.trueChecksum);
    row("framing preview", (x) => `\`${x.framingPreview}\``);
    lines.push("", `Runtime config in bundle: ${JSON.stringify(a.runtime)}. The direct call adds a non-ASCII string chunk (\"naïve string chunk\", 18 chars / 19 UTF-8 bytes).`);
  }
  if (r.rows.length) {
    lines.push("", "## B/C/D. PutObject over each runtime's fetch", "", "| scenario | runtime | target | body | checksum calc | outcome |", "|---|---|---|---|---|---|");
    for (const x of r.rows) lines.push(`| ${x.scenario} | ${esc(x.runtime)} | ${x.target} | ${x.bodyLabel ?? "-"} | ${x.checksum ?? (x.bodyLabel ? "WHEN_SUPPORTED" : "-")} | ${esc(outcome(x).text)} |`);
  }
  const consoleRows = r.rows.filter((x) => x.consoleErrors?.length);
  if (consoleRows.length) {
    lines.push("", "## Browser console errors", "");
    for (const x of consoleRows) lines.push(`- ${x.runtime}: ${x.consoleErrors.map((m) => `\`${clip(m, 200)}\``).join("; ")}`);
  }
  if (r.cleanup) lines.push("", "## Real S3 cleanup", "", `Bucket \`${r.cleanup.bucket}\` (${r.cleanup.region}): ${r.cleanup.objectsDeleted} objects deleted, bucket deleted; ${r.cleanup.proof}.`);
  return lines.join("\n") + "\n";
}
