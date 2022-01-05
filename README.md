# Node Cluster Memory

- memory.init();
- memory.get(key: string, timeout?: number (ms));
- memory.set(key: string, data: any, expire?: number (second), timeout?: number(ms));
- memory.del(key: string, timeout?: number (ms));

- expire: Time to delete data when there are no read and write operations
- timeout: ipc communication timeout
