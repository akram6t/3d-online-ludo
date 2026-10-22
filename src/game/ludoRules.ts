export enum PlayerColor {
  RED = 'RED',
  GREEN = 'GREEN',
  YELLOW = 'YELLOW',
  BLUE = 'BLUE',
}

export enum SeatType {
  HUMAN = 'HUMAN',
  BOT = 'BOT',
  OFF = 'OFF',
}

export enum TurnPhase {
  WAITING_FOR_ROLL = 'WAITING_FOR_ROLL',
  ROLLING = 'ROLLING',
  SELECTING_MOVE = 'SELECTING_MOVE',
  ANIMATING_MOVE = 'ANIMATING_MOVE',
  GAME_OVER = 'GAME_OVER',
}

export interface TokenState {
  id: string; // e.g. 'RED-0'
  color: PlayerColor;
  tokenIndex: number; // 0..3
  /**
   * Relative progress step:
   * -1 = in Starting Yard
   * 0..50 = on Main Perimeter Track (51 steps around the board)
   * 51..55 = on Colored Home Stretch (5 steps)
   * 56 = Finished inside Center Home Crown
   */
  step: number;
}

export interface PlayerConfig {
  color: PlayerColor;
  name: string;
  seatType: SeatType;
  hex: string;
  accentHex: string;
  darkHex: string;
}

export interface GridCoord {
  col: number; // 0..14 (X axis: col - 7)
  row: number; // 0..14 (Z axis: row - 7)
}

export interface MoveOption {
  tokenIndex: number;
  tokenId: string;
  fromStep: number;
  toStep: number;
  pathCoords: GridCoord[];
  capturesTokenIds: string[];
  landsOnSafeTile: boolean;
  reachesHome: boolean;
  exitsYard: boolean;
  tacticalScore: number;
  tacticalReason: string;
}

export interface LudoMatchState {
  players: Record<PlayerColor, PlayerConfig>;
  activeColors: PlayerColor[];
  currentTurnColor: PlayerColor;
  turnPhase: TurnPhase;
  diceValue: number | null;
  consecutiveSixes: number;
  tokens: Record<PlayerColor, TokenState[]>;
  turnsPlayed: number;
  capturesByColor: Record<PlayerColor, number>;
  finishOrder: PlayerColor[];
  lastActionLog: string;
}

export const PLAYER_ORDER: PlayerColor[] = [
  PlayerColor.RED,
  PlayerColor.GREEN,
  PlayerColor.YELLOW,
  PlayerColor.BLUE,
];

export const DEFAULT_PLAYERS: Record<PlayerColor, PlayerConfig> = {
  [PlayerColor.RED]: {
    color: PlayerColor.RED,
    name: 'Crimson House',
    seatType: SeatType.HUMAN,
    hex: '#DC2626',
    accentHex: '#FCA5A5',
    darkHex: '#7F1D1D',
  },
  [PlayerColor.GREEN]: {
    color: PlayerColor.GREEN,
    name: 'Emerald Guard',
    seatType: SeatType.BOT,
    hex: '#16A34A',
    accentHex: '#86EFAC',
    darkHex: '#14532D',
  },
  [PlayerColor.YELLOW]: {
    color: PlayerColor.YELLOW,
    name: 'Sovereign Gold',
    seatType: SeatType.BOT,
    hex: '#D97706',
    accentHex: '#FDE68A',
    darkHex: '#78350F',
  },
  [PlayerColor.BLUE]: {
    color: PlayerColor.BLUE,
    name: 'Sapphire Crown',
    seatType: SeatType.BOT,
    hex: '#2563EB',
    accentHex: '#93C5FD',
    darkHex: '#1E3A8A',
  },
};

/**
 * 52-tile clockwise main perimeter track on a 15x15 Ludo grid (col 0..14, row 0..14)
 */
