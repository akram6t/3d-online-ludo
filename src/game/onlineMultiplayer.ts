import { LudoMatchState, MoveOption, PlayerColor, SeatType } from './ludoRules';

export const TURN_TIME_LIMIT_SECONDS = 15;

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

export function getOrCreateClientId(): string {
  if (typeof window === 'undefined') return 'server_client';
  try {
    const existing = window.sessionStorage.getItem('royal_ludo_client_id');
    if (existing) return existing;
    const generated = `plr_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
    window.sessionStorage.setItem('royal_ludo_client_id', generated);
    return generated;
  } catch {
    return `plr_${Math.random().toString(36).slice(2, 9)}`;
  }
}

export function getWebSocketUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/ws`;
}

export async function fetchActiveOnlineRooms(): Promise<OnlineRoomSnapshot[]> {
  try {
    const res = await fetch('/api/rooms');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.rooms) ? data.rooms : [];
  } catch {
    return [];
  }
}
