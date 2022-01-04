import cluster, { Worker } from "cluster";
import process from "process";

let mem: any = {}; // { key: value }
let timeouts: any = {}; // { key: { timeout, expire } }
let promises: any = {}; // { cnt: resolve }
let cnt = 0;

interface Data {
  isClusterMemoryData: boolean;
  op: string;
}

interface GetData extends Data {
  key: string;
  pri: number;
}

interface SetData extends Data {
  key: string;
  data: any;
  expire: number;
  pri: number;
}

interface DoneData extends Data {
  data: any;
  pri: number;
}

function setExpireTimeout(key: string, expire?: number): void {
  if (timeouts[key]) {
    clearTimeout(timeouts[key].timeout);
  }
  expire = expire ?? timeouts[key]?.timeout;
  if (!expire) throw Error("expire is null");
  timeouts[key] = {
    timeout: setTimeout(() => {
      delete mem[key];
      delete timeouts[key];
    }, expire * 1000),
    expire,
  };
}

function getPrimary(key: string): any {
  if (!mem[key]) return;
  setExpireTimeout(key);
  return mem[key];
}

async function getWorker(key: string, timeout: number = 5000): Promise<any> {
  if (!process.send) throw Error("Node.js was not spawned with an IPC channel");
  let pri = cnt++;
  if (cnt == Number.MAX_SAFE_INTEGER + 1) cnt = 0;
  let promise = new Promise((resolve) => {
    promises[pri] = resolve;
  });
  try {
    process.send({
      isClusterMemoryData: true,
      op: "get",
      key,
      pri,
    });
    let result = await Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(reject, timeout)),
    ]);
    return result;
  } finally {
    delete promises[pri];
  }
}

async function get(key: string, timeout: number = 5000): Promise<any> {
  if (cluster.isPrimary) {
    return getPrimary(key);
  } else {
    return await getWorker(key, timeout);
  }
}

function setPrimary(key: string, data: any, expire: number = 3600): void {
  setExpireTimeout(key, expire);
  mem[key] = data;
}

async function setWorker(
  key: string,
  data: any,
  expire: number = 3600,
  timeout: number = 5000
): Promise<void> {
  if (!process.send) throw Error("Node.js was not spawned with an IPC channel");
  let pri = cnt++;
  if (cnt == Number.MAX_SAFE_INTEGER + 1) cnt = 0;
  let promise = new Promise((resolve) => {
    promises[pri] = resolve;
  });
  try {
    process.send({
      isClusterMemoryData: true,
      op: "set",
      key,
      data,
      expire,
      pri,
    });
    await Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(reject, timeout)),
    ]);
  } finally {
    delete promises[pri];
  }
}

async function set(
  key: string,
  data: any,
  expire: number = 3600,
  timeout: number = 5000
): Promise<void> {
  if (cluster.isPrimary) {
    return setPrimary(key, data, expire);
  } else {
    return await setWorker(key, data, expire, timeout);
  }
}

function initPrimary(): void {
  cluster.on("online", (worker: Worker) => {
    worker.on("message", async (_data: any) => {
      if (_data.isClusterMemoryData) {
        let data = _data as Data;
        if (data.op === "get") {
          let getData = data as GetData;
          let result = await get(getData.key);
          worker.send({
            isClusterMemoryData: true,
            op: "done",
            pri: getData.pri,
            data: result,
          });
        } else if (data.op === "set") {
          let setData = data as SetData;
          await set(setData.key, setData.data, setData.expire);
          worker.send({
            isClusterMemoryData: true,
            op: "done",
            pri: setData.pri,
            data: undefined,
          });
        } else {
          throw Error("Data op is invalid");
        }
      }
    });
  });
}

function initWorker(): void {
  process.on("message", async (_data: any) => {
    if (_data.isClusterMemoryData) {
      let data = _data as Data;
      if (data.op === "done") {
        let doneData = data as DoneData;
        if (promises[doneData.pri]) {
          promises[doneData.pri](doneData.data);
        }
      } else {
        throw Error("Data op is invalid");
      }
    }
  });
}

function init(): void {
  if (cluster.isPrimary) {
    initPrimary();
  } else {
    initWorker();
  }
}

export { init, get, set };
export default {
  init,
  get,
  set,
};