export const MAIN_TRACK_COORDS: GridCoord[] = [
  // Red arm top row moving right (indices 0..4)
  { col: 1, row: 6 },
  { col: 2, row: 6 },
  { col: 3, row: 6 },
  { col: 4, row: 6 },
  { col: 5, row: 6 },
  // Green arm left col moving up (indices 5..10)
  { col: 6, row: 5 },
  { col: 6, row: 4 },
  { col: 6, row: 3 },
  { col: 6, row: 2 },
  { col: 6, row: 1 },
  { col: 6, row: 0 },
  // Top turn (index 11)
  { col: 7, row: 0 },
  // Green arm right col moving down (indices 12..17) — index 13 is Green start
  { col: 8, row: 0 },
  { col: 8, row: 1 },
  { col: 8, row: 2 },
  { col: 8, row: 3 },
  { col: 8, row: 4 },
  { col: 8, row: 5 },
  // Yellow arm top row moving right (indices 18..23)
  { col: 9, row: 6 },
  { col: 10, row: 6 },
  { col: 11, row: 6 },
  { col: 12, row: 6 },
  { col: 13, row: 6 },
  { col: 14, row: 6 },
  // Right turn (index 24)
  { col: 14, row: 7 },
  // Yellow arm bottom row moving left (indices 25..30) — index 26 is Yellow start
  { col: 14, row: 8 },
  { col: 13, row: 8 },
  { col: 12, row: 8 },
  { col: 11, row: 8 },
  { col: 10, row: 8 },
  { col: 9, row: 8 },
  // Blue arm right col moving down (indices 31..36)
  { col: 8, row: 9 },
  { col: 8, row: 10 },
  { col: 8, row: 11 },
  { col: 8, row: 12 },
  { col: 8, row: 13 },
  { col: 8, row: 14 },
  // Bottom turn (index 37)
  { col: 7, row: 14 },
  // Blue arm left col moving up (indices 38..43) — index 39 is Blue start
  { col: 6, row: 14 },
  { col: 6, row: 13 },
  { col: 6, row: 12 },
  { col: 6, row: 11 },
  { col: 6, row: 10 },
  { col: 6, row: 9 },
  // Red arm bottom row moving left (indices 44..49)
  { col: 5, row: 8 },
  { col: 4, row: 8 },
  { col: 3, row: 8 },
  { col: 2, row: 8 },
  { col: 1, row: 8 },
  { col: 0, row: 8 },
  // Left turn (index 50) & corner before Red start (index 51)
  { col: 0, row: 7 },
  { col: 0, row: 6 },
];

export const START_TRACK_INDEX: Record<PlayerColor, number> = {
  [PlayerColor.RED]: 0,
  [PlayerColor.GREEN]: 13,
  [PlayerColor.YELLOW]: 26,
  [PlayerColor.BLUE]: 39,
};

/**
 * 8 Star/Safe squares on the 52-tile perimeter track:
 * The 4 colored start squares (0, 13, 26, 39) + 4 star squares (8, 21, 34, 47)
 */
export const SAFE_TRACK_INDICES = new Set<number>([0, 8, 13, 21, 26, 34, 39, 47]);

/**
 * Home Stretch coordinates for steps 51..55
 */
export const HOME_STRETCH_COORDS: Record<PlayerColor, GridCoord[]> = {
  [PlayerColor.RED]: [
    { col: 1, row: 7 },
    { col: 2, row: 7 },
    { col: 3, row: 7 },
    { col: 4, row: 7 },
    { col: 5, row: 7 },
  ],
  [PlayerColor.GREEN]: [
    { col: 7, row: 1 },
    { col: 7, row: 2 },
    { col: 7, row: 3 },
    { col: 7, row: 4 },
    { col: 7, row: 5 },
  ],
  [PlayerColor.YELLOW]: [
    { col: 13, row: 7 },
    { col: 12, row: 7 },
    { col: 11, row: 7 },
    { col: 10, row: 7 },
    { col: 9, row: 7 },
  ],
  [PlayerColor.BLUE]: [
    { col: 7, row: 13 },
    { col: 7, row: 12 },
    { col: 7, row: 11 },
    { col: 7, row: 10 },
    { col: 7, row: 9 },
  ],
};

