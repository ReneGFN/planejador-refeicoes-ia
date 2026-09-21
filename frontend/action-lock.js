export function createActionLock() {
  const active = new Set();
  return {
    start(key) {
      if (active.has(key)) return false;
      active.add(key);
      return true;
    },
    finish(key) { active.delete(key); },
  };
}
