import { AsyncLocalStorage } from "node:async_hooks";

const als = new AsyncLocalStorage<Uint8Array>();

export const dekContext = {
  run<T>(dek: Uint8Array, fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      als.run(dek, () => {
        fn().then(resolve, reject);
      });
    });
  },
  get(): Uint8Array | undefined {
    return als.getStore();
  },
};