/**
 * Yard rest coordinates for each player's 4 tokens (step === -1)
 * Note: RED is bottom-left or top-left?
 * Wait: on our 15x15 grid:
 * - Left arm is col 0..5, row 6..8. Red starts at (col 1, row 6), which is adjacent to the TOP-LEFT 6x6 yard (col 0..5, row 0..5)!
 * Let's verify each 6x6 yard so the yard sits directly beside each color's start square:
 * - RED starts at (col 1, row 6) -> Top-Left Yard (col 0..5, row 0..5)
 * - GREEN starts at (col 8, row 1) -> Top-Right Yard (col 9..14, row 0..5)
 * - YELLOW starts at (col 13, row 8) -> Bottom-Right Yard (col 9..14, row 9..14)
 * - BLUE starts at (col 6, row 13) -> Bottom-Left Yard (col 0..5, row 9..14)
 */
export const YARD_TOKEN_COORDS: Record<PlayerColor, GridCoord[]> = {
  [PlayerColor.RED]: [
    { col: 1.75, row: 1.75 },
    { col: 3.25, row: 1.75 },
    { col: 1.75, row: 3.25 },
    { col: 3.25, row: 3.25 },
  ],
  [PlayerColor.GREEN]: [
    { col: 10.75, row: 1.75 },
    { col: 12.25, row: 1.75 },
    { col: 10.75, row: 3.25 },
    { col: 12.25, row: 3.25 },
  ],
  [PlayerColor.YELLOW]: [
    { col: 10.75, row: 10.75 },
    { col: 12.25, row: 10.75 },
    { col: 10.75, row: 12.25 },
    { col: 12.25, row: 12.25 },
  ],
  [PlayerColor.BLUE]: [
    { col: 1.75, row: 10.75 },
    { col: 3.25, row: 10.75 },
    { col: 1.75, row: 12.25 },
    { col: 3.25, row: 12.25 },
  ],
};

/**
 * Center Home Crown positions for finished tokens (step === 56)
 */
export const HOME_GOAL_COORDS: Record<PlayerColor, GridCoord[]> = {
  [PlayerColor.RED]: [
    { col: 6.18, row: 6.65 },
    { col: 6.18, row: 7.0 },
    { col: 6.18, row: 7.35 },
    { col: 6.48, row: 7.0 },
  ],
  [PlayerColor.GREEN]: [
    { col: 6.65, row: 6.18 },
    { col: 7.0, row: 6.18 },
    { col: 7.35, row: 6.18 },
    { col: 7.0, row: 6.48 },
  ],
  [PlayerColor.YELLOW]: [
    { col: 7.82, row: 6.65 },
    { col: 7.82, row: 7.0 },
    { col: 7.82, row: 7.35 },
    { col: 7.52, row: 7.0 },
  ],
  [PlayerColor.BLUE]: [
    { col: 6.65, row: 7.82 },
    { col: 7.0, row: 7.82 },
    { col: 7.35, row: 7.82 },
    { col: 7.0, row: 7.52 },
  ],
};

/**
 * Converts a color + relative step (0..50) to global track index (0..51).
 * Returns null if step < 0 or step > 50.
 */
export function getGlobalTrackIndex(color: PlayerColor, step: number): number | null {
  if (step < 0 || step > 50) return null;
  return (START_TRACK_INDEX[color] + step) % 52;
}

/**
 * Gets the exact GridCoord for a token given its color, tokenIndex (0..3), and relative step (-1..56).
 */
export function getTokenGridCoord(
  color: PlayerColor,
  tokenIndex: number,
  step: number
): GridCoord {
  if (step < 0) {
    return YARD_TOKEN_COORDS[color][tokenIndex] ?? YARD_TOKEN_COORDS[color][0];
  }
  if (step <= 50) {
    const idx = getGlobalTrackIndex(color, step)!;
    return MAIN_TRACK_COORDS[idx];
  }
  if (step <= 55) {
    return HOME_STRETCH_COORDS[color][step - 51];
  }
  return HOME_GOAL_COORDS[color][tokenIndex] ?? HOME_GOAL_COORDS[color][0];
}

