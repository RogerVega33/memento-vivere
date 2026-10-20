/** Track one active read, including manual refreshes and retries. */
export function createLatestRequest() {
  /** @type {AbortController|null} */
  let active = null;

  return {
    start() {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      return {
        signal: controller.signal,
        isCurrent: () => active === controller && !controller.signal.aborted,
      };
    },
    cancel() {
      active?.abort();
      active = null;
    },
  };
}
