// Usage: <node|deno|bun> scripts/runtime-runner.mjs <cases.json>; credentials (optional) come from REPRO_AWS_CREDS.
import { runCases } from "../dist/scenarios.browser.js";

const path = globalThis.Deno ? Deno.args[0] : process.argv[2];
const env = (k) => (globalThis.Deno ? Deno.env.get(k) : process.env[k]);
const read = globalThis.Deno ? (p) => Deno.readTextFile(p) : async (p) => (await import("node:fs/promises")).readFile(p, "utf8");

const cases = JSON.parse(await read(path));
const creds = env("REPRO_AWS_CREDS") ? JSON.parse(env("REPRO_AWS_CREDS")) : undefined;
console.log(JSON.stringify(await runCases(cases, creds)));
