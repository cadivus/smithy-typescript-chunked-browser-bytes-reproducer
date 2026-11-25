// Usage: node scripts/run.mjs [A|B|C|D|all]   (REAL_S3=0 disables real S3 even if AWS credentials are present)
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import {
  S3Client, CreateBucketCommand, PutBucketCorsCommand, GetObjectCommand, ListObjectsV2Command,
  DeleteObjectsCommand, DeleteBucketCommand, HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { chromium, firefox, webkit } from "playwright";
import { BODIES, concat } from "../src/payload.js";
import { renderMarkdown } from "./render.mjs";

const part = (process.argv[2] ?? "all").toUpperCase();
const want = (p) => part === "ALL" || part === p;
const REGION = "us-west-2";
const PAGE = "http://127.0.0.1:8790/";
const STUB_H1 = "http://127.0.0.1:8791";
const STUB_H2 = "https://localhost:8792";
const expected = Object.values(BODIES).map((parts) => Buffer.from(concat(parts)));
const active = JSON.parse(readFileSync(".smithy/active.json", "utf8"));
const bundleCheck = JSON.parse(readFileSync("dist/bundle-check.json", "utf8"));
const scrub = (s) => String(s).replace(/\b\d{12}\b/g, "<account>");
const children = [];

function start(cmd, args, ready, opts = {}) {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], detached: true, ...opts });
  children.push(child);
  return new Promise((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error(`${cmd} did not become ready:\n${out}`)), 60000);
    const onData = (d) => {
      out += d;
      if (ready.test(out)) clearTimeout(timer), resolve(child);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
  });
}