/**
 * Creates a fresh LudoMatchState from the configured seats.
 */
export function createInitialMatchState(
  seatOverrides?: Partial<Record<PlayerColor, SeatType>>
): LudoMatchState {
  const players: Record<PlayerColor, PlayerConfig> = {
    [PlayerColor.RED]: { ...DEFAULT_PLAYERS[PlayerColor.RED] },
    [PlayerColor.GREEN]: { ...DEFAULT_PLAYERS[PlayerColor.GREEN] },
    [PlayerColor.YELLOW]: { ...DEFAULT_PLAYERS[PlayerColor.YELLOW] },
    [PlayerColor.BLUE]: { ...DEFAULT_PLAYERS[PlayerColor.BLUE] },
  };

  if (seatOverrides) {
    for (const color of PLAYER_ORDER) {
      if (seatOverrides[color]) {
        players[color].seatType = seatOverrides[color]!;
      }
    }
  }

  const activeColors = PLAYER_ORDER.filter((c) => players[c].seatType !== SeatType.OFF);
  // Guarantee at least 2 active players
  if (activeColors.length < 2) {
    players[PlayerColor.RED].seatType = SeatType.HUMAN;
    players[PlayerColor.YELLOW].seatType = SeatType.BOT;
    activeColors.splice(0, activeColors.length, PlayerColor.RED, PlayerColor.YELLOW);
  }

  const tokens: Record<PlayerColor, TokenState[]> = {
    [PlayerColor.RED]: [],
    [PlayerColor.GREEN]: [],
    [PlayerColor.YELLOW]: [],
    [PlayerColor.BLUE]: [],
  };

  for (const color of PLAYER_ORDER) {
    tokens[color] = [0, 1, 2, 3].map((idx) => ({
      id: `${color}-${idx}`,
      color,
      tokenIndex: idx,
      step: -1,
    }));
  }

  return {
    players,
    activeColors,
    currentTurnColor: activeColors[0],
    turnPhase: TurnPhase.WAITING_FOR_ROLL,
    diceValue: null,
    consecutiveSixes: 0,
    tokens,
    turnsPlayed: 1,
    capturesByColor: {
      [PlayerColor.RED]: 0,
      [PlayerColor.GREEN]: 0,
      [PlayerColor.YELLOW]: 0,
      [PlayerColor.BLUE]: 0,
    },
    finishOrder: [],
    lastActionLog: `${players[activeColors[0]].name} to roll the die.`,
  };
}

/**
 * Computes all legal MoveOptions for `color` given `diceValue` (1..6).
 * Includes tactical evaluation score and reasoning for AI & Tactical Advisor.
 */
