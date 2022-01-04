import cluster from "cluster";
import os from "os";
import crypto from "crypto";
import memory from "./memory";

const numCPUs = os.cpus().length;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  memory.init();
  if (cluster.isPrimary) {
    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }
    while (true) {
      console.log(await memory.get("test"));
      await sleep(100);
    }
  } else {
    while (true) {
      await memory.set("test", crypto.randomBytes(4).toString("hex"));
      await sleep(10000 * Math.random());
    }
  }
}

main();
