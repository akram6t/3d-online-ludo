import React, { useState } from 'react';
import {
  LudoMatchState,
  MoveOption,
  PLAYER_ORDER,
  PlayerColor,
  SeatType,
  TurnPhase,
  getPlayerProgressPercent,
} from '../game/ludoRules';
import { OnlineRoomSnapshot } from '../game/onlineMultiplayer';
import { WOOD_FINISHES, WoodFinishId } from '../game/proceduralMaterials';
import { ViralSoundPreset } from '../game/soundEffects';
import { CameraPreset } from './LudoBoard3D';

export interface TacticalAdviceResult {
  source: string;
  recommendedPawnIndex: number;
  headline: string;
  reasoning: string;
  winProbabilityEstimate: number;
  captureRiskLevel: string;
}

export interface CelebrationBannerState {
  id: number;
  kind: 'kill' | 'six' | 'crown' | 'win' | 'party';
  color: PlayerColor;
  headline: string;
  subtext: string;
}

interface GameHudAndModalsProps {
  gameState: 'title' | 'playing' | 'paused' | 'gameover';
  matchState: LudoMatchState;
  legalMoves: MoveOption[];
  hoveredTokenIndex: number | null;
  setHoveredTokenIndex: (idx: number | null) => void;
  cameraPreset: CameraPreset;
  setCameraPreset: (preset: CameraPreset) => void;
  woodFinish: WoodFinishId;
  setWoodFinish: (finish: WoodFinishId) => void;
  dockCollapsed: boolean;
  setDockCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  muted: boolean;
  onToggleMute: () => void;
  onStartMatch: () => void;
  onPauseToggle: () => void;
  onRestartMatch: () => void;
  onReturnToTitle: () => void;
  onChangeSeatType: (color: PlayerColor, seatType: SeatType) => void;
  onApplyPresetMode: (mode: '2p-local' | '4p-local' | '1p-bots') => void;
  onRollDice: () => void;
  onSelectMove: (tokenIndex: number) => void;
  tacticalAdvice: TacticalAdviceResult | null;
  tacticalLoading: boolean;
  tacticalOpen: boolean;
  setTacticalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onRequestTacticalAdvice: () => void;
  celebrationBanner: CelebrationBannerState | null;
  onTriggerDanceParty: () => void;
  onTriggerSmashDemo: () => void;
  onPlayViralSound: (preset: ViralSoundPreset) => void;
  // Online Multiplayer Props
  isOnlineMode: boolean;
  clientId: string;
  playerName: string;
  setPlayerName: (name: string) => void;
  onlineRoom: OnlineRoomSnapshot | null;
  availableRooms: OnlineRoomSnapshot[];
  wsConnected: boolean;
  onlineError: string | null;
  onCreateOnlineRoom: (customCode?: string, preferredColor?: PlayerColor) => void;
  onJoinOnlineRoom: (roomCode: string) => void;
  onLeaveOnlineRoom: () => void;
  onClaimOnlineSeat: (color: PlayerColor) => void;
  onRefreshOnlineRooms: () => void;
  // Player Turn Countdown Timer
  turnRemainingSec: number;
  turnMaxSec: number;
}

/**
 * Custom inline SVG Pip Die Icon matched to current diceValue (1..6)
 */
const DieFaceSvg: React.FC<{ value: number | null; rolling: boolean }> = ({ value, rolling }) => {
  const pips: Record<number, [number, number][]> = {
    1: [[12, 12]],
    2: [
      [7, 7],
      [17, 17],
    ],
    3: [
      [6.5, 6.5],
      [12, 12],
      [17.5, 17.5],
    ],
    4: [
      [7, 7],
      [17, 7],
      [7, 17],
      [17, 17],
    ],
    5: [
      [6.5, 6.5],
      [17.5, 6.5],
      [12, 12],
      [6.5, 17.5],
      [17.5, 17.5],
    ],
    6: [
      [7, 6],
      [17, 6],
      [7, 12],
      [17, 12],
      [7, 18],
      [17, 18],
    ],
  };

  const activePips = value && pips[value] ? pips[value] : pips[6];

  return (
    <svg
      viewBox="0 0 24 24"
      className={`w-7 h-7 shrink-0 transition-transform duration-150 ${
        rolling ? 'rotate-45 scale-110' : ''
      }`}
      aria-hidden="true"
    >
      <rect
        x="1.5"
        y="1.5"
        width="21"
        height="21"
        rx="4"
        fill="#f7efe2"
        stroke="#d4af37"
        strokeWidth="1.8"
      />
      {activePips.map(([cx, cy], idx) => (
        <circle
          key={idx}
          cx={cx}
          cy={cy}
          r={value === 1 ? 2.6 : 1.9}
          fill={value === 1 || value === 6 ? '#b91c1c' : '#1c1917'}
        />
      ))}
    </svg>
  );
};

/**
 * Circular SVG Radial Countdown Ring + Tabular-Nums Seconds Badge for Active Player Turn
 */
const TurnTimerRingSvg: React.FC<{ remainingSec: number; maxSec: number }> = ({
  remainingSec,
  maxSec,
}) => {
  const clamped = Math.max(0, Math.min(maxSec, remainingSec));
  const ratio = maxSec > 0 ? clamped / maxSec : 0;
  const radius = 11.5;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);
  const wholeSec = Math.ceil(clamped);

  const strokeColor =
    wholeSec <= 4 ? '#f87171' : wholeSec <= 8 ? '#fbbf24' : '#86efac';

  return (
    <div
      className="relative w-8 h-8 flex items-center justify-center shrink-0 font-mono tabular-nums"
      title={`Turn Timer: ${wholeSec}s remaining`}
      aria-label={`Turn Timer ${wholeSec} seconds`}
    >
      <svg viewBox="0 0 28 28" className="w-8 h-8 -rotate-90" aria-hidden="true">
        <circle
          cx="14"
          cy="14"
          r={radius}
          fill="rgba(18, 12, 9, 0.85)"
          stroke="rgba(212, 175, 55, 0.22)"
          strokeWidth="2.4"
        />
        <circle
          cx="14"
          cy="14"
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span
        className="absolute text-[10px] font-bold tracking-tighter"
        style={{ color: strokeColor }}
      >
        {wholeSec}s
      </span>
    </div>
  );
};

