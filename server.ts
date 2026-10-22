import 'dotenv/config';
import http from 'http';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  DEFAULT_PLAYERS,
  LudoMatchState,
  MoveOption,
  PLAYER_ORDER,
  PlayerColor,
  SeatType,
  TurnPhase,
  applyMove,
  createInitialMatchState,
  resolveDiceRoll,
} from './src/game/ludoRules.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface OnlineSeatInfo {
  color: PlayerColor;
  seatType: SeatType;
  occupantClientId: string | null;
  occupantName: string;
  connected: boolean;
}

export interface OnlineRoomSnapshot {
  roomId: string;
  roomName: string;
  hostClientId: string;
  status: 'lobby' | 'playing' | 'gameover';
  seats: Record<PlayerColor, OnlineSeatInfo>;
  matchState: LudoMatchState;
  legalMoves: MoveOption[];
  turnDeadlineMs: number;
  rollSeq: number;
  lastRoll: {
    rollSeq: number;
    color: PlayerColor;
    value: number;
  } | null;
  moveSeq: number;
  lastMove: {
    moveSeq: number;
    color: PlayerColor;
    move: MoveOption;
  } | null;
  emoteSeq: number;
  lastEmote: {
    emoteSeq: number;
    color: PlayerColor;
    senderName: string;
    preset: string;
  } | null;
  connectedCount: number;
  updatedAt: number;
}

interface InternalRoom extends OnlineRoomSnapshot {
  clients: Map<string, { ws: WebSocket; playerName: string }>;
  botTimer: NodeJS.Timeout | null;
  turnTimeoutTimer: NodeJS.Timeout | null;
}

const TURN_LIMIT_MS = 15000;

const rooms = new Map<string, InternalRoom>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function sanitizeRoomCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

function buildSeatConfigFromRoomSeats(
  seats: Record<PlayerColor, OnlineSeatInfo>
): Record<PlayerColor, SeatType> {
  return {
    [PlayerColor.RED]: seats.RED.seatType,
    [PlayerColor.GREEN]: seats.GREEN.seatType,
    [PlayerColor.YELLOW]: seats.YELLOW.seatType,
    [PlayerColor.BLUE]: seats.BLUE.seatType,
  };
}

function syncMatchPlayerNames(room: InternalRoom) {
  for (const color of PLAYER_ORDER) {
    const seat = room.seats[color];
    if (seat.seatType === SeatType.HUMAN && seat.occupantName) {
      room.matchState.players[color].name = seat.occupantName;
    } else if (seat.seatType === SeatType.BOT) {
      room.matchState.players[color].name = `${DEFAULT_PLAYERS[color].name.split(' ')[0]} Bot`;
    } else {
      room.matchState.players[color].name = DEFAULT_PLAYERS[color].name;
    }
    room.matchState.players[color].seatType = seat.seatType;
  }
}

function toPublicSnapshot(room: InternalRoom): OnlineRoomSnapshot {
  let connectedCount = 0;
  for (const color of PLAYER_ORDER) {
    if (room.seats[color].occupantClientId && room.seats[color].connected) {
      connectedCount++;
    }
  }
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    hostClientId: room.hostClientId,
    status: room.status,
    seats: room.seats,
    matchState: room.matchState,
    legalMoves: room.legalMoves,
    turnDeadlineMs: room.turnDeadlineMs,
    rollSeq: room.rollSeq,
    lastRoll: room.lastRoll,
    moveSeq: room.moveSeq,
    lastMove: room.lastMove,
    emoteSeq: room.emoteSeq,
    lastEmote: room.lastEmote,
    connectedCount: Math.max(connectedCount, room.clients.size),
    updatedAt: room.updatedAt,
  };
}

