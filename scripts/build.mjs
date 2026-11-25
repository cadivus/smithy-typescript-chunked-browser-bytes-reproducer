import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });
const result = await build({
  entryPoints: ["src/scenarios.js"],
  outfile: "dist/scenarios.browser.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  metafile: true,
  logLevel: "warning",
});

const coreInputs = Object.keys(result.metafile.inputs).filter((p) => p.includes("@smithy/core/"));
const coreRoots = [...new Set(coreInputs.map((p) => p.slice(0, p.indexOf("@smithy/core/") + "@smithy/core".length)))];
const encoderFile = coreInputs.find((p) => p.endsWith("getAwsChunkedEncodingStream.browser.js"));
const markers = coreRoots.map((root) => JSON.parse(readFileSync(`${root}/.smithy-ref.json`, "utf8")));
const bundle = readFileSync("dist/scenarios.browser.js", "utf8");

const check = {
  smithyCoreRootsInBundle: coreRoots,
  activeSmithy: markers,
  browserEncoderBundled: encoderFile ?? null,
  bundleHasFixFingerprint: bundle.includes("unsupported stream chunk type"),
  bundleHasBlobHasher: /function blobHasher|blobHasher =/.test(bundle),
};
writeFileSync("dist/bundle-check.json", JSON.stringify(check, null, 2));
console.log("bundle check:", JSON.stringify(check));
if (coreRoots.length !== 1 || !encoderFile || markers.length !== 1) {
  console.error("Unexpected @smithy/core layout in bundle; run ./use-smithy.sh first");
  process.exit(1);
}