export const GameHudAndModals: React.FC<GameHudAndModalsProps> = ({
  gameState,
  matchState,
  legalMoves,
  hoveredTokenIndex,
  setHoveredTokenIndex,
  cameraPreset,
  setCameraPreset,
  woodFinish,
  setWoodFinish,
  dockCollapsed,
  setDockCollapsed,
  muted,
  onToggleMute,
  onStartMatch,
  onPauseToggle,
  onRestartMatch,
  onReturnToTitle,
  onChangeSeatType,
  onApplyPresetMode,
  onRollDice,
  onSelectMove,
  tacticalAdvice,
  tacticalLoading,
  tacticalOpen,
  setTacticalOpen,
  onRequestTacticalAdvice,
  celebrationBanner,
  onTriggerDanceParty,
  onTriggerSmashDemo,
  onPlayViralSound,
  isOnlineMode,
  clientId,
  playerName,
  setPlayerName,
  onlineRoom,
  availableRooms,
  wsConnected,
  onlineError,
  onCreateOnlineRoom,
  onJoinOnlineRoom,
  onLeaveOnlineRoom,
  onClaimOnlineSeat,
  onRefreshOnlineRooms,
  turnRemainingSec,
  turnMaxSec,
}) => {
  const [lobbyTab, setLobbyTab] = useState<'local' | 'online'>(
    onlineRoom ? 'online' : 'online'
  );
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [copiedRoomCode, setCopiedRoomCode] = useState<boolean>(false);
  const [fxDrawerOpen, setFxDrawerOpen] = useState<boolean>(false);

  const currentPlayer = matchState.players[matchState.currentTurnColor];
  const totalCaptures =
    matchState.capturesByColor.RED +
    matchState.capturesByColor.GREEN +
    matchState.capturesByColor.YELLOW +
    matchState.capturesByColor.BLUE;

  // Determine if this client can control the current turn
  let canControlCurrentTurn = currentPlayer.seatType === SeatType.HUMAN;
  let myOnlineSeatColor: PlayerColor | null = null;
  if (isOnlineMode && onlineRoom) {
    for (const c of PLAYER_ORDER) {
      if (onlineRoom.seats[c].occupantClientId === clientId) {
        myOnlineSeatColor = c;
        break;
      }
    }
    const turnSeat = onlineRoom.seats[matchState.currentTurnColor];
    canControlCurrentTurn =
      turnSeat.seatType === SeatType.HUMAN &&
      (turnSeat.occupantClientId === clientId ||
        (!turnSeat.occupantClientId && onlineRoom.hostClientId === clientId));
  }

  const handleCopyRoomInvite = () => {
    if (!onlineRoom) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${onlineRoom.roomId}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
    setCopiedRoomCode(true);
    window.setTimeout(() => setCopiedRoomCode(false), 2000);
  };

  return (
    <div className="fixed inset-0 pointer-events-none z-10 flex flex-col justify-between">
      {/* ===================================================================
          1. TITLE & ONLINE MULTIPLAYER ROOM LOBBY OVERLAY
         =================================================================== */}
      {gameState === 'title' && (
        <div
          className="fixed inset-0 flex flex-col justify-between p-4 sm:p-6 md:p-8 pointer-events-none overflow-y-auto"
          style={{
            background:
              'linear-gradient(90deg, rgba(16,11,8,0.95) 0%, rgba(16,11,8,0.85) 42%, rgba(16,11,8,0.18) 76%, rgba(16,11,8,0.05) 100%)',
          }}
        >
          <div className="pointer-events-auto max-w-md w-full my-auto space-y-4 bg-[#19110d]/95 border border-[#d4af37]/35 rounded-xl p-4 sm:p-5 shadow-2xl">
            {/* Custom Inline SVG Title Lockup */}
            <div className="flex items-center gap-3">
              <svg
                viewBox="0 0 64 64"
                className="w-11 h-11 shrink-0"
                aria-label="Royal Ludo Crest Emblem"
              >
                <polygon
                  points="32,4 58,18 58,46 32,60 6,46 6,18"
                  fill="#2a1810"
                  stroke="#d4af37"
                  strokeWidth="2.5"
                />
                <polygon points="32,32 14,16 32,10 50,16" fill="#16a34a" opacity="0.9" />
                <polygon points="32,32 50,16 56,32 50,48" fill="#d97706" opacity="0.9" />
                <polygon points="32,32 50,48 32,54 14,48" fill="#2563eb" opacity="0.9" />
                <polygon points="32,32 14,48 8,32 14,16" fill="#dc2626" opacity="0.9" />
                <circle cx="32" cy="32" r="10" fill="#19110d" stroke="#fef08a" strokeWidth="2" />
                <path d="M27 35L29 27L32 30.5L35 27L37 35Z" fill="#d4af37" />
              </svg>
              <div>
                <h1
                  className="font-display text-xl sm:text-2xl font-bold tracking-wider text-[#fef08a]"
                  style={{ textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}
                >
                  ROYAL LUDO 3D
                </h1>
                <p className="text-[11px] tracking-widest uppercase text-[#d4af37]/90 font-semibold">
                  Online Network Rooms &amp; Local Parlor
                </p>
              </div>
            </div>

            {/* Mode Switcher Tabs: Online Network Multiplayer vs Local Table */}
            <div className="grid grid-cols-2 gap-1.5 bg-[#120c09] p-1 rounded-lg border border-[#d4af37]/25">
              <button
                type="button"
                onClick={() => setLobbyTab('online')}
                className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  lobbyTab === 'online'
                    ? 'bg-[#d4af37] text-[#19110d]'
                    : 'text-[#c8b99e] hover:text-white'
                }`}
              >
                <span>Online Room (ID)</span>
              </button>
              <button
                type="button"
                onClick={() => setLobbyTab('local')}
                className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  lobbyTab === 'local'
                    ? 'bg-[#d4af37] text-[#19110d]'
                    : 'text-[#c8b99e] hover:text-white'
                }`}
              >
                <span>Local Pass &amp; Play</span>
              </button>
            </div>

            {/* ===============================================================
                TAB A: ONLINE NETWORK ROOM MULTIPLAYER (Create / Join by Room ID)
               =============================================================== */}
            {lobbyTab === 'online' && (
              <div className="space-y-3.5">
                {/* Player Display Name */}
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="online-player-name"
                    className="text-xs text-[#c8b99e] shrink-0 font-medium"
                  >
                    Your Name:
                  </label>
                  <input
                    id="online-player-name"
                    type="text"
                    maxLength={18}
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Enter player name"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#120c09] border border-[#d4af37]/30 text-xs text-[#fffdf7] focus:outline-none focus:border-[#fef08a]"
                  />
                </div>

                {onlineError && (
                  <div className="px-3 py-1.5 rounded-lg bg-[#3b1815] border border-[#ef4444]/50 text-xs text-[#fca5a5]">
                    {onlineError}
                  </div>
                )}

                {!onlineRoom ? (
                  <>
                    {/* Create or Join by Room ID */}
                    <div className="p-3 rounded-lg bg-[#231711] border border-[#d4af37]/25 space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#fef08a]">
                          Join or Create by Room ID
                        </span>
                        <span className="font-mono text-[11px] text-[#86efac]">
                          {wsConnected ? 'Server Online' : 'Connecting...'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          maxLength={8}
                          value={joinCodeInput}
                          onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                          placeholder="ROOM ID (e.g. LUDO88)"
                          aria-label="Room ID Code"
                          className="flex-1 px-3 py-2 rounded-lg bg-[#120c09] border border-[#d4af37]/35 text-xs font-mono uppercase tracking-wider text-[#fef08a] placeholder:text-[#c8b99e]/50 focus:outline-none focus:border-[#fef08a]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (joinCodeInput.trim().length >= 3) {
                              onJoinOnlineRoom(joinCodeInput.trim());
                            } else {
                              onCreateOnlineRoom();
                            }
                          }}
                          className="px-3.5 py-2 rounded-lg bg-[#2a1c15] hover:bg-[#3b271d] border border-[#d4af37]/40 text-xs font-semibold text-[#fef08a] transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {joinCodeInput.trim().length >= 3 ? 'Join Room' : 'Random Room'}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          onCreateOnlineRoom(
                            joinCodeInput.trim().length >= 4 ? joinCodeInput.trim() : undefined,
                            PlayerColor.RED
                          )
                        }
                        className="w-full py-2.5 px-4 rounded-lg bg-[#d4af37] hover:bg-[#e5c158] text-[#19110d] font-display font-bold text-xs tracking-wider uppercase shadow-md transition-all cursor-pointer"
                      >
                        Create New Online Room
                      </button>
                    </div>

                    {/* Active Rooms List on Server */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-[#c8b99e]">
                        <span>Active Network Rooms ({availableRooms.length})</span>
                        <button
                          type="button"
                          onClick={onRefreshOnlineRooms}
                          className="text-[#fef08a] hover:underline cursor-pointer font-mono"
                        >
                          Refresh
                        </button>
                      </div>
                      {availableRooms.length === 0 ? (
                        <div className="p-2.5 rounded-lg bg-[#140d0a] border border-[#d4af37]/15 text-[11px] text-[#c8b99e] text-center">
                          No public rooms waiting. Click &ldquo;Create New Online Room&rdquo; or play Instant Local Match below!
                        </div>
                      ) : (
                        <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
                          {availableRooms.map((rm) => (
                            <div
                              key={rm.roomId}
                              className="px-3 py-2 rounded-lg bg-[#140d0a] border border-[#d4af37]/25 flex items-center justify-between gap-2"
                            >
                              <div>
                                <div className="text-xs font-mono font-bold text-[#fef08a]">
                                  ROOM #{rm.roomId}
                                </div>
                                <div className="text-[10px] text-[#c8b99e]">
                                  {rm.roomName} · {rm.connectedCount} Connected · {rm.status.toUpperCase()}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => onJoinOnlineRoom(rm.roomId)}
                                className="px-2.5 py-1 rounded bg-[#d4af37] text-[#19110d] text-xs font-bold cursor-pointer"
                              >
                                Join
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Quick Local Fallback Button so 1-Click Start always works */}
                    <button
                      type="button"
                      data-start="true"
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onStartMatch();
                      }}
                      className="w-full py-2.5 px-4 rounded-lg bg-[#2a1c15] hover:bg-[#38261d] border border-[#d4af37]/35 text-[#fef08a] font-display font-bold text-xs tracking-wider uppercase transition-all cursor-pointer"
                    >
                      Quick Start Solo vs Bots
                    </button>
                  </>
                ) : (
                  /* INSIDE ONLINE ROOM LOBBY */
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-[#140d0a] border border-[#fef08a]/50 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-[#c8b99e]">
                          ONLINE ROOM CODE (SHARE WITH FRIENDS)
                        </div>
                        <div className="font-mono text-xl font-bold tracking-widest text-[#fef08a]">
                          {onlineRoom.roomId}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleCopyRoomInvite}
                          className="px-2.5 py-1.5 rounded-lg bg-[#2a1c15] hover:bg-[#38261d] border border-[#d4af37]/40 text-xs font-semibold text-[#fef08a] cursor-pointer"
                        >
                          {copiedRoomCode ? 'Copied Link!' : 'Copy Invite'}
                        </button>
                        <button
                          type="button"
                          onClick={onLeaveOnlineRoom}
                          className="px-2 py-1.5 rounded-lg bg-[#3b1815] hover:bg-[#52211d] text-xs font-semibold text-[#fca5a5] cursor-pointer"
                        >
                          Leave
                        </button>
                      </div>
                    </div>

                    {/* 4 Online Room Seats */}
                    <div className="grid grid-cols-2 gap-2">
                      {PLAYER_ORDER.map((color) => {
                        const seat = onlineRoom.seats[color];
                        const cfg = matchState.players[color];
                        const isMine = seat.occupantClientId === clientId;
                        return (
                          <div
                            key={color}
                            className={`p-2 rounded-lg border flex flex-col gap-1.5 ${
                              isMine
                                ? 'bg-[#2c1d15] border-[#fef08a]'
                                : 'bg-[#231711] border-[#d4af37]/20'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                                  style={{ backgroundColor: cfg.hex }}
                                />
                                <span className="text-xs font-semibold text-[#fffdf7] truncate">
                                  {seat.occupantName}
                                </span>
                              </div>
                              {isMine && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#d4af37] text-[#19110d] font-bold">
                                  YOU
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1">
                              {!isMine && (!seat.occupantClientId || !seat.connected) && (
                                <button
                                  type="button"
                                  onClick={() => onClaimOnlineSeat(color)}
                                  className="flex-1 py-1 rounded bg-[#2a1c15] hover:bg-[#38261d] border border-[#d4af37]/30 text-[10px] font-semibold text-[#fef08a] cursor-pointer"
                                >
                                  Take Seat
                                </button>
                              )}
                              {[SeatType.HUMAN, SeatType.BOT, SeatType.OFF].map((st) => (
                                <button
                                  key={st}
                                  type="button"
                                  onClick={() => onChangeSeatType(color, st)}
                                  className={`px-1.5 py-1 text-[10px] font-semibold rounded transition-colors cursor-pointer ${
                                    seat.seatType === st
                                      ? 'bg-[#d4af37] text-[#19110d]'
                                      : 'bg-[#160e0a] text-[#c8b99e] hover:text-white'
                                  }`}
                                >
                                  {st === SeatType.HUMAN
                                    ? 'Online'
                                    : st === SeatType.BOT
                                    ? 'Bot'
                                    : 'Off'}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      data-start="true"
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onStartMatch();
                      }}
                      className="w-full py-3 px-6 rounded-lg bg-[#d4af37] hover:bg-[#e5c158] text-[#19110d] font-display font-bold text-sm tracking-wider uppercase shadow-lg transition-all cursor-pointer"
                    >
                      Launch Online Room Match
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ===============================================================
                TAB B: LOCAL PASS & PLAY / AI BOTS TABLE SETUP
               =============================================================== */}
            {lobbyTab === 'local' && (
              <div className="space-y-3.5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-[#e6dcc8]/80">
                    <span>Quick Table Setup</span>
                    <span>{matchState.activeColors.length} Houses Active</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onApplyPresetMode('1p-bots')}
                      className="px-2 py-1.5 text-xs font-semibold rounded-lg bg-[#2a1c15] hover:bg-[#38261d] text-[#f7efe2] border border-[#d4af37]/30 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      1P vs 3 Bots
                    </button>
                    <button
                      type="button"
                      onClick={() => onApplyPresetMode('2p-local')}
                      className="px-2 py-1.5 text-xs font-semibold rounded-lg bg-[#2a1c15] hover:bg-[#38261d] text-[#f7efe2] border border-[#d4af37]/30 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      2P Pass &amp; Play
                    </button>
                    <button
                      type="button"
                      onClick={() => onApplyPresetMode('4p-local')}
                      className="px-2 py-1.5 text-xs font-semibold rounded-lg bg-[#2a1c15] hover:bg-[#38261d] text-[#f7efe2] border border-[#d4af37]/30 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      4P Pass &amp; Play
                    </button>
                  </div>
                </div>

                {/* 4 Houses Seat Selector */}
                <div className="grid grid-cols-2 gap-2">
                  {PLAYER_ORDER.map((color) => {
                    const cfg = matchState.players[color];
                    return (
                      <div
                        key={color}
                        className="p-2 rounded-lg bg-[#231711] border border-[#d4af37]/20 flex flex-col gap-1.5"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: cfg.hex }}
                          />
                          <span className="text-xs font-semibold text-[#f7efe2] truncate">
                            {cfg.name}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {[SeatType.HUMAN, SeatType.BOT, SeatType.OFF].map((st) => {
                            const active = cfg.seatType === st;
                            return (
                              <button
                                key={st}
                                type="button"
                                aria-label={`${cfg.name} ${st}`}
                                onClick={() => onChangeSeatType(color, st)}
                                className={`py-1 text-[10px] font-semibold rounded transition-colors cursor-pointer ${
                                  active
                                    ? 'bg-[#d4af37] text-[#19110d]'
                                    : 'bg-[#160e0a] text-[#c8b99e] hover:text-white'
                                }`}
                              >
                                {st === SeatType.HUMAN
                                  ? 'Human'
                                  : st === SeatType.BOT
                                  ? 'Bot'
                                  : 'Off'}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Cabinet Wood Finish Selector */}
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.keys(WOOD_FINISHES) as WoodFinishId[]).map((fid) => {
                    const spec = WOOD_FINISHES[fid];
                    const isSelected = woodFinish === fid;
                    return (
                      <button
                        key={fid}
                        type="button"
                        onClick={() => setWoodFinish(fid)}
                        className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
                          isSelected
                            ? 'bg-[#38261d] border-[#fef08a] text-[#fef08a]'
                            : 'bg-[#211510] border-[#d4af37]/20 text-[#d6c7b2] hover:text-white'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/30"
                          style={{ backgroundColor: spec.baseHex }}
                        />
                        <span>{spec.label.split(' ')[1]}</span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  data-start="true"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onStartMatch();
                  }}
                  className="w-full py-3 px-6 rounded-lg bg-[#d4af37] hover:bg-[#e5c158] text-[#19110d] font-display font-bold text-sm tracking-wider uppercase shadow-lg transition-all cursor-pointer"
                >
                  Start Local Parlor Match
                </button>
              </div>
            )}
          </div>

          {/* Flat Single-Line Control Hint at Bottom Margin */}
          <div className="text-[11px] text-[#e6dcc8]/80 tracking-wide font-mono">
            Space Roll Die · 1–4 Move Goti · H Hide/Compact HUD · K Preview Smash &amp; Victim Sad Reaction
          </div>
        </div>
      )}

      {/* ===================================================================
          2. COMPACT, HIDEABLE, MOBILE-FRIENDLY IN-GAME HUD
         =================================================================== */}
      {gameState !== 'title' && (
        <>
          {/* Ultra-Slim Top Perimeter Bar (Never blocks the 3D Ludo Board) */}
          <div className="w-full flex items-start justify-between gap-2 p-2 sm:p-3 pointer-events-none">
            {/* Top-Left Compact Turn & Score Pill with Player Turn Timer */}
            {!dockCollapsed ? (
              <div className="pointer-events-auto relative overflow-hidden bg-[#19110d]/92 border border-[#d4af37]/35 rounded-xl px-2.5 py-1.5 shadow-lg flex flex-wrap items-center gap-2 max-w-[74vw] sm:max-w-xl">
                {/* Active Player Badge + Radial Turn Countdown Timer */}
                <div className="flex items-center gap-2 pr-2 border-r border-[#d4af37]/20">
                  <TurnTimerRingSvg remainingSec={turnRemainingSec} maxSec={turnMaxSec} />
                  <span
                    className="w-2 h-5 rounded-sm shrink-0"
                    style={{ backgroundColor: currentPlayer.hex }}
                  />
                  <div>
                    <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-[#d4af37] tabular-nums">
                      <span>T{matchState.turnsPlayed}</span>
                      <span>·</span>
                      <span
                        className={
                          Math.ceil(turnRemainingSec) <= 4
                            ? 'text-[#f87171] font-bold'
                            : 'text-[#86efac]'
                        }
                      >
                        {Math.ceil(turnRemainingSec)}S LEFT
                      </span>
                      {isOnlineMode && onlineRoom && (
                        <>
                          <span>·</span>
                          <button
                            type="button"
                            onClick={handleCopyRoomInvite}
                            title="Click to copy Online Room Invite Link"
                            className="text-[#fef08a] font-bold hover:underline cursor-pointer"
                          >
                            {copiedRoomCode ? 'COPIED!' : `#${onlineRoom.roomId}`}
                          </button>
                        </>
                      )}
                    </div>
                    <div className="font-display font-bold text-xs sm:text-sm text-[#fffdf7] truncate max-w-[115px] sm:max-w-[155px]">
                      {currentPlayer.name}
                    </div>
                  </div>
                </div>

                {/* Compact 4-House Mini Status Badges */}
                <div className="flex items-center gap-1 flex-wrap">
                  {matchState.activeColors.map((color) => {
                    const cfg = matchState.players[color];
                    const pTokens = matchState.tokens[color];
                    const isTurn = matchState.currentTurnColor === color;
                    const homeCount = pTokens.filter((t) => t.step === 56).length;
                    const kills = matchState.capturesByColor[color];
                    const pct = getPlayerProgressPercent(matchState.tokens, color);
                    return (
                      <div
                        key={color}
                        className={`px-1.5 py-0.5 rounded border text-[10px] font-mono tabular-nums flex items-center gap-1 ${
                          isTurn
                            ? 'bg-[#2c1d15] border-[#fef08a] text-[#fffdf7]'
                            : 'bg-[#140d0a]/80 border-[#d4af37]/15 text-[#c8b99e]'
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: cfg.hex }}
                        />
                        <span className="hidden md:inline font-sans font-semibold text-[#f7efe2]">
                          {cfg.name.split(' ')[0]}
                        </span>
                        <span>{homeCount}/4</span>
                        {kills > 0 && <span className="text-[#fca5a5]">·{kills}K</span>}
                        <span className="hidden sm:inline opacity-75">({pct}%)</span>
                      </div>
                    );
                  })}
                </div>

                {/* Bottom Linear Turn Countdown Drain Bar */}
                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#120c09]">
                  <div
                    className="h-full transition-all duration-100"
                    style={{
                      width: `${Math.max(0, Math.min(100, (turnRemainingSec / Math.max(1, turnMaxSec)) * 100))}%`,
                      backgroundColor:
                        Math.ceil(turnRemainingSec) <= 4
                          ? '#f87171'
                          : Math.ceil(turnRemainingSec) <= 8
                          ? '#fbbf24'
                          : currentPlayer.hex,
                    }}
                  />
                </div>
              </div>
            ) : (
              /* Super-Minimized Top-Left Badge when HUD is hidden */
              <div className="pointer-events-auto bg-[#19110d]/90 border border-[#d4af37]/35 rounded-lg px-2.5 py-1 flex items-center gap-2 text-xs">
                <TurnTimerRingSvg remainingSec={turnRemainingSec} maxSec={turnMaxSec} />
                <span className="font-display font-bold text-[#fef08a] text-xs">
                  {currentPlayer.name}
                </span>
                {isOnlineMode && onlineRoom && (
                  <span className="font-mono text-[10px] text-[#86efac]">
                    #{onlineRoom.roomId}
                  </span>
                )}
              </div>
            )}

            {/* Top-Center: Compact Celebration / Victim Reaction Callout Pill */}
            {celebrationBanner && !dockCollapsed && (
              <div
                key={celebrationBanner.id}
                role="status"
                aria-live="polite"
                className="pointer-events-auto hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[#19110d]/95 border border-[#fef08a] shadow-xl"
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: matchState.players[celebrationBanner.color].hex }}
                />
                <div className="text-xs">
                  <span className="font-display font-bold uppercase text-[#fef08a] mr-2">
                    {celebrationBanner.headline}
                  </span>
                  <span className="text-[11px] text-[#e6dcc8] font-mono">
                    {celebrationBanner.subtext}
                  </span>
                </div>
              </div>
            )}

            {/* Top-Right Compact Utility Icons (32x32px) */}
            <div className="pointer-events-auto flex items-center gap-1.5">
              <button
                type="button"
                tabIndex={-1}
                aria-label={dockCollapsed ? 'Show Controls [H]' : 'Compact / Hide Controls [H]'}
                title={dockCollapsed ? 'Show Controls [H]' : 'Compact / Hide Controls [H]'}
                onClick={(e) => {
                  e.currentTarget.blur();
                  setDockCollapsed((prev) => !prev);
                }}
                className="h-8 px-2.5 rounded-lg bg-[#19110d]/92 hover:bg-[#2a1c15] border border-[#d4af37]/35 flex items-center justify-center text-[11px] font-mono text-[#fef08a] shadow-md transition-colors cursor-pointer whitespace-nowrap"
              >
                {dockCollapsed ? 'Show [H]' : 'Hide [H]'}
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label={muted ? 'Unmute Audio [M]' : 'Mute Audio [M]'}
                title={muted ? 'Unmute Audio [M]' : 'Mute Audio [M]'}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleMute();
                }}
                className="w-8 h-8 rounded-lg bg-[#19110d]/92 hover:bg-[#2a1c15] border border-[#d4af37]/35 flex items-center justify-center text-[#fef08a] shadow-md transition-colors cursor-pointer"
              >
                {muted ? (
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                )}
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Restart Match [R]"
                title="Restart Match [R]"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onRestartMatch();
                }}
                className="w-8 h-8 rounded-lg bg-[#19110d]/92 hover:bg-[#2a1c15] border border-[#d4af37]/35 flex items-center justify-center text-[#fef08a] shadow-md transition-colors cursor-pointer"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Pause Match [P]"
                title="Pause Match [P]"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onPauseToggle();
                }}
                className="w-8 h-8 rounded-lg bg-[#19110d]/92 hover:bg-[#2a1c15] border border-[#d4af37]/35 flex items-center justify-center text-[#fef08a] shadow-md transition-colors cursor-pointer"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              </button>
            </div>
          </div>

          {/* ===================================================================
              3. ULTRA-COMPACT HIDEABLE BOTTOM CONTROL PILL
             =================================================================== */}
          <div className="w-full flex flex-col items-center px-2 pb-2 sm:pb-3 pointer-events-none">
            <div className="w-full max-w-[820px] flex flex-col items-center pointer-events-auto">
              {/* Optional Popover Drawers (Tactical Advisor or Viral FX Drawer) */}
              {!dockCollapsed && tacticalOpen && (
                <div className="w-full max-w-xl mb-1.5 bg-[#19110d]/96 border border-[#d4af37]/45 rounded-xl p-3 shadow-2xl text-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display font-bold text-xs text-[#fef08a]">
                      Grandmaster Tactical Advisor
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={onRequestTacticalAdvice}
                        disabled={tacticalLoading}
                        className="px-2 py-0.5 rounded bg-[#2c1d15] border border-[#d4af37]/30 text-[11px] text-[#fef08a] cursor-pointer"
                      >
                        {tacticalLoading ? '...' : 'Refresh'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTacticalOpen(false)}
                        className="px-2 py-0.5 rounded bg-[#231711] text-[11px] text-[#c8b99e] cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                  {tacticalLoading ? (
                    <div className="text-[11px] text-[#e6dcc8] font-mono">
                      Evaluating dice probabilities &amp; safe-star tempo...
                    </div>
                  ) : tacticalAdvice ? (
                    <div className="space-y-1">
                      <div className="font-semibold text-xs text-[#fffdf7]">
                        {tacticalAdvice.headline} · Win Equity {tacticalAdvice.winProbabilityEstimate}% · Risk: {tacticalAdvice.captureRiskLevel}
                      </div>
                      <p className="text-[11px] text-[#d6c7b2] leading-snug">
                        {tacticalAdvice.reasoning}
                      </p>
                    </div>
                  ) : null}
                </div>
              )}

              {!dockCollapsed && fxDrawerOpen && (
                <div className=" mb-1.5 bg-[#19110d]/96 border border-[#d4af37]/40 rounded-xl px-3 py-2 shadow-2xl flex flex-wrap items-center justify-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => onTriggerSmashDemo()}
                    className="px-2.5 py-1 rounded bg-[#3b1815] hover:bg-[#52211d] text-[#fca5a5] border border-[#ef4444]/40 font-semibold cursor-pointer"
                  >
                    Smash + Victim Sad [K]
                  </button>
                  <button
                    type="button"
                    onClick={() => onTriggerDanceParty()}
                    className="px-2.5 py-1 rounded bg-[#2a1c15] hover:bg-[#3b271d] text-[#fef08a] border border-[#d4af37]/30 font-semibold cursor-pointer"
                  >
                    Winner Dance [D]
                  </button>
                  <button
                    type="button"
                    onClick={() => onPlayViralSound('airhorn')}
                    className="px-2 py-1 rounded bg-[#140d0a] text-[#e6dcc8] hover:text-[#fef08a] font-mono text-[11px] cursor-pointer"
                  >
                    Airhorn
                  </button>
                  <button
                    type="button"
                    onClick={() => onPlayViralSound('bonk')}
                    className="px-2 py-1 rounded bg-[#140d0a] text-[#e6dcc8] hover:text-[#fef08a] font-mono text-[11px] cursor-pointer"
                  >
                    Bonk
                  </button>
                  <button
                    type="button"
                    onClick={() => onPlayViralSound('sad_trombone')}
                    className="px-2 py-1 rounded bg-[#140d0a] text-[#e6dcc8] hover:text-[#fef08a] font-mono text-[11px] cursor-pointer"
                  >
                    Wah-Wah
                  </button>
                </div>
              )}

              {/* Minimized vs Compact Expanded Bottom Pill */}
              {dockCollapsed ? (
                <div className="bg-[#19110d]/95 border border-[#d4af37]/40 rounded-full px-3 py-1 shadow-xl flex items-center gap-2">
                  <DieFaceSvg
                    value={matchState.diceValue}
                    rolling={matchState.turnPhase === TurnPhase.ROLLING}
                  />
                  {canControlCurrentTurn && matchState.turnPhase === TurnPhase.WAITING_FOR_ROLL && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onRollDice();
                      }}
                      className="px-3 py-1 rounded-full bg-[#d4af37] text-[#19110d] font-display font-bold text-xs uppercase cursor-pointer"
                    >
                      Roll
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDockCollapsed(false)}
                    className="text-[11px] font-mono text-[#fef08a] px-2 py-0.5 cursor-pointer"
                  >
                    Expand [H]
                  </button>
                </div>
              ) : (
                <div className="bg-[#19110d]/95 border border-[#d4af37]/40 rounded-xl px-2.5 py-1.5 shadow-2xl flex flex-wrap items-center justify-center gap-2">
                  {/* Die Face + Readout */}
                  <div className="flex items-center gap-1.5 pr-2 border-r border-[#d4af37]/20">
                    <DieFaceSvg
                      value={matchState.diceValue}
                      rolling={matchState.turnPhase === TurnPhase.ROLLING}
                    />
                    <div className="font-mono tabular-nums leading-tight">
                      <div className="text-[9px] uppercase text-[#c8b99e]">DIE</div>
                      <div className="text-xs font-bold text-[#fef08a]">
                        {matchState.turnPhase === TurnPhase.ROLLING
                          ? 'ROLL...'
                          : matchState.diceValue
                          ? `=${matchState.diceValue}`
                          : 'READY'}
                      </div>
                    </div>
                  </div>

                  {/* Primary Turn Action: Roll or Goti Selection */}
                  {canControlCurrentTurn && matchState.turnPhase === TurnPhase.WAITING_FOR_ROLL && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onRollDice();
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-[#d4af37] hover:bg-[#e5c158] active:scale-[0.98] text-[#19110d] font-display font-bold text-xs tracking-wide uppercase shadow-md transition-all cursor-pointer whitespace-nowrap"
                    >
                      Roll Die [Space]
                    </button>
                  )}

                  {canControlCurrentTurn &&
                    matchState.turnPhase === TurnPhase.SELECTING_MOVE &&
                    legalMoves.map((move) => {
                      const isHovered = hoveredTokenIndex === move.tokenIndex;
                      return (
                        <button
                          key={move.tokenId}
                          type="button"
                          onMouseEnter={() => setHoveredTokenIndex(move.tokenIndex)}
                          onMouseLeave={() => setHoveredTokenIndex(null)}
                          onClick={(e) => {
                            e.currentTarget.blur();
                            setHoveredTokenIndex(null);
                            onSelectMove(move.tokenIndex);
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                            isHovered
                              ? 'bg-[#d4af37] text-[#19110d] border-[#fef08a]'
                              : 'bg-[#2a1c15] hover:bg-[#38261d] text-[#fffdf7] border-[#d4af37]/40'
                          }`}
                        >
                          <span className="font-mono font-bold">#{move.tokenIndex + 1}</span>
                          <span className="font-mono text-[10px] opacity-90">
                            {move.exitsYard
                              ? 'Out'
                              : move.reachesHome
                              ? 'Crown!'
                              : move.capturesTokenIds.length > 0
                              ? 'SMASH!'
                              : `+${matchState.diceValue}`}
                          </span>
                        </button>
                      );
                    })}

                  {!canControlCurrentTurn && (
                    <div className="px-2.5 py-1 rounded-lg bg-[#231711] border border-[#d4af37]/20 text-[11px] text-[#e6dcc8] font-mono">
                      {currentPlayer.name} Turn...
                    </div>
                  )}

                  {/* Compact Camera Cycle Button */}
                  <div
                    className="flex items-center bg-[#120c09] p-0.5 rounded-lg border border-[#d4af37]/25"
                    role="group"
                    aria-label="Camera View Presets"
                  >
                    {(['isometric', 'overhead', 'pov'] as CameraPreset[]).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={(e) => {
                          e.currentTarget.blur();
                          setCameraPreset(preset);
                        }}
                        className={`px-2 py-1 rounded text-[11px] font-medium capitalize transition-colors cursor-pointer whitespace-nowrap ${
                          cameraPreset === preset
                            ? 'bg-[#d4af37] text-[#19110d] font-semibold'
                            : 'text-[#c8b99e] hover:text-white'
                        }`}
                      >
                        {preset === 'isometric' ? '3D' : preset === 'overhead' ? 'Top' : 'POV'}
                      </button>
                    ))}
                  </div>

                  {/* Compact FX & Soundboard Drawer Toggle + Direct Smash [K] */}
                  <button
                    type="button"
                    title="Preview Goti Smash & Victim Upset Reaction [K]"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onTriggerSmashDemo();
                    }}
                    className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-[#3b1815] hover:bg-[#52211d] text-[#fca5a5] border border-[#ef4444]/40 cursor-pointer whitespace-nowrap"
                  >
                    Smash [K]
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      setFxDrawerOpen((prev) => !prev);
                    }}
                    className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                      fxDrawerOpen
                        ? 'bg-[#d4af37] text-[#19110d] border-[#fef08a]'
                        : 'bg-[#261a13] hover:bg-[#36241b] text-[#fef08a] border-[#d4af37]/35'
                    }`}
                  >
                    FX
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      if (!tacticalOpen) {
                        setTacticalOpen(true);
                        onRequestTacticalAdvice();
                      } else {
                        setTacticalOpen(false);
                      }
                    }}
                    className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                      tacticalOpen
                        ? 'bg-[#d4af37] text-[#19110d] border-[#fef08a]'
                        : 'bg-[#261a13] hover:bg-[#36241b] text-[#fef08a] border-[#d4af37]/35'
                    }`}
                  >
                    AI
                  </button>

                  {/* 1-Tap Minimize Control Pill Button */}
                  <button
                    type="button"
                    title="Minimize Controls [H]"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      setDockCollapsed(true);
                    }}
                    className="px-1.5 py-1 rounded-lg bg-[#120c09] hover:bg-[#281b14] border border-[#d4af37]/25 text-[10px] font-mono text-[#c8b99e] cursor-pointer"
                  >
                    Hide
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ===================================================================
          4. PAUSE & VICTORY / GAME OVER MODAL CARDS
         =================================================================== */}
      {(gameState === 'paused' || gameState === 'gameover') && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 pointer-events-auto"
          style={{ backgroundColor: 'rgba(12, 8, 6, 0.82)' }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-status-heading"
            className="w-full max-w-md bg-[#19110d] border border-[#d4af37]/45 rounded-xl p-6 shadow-2xl space-y-5"
          >
            <div className="space-y-1 text-center">
              <div className="text-xs uppercase tracking-widest text-[#d4af37] font-semibold">
                {gameState === 'gameover'
                  ? 'Royal Parlor Victory Proclamation'
                  : 'Match Suspended'}
              </div>
              <h2
                id="modal-status-heading"
                className="font-display text-2xl font-bold text-[#fef08a]"
              >
                {gameState === 'gameover'
                  ? `${
                      matchState.players[
                        matchState.finishOrder[0] || matchState.currentTurnColor
                      ].name
                    } Triumphs!`
                  : 'Game Paused'}
              </h2>
              <p className="text-xs text-[#c8b99e]">{matchState.lastActionLog}</p>
              {isOnlineMode && onlineRoom && (
                <p className="text-[11px] font-mono text-[#86efac]">
                  Online Room #{onlineRoom.roomId} ({myOnlineSeatColor || 'Spectator'})
                </p>
              )}
            </div>

            {/* 3 Tabular-Nums Stat Tiles */}
            <div className="grid grid-cols-3 gap-2.5 font-mono tabular-nums">
              <div className="bg-[#120c09] border border-[#d4af37]/20 rounded-lg p-3 text-center">
                <div className="text-[10px] uppercase text-[#c8b99e]">TURNS</div>
                <div className="text-lg font-bold text-[#fffdf7]">{matchState.turnsPlayed}</div>
              </div>
              <div className="bg-[#120c09] border border-[#d4af37]/20 rounded-lg p-3 text-center">
                <div className="text-[10px] uppercase text-[#c8b99e]">GOTIS SMASHED</div>
                <div className="text-lg font-bold text-[#fca5a5]">{totalCaptures}</div>
              </div>
              <div className="bg-[#120c09] border border-[#d4af37]/20 rounded-lg p-3 text-center">
                <div className="text-[10px] uppercase text-[#c8b99e]">CROWNED</div>
                <div className="text-lg font-bold text-[#fef08a]">
                  {
                    matchState.tokens[
                      matchState.finishOrder[0] || matchState.currentTurnColor
                    ].filter((t) => t.step === 56).length
                  }
                  /4
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col gap-2.5">
              {gameState === 'paused' ? (
                <>
                  <button
                    type="button"
                    onClick={onPauseToggle}
                    className="w-full py-3 rounded-lg bg-[#d4af37] hover:bg-[#e5c158] text-[#19110d] font-display font-bold text-sm uppercase tracking-wider cursor-pointer"
                  >
                    Resume Match [Esc]
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={onRestartMatch}
                      className="py-2.5 rounded-lg bg-[#2a1c15] hover:bg-[#38261d] border border-[#d4af37]/30 text-xs font-semibold text-[#f7efe2] cursor-pointer"
                    >
                      Restart Match
                    </button>
                    <button
                      type="button"
                      onClick={onReturnToTitle}
                      className="py-2.5 rounded-lg bg-[#2a1c15] hover:bg-[#38261d] border border-[#d4af37]/30 text-xs font-semibold text-[#f7efe2] cursor-pointer"
                    >
                      Title / Lobby
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    data-start="true"
                    onClick={onRestartMatch}
                    className="w-full py-3 rounded-lg bg-[#d4af37] hover:bg-[#e5c158] text-[#19110d] font-display font-bold text-sm uppercase tracking-wider cursor-pointer"
                  >
                    Play Again
                  </button>
                  <button
                    type="button"
                    onClick={onReturnToTitle}
                    className="w-full py-2.5 rounded-lg bg-[#2a1c15] hover:bg-[#38261d] border border-[#d4af37]/30 text-xs font-semibold text-[#f7efe2] cursor-pointer"
                  >
                    Return to Lobby
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
