import { runCases } from "../src/scenarios.js";

export default {
  async fetch(request) {
    if (request.method !== "POST") return new Response("ready");
    const { cases, credentials } = await request.json();
    return Response.json(await runCases(cases, credentials));
  },
};