export function getLegalMoves(
  state: LudoMatchState,
  color: PlayerColor = state.currentTurnColor,
  diceValue: number | null = state.diceValue
): MoveOption[] {
  if (!diceValue || diceValue < 1 || diceValue > 6) return [];
  const playerTokens = state.tokens[color];
  const moves: MoveOption[] = [];

  for (const token of playerTokens) {
    if (token.step === 56) continue; // Already home

    let toStep = -1;
    let exitsYard = false;

    if (token.step === -1) {
      if (diceValue === 6) {
        toStep = 0;
        exitsYard = true;
      } else {
        continue;
      }
    } else {
      if (token.step + diceValue <= 56) {
        toStep = token.step + diceValue;
      } else {
        continue; // Overshoots exact home roll
      }
    }

    // Build step-by-step path coordinates for hopping animation
    const pathCoords: GridCoord[] = [];
    if (exitsYard) {
      pathCoords.push(getTokenGridCoord(color, token.tokenIndex, 0));
    } else {
      for (let s = token.step + 1; s <= toStep; s++) {
        pathCoords.push(getTokenGridCoord(color, token.tokenIndex, s));
      }
    }

    const destTrackIdx = getGlobalTrackIndex(color, toStep);
    const landsOnSafeTile =
      toStep >= 51 || (destTrackIdx !== null && SAFE_TRACK_INDICES.has(destTrackIdx));
    const reachesHome = toStep === 56;

    // Check captures: if landing on a main track tile (0..50) that is NOT a safe tile,
    // any opponent tokens at that exact global track index are captured!
    const capturesTokenIds: string[] = [];
    if (destTrackIdx !== null && !SAFE_TRACK_INDICES.has(destTrackIdx)) {
      for (const otherColor of state.activeColors) {
        if (otherColor === color) continue;
        for (const otherToken of state.tokens[otherColor]) {
          const otherTrackIdx = getGlobalTrackIndex(otherColor, otherToken.step);
          if (otherTrackIdx !== null && otherTrackIdx === destTrackIdx) {
            capturesTokenIds.push(otherToken.id);
          }
        }
      }
    }

    // Evaluate tactical score and human-readable strategic reason
    const { score, reason } = evaluateMoveTactics(
      state,
      color,
      token,
      toStep,
      exitsYard,
      landsOnSafeTile,
      reachesHome,
      capturesTokenIds
    );

    moves.push({
      tokenIndex: token.tokenIndex,
      tokenId: token.id,
      fromStep: token.step,
      toStep,
      pathCoords,
      capturesTokenIds,
      landsOnSafeTile,
      reachesHome,
      exitsYard,
      tacticalScore: score,
      tacticalReason: reason,
    });
  }

  return moves.sort((a, b) => b.tacticalScore - a.tacticalScore);
}

/**
 * Evaluates a candidate move using positional danger (1-6 steps ahead of enemy pieces),
 * capture value, safe-star anchoring, yard deployment, and home completion.
 */
function evaluateMoveTactics(
  state: LudoMatchState,
  color: PlayerColor,
  token: TokenState,
  toStep: number,
  exitsYard: boolean,
  landsOnSafeTile: boolean,
  reachesHome: boolean,
  capturesTokenIds: string[]
): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  if (capturesTokenIds.length > 0) {
    score += 140 * capturesTokenIds.length;
    reasons.push(`Captures opponent pawn and earns a bonus roll`);
  }

  if (reachesHome) {
    score += 120;
    reasons.push(`Secures pawn inside the Crown Home and grants a bonus roll`);
  }

  if (exitsYard) {
    const activeCount = state.tokens[color].filter((t) => t.step >= 0 && t.step < 56).length;
    score += activeCount === 0 ? 115 : activeCount === 1 ? 95 : 75;
    reasons.push(`Deploys pawn from yard onto protected starting star`);
  }

  // Danger check at current position vs destination position
  const currentTrackIdx = getGlobalTrackIndex(color, token.step);
  const destTrackIdx = getGlobalTrackIndex(color, toStep);

  const isCurrentlyExposed =
    currentTrackIdx !== null && !SAFE_TRACK_INDICES.has(currentTrackIdx);
  const currentThreatCount = isCurrentlyExposed
    ? countOpponentThreatsBehind(state, color, currentTrackIdx!)
    : 0;

  if (currentThreatCount > 0) {
    score += 38 * currentThreatCount;
    reasons.push(`Escapes direct pursuit from ${currentThreatCount} trailing opponent pawn(s)`);
  }

  if (landsOnSafeTile && !exitsYard && !reachesHome) {
    score += 55;
    if (toStep >= 51) {
      reasons.push(`Enters invulnerable Home Stretch corridor`);
    } else {
      reasons.push(`Anchors on a Star Safe tile immune to capture`);
    }
  }

  if (destTrackIdx !== null && !SAFE_TRACK_INDICES.has(destTrackIdx)) {
    const destThreatCount = countOpponentThreatsBehind(state, color, destTrackIdx);
    if (destThreatCount > 0) {
      score -= 42 * destThreatCount;
      reasons.push(`Caution: exposes pawn within 6 tiles of an opponent`);
    }
  }

  // Progress bonus (favor advancing leading pieces close to home stretch)
  score += Math.round(toStep * 0.8);

  if (reasons.length === 0) {
    reasons.push(`Advances pawn to step ${toStep}/56 along perimeter track`);
  }

  return {
    score,
    reason: reasons.slice(0, 2).join(' · '),
  };
}

