/**
 * Why a move list cannot have come from playing the board it claims to be for.
 *
 * Shared by both seeded engines so `games.finish` has one thing to catch. The
 * reasons are the wire's vocabulary — `finish` puts `reason` and `move` into the
 * refusal's detail — so a client that sent a bad replay is told which move of it
 * the server could not follow, which is the one fact that makes a divergence
 * between the Dart port and this one debuggable from a bug report.
 *
 * Fields are assigned in the body rather than declared as constructor parameter
 * properties because Node runs this file with type-stripping only, and parameter
 * properties are not strippable syntax.
 */
export type ReplayReason = 'bad_move' | 'no_change' | 'no_match' | 'too_many_moves';

export class ReplayError extends Error {
  /** 0-based index of the offending move, or -1 for the list as a whole. */
  readonly move: number;
  readonly reason: ReplayReason;

  constructor(move: number, reason: ReplayReason) {
    super(`${reason} at move ${move}`);
    this.move = move;
    this.reason = reason;
  }
}
