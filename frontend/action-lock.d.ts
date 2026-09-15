export function createActionLock(): {
  start(key: string): boolean;
  finish(key: string): void;
};