/**
 * Counts how many active opponent pawns sit 1..6 tiles behind `targetTrackIdx` on the 52-tile track.
 */
export function countOpponentThreatsBehind(
  state: LudoMatchState,
  color: PlayerColor,
  targetTrackIdx: number
): number {
  let threats = 0;
  for (const otherColor of state.activeColors) {
    if (otherColor === color) continue;
    for (const otherToken of state.tokens[otherColor]) {
      const otherIdx = getGlobalTrackIndex(otherColor, otherToken.step);
      if (otherIdx === null) continue;
      const dist = (targetTrackIdx - otherIdx + 52) % 52;
      if (dist >= 1 && dist <= 6 && otherToken.step + dist <= 50) {
        threats++;
      }
    }
  }
  return threats;
}

/**
 * Applies a chosen MoveOption and returns the updated LudoMatchState.
 */
export function applyMove(state: LudoMatchState, move: MoveOption): LudoMatchState {
  const color = state.currentTurnColor;
  const nextTokens: Record<PlayerColor, TokenState[]> = {
    [PlayerColor.RED]: state.tokens[PlayerColor.RED].map((t) => ({ ...t })),
    [PlayerColor.GREEN]: state.tokens[PlayerColor.GREEN].map((t) => ({ ...t })),
    [PlayerColor.YELLOW]: state.tokens[PlayerColor.YELLOW].map((t) => ({ ...t })),
    [PlayerColor.BLUE]: state.tokens[PlayerColor.BLUE].map((t) => ({ ...t })),
  };

  // Move the chosen token
  const movingToken = nextTokens[color].find((t) => t.tokenIndex === move.tokenIndex);
  if (!movingToken) return state;
  movingToken.step = move.toStep;

  // Send captured opponent tokens back to their yard (-1)
  const nextCaptures = { ...state.capturesByColor };
  for (const capturedId of move.capturesTokenIds) {
    for (const c of state.activeColors) {
      const victim = nextTokens[c].find((t) => t.id === capturedId);
      if (victim) {
        victim.step = -1;
        nextCaptures[color] = (nextCaptures[color] || 0) + 1;
      }
    }
  }

  // Check if current player has all 4 tokens at step 56
  const allHome = nextTokens[color].every((t) => t.step === 56);
  const nextFinishOrder = [...state.finishOrder];
  if (allHome && !nextFinishOrder.includes(color)) {
    nextFinishOrder.push(color);
  }

  // Victory check: first player to bring all 4 tokens home wins the match!
  if (allHome) {
    return {
      ...state,
      tokens: nextTokens,
      capturesByColor: nextCaptures,
      finishOrder: nextFinishOrder,
      turnPhase: TurnPhase.GAME_OVER,
      lastActionLog: `${state.players[color].name} crowned all 4 pawns and won the match!`,
    };
  }

  // Bonus roll granted on rolling a 6, capturing a piece, or reaching Home (step 56)
  const earnedBonusRoll =
    state.diceValue === 6 || move.capturesTokenIds.length > 0 || move.reachesHome;

  if (earnedBonusRoll) {
    const actionDesc =
      move.capturesTokenIds.length > 0
        ? `captured an opposing pawn — Bonus Roll!`
        : move.reachesHome
        ? `crowned Pawn #${move.tokenIndex + 1} — Bonus Roll!`
        : `rolled a 6 — Bonus Roll!`;

    return {
      ...state,
      tokens: nextTokens,
      capturesByColor: nextCaptures,
      finishOrder: nextFinishOrder,
      diceValue: null,
      turnPhase: TurnPhase.WAITING_FOR_ROLL,
      lastActionLog: `${state.players[color].name} ${actionDesc}`,
    };
  }

  // Advance to next active player's turn
  const nextColor = getNextActiveColor(state.activeColors, color);
  return {
    ...state,
    tokens: nextTokens,
    capturesByColor: nextCaptures,
    finishOrder: nextFinishOrder,
    currentTurnColor: nextColor,
    consecutiveSixes: 0,
    diceValue: null,
    turnPhase: TurnPhase.WAITING_FOR_ROLL,
    turnsPlayed: state.turnsPlayed + 1,
    lastActionLog: `${state.players[nextColor].name} to roll.`,
  };
}

