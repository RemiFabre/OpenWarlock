import { defineConfig, defaultExclude } from 'vitest/config';

// .claude/worktrees/ holds agent worktrees (full repo copies) — without this
// exclude, vitest silently runs every suite TWICE and reports doubled counts.
export default defineConfig({
  test: { exclude: [...defaultExclude, '**/.claude/**'] },
});
