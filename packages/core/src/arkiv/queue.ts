/** A FIFO mutex as a promise chain: tasks run one at a time, in submission order. */
export function createWriteQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    // Keep the chain alive regardless of this task's outcome.
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}
