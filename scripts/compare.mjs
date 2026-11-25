import { readFileSync, writeFileSync } from "node:fs";
import { renderComparison } from "./render.mjs";

const load = (n) => JSON.parse(readFileSync(`results/${n}.json`, "utf8"));
const md = renderComparison(load("main"), load("fix"));
writeFileSync("results/comparison.md", md);
console.log(md);
