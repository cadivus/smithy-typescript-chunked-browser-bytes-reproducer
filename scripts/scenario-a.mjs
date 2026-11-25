import { encoderDirect, encoderViaSdk, runtimeInfo } from "../dist/scenarios.browser.js";

console.log(JSON.stringify({ runtime: runtimeInfo(), direct: await encoderDirect(), viaSdk: await encoderViaSdk() }, null, 2));
