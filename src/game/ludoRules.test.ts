import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PlayerColor,
  SeatType,
  TurnPhase,
  MAIN_TRACK_COORDS,
  createInitialMatchState,
  getLegalMoves,
  resolveDiceRoll,
  applyMove,
  getGlobalTrackIndex,
  getPlayerProgressPercent,
} from './ludoRules';

test('52-tile main track has exact length and distinct start indices', () => {
  assert.equal(MAIN_TRACK_COORDS.length, 52);
  assert.equal(getGlobalTrackIndex(PlayerColor.RED, 0), 0);
  assert.equal(getGlobalTrackIndex(PlayerColor.GREEN, 0), 13);
  assert.equal(getGlobalTrackIndex(PlayerColor.YELLOW, 0), 26);
  assert.equal(getGlobalTrackIndex(PlayerColor.BLUE, 0), 39);
});

test('yard exit requires rolling a 6 and grants a bonus roll', () => {
  const state = createInitialMatchState({
    [PlayerColor.RED]: SeatType.HUMAN,
    [PlayerColor.GREEN]: SeatType.BOT,
  });

  // Roll a 4 when all tokens are in the yard (-1) -> no legal moves, turn passes to GREEN
  const roll4 = resolveDiceRoll(state, 4);
  assert.equal(roll4.noLegalMoves, true);
  assert.equal(roll4.legalMoves.length, 0);
  assert.equal(roll4.nextState.currentTurnColor, PlayerColor.GREEN);

  // Roll a 6 from initial state -> 4 legal yard exit moves
  const roll6 = resolveDiceRoll(state, 6);
  assert.equal(roll6.noLegalMoves, false);
  assert.equal(roll6.legalMoves.length, 4);
  assert.equal(roll6.legalMoves[0].exitsYard, true);
  assert.equal(roll6.legalMoves[0].toStep, 0);

  // Applying the move puts token 0 at step 0 and keeps RED's turn for bonus roll
  const afterMove = applyMove(roll6.nextState, roll6.legalMoves[0]);
  assert.equal(afterMove.tokens[PlayerColor.RED][0].step, 0);
  assert.equal(afterMove.currentTurnColor, PlayerColor.RED);
  assert.equal(afterMove.turnPhase, TurnPhase.WAITING_FOR_ROLL);
});

test('capturing an opponent on a non-safe tile returns opponent to yard and grants bonus roll', () => {
  const state = createInitialMatchState();
  // Place RED token 0 at step 1 (global track index 1)
  state.tokens[PlayerColor.RED][0].step = 1;
  // Place GREEN token 0 at global track index 4:
  // wait: GREEN starts at 13, so let's place RED token 0 at step 14 (global index 14)
  // and GREEN token 0 at step 1 (global index 13 + 1 = 14)
  state.tokens[PlayerColor.RED][0].step = 11; // global index 11
  state.tokens[PlayerColor.GREEN][0].step = 1; // global index 14 (non-safe!)

  const rolled = resolveDiceRoll(state, 3); // 11 + 3 = 14!
  const captureMove = rolled.legalMoves.find((m) => m.tokenIndex === 0);
  assert.ok(captureMove);
  assert.deepEqual(captureMove.capturesTokenIds, ['GREEN-0']);

  const afterCapture = applyMove(rolled.nextState, captureMove);
  assert.equal(afterCapture.tokens[PlayerColor.RED][0].step, 14);
  assert.equal(afterCapture.tokens[PlayerColor.GREEN][0].step, -1); // back in yard
  assert.equal(afterCapture.capturesByColor[PlayerColor.RED], 1);
  assert.equal(afterCapture.currentTurnColor, PlayerColor.RED); // bonus roll!
});

test('safe star tiles protect opponent tokens from capture', () => {
  const state = createInitialMatchState();
  // Global index 13 is GREEN's starting safe tile
  state.tokens[PlayerColor.RED][0].step = 10; // global index 10
  state.tokens[PlayerColor.GREEN][0].step = 0; // global index 13 (safe!)

  const rolled = resolveDiceRoll(state, 3); // 10 + 3 = 13
  const move = rolled.legalMoves.find((m) => m.tokenIndex === 0);
  assert.ok(move);
  assert.equal(move.landsOnSafeTile, true);
  assert.equal(move.capturesTokenIds.length, 0);
});

test('three consecutive 6s forfeit the turn', () => {
  let state = createInitialMatchState();
  state.consecutiveSixes = 2;

  const thirdSix = resolveDiceRoll(state, 6);
  assert.equal(thirdSix.forfeitedTripleSix, true);
  assert.equal(thirdSix.legalMoves.length, 0);
  assert.equal(thirdSix.nextState.currentTurnColor, PlayerColor.GREEN);
  assert.equal(thirdSix.nextState.consecutiveSixes, 0);
});

test('exact roll required for home crown and crowning all 4 tokens triggers victory', () => {
  const state = createInitialMatchState();
  state.tokens[PlayerColor.RED][0].step = 56;
  state.tokens[PlayerColor.RED][1].step = 56;
  state.tokens[PlayerColor.RED][2].step = 56;
  state.tokens[PlayerColor.RED][3].step = 54; // Needs exact 2 to reach 56

  // Rolling a 4 overshoots 56 -> no legal moves
  const overshoot = getLegalMoves(state, PlayerColor.RED, 4);
  assert.equal(overshoot.length, 0);

  // Rolling an exact 2 reaches 56 and wins the game
  const exactRoll = resolveDiceRoll(state, 2);
  assert.equal(exactRoll.legalMoves.length, 1);
  assert.equal(exactRoll.legalMoves[0].reachesHome, true);

  const wonState = applyMove(exactRoll.nextState, exactRoll.legalMoves[0]);
  assert.equal(wonState.turnPhase, TurnPhase.GAME_OVER);
  assert.equal(wonState.finishOrder[0], PlayerColor.RED);
  assert.equal(getPlayerProgressPercent(wonState.tokens, PlayerColor.RED), 100);
});