/**
 * Handles the outcome of a dice roll (1..6), including the 3-consecutive-sixes forfeit rule
 * and auto-passing when no legal moves exist.
 */
export function resolveDiceRoll(
  state: LudoMatchState,
  rolledValue: number
): {
  nextState: LudoMatchState;
  legalMoves: MoveOption[];
  forfeitedTripleSix: boolean;
  noLegalMoves: boolean;
} {
  const color = state.currentTurnColor;
  const newConsecutiveSixes = rolledValue === 6 ? state.consecutiveSixes + 1 : 0;

  // Classic Ludo rule: 3 consecutive 6s forfeit the turn
  if (newConsecutiveSixes >= 3) {
    const nextColor = getNextActiveColor(state.activeColors, color);
    const nextState: LudoMatchState = {
      ...state,
      diceValue: rolledValue,
      consecutiveSixes: 0,
      currentTurnColor: nextColor,
      turnPhase: TurnPhase.WAITING_FOR_ROLL,
      turnsPlayed: state.turnsPlayed + 1,
      lastActionLog: `${state.players[color].name} rolled three 6s in a row — turn passes to ${state.players[nextColor].name}.`,
    };
    return {
      nextState,
      legalMoves: [],
      forfeitedTripleSix: true,
      noLegalMoves: false,
    };
  }

  const tempState: LudoMatchState = {
    ...state,
    diceValue: rolledValue,
    consecutiveSixes: newConsecutiveSixes,
    turnPhase: TurnPhase.SELECTING_MOVE,
  };

  const legalMoves = getLegalMoves(tempState, color, rolledValue);

  if (legalMoves.length === 0) {
    const nextColor = getNextActiveColor(state.activeColors, color);
    const nextState: LudoMatchState = {
      ...tempState,
      currentTurnColor: nextColor,
      consecutiveSixes: 0,
      diceValue: null,
      turnPhase: TurnPhase.WAITING_FOR_ROLL,
      turnsPlayed: state.turnsPlayed + 1,
      lastActionLog: `${state.players[color].name} rolled ${rolledValue} with no legal moves — ${state.players[nextColor].name} up next.`,
    };
    return {
      nextState,
      legalMoves: [],
      forfeitedTripleSix: false,
      noLegalMoves: true,
    };
  }

  return {
    nextState: {
      ...tempState,
      lastActionLog: `${state.players[color].name} rolled ${rolledValue} — select a pawn to move.`,
    },
    legalMoves,
    forfeitedTripleSix: false,
    noLegalMoves: false,
  };
}

export function getNextActiveColor(
  activeColors: PlayerColor[],
  current: PlayerColor
): PlayerColor {
  const idx = activeColors.indexOf(current);
  if (idx === -1) return activeColors[0];
  return activeColors[(idx + 1) % activeColors.length];
}

/**
 * Calculates overall progress percentage (0..100) for a player color.
 */
export function getPlayerProgressPercent(
  tokens: Record<PlayerColor, TokenState[]>,
  color: PlayerColor
): number {
  const list = tokens[color] || [];
  const totalSteps = list.reduce((acc, t) => acc + Math.max(0, t.step + 1), 0);
  // Max per token is 57 steps (-1 to 56), so 4 * 57 = 228
  return Math.round((totalSteps / 228) * 100);
}
