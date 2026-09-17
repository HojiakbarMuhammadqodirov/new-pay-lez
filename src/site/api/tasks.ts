/**
 * The daily-task prompts, as the server prices them.
 *
 * ## Why there is no copy and no amount in this file
 *
 * A task arrives as a **key, a dictionary key and a number**, and every one of
 * those three comes from somewhere that cannot drift:
 *
 * - The **sentence** is `copy.games.tasks[copyKey]` — five dictionaries, where a
 *   missing or misspelt key is a build error. The server chooses *which* prompt;
 *   it does not send words, because words in a database are words that are
 *   missing in Ukrainian with nothing to report it.
 * - The **figure** is resolved on the server from the rule that pays it
 *   (`CONFIG.earn`, the check-in cycle, the plan multiplier), so a panel
 *   offering fifty points cannot be advertising a bonus that pays twenty-five.
 *   It is not a constant here for exactly that reason, and it must not become
 *   one: the check-in's value changes every day of the week.
 * - **`done`** is per account, from the same column the once-only grant guards
 *   on. An undone list is the whole feature — a nudge for something finished
 *   last month is a promise the server will refuse.
 *
 * `exact: false` means the number is a **ceiling**: a game round pays what the
 * round scored, so the prompt says "up to". Two dictionary entries per task
 * rather than one sentence with a fudged verb, because "earn 50 points" and
 * "earn up to 8 points" are different promises and only one of them is safe to
 * make about a round somebody might lose.
 */
import type { ApiState } from './useApi';

export interface DailyTask {
  key: string;
  /** The entry in `copy.games.tasks` to render. */
  copyKey: string;
  points: number;
  /** False when `points` is a ceiling rather than a promise. */
  exact: boolean;
  done: boolean;
  sortOrder: number;
}

export interface DailyTasks {
  tasks: DailyTask[];
}

export const DAILY_TASKS_PATH = '/v1/daily/tasks';

/**
 * The tasks still worth doing, in the server's order.
 *
 * A function rather than a filter at the call site because the empty case has
 * to be handled identically wherever it is read, and there are two empty cases
 * that look the same and are not: **nothing left to do today** (good, and the
 * panel says so) and **the server did not answer** (which `ApiState` keeps
 * separate and the panel must not turn into a congratulation).
 *
 * So this takes the state rather than the data: `null` means "no answer yet or
 * no answer at all", an empty array means "everything is done".
 */
export function openTasks(state: ApiState<DailyTasks>): DailyTask[] | null {
  if (state.status !== 'ready') return null;
  return state.data.tasks
    .filter((task) => !task.done)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