async function waitHttp(url) {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${url} not reachable`);
}

function makeCerts() {
  const ssl = (...args) => execFileSync("openssl", args, { stdio: "ignore" });
  writeFileSync(".certs/leaf.ext", "basicConstraints=critical,CA:FALSE\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n");
  ssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", ".certs/ca-key.pem", "-out", ".certs/ca.pem", "-days", "2", "-subj", "/CN=reproducer test CA");
  ssl("req", "-newkey", "rsa:2048", "-nodes", "-keyout", ".certs/key.pem", "-out", ".certs/leaf.csr", "-subj", "/CN=localhost");
  ssl("x509", "-req", "-in", ".certs/leaf.csr", "-CA", ".certs/ca.pem", "-CAkey", ".certs/ca-key.pem", "-CAcreateserial", "-out", ".certs/cert.pem", "-days", "2", "-extfile", ".certs/leaf.ext");
}

const stubLog = async () => (await fetch(`${STUB_H1}/__log`)).json();

function buildCases(runtime, realS3) {
  const targets = [
    ["stub HTTP/1.1", { endpoint: STUB_H1 }],
    ["stub HTTP/2 (TLS)", { endpoint: STUB_H2 }],
    ...(realS3 ? [["real S3", { region: REGION, bucket: realS3, useCredentials: true }]] : []),
  ];
  const variants = [
    ["B/C", "ReadableStream<Uint8Array>", "stream", undefined],
    ["B/C", "ReadableStream<string> (ASCII)", "string-stream", undefined],
    ["B/C", "ReadableStream<Uint8Array>, chunks < 8 KiB", "small-stream", undefined],
    ["D", "ReadableStream<Uint8Array>", "stream", "WHEN_REQUIRED"],
    ["control", "Uint8Array", "bytes", undefined],
  ];
  const cases = [];
  for (const [target, t] of targets) {
    for (const [scenario, label, body, checksum] of variants) {
      if (!want("B") && !want("C") && scenario !== "D") continue;
      const id = `${runtime}|${target}|${label}|${checksum ?? "WHEN_SUPPORTED"}`;
      const key = id.replace(/[^A-Za-z0-9]+/g, "-");
      cases.push({ id, scenario, runtime, target, bodyLabel: label, body, checksum, key, ...t });
    }
  }
  return cases;
}

async function annotate(cases, results, admin) {
  const log = await stubLog();
  const out = [];
  for (const c of cases) {
    const r = results.find((x) => x.id === c.id) ?? { ok: false, error: "no result" };
    const row = { ...c, ...r, endpoint: c.endpoint ?? `s3.${REGION}.amazonaws.com`, error: r.error && scrub(r.error) };
    delete row.useCredentials;
    if (c.endpoint) {
      const entry = log.filter((e) => e.path.endsWith(`/${c.key}`)).at(-1);
      row.stub = entry ?? "request never completed at the stub";
    } else if (admin) {
      row.stored = await storedState(admin, c.bucket, c.key);
    }
    out.push(row);
  }
  return out;
}

async function storedState(admin, Bucket, Key) {
  try {
    const obj = await admin.send(new GetObjectCommand({ Bucket, Key }));
    const body = Buffer.from(await obj.Body.transformToByteArray());
    return expected.some((e) => body.equals(e)) ? "object stored, bytes match" : `object stored, bytes DIFFER (${body.length} bytes)`;
  } catch (e) {
    return e.name === "NoSuchKey" ? "no object" : `GetObject failed: ${e.name}`;
  }
}

async function runBrowsers(realS3, creds, admin) {
  const rows = [];
  for (const [name, type] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]]) {
    let browser;
    try {
      browser = await type.launch();
    } catch (e) {
      const reason = /missing dependencies|install-deps/i.test(e.message) ? "host is missing system libraries (sudo npx playwright install-deps)" : e.message.split("\n").find((l) => l.trim()) ?? "";
      rows.push({ runtime: name, scenario: "B", target: "-", body: "-", launchError: scrub(reason.slice(0, 200)) });
      continue;
    }
    const runtime = `${name} ${browser.version()}`;
    const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
    const netErrors = {};
    const consoleErrors = [];
    page.on("requestfailed", (r) => (netErrors[new URL(r.url()).pathname.split("/").pop()] = r.failure()?.errorText));
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
    await page.goto(PAGE);
    await page.waitForFunction(() => document.title === "ready");
    const cases = buildCases(runtime, realS3);
    const { results, runtime: info } = await page.evaluate(([c, k]) => window.scenarios.runCases(c, k), [cases, creds]);
    for (const row of await annotate(cases, results, admin)) rows.push({ ...row, netError: netErrors[row.key] ?? null, runtimeConfig: info });
    rows.filter((r) => r.runtime === runtime).at(-1).consoleErrors = [...new Set(consoleErrors.map(scrub))];
    await browser.close();
  }
  return rows;
}

async function runCli(name, cmd, args, env, realS3, creds, admin) {
  const version = execFileSync(cmd, ["--version"], { encoding: "utf8" }).split("\n")[0];
  const runtime = `${name} ${version.match(/\d+\.\d+\.\d+/)[0]}`;
  const cases = buildCases(runtime, realS3);
  writeFileSync("dist/cases.json", JSON.stringify(cases));
  const stdout = execFileSync(cmd, [...args, "scripts/runtime-runner.mjs", "dist/cases.json"], {
    encoding: "utf8",
    env: { ...process.env, ...env, ...(creds ? { REPRO_AWS_CREDS: JSON.stringify(creds) } : {}) },
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 300000,
  });
  const { results, runtime: info } = JSON.parse(stdout.trim().split("\n").at(-1));
  return (await annotate(cases, results, admin)).map((r) => ({ ...r, runtimeConfig: info }));
}

async function runWorkerd(realS3, creds, admin) {
  const version = JSON.parse(readFileSync("node_modules/wrangler/package.json", "utf8")).version;
  const runtime = `workerd (wrangler ${version} dev)`;
  await start("npx", ["wrangler", "dev", "--port", "8793", "--ip", "127.0.0.1"], /Ready on|ready on/i, {
    cwd: "worker",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", NODE_EXTRA_CA_CERTS: "../.certs/ca.pem" },
  });
  await waitHttp("http://127.0.0.1:8793/");
  const cases = buildCases(runtime, realS3);
  const res = await fetch("http://127.0.0.1:8793/", { method: "POST", body: JSON.stringify({ cases, credentials: creds }) });
  const { results, runtime: info } = await res.json();
  return (await annotate(cases, results, admin)).map((r) => ({ ...r, runtimeConfig: info }));
}

async function credentialsOrNull(admin) {
  if (process.env.REAL_S3 === "0") return null;
  try {
    const c = await admin.config.credentials();
    return { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, sessionToken: c.sessionToken };
  } catch {
    return null;
  }
}

const report = { smithy: active, bundleCheck, clientS3: JSON.parse(readFileSync("node_modules/@aws-sdk/client-s3/package.json", "utf8")).version, generatedAt: new Date().toISOString(), part, rows: [] };
const admin = new S3Client({ region: REGION });
const creds = want("A") && part === "A" ? null : await credentialsOrNull(admin);
let bucket = null;
const cleanup = [];

try {
  if (want("A")) {
    report.A = JSON.parse(execFileSync("node", ["scripts/scenario-a.mjs"], { encoding: "utf8" }));
    console.log("Scenario A (encoder, no network):", JSON.stringify({ direct: report.A.direct, viaSdk: report.A.viaSdk }, null, 1));
  }
  if (want("B") || want("C") || want("D")) {
    mkdirSync(".certs", { recursive: true });
    makeCerts();
    await start("node", ["scripts/stub-s3.mjs"], /stub ready/);
    if (creds) {
      bucket = `smithy-chunked-repro-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await admin.send(new CreateBucketCommand({ Bucket: bucket, CreateBucketConfiguration: { LocationConstraint: REGION } }));
      await admin.send(new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: { CORSRules: [{ AllowedOrigins: ["http://127.0.0.1:8790"], AllowedMethods: ["PUT", "GET"], AllowedHeaders: ["*"], ExposeHeaders: ["ETag", "x-amz-checksum-crc32"] }] },
      }));
      console.log(`created temporary bucket ${bucket} in ${REGION}`);
    } else {
      console.log("no AWS credentials (or REAL_S3=0): skipping real S3 cases");
    }
    const step = async (label, fn) => {
      console.log(`running ${label} ...`);
      try {
        report.rows.push(...(await fn()));
      } catch (e) {
        report.rows.push({ runtime: label, scenario: "-", target: "-", body: "-", launchError: scrub(e.message.split("\n")[0]) });
      }
    };
    if (want("B") || want("D")) await step("browsers", () => runBrowsers(bucket, creds, admin));
    if (want("C") || want("D")) {
      const ca = { NODE_EXTRA_CA_CERTS: ".certs/ca.pem", DENO_CERT: ".certs/ca.pem" };
      await step("deno", () => runCli("deno", "node_modules/.bin/deno", ["run", "--allow-net", "--allow-env", "--allow-read"], ca, bucket, creds, admin));
      await step("bun", () => runCli("bun", "node_modules/.bin/bun", [], ca, bucket, creds, admin));
      await step("node", () => runCli("node", "node", [], ca, bucket, creds, admin));
      await step("workerd", () => runWorkerd(bucket, creds, admin));
    }
  }
} finally {
  if (bucket) {
    const listed = await admin.send(new ListObjectsV2Command({ Bucket: bucket }));
    const keys = (listed.Contents ?? []).map((o) => ({ Key: o.Key }));
    if (keys.length) await admin.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } }));
    await admin.send(new DeleteBucketCommand({ Bucket: bucket }));
    let proof;
    try {
      await admin.send(new HeadBucketCommand({ Bucket: bucket }));
      proof = "HeadBucket still succeeds (NOT deleted)";
    } catch (e) {
      proof = `HeadBucket -> ${e.name} (HTTP ${e.$metadata?.httpStatusCode})`;
    }
    report.cleanup = { bucket, region: REGION, objectsDeleted: keys.length, bucketDeleted: true, proof };
    console.log(`cleanup: deleted ${keys.length} objects and bucket ${bucket}; ${proof}`);
  }
  for (const c of children) process.kill(-c.pid);
}

mkdirSync("results", { recursive: true });
const name = active.ref.replace(/[^A-Za-z0-9._-]+/g, "_") + (part === "ALL" ? "" : `-${part}`);
writeFileSync(`results/${name}.json`, JSON.stringify(report, null, 2) + "\n");
writeFileSync(`results/${name}.md`, renderMarkdown(report));
console.log(`\nwrote results/${name}.json and results/${name}.md\n`);
console.log(renderMarkdown(report));
process.exit(0);
