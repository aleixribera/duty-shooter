import type { Reporter, TestModule } from 'vitest/node';

/**
 * The suite's time budget, said out loud: a whole tier that runs past its budget, or a fast-tier test
 * that takes longer than SLOW_TEST_MS, prints a warning under the summary naming what to make cheaper
 * (or, for a whole match, move to a soak). Budgets are for the laptop and for each CI shard alike.
 */
const BUDGET_S = { fast: 90, soak: 150 } as const;
const SLOW_TEST_MS = 10_000;

export default class Budget implements Reporter {
  private started = performance.now();

  onTestRunStart(): void {
    this.started = performance.now();
  }

  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const seconds = (performance.now() - this.started) / 1000;
    const projects = new Set(modules.map((m) => m.project.name));
    const slow: string[] = [];
    for (const m of modules) {
      if (m.project.name !== 'fast') continue;
      for (const t of m.children.allTests()) {
        const ms = t.diagnostic()?.duration ?? 0;
        if (ms > SLOW_TEST_MS) slow.push(`  ${(ms / 1000).toFixed(1)} s  ${m.relativeModuleId} > ${t.fullName}`);
      }
    }
    const lines: string[] = [];
    // Only a whole tier's run is held to the tier's budget: a file or a filter is always under it.
    if (modules.length > 100) {
      const budget = [...projects].reduce((s, p) => s + (BUDGET_S[p as keyof typeof BUDGET_S] ?? 0), 0);
      if (seconds > budget) lines.push(`the run took ${seconds.toFixed(0)} s, over its ${budget} s budget (AGENTS.md, "Test time budget")`);
    }
    if (slow.length) lines.push(`fast-tier tests over ${SLOW_TEST_MS / 1000} s: make them cheaper, or a soak if they play a whole match`, ...slow);
    if (lines.length) console.warn(`\n\x1b[33mTEST BUDGET: ${lines.join('\n')}\x1b[0m\n`);
  }
}
