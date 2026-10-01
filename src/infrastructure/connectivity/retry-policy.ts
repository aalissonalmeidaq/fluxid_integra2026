interface Options { logger?: (entry: { event: 'manual_retry' }) => void }

export function createRetryPolicy(options: Options = {}) {
  let automaticAttempt = 0;
  const delays = [2000, 4000, 8000] as const;
  return {
    nextAutomaticDelay(): number | null { return delays[automaticAttempt++] ?? null; },
    reset(): void { automaticAttempt = 0; },
    async runManual<T>(action: () => Promise<T>): Promise<T> {
      options.logger?.({ event: 'manual_retry' });
      return action();
    },
  };
}
