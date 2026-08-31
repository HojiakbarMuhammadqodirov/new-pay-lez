/**
 * The weekly leaderboard, as the server serves it.
 *
 * Split out of `api/consumer.ts` because the board is the one thing here that
 * a **signed-out visitor** reads: `/v1/leaderboard/:scope` is `auth: 'none'`,
 * so somebody deciding whether to sign up can see that people are playing. The
 * rest of that file needs a session for every call, and mixing the two would
 * hide which is which.
 *
 * Three scopes, and they exist because one is never the right answer at two
 * different sizes. `global` always has somebody in it, which is what a product
 * with a handful of players needs; `city` and `country` get more interesting as
 * it grows. A scope that cannot be answered — a city board for somebody who
 * never gave a city — falls back to global on the server and says so in
 * `scope`, so the client can label what it actually got rather than guess.
 */
import { call } from './client';

export const SCOPES = ['city', 'country', 'global'] as const;
export type Scope = (typeof SCOPES)[number];

export interface BoardRow {
  rank: number;
  userId: string;
  /** The display name. Never the address — see §8.2 in `domain/social.ts`. */
  name: string;
  avatar: string | null;
  points: number;
  isYou: boolean;
}

export interface Board {
  /** What answered: `city:Krakow`, `country:PL` or `global`. */
  scope: string;
  /** ISO week, so a client can say which week it is looking at. */
  week: string;
  rows: BoardRow[];
  /**
   * The viewer's own row, **present even when they are not listed**.
   *
   * That is the opt-out case and the reason this field is separate from the
   * rows: everybody counts toward the ranking and only the opted-in are shown,
   * so a hidden player still learns their real position rather than a
   * flattering one computed over the people who agreed to be seen.
   */
  you: BoardRow | null;
  /** True when the viewer is playing but has chosen not to be listed. */
  hidden: boolean;
}

export const board = (scope: Scope, limit = 20) =>
  call<Board>(`/v1/leaderboard/${scope}?limit=${limit}`);