function broadcastRoomState(room: InternalRoom) {
  room.updatedAt = Date.now();
  const payload = JSON.stringify({
    type: 'room:state',
    room: toPublicSnapshot(room),
  });
  for (const { ws } of room.clients.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function clearRoomBotTimer(room: InternalRoom) {
  if (room.botTimer) {
    clearTimeout(room.botTimer);
    room.botTimer = null;
  }
  if (room.turnTimeoutTimer) {
    clearTimeout(room.turnTimeoutTimer);
    room.turnTimeoutTimer = null;
  }
}

function executeRoomMove(room: InternalRoom, color: PlayerColor, move: MoveOption) {
  clearRoomBotTimer(room);
  room.turnDeadlineMs = 0;
  room.moveSeq += 1;
  room.lastMove = {
    moveSeq: room.moveSeq,
    color,
    move,
  };
  room.legalMoves = [];
  room.matchState = {
    ...room.matchState,
    turnPhase: TurnPhase.ANIMATING_MOVE,
    lastActionLog: `${room.matchState.players[color].name} moving Goti #${move.tokenIndex + 1}...`,
  };
  syncMatchPlayerNames(room);
  broadcastRoomState(room);

  const stepsCount = Math.max(1, move.pathCoords.length);
  const animMs = Math.min(2600, stepsCount * 170 + (move.capturesTokenIds.length > 0 ? 750 : 280));

  room.botTimer = setTimeout(() => {
    const postMove = applyMove(room.matchState, move);
    room.matchState = postMove;
    syncMatchPlayerNames(room);
    if (postMove.turnPhase === TurnPhase.GAME_OVER) {
      room.status = 'gameover';
      room.turnDeadlineMs = 0;
      broadcastRoomState(room);
      return;
    }
    scheduleBotTurnIfNeeded(room);
    broadcastRoomState(room);
  }, animMs);
}

function triggerRoomDiceRoll(room: InternalRoom, requestedByColor: PlayerColor) {
  if (room.status !== 'playing') return;
  if (room.matchState.turnPhase !== TurnPhase.WAITING_FOR_ROLL) return;
  if (room.matchState.currentTurnColor !== requestedByColor) return;

  clearRoomBotTimer(room);
  room.turnDeadlineMs = 0;

  const ms = room.matchState;
  const allInYard = ms.tokens[requestedByColor].every((t) => t.step === -1);
  const isOpeningFirstRoll =
    ms.turnsPlayed <= 4 && ms.consecutiveSixes === 0 && allInYard;
  const rolledValue = isOpeningFirstRoll
    ? 6
    : allInYard && Math.random() < 0.42
    ? 6
    : Math.floor(Math.random() * 6) + 1;

  room.rollSeq += 1;
  room.lastRoll = {
    rollSeq: room.rollSeq,
    color: requestedByColor,
    value: rolledValue,
  };
  room.matchState = {
    ...ms,
    turnPhase: TurnPhase.ROLLING,
    lastActionLog: `${ms.players[requestedByColor].name} rolling the die...`,
  };
  syncMatchPlayerNames(room);
  broadcastRoomState(room);

  room.botTimer = setTimeout(() => {
    const resolution = resolveDiceRoll(room.matchState, rolledValue);
    room.matchState = resolution.nextState;
    room.legalMoves = resolution.legalMoves;
    syncMatchPlayerNames(room);

    const activeColor = room.matchState.currentTurnColor;
    const seat = room.seats[activeColor];

    if (
      room.matchState.turnPhase === TurnPhase.SELECTING_MOVE &&
      room.legalMoves.length > 0
    ) {
      if (seat.seatType === SeatType.BOT) {
        room.turnDeadlineMs = Date.now() + 2000;
        broadcastRoomState(room);
        const bestMove = room.legalMoves[0];
        room.botTimer = setTimeout(() => {
          executeRoomMove(room, activeColor, bestMove);
        }, 450);
      } else if (room.legalMoves.length === 1) {
        room.turnDeadlineMs = Date.now() + TURN_LIMIT_MS;
        broadcastRoomState(room);
        const forcedMove = room.legalMoves[0];
        room.botTimer = setTimeout(() => {
          if (
            room.status === 'playing' &&
            room.matchState.turnPhase === TurnPhase.SELECTING_MOVE &&
            room.matchState.currentTurnColor === activeColor
          ) {
            executeRoomMove(room, activeColor, forcedMove);
          }
        }, 480);
      } else {
        // Human has multiple legal moves: start fresh 15s move selection timer!
        room.turnDeadlineMs = Date.now() + TURN_LIMIT_MS;
        broadcastRoomState(room);
        room.turnTimeoutTimer = setTimeout(() => {
          if (
            room.status === 'playing' &&
            room.matchState.turnPhase === TurnPhase.SELECTING_MOVE &&
            room.matchState.currentTurnColor === activeColor &&
            room.legalMoves.length > 0
          ) {
            executeRoomMove(room, activeColor, room.legalMoves[0]);
          }
        }, TURN_LIMIT_MS);
      }
    } else {
      scheduleBotTurnIfNeeded(room);
      broadcastRoomState(room);
    }
  }, 680);
}

function scheduleBotTurnIfNeeded(room: InternalRoom) {
  if (room.status !== 'playing') {
    room.turnDeadlineMs = 0;
    return;
  }
  if (room.matchState.turnPhase !== TurnPhase.WAITING_FOR_ROLL) return;
  const currentColor = room.matchState.currentTurnColor;
  const seat = room.seats[currentColor];

  clearRoomBotTimer(room);

  if (seat.seatType === SeatType.BOT) {
    room.turnDeadlineMs = Date.now() + 3000;
    room.botTimer = setTimeout(() => {
      triggerRoomDiceRoll(room, currentColor);
    }, 650);
  } else {
    // Human turn: set 15-second turn deadline and auto-roll if time expires!
    room.turnDeadlineMs = Date.now() + TURN_LIMIT_MS;
    room.turnTimeoutTimer = setTimeout(() => {
      if (
        room.status === 'playing' &&
        room.matchState.turnPhase === TurnPhase.WAITING_FOR_ROLL &&
        room.matchState.currentTurnColor === currentColor
      ) {
        triggerRoomDiceRoll(room, currentColor);
      }
    }, TURN_LIMIT_MS);
  }
}

function createRoomInstance(
  hostClientId: string,
  playerName: string,
  preferredRoomCode?: string,
  preferredColor: PlayerColor = PlayerColor.RED
): InternalRoom {
  const cleanCode = preferredRoomCode ? sanitizeRoomCode(preferredRoomCode) : '';
  const roomId =
    cleanCode.length >= 4 && !rooms.has(cleanCode) ? cleanCode : generateRoomCode();

  const seats: Record<PlayerColor, OnlineSeatInfo> = {
    [PlayerColor.RED]: {
      color: PlayerColor.RED,
      seatType: SeatType.HUMAN,
      occupantClientId: null,
      occupantName: DEFAULT_PLAYERS.RED.name,
      connected: false,
    },
    [PlayerColor.GREEN]: {
      color: PlayerColor.GREEN,
      seatType: SeatType.HUMAN,
      occupantClientId: null,
      occupantName: 'Open Online Seat',
      connected: false,
    },
    [PlayerColor.YELLOW]: {
      color: PlayerColor.YELLOW,
      seatType: SeatType.BOT,
      occupantClientId: null,
      occupantName: 'Sovereign Bot',
      connected: false,
    },
    [PlayerColor.BLUE]: {
      color: PlayerColor.BLUE,
      seatType: SeatType.BOT,
      occupantClientId: null,
      occupantName: 'Sapphire Bot',
      connected: false,
    },
  };

  seats[preferredColor] = {
    color: preferredColor,
    seatType: SeatType.HUMAN,
    occupantClientId: hostClientId,
    occupantName: playerName || 'Player 1',
    connected: true,
  };

  const matchState = createInitialMatchState(buildSeatConfigFromRoomSeats(seats));
  const room: InternalRoom = {
    roomId,
    roomName: `${playerName || 'Royal'}'s Ludo Room`,
    hostClientId,
    status: 'lobby',
    seats,
    matchState,
    legalMoves: [],
    turnDeadlineMs: 0,
    rollSeq: 0,
    lastRoll: null,
    moveSeq: 0,
    lastMove: null,
    emoteSeq: 0,
    lastEmote: null,
    connectedCount: 1,
    updatedAt: Date.now(),
    clients: new Map(),
    botTimer: null,
    turnTimeoutTimer: null,
  };

  syncMatchPlayerNames(room);
  rooms.set(roomId, room);
  return room;
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = 3000;

  app.use(express.json({ limit: '1mb' }));

  // List active online rooms
  app.get('/api/rooms', (_req, res) => {
    const activeRooms: OnlineRoomSnapshot[] = [];
    const now = Date.now();
    for (const [id, room] of rooms.entries()) {
      if (now - room.updatedAt > 1000 * 60 * 60) {
        clearRoomBotTimer(room);
        rooms.delete(id);
        continue;
      }
      activeRooms.push(toPublicSnapshot(room));
    }
    res.json({ rooms: activeRooms });
  });

  // High-Thinking Tactical Advisor Endpoint
  app.post('/api/tactical-advice', async (req, res) => {
    const { boardSummary, legalMoves, currentTurnColor, diceValue, userQuestion } = req.body || {};

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(200).json({
        configured: false,
        fallbackReady: true,
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = `You are the Grand Parlor Ludo Tactical Grandmaster. Analyze this 3D Ludo board state with deep multi-turn probabilistic reasoning.
Current Player: ${currentTurnColor}
Rolled Die Value: ${diceValue ?? 'Not rolled yet (pre-roll positional evaluation)'}
Board State Summary:
${JSON.stringify(boardSummary, null, 2)}

Legal Move Candidates:
${JSON.stringify(legalMoves, null, 2)}

Player Query: ${userQuestion || 'What is the highest expected-value move and 2-turn risk assessment?'}`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-argon',
        contents: prompt,
        config: {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
          },
          systemInstruction:
            'You are a master Ludo probability and game-theory analyst. Provide concise, actionable tactical advice grounded in exact tile distances, capture probabilities (1/6 per single die roll, plus 6-bonus chains), safe-star anchoring, and home-stretch race tempo.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              recommendedPawnIndex: {
                type: Type.INTEGER,
                description: '1-based pawn number (1 to 4) recommended to move, or 0 if pre-roll.',
              },
              headline: {
                type: Type.STRING,
                description: 'Short tactical headline summarizing the best play.',
              },
              reasoning: {
                type: Type.STRING,
                description: '2-3 sentence deep probability and positional analysis.',
              },
              winProbabilityEstimate: {
                type: Type.INTEGER,
                description: 'Estimated win equity percentage (0-100) for current player.',
              },
              captureRiskLevel: {
                type: Type.STRING,
                description: 'Low, Moderate, or High exposure risk over the next opponent cycle.',
              },
            },
            required: [
              'recommendedPawnIndex',
              'headline',
              'reasoning',
              'winProbabilityEstimate',
              'captureRiskLevel',
            ],
          },
        },
      });

      const text = response.text || '{}';
      const parsed = JSON.parse(text);
      res.json({
        source: 'gemini-4-argon-high-thinking',
        ...parsed,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Tactical analysis request failed';
      res.status(200).json({
        error: message,
        fallbackReady: true,
      });
    }
  });

  // WebSocket Server for Real-Time Online Ludo Rooms on `/api/ws`
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const url = request.url || '';
    if (url.startsWith('/api/ws')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws) => {
    let boundClientId = '';
    let boundRoomId = '';

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        const type = msg.type as string;
        const clientId = String(msg.clientId || boundClientId || `c_${Date.now()}`);
        const playerName = String(msg.playerName || 'Parlor Player').slice(0, 22);
        boundClientId = clientId;

        if (type === 'room:create') {
          const room = createRoomInstance(
            clientId,
            playerName,
            msg.roomId ? String(msg.roomId) : undefined,
            (msg.preferredColor as PlayerColor) || PlayerColor.RED
          );
          boundRoomId = room.roomId;
          room.clients.set(clientId, { ws, playerName });
          broadcastRoomState(room);
          return;
        }

        if (type === 'room:join') {
          const code = sanitizeRoomCode(String(msg.roomId || ''));
          if (!code) {
            ws.send(JSON.stringify({ type: 'room:error', message: 'Invalid Room ID.' }));
            return;
          }
          let room = rooms.get(code);
          if (!room) {
            // Auto-create the room with that exact Room ID so players sharing a custom code can join immediately!
            room = createRoomInstance(clientId, playerName, code, PlayerColor.RED);
          }

          boundRoomId = room.roomId;
          room.clients.set(clientId, { ws, playerName });

          // Check if client already has a seat in this room (reconnection)
          let assignedSeatColor: PlayerColor | null = null;
          for (const c of PLAYER_ORDER) {
            if (room.seats[c].occupantClientId === clientId) {
              room.seats[c].connected = true;
              room.seats[c].occupantName = playerName;
              assignedSeatColor = c;
              break;
            }
          }

          // Otherwise claim the first open HUMAN seat, or convert a BOT seat if in lobby
          if (!assignedSeatColor) {
            for (const c of PLAYER_ORDER) {
              if (room.seats[c].seatType === SeatType.HUMAN && !room.seats[c].occupantClientId) {
                room.seats[c].occupantClientId = clientId;
                room.seats[c].occupantName = playerName;
                room.seats[c].connected = true;
                assignedSeatColor = c;
                break;
              }
            }
          }
          if (!assignedSeatColor && room.status === 'lobby') {
            for (const c of PLAYER_ORDER) {
              if (room.seats[c].seatType !== SeatType.HUMAN || !room.seats[c].occupantClientId) {
                room.seats[c].seatType = SeatType.HUMAN;
                room.seats[c].occupantClientId = clientId;
                room.seats[c].occupantName = playerName;
                room.seats[c].connected = true;
                assignedSeatColor = c;
                break;
              }
            }
          }

          syncMatchPlayerNames(room);
          broadcastRoomState(room);
          return;
        }

        const room = rooms.get(sanitizeRoomCode(String(msg.roomId || boundRoomId)));
        if (!room) {
          ws.send(JSON.stringify({ type: 'room:error', message: 'Room not found.' }));
          return;
        }

        if (type === 'room:claim_seat' && room.status === 'lobby') {
          const targetColor = msg.color as PlayerColor;
          if (!PLAYER_ORDER.includes(targetColor)) return;
          const targetSeat = room.seats[targetColor];
          if (targetSeat.occupantClientId && targetSeat.occupantClientId !== clientId && targetSeat.connected) {
            return; // Seat already occupied by another live player
          }
          // Release previous seat held by this client
          for (const c of PLAYER_ORDER) {
            if (room.seats[c].occupantClientId === clientId) {
              room.seats[c].occupantClientId = null;
              room.seats[c].occupantName = 'Open Online Seat';
              room.seats[c].connected = false;
            }
          }
          targetSeat.seatType = SeatType.HUMAN;
          targetSeat.occupantClientId = clientId;
          targetSeat.occupantName = playerName;
          targetSeat.connected = true;
          room.matchState = createInitialMatchState(buildSeatConfigFromRoomSeats(room.seats));
          syncMatchPlayerNames(room);
          broadcastRoomState(room);
          return;
        }

        if (type === 'room:configure_seat' && room.status === 'lobby') {
          const targetColor = msg.color as PlayerColor;
          const nextSeatType = msg.seatType as SeatType;
          if (!PLAYER_ORDER.includes(targetColor)) return;
          const updatedSeats = {
            ...room.seats,
            [targetColor]: {
              ...room.seats[targetColor],
              seatType: nextSeatType,
            },
          };
          const activeCount = PLAYER_ORDER.filter(
            (c) => updatedSeats[c].seatType !== SeatType.OFF
          ).length;
          if (activeCount < 2) return;

          if (nextSeatType !== SeatType.HUMAN) {
            updatedSeats[targetColor].occupantClientId = null;
            updatedSeats[targetColor].connected = false;
            updatedSeats[targetColor].occupantName =
              nextSeatType === SeatType.BOT
                ? `${DEFAULT_PLAYERS[targetColor].name.split(' ')[0]} Bot`
                : DEFAULT_PLAYERS[targetColor].name;
          } else if (!updatedSeats[targetColor].occupantClientId) {
            updatedSeats[targetColor].occupantName = 'Open Online Seat';
          }

          room.seats = updatedSeats;
          room.matchState = createInitialMatchState(buildSeatConfigFromRoomSeats(room.seats));
          syncMatchPlayerNames(room);
          broadcastRoomState(room);
          return;
        }

        if (type === 'room:start_match') {
          clearRoomBotTimer(room);
          room.status = 'playing';
          room.matchState = createInitialMatchState(buildSeatConfigFromRoomSeats(room.seats));
          room.legalMoves = [];
          syncMatchPlayerNames(room);
          scheduleBotTurnIfNeeded(room);
          broadcastRoomState(room);
          return;
        }

        if (type === 'room:restart') {
          clearRoomBotTimer(room);
          room.status = 'playing';
          room.matchState = createInitialMatchState(buildSeatConfigFromRoomSeats(room.seats));
          room.legalMoves = [];
          syncMatchPlayerNames(room);
          scheduleBotTurnIfNeeded(room);
          broadcastRoomState(room);
          return;
        }

        if (type === 'room:roll_dice') {
          const currentColor = room.matchState.currentTurnColor;
          const seat = room.seats[currentColor];
          // Allow the occupant of the current turn seat (or host if seat is an unassigned human seat) to roll
          if (
            seat.occupantClientId === clientId ||
            (!seat.occupantClientId && room.hostClientId === clientId)
          ) {
            triggerRoomDiceRoll(room, currentColor);
          }
          return;
        }

        if (type === 'room:select_move') {
          const currentColor = room.matchState.currentTurnColor;
          const seat = room.seats[currentColor];
          const tokenIndex = Number(msg.tokenIndex);
          if (
            room.matchState.turnPhase === TurnPhase.SELECTING_MOVE &&
            (seat.occupantClientId === clientId ||
              (!seat.occupantClientId && room.hostClientId === clientId))
          ) {
            const chosenMove = room.legalMoves.find((m) => m.tokenIndex === tokenIndex);
            if (chosenMove) {
              executeRoomMove(room, currentColor, chosenMove);
            }
          }
          return;
        }

        if (type === 'room:emote') {
          const preset = String(msg.preset || 'airhorn');
          let senderColor = room.matchState.currentTurnColor;
          for (const c of PLAYER_ORDER) {
            if (room.seats[c].occupantClientId === clientId) {
              senderColor = c;
              break;
            }
          }
          room.emoteSeq += 1;
          room.lastEmote = {
            emoteSeq: room.emoteSeq,
            color: senderColor,
            senderName: playerName,
            preset,
          };
          broadcastRoomState(room);
          return;
        }
      } catch {
        // Ignore malformed WS message
      }
    });

    ws.on('close', () => {
      if (!boundRoomId || !boundClientId) return;
      const room = rooms.get(boundRoomId);
      if (!room) return;
      room.clients.delete(boundClientId);
      for (const c of PLAYER_ORDER) {
        if (room.seats[c].occupantClientId === boundClientId) {
          room.seats[c].connected = false;
        }
      }
      broadcastRoomState(room);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Royal Ludo 3D Real-Time Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
