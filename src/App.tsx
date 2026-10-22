import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LudoMatchState,
  MoveOption,
  PLAYER_ORDER,
  PlayerColor,
  SeatType,
  TurnPhase,
  applyMove,
  countOpponentThreatsBehind,
  createInitialMatchState,
  getGlobalTrackIndex,
  getPlayerProgressPercent,
  getTokenGridCoord,
  resolveDiceRoll,
} from './game/ludoRules';
import {
  OnlineRoomSnapshot,
  TURN_TIME_LIMIT_SECONDS,
  fetchActiveOnlineRooms,
  getOrCreateClientId,
  getWebSocketUrl,
} from './game/onlineMultiplayer';
import { WoodFinishId } from './game/proceduralMaterials';
import { ViralSoundPreset, soundEngine } from './game/soundEffects';
import { CameraPreset, CelebrationTrigger, LudoBoard3D } from './components/LudoBoard3D';
import {
  CelebrationBannerState,
  GameHudAndModals,
  TacticalAdviceResult,
} from './components/GameHudAndModals';

function buildDeterministicTacticalAdvice(
  matchState: LudoMatchState,
  legalMoves: MoveOption[]
): TacticalAdviceResult {
  const color = matchState.currentTurnColor;
  const player = matchState.players[color];
  const myPct = getPlayerProgressPercent(matchState.tokens, color);

  let totalThreats = 0;
  for (const t of matchState.tokens[color]) {
    const idx = getGlobalTrackIndex(color, t.step);
    if (idx !== null) {
      totalThreats += countOpponentThreatsBehind(matchState, color, idx);
    }
  }
  const captureRiskLevel =
    totalThreats >= 2 ? 'High' : totalThreats === 1 ? 'Moderate' : 'Low';

  const winProbabilityEstimate = Math.min(
    94,
    Math.max(18, Math.round(25 + myPct * 0.65 - totalThreats * 6))
  );

  if (legalMoves.length > 0) {
    const best = legalMoves[0];
    return {
      source: 'grandmaster-expectiminimax',
      recommendedPawnIndex: best.tokenIndex + 1,
      headline: `Advance Goti #${best.tokenIndex + 1} (${best.tacticalReason.split(' · ')[0]})`,
      reasoning: `${best.tacticalReason}. Moving Goti #${
        best.tokenIndex + 1
      } from step ${best.fromStep === -1 ? 'Yard' : best.fromStep} to ${
        best.toStep
      } maximizes expected board equity (score +${best.tacticalScore}) while keeping exposure ${captureRiskLevel.toLowerCase()}.`,
      winProbabilityEstimate,
      captureRiskLevel,
    };
  }

  return {
    source: 'grandmaster-expectiminimax',
    recommendedPawnIndex: 0,
    headline: `${player.name} Pre-Roll Position Assessment`,
    reasoning: `Roll a 6 (16.7% single-die probability) to deploy yard gotis or chain a bonus roll. Prioritize anchoring active gotis on the 8 Star Safe tiles (indices 0, 8, 13, 21, 26, 34, 39, 47) before entering enemy quadrant corridors.`,
    winProbabilityEstimate,
    captureRiskLevel,
  };
}

export default function App() {
  const [clientId] = useState<string>(() => getOrCreateClientId());
  const [playerName, setPlayerName] = useState<string>('Royal Player');

  const [gameState, setGameState] = useState<'title' | 'playing' | 'paused' | 'gameover'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        return 'playing';
      }
    }
    return 'title';
  });

  const [isOnlineMode, setIsOnlineMode] = useState<boolean>(false);
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoomSnapshot | null>(null);
  const [availableRooms, setAvailableRooms] = useState<OnlineRoomSnapshot[]>([]);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);

  const [seatConfig, setSeatConfig] = useState<Record<PlayerColor, SeatType>>({
    [PlayerColor.RED]: SeatType.HUMAN,
    [PlayerColor.GREEN]: SeatType.BOT,
    [PlayerColor.YELLOW]: SeatType.BOT,
    [PlayerColor.BLUE]: SeatType.BOT,
  });

  const [matchState, setMatchState] = useState<LudoMatchState>(() =>
    createInitialMatchState({
      [PlayerColor.RED]: SeatType.HUMAN,
      [PlayerColor.GREEN]: SeatType.BOT,
      [PlayerColor.YELLOW]: SeatType.BOT,
      [PlayerColor.BLUE]: SeatType.BOT,
    })
  );

  const [legalMoves, setLegalMoves] = useState<MoveOption[]>([]);
  const [hoveredTokenIndex, setHoveredTokenIndex] = useState<number | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('isometric');
  const [woodFinish, setWoodFinish] = useState<WoodFinishId>('mahogany');
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);

  const [diceRollTrigger, setDiceRollTrigger] = useState<{
    rollId: number;
    value: number;
    onSettled: () => void;
  } | null>(null);

  const [activeAnimationMove, setActiveAnimationMove] = useState<{
    color: PlayerColor;
    move: MoveOption;
    onComplete: () => void;
  } | null>(null);

  const [celebrationTrigger, setCelebrationTrigger] = useState<CelebrationTrigger | null>(null);
  const [celebrationBanner, setCelebrationBanner] = useState<CelebrationBannerState | null>(null);

  const [tacticalOpen, setTacticalOpen] = useState<boolean>(false);
  const [tacticalLoading, setTacticalLoading] = useState<boolean>(false);
  const [tacticalAdvice, setTacticalAdvice] = useState<TacticalAdviceResult | null>(null);
  const [turnRemainingSec, setTurnRemainingSec] = useState<number>(TURN_TIME_LIMIT_SECONDS);
  const lastTickSoundSecRef = useRef<number>(99);

  const wsRef = useRef<WebSocket | null>(null);
  const rollIdCounterRef = useRef<number>(1);
  const celebrationIdRef = useRef<number>(1);
  const bannerTimerRef = useRef<number | null>(null);

  // Track last processed online sequence numbers for idempotency
  const lastProcessedOnlineRollSeqRef = useRef<number>(0);
  const lastProcessedOnlineMoveSeqRef = useRef<number>(0);
  const lastProcessedOnlineEmoteSeqRef = useRef<number>(0);

  const stateRef = useRef({
    gameState,
    isOnlineMode,
    onlineRoom,
    playerName,
    matchState,
    legalMoves,
    activeAnimationMove,
  });
  stateRef.current = {
    gameState,
    isOnlineMode,
    onlineRoom,
    playerName,
    matchState,
    legalMoves,
    activeAnimationMove,
  };

  // Mirror game state to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = gameState;
  }, [gameState]);

  const showCelebrationBanner = useCallback(
    (
      kind: 'kill' | 'six' | 'crown' | 'win' | 'party',
      color: PlayerColor,
      headline: string,
      subtext: string,
      durationMs = 3600
    ) => {
      const nextId = celebrationIdRef.current++;
      setCelebrationBanner({
        id: nextId,
        kind,
        color,
        headline,
        subtext,
      });
      if (bannerTimerRef.current) {
        window.clearTimeout(bannerTimerRef.current);
      }
      bannerTimerRef.current = window.setTimeout(() => {
        setCelebrationBanner((curr) => (curr && curr.id === nextId ? null : curr));
      }, durationMs);
    },
    []
  );

  // Refresh active online rooms list
  const handleRefreshOnlineRooms = useCallback(async () => {
    const list = await fetchActiveOnlineRooms();
    setAvailableRooms(list);
  }, []);

  useEffect(() => {
    handleRefreshOnlineRooms();
  }, [handleRefreshOnlineRooms]);

  // Establish Real-Time WebSocket Connection to `/api/ws`
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let isDisposed = false;
    let reconnectTimer: number | null = null;

    function connectWs() {
      if (isDisposed) return;
      try {
        const ws = new WebSocket(getWebSocketUrl());
        wsRef.current = ws;

        ws.onopen = () => {
          if (isDisposed) return;
          setWsConnected(true);
          setOnlineError(null);

          // Auto-rejoin room if already in one or if URL has ?room=CODE
          const urlRoom = new URLSearchParams(window.location.search).get('room');
          const activeRoomId = stateRef.current.onlineRoom?.roomId || urlRoom;
          if (activeRoomId) {
            ws.send(
              JSON.stringify({
                type: 'room:join',
                roomId: activeRoomId,
                clientId,
                playerName: stateRef.current.playerName,
              })
            );
          }
        };

        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(String(event.data));
            if (payload.type === 'room:error') {
              setOnlineError(String(payload.message || 'Room error'));
              return;
            }
            if (payload.type === 'room:state' && payload.room) {
              const room: OnlineRoomSnapshot = payload.room;
              setOnlineRoom(room);
              setIsOnlineMode(true);
              setOnlineError(null);

              // Synchronize URL ?room=CODE without reload
              const url = new URL(window.location.href);
              if (url.searchParams.get('room') !== room.roomId) {
                url.searchParams.set('room', room.roomId);
                window.history.replaceState({}, '', url.toString());
              }

              // Sync game screen state
              if (room.status === 'playing' && stateRef.current.gameState === 'title') {
                setGameState('playing');
              } else if (room.status === 'gameover') {
                setGameState('gameover');
              }

              // Idempotent handling of remote Dice Roll animation
              if (
                room.lastRoll &&
                room.lastRoll.rollSeq > lastProcessedOnlineRollSeqRef.current
              ) {
                lastProcessedOnlineRollSeqRef.current = room.lastRoll.rollSeq;
                const rolledVal = room.lastRoll.value;
                const rollerColor = room.lastRoll.color;
                setDiceRollTrigger({
                  rollId: rollIdCounterRef.current++,
                  value: rolledVal,
                  onSettled: () => {
                    if (rolledVal === 6) {
                      setCelebrationTrigger({
                        id: celebrationIdRef.current++,
                        kind: 'six',
                        color: rollerColor,
                      });
                      showCelebrationBanner(
                        'six',
                        rollerColor,
                        `ROLLED A 6!`,
                        `${room.matchState.players[rollerColor].name} Mascot Dances!`
                      );
                    }
                  },
                });
              }

              // Idempotent handling of remote Pawn Move + Capture Smash + Dancer Reaction
              if (
                room.lastMove &&
                room.lastMove.moveSeq > lastProcessedOnlineMoveSeqRef.current
              ) {
                lastProcessedOnlineMoveSeqRef.current = room.lastMove.moveSeq;
                const mv = room.lastMove.move;
                const moverColor = room.lastMove.color;
                setActiveAnimationMove({
                  color: moverColor,
                  move: mv,
                  onComplete: () => {
                    setActiveAnimationMove(null);
                  },
                });
              } else if (!stateRef.current.activeAnimationMove) {
                setMatchState(room.matchState);
                setLegalMoves(room.legalMoves);
              }

              // Idempotent handling of remote Viral Emotes
              if (
                room.lastEmote &&
                room.lastEmote.emoteSeq > lastProcessedOnlineEmoteSeqRef.current
              ) {
                lastProcessedOnlineEmoteSeqRef.current = room.lastEmote.emoteSeq;
                const preset = room.lastEmote.preset as ViralSoundPreset;
                soundEngine.playPreset(preset);
                showCelebrationBanner(
                  'party',
                  room.lastEmote.color,
                  `${room.lastEmote.senderName}: ${preset.toUpperCase()}!`,
                  `Live Network Emote in Room #${room.roomId}`,
                  2500
                );
              }
            }
          } catch {
            // Ignore malformed message
          }
        };

        ws.onclose = () => {
          if (isDisposed) return;
          setWsConnected(false);
          reconnectTimer = window.setTimeout(connectWs, 1800);
        };
      } catch {
        reconnectTimer = window.setTimeout(connectWs, 2500);
      }
    }

    connectWs();

    return () => {
      isDisposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [clientId, showCelebrationBanner]);

  const sendWsMessage = useCallback(
    (msg: Record<string, unknown>) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            clientId,
            playerName: stateRef.current.playerName,
            roomId: stateRef.current.onlineRoom?.roomId,
            ...msg,
          })
        );
      }
    },
    [clientId]
  );

  const handleCreateOnlineRoom = useCallback(
    (customCode?: string, preferredColor: PlayerColor = PlayerColor.RED) => {
      sendWsMessage({
        type: 'room:create',
        roomId: customCode,
        preferredColor,
      });
      setTimeout(handleRefreshOnlineRooms, 300);
    },
    [sendWsMessage, handleRefreshOnlineRooms]
  );

  const handleJoinOnlineRoom = useCallback(
    (roomCode: string) => {
      sendWsMessage({
        type: 'room:join',
        roomId: roomCode,
      });
    },
    [sendWsMessage]
  );

  const handleLeaveOnlineRoom = useCallback(() => {
    setIsOnlineMode(false);
    setOnlineRoom(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
    handleRefreshOnlineRooms();
  }, [handleRefreshOnlineRooms]);

  const handleClaimOnlineSeat = useCallback(
    (color: PlayerColor) => {
      sendWsMessage({
        type: 'room:claim_seat',
        color,
      });
    },
    [sendWsMessage]
  );

  const handleTriggerDanceParty = useCallback(() => {
    const ms = stateRef.current.matchState;
    const color = ms.currentTurnColor;
    const nextId = celebrationIdRef.current++;
    soundEngine.playDanceGroove();
    setCelebrationTrigger({
      id: nextId,
      kind: 'party',
      color,
    });
    showCelebrationBanner(
      'party',
      color,
      `${ms.players[color].name} VICTORY DANCE!`,
      `${ms.players[color].name} Mascot hits the viral celebration groove!`
    );
  }, [showCelebrationBanner]);

  const handleTriggerSmashDemo = useCallback(() => {
    const ms = stateRef.current.matchState;
    const killerColor = ms.currentTurnColor;
    // Choose another active house as the victim whose mascot reacts Not Happy / Upset!
    const victimColor =
      ms.activeColors.find((c) => c !== killerColor) || PlayerColor.GREEN;
    const nextId = celebrationIdRef.current++;
    const activeToken =
      ms.tokens[killerColor].find((t) => t.step >= 0 && t.step < 56) ||
      ms.tokens[killerColor][0];
    const targetCoord = getTokenGridCoord(
      killerColor,
      activeToken.step >= 0 ? activeToken.step : 0,
      activeToken.tokenIndex
    );
    soundEngine.playCaptureHit();
    window.setTimeout(() => {
      soundEngine.playSadTrombone();
    }, 420);
    setCelebrationTrigger({
      id: nextId,
      kind: 'kill',
      color: killerColor,
      victimColor,
      targetCoord,
    });
    showCelebrationBanner(
      'kill',
      killerColor,
      `${ms.players[killerColor].name} KILLED ${ms.players[victimColor].name}'S GOTI!`,
      `${ms.players[killerColor].name} Dances · ${ms.players[victimColor].name} Mascot is Upset!`
    );
  }, [showCelebrationBanner]);

  const handlePlayViralSound = useCallback(
    (preset: ViralSoundPreset) => {
      if (stateRef.current.isOnlineMode && stateRef.current.onlineRoom) {
        sendWsMessage({ type: 'room:emote', preset });
        return;
      }
      soundEngine.playPreset(preset);
      const ms = stateRef.current.matchState;
      const color = ms.currentTurnColor;
      const victimColor = ms.activeColors.find((c) => c !== color) || PlayerColor.GREEN;
      const nextId = celebrationIdRef.current++;
      setCelebrationTrigger({
        id: nextId,
        kind: preset === 'bonk' ? 'kill' : 'party',
        color,
        victimColor: preset === 'bonk' || preset === 'sad_trombone' ? victimColor : undefined,
      });
      const labels: Record<ViralSoundPreset, [string, string]> = {
        airhorn: ['MLG TRIPLE AIRHORN!', '3D Speaker Towers & Mascot Hyped Up!'],
        bonk: ['CARTOON COCONUT BONK!', 'Goti Knockback + Victim Mascot Upset!'],
        sad_trombone: ['WAH-WAH-WAH-WAAAH!', 'Sad Brass Trombone Taunt Activated!'],
        dance_groove: ['FUNK SYNTH PARTY BEAT!', 'Active Mascot Dancer Grooving!'],
        six_hype: ['MAXIMUM SIX HYPE!', 'Bonus Roll Chime + Confetti Burst!'],
      };
      const [headline, subtext] = labels[preset];
      showCelebrationBanner('party', color, headline, subtext, 2800);
    },
    [sendWsMessage, showCelebrationBanner]
  );

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundEngine.muted = next;
      return next;
    });
  }, []);

  const handleStartMatch = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (stateRef.current.isOnlineMode && stateRef.current.onlineRoom) {
      sendWsMessage({ type: 'room:start_match' });
      setGameState('playing');
      document.body.dataset.state = 'playing';
      return;
    }
    const fresh = createInitialMatchState(seatConfig);
    setMatchState(fresh);
    setLegalMoves([]);
    setActiveAnimationMove(null);
    setDiceRollTrigger(null);
    setCelebrationBanner(null);
    setGameState('playing');
    document.body.dataset.state = 'playing';
  }, [seatConfig, sendWsMessage]);

  const handleRestartMatch = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (stateRef.current.isOnlineMode && stateRef.current.onlineRoom) {
      sendWsMessage({ type: 'room:restart' });
      setGameState('playing');
      document.body.dataset.state = 'playing';
      return;
    }
    const fresh = createInitialMatchState(seatConfig);
    setMatchState(fresh);
    setLegalMoves([]);
    setActiveAnimationMove(null);
    setDiceRollTrigger(null);
    setCelebrationBanner(null);
    setGameState('playing');
    document.body.dataset.state = 'playing';
  }, [seatConfig, sendWsMessage]);

  const handleReturnToTitle = useCallback(() => {
    setActiveAnimationMove(null);
    setDiceRollTrigger(null);
    setCelebrationBanner(null);
    setGameState('title');
    document.body.dataset.state = 'title';
  }, []);

  const handlePauseToggle = useCallback(() => {
    setGameState((prev) => {
      if (prev === 'playing') return 'paused';
      if (prev === 'paused') return 'playing';
      return prev;
    });
  }, []);

  const handleChangeSeatType = useCallback(
    (color: PlayerColor, st: SeatType) => {
      if (stateRef.current.isOnlineMode && stateRef.current.onlineRoom) {
        sendWsMessage({
          type: 'room:configure_seat',
          color,
          seatType: st,
        });
        return;
      }
      setSeatConfig((prev) => {
        const updated = { ...prev, [color]: st };
        const activeCount = PLAYER_ORDER.filter((c) => updated[c] !== SeatType.OFF).length;
        if (activeCount < 2) return prev;
        setMatchState(createInitialMatchState(updated));
        return updated;
      });
    },
    [sendWsMessage]
  );

  const handleApplyPresetMode = useCallback((mode: '2p-local' | '4p-local' | '1p-bots') => {
    setIsOnlineMode(false);
    setOnlineRoom(null);
    let nextSeats: Record<PlayerColor, SeatType>;
    if (mode === '2p-local') {
      nextSeats = {
        [PlayerColor.RED]: SeatType.HUMAN,
        [PlayerColor.GREEN]: SeatType.OFF,
        [PlayerColor.YELLOW]: SeatType.HUMAN,
        [PlayerColor.BLUE]: SeatType.OFF,
      };
    } else if (mode === '4p-local') {
      nextSeats = {
        [PlayerColor.RED]: SeatType.HUMAN,
        [PlayerColor.GREEN]: SeatType.HUMAN,
        [PlayerColor.YELLOW]: SeatType.HUMAN,
        [PlayerColor.BLUE]: SeatType.HUMAN,
      };
    } else {
      nextSeats = {
        [PlayerColor.RED]: SeatType.HUMAN,
        [PlayerColor.GREEN]: SeatType.BOT,
        [PlayerColor.YELLOW]: SeatType.BOT,
        [PlayerColor.BLUE]: SeatType.BOT,
      };
    }
    setSeatConfig(nextSeats);
    setMatchState(createInitialMatchState(nextSeats));
  }, []);

  // Execute a selected MoveOption locally with 3D tile-by-tile hopping animation
  const executeMoveOption = useCallback(
    (currentMs: LudoMatchState, move: MoveOption) => {
      setLegalMoves([]);
      setHoveredTokenIndex(null);
      const animatingState: LudoMatchState = {
        ...currentMs,
        turnPhase: TurnPhase.ANIMATING_MOVE,
        lastActionLog: `${currentMs.players[currentMs.currentTurnColor].name} moving Goti #${
          move.tokenIndex + 1
        }...`,
      };
      setMatchState(animatingState);

      setActiveAnimationMove({
        color: currentMs.currentTurnColor,
        move,
        onComplete: () => {
          setActiveAnimationMove(null);
          const postMoveState = applyMove(currentMs, move);
          setMatchState(postMoveState);
          if (postMoveState.turnPhase === TurnPhase.GAME_OVER) {
            soundEngine.playCrownFanfare();
            const winColor = postMoveState.finishOrder[0] || currentMs.currentTurnColor;
            setCelebrationTrigger({
              id: celebrationIdRef.current++,
              kind: 'win',
              color: winColor,
            });
            showCelebrationBanner(
              'win',
              winColor,
              `${postMoveState.players[winColor].name} WINS THE CROWN!`,
              'All 4 Gotis Home · 3D Mascot Victory Dance!',
              6000
            );
            setGameState('gameover');
          }
        },
      });
    },
    [showCelebrationBanner]
  );

  // Trigger a 3D Dice Roll (Online Server-Authoritative or Local)
  const triggerRollDice = useCallback(() => {
    const {
      gameState: gs,
      isOnlineMode: online,
      onlineRoom: room,
      matchState: ms,
      activeAnimationMove: anim,
    } = stateRef.current;
    if (gs !== 'playing' || ms.turnPhase !== TurnPhase.WAITING_FOR_ROLL || anim) return;

    if (online && room) {
      sendWsMessage({ type: 'room:roll_dice' });
      return;
    }

    const allInYard = ms.tokens[ms.currentTurnColor].every((t) => t.step === -1);
    const isOpeningFirstRoll =
      ms.turnsPlayed === 1 && ms.consecutiveSixes === 0 && allInYard;
    const rolledValue = isOpeningFirstRoll
      ? 6
      : allInYard && Math.random() < 0.42
      ? 6
      : Math.floor(Math.random() * 6) + 1;

    const nextRollId = rollIdCounterRef.current++;

    setMatchState((prev) => ({
      ...prev,
      turnPhase: TurnPhase.ROLLING,
      lastActionLog: `${prev.players[prev.currentTurnColor].name} rolling the die...`,
    }));

    setDiceRollTrigger({
      rollId: nextRollId,
      value: rolledValue,
      onSettled: () => {
        const latestMs = stateRef.current.matchState;
        const resolution = resolveDiceRoll(latestMs, rolledValue);
        setMatchState(resolution.nextState);
        setLegalMoves(resolution.legalMoves);

        if (rolledValue === 6) {
          setCelebrationTrigger({
            id: celebrationIdRef.current++,
            kind: 'six',
            color: latestMs.currentTurnColor,
          });
          showCelebrationBanner(
            'six',
            latestMs.currentTurnColor,
            `ROLLED A SIX! BONUS TURN!`,
            `${latestMs.players[latestMs.currentTurnColor].name} Mascot Dances!`,
            2600
          );
        }

        const seat = resolution.nextState.players[resolution.nextState.currentTurnColor].seatType;
        if (
          resolution.nextState.turnPhase === TurnPhase.SELECTING_MOVE &&
          resolution.legalMoves.length > 0
        ) {
          if (seat === SeatType.BOT) {
            const bestMove = resolution.legalMoves[0];
            window.setTimeout(() => {
              if (stateRef.current.gameState === 'playing') {
                executeMoveOption(resolution.nextState, bestMove);
              }
            }, 380);
          } else if (resolution.legalMoves.length === 1) {
            const forcedMove = resolution.legalMoves[0];
            window.setTimeout(() => {
              if (
                stateRef.current.gameState === 'playing' &&
                stateRef.current.matchState.turnPhase === TurnPhase.SELECTING_MOVE
              ) {
                executeMoveOption(resolution.nextState, forcedMove);
              }
            }, 420);
          }
        }
      },
    });
  }, [executeMoveOption, sendWsMessage, showCelebrationBanner]);

  const handleSelectMoveByTokenIndex = useCallback(
    (tokenIndex: number) => {
      const {
        gameState: gs,
        isOnlineMode: online,
        onlineRoom: room,
        matchState: ms,
        legalMoves: moves,
      } = stateRef.current;
      if (gs !== 'playing' || ms.turnPhase !== TurnPhase.SELECTING_MOVE) return;

      if (online && room) {
        sendWsMessage({ type: 'room:select_move', tokenIndex });
        return;
      }

      const move = moves.find((m) => m.tokenIndex === tokenIndex);
      if (!move) return;
      executeMoveOption(ms, move);
    },
    [executeMoveOption, sendWsMessage]
  );

  // Automatic Local AI Bot Roll Scheduler (only in Local Mode; Online Mode bots run on Server)
  useEffect(() => {
    if (isOnlineMode) return;
    if (gameState !== 'playing') return;
    if (matchState.turnPhase !== TurnPhase.WAITING_FOR_ROLL) return;
    const currentSeat = matchState.players[matchState.currentTurnColor].seatType;
    if (currentSeat !== SeatType.BOT) return;

    const timer = window.setTimeout(() => {
      triggerRollDice();
    }, 620);

    return () => window.clearTimeout(timer);
  }, [
    isOnlineMode,
    gameState,
    matchState.currentTurnColor,
    matchState.turnPhase,
    matchState.players,
    triggerRollDice,
  ]);

  // High-Thinking Tactical Advisor Request (`gemini-4-argon` + `ThinkingLevel.HIGH` with fallback)
  const handleRequestTacticalAdvice = useCallback(async () => {
    const { matchState: ms, legalMoves: moves } = stateRef.current;
    setTacticalLoading(true);
    const fallback = buildDeterministicTacticalAdvice(ms, moves);

    try {
      const boardSummary = PLAYER_ORDER.map((c) => ({
        color: c,
        seat: ms.players[c].seatType,
        tokens: ms.tokens[c].map((t) => ({
          pawn: t.tokenIndex + 1,
          step: t.step,
          globalTrackIndex: getGlobalTrackIndex(c, t.step),
        })),
      }));

      const res = await fetch('/api/tactical-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardSummary,
          legalMoves: moves.map((m) => ({
            pawn: m.tokenIndex + 1,
            fromStep: m.fromStep,
            toStep: m.toStep,
            tacticalScore: m.tacticalScore,
            tacticalReason: m.tacticalReason,
          })),
          currentTurnColor: ms.currentTurnColor,
          diceValue: ms.diceValue,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.headline) {
          setTacticalAdvice(data);
          setTacticalLoading(false);
          return;
        }
      }
    } catch {
      // Fall back to deterministic Grandmaster Expectiminimax advisor
    }

    setTacticalAdvice(fallback);
    setTacticalLoading(false);
  }, []);

  useEffect(() => {
    if (tacticalOpen && gameState === 'playing') {
      setTacticalAdvice(buildDeterministicTacticalAdvice(matchState, legalMoves));
    }
  }, [tacticalOpen, gameState, matchState, legalMoves]);

  // Reset local turn timer whenever active turn player or phase transitions to a decision phase
  useEffect(() => {
    if (gameState !== 'playing') return;
    lastTickSoundSecRef.current = 99;
    if (!isOnlineMode) {
      setTurnRemainingSec(TURN_TIME_LIMIT_SECONDS);
    }
  }, [
    gameState,
    isOnlineMode,
    matchState.currentTurnColor,
    matchState.turnPhase,
    matchState.turnsPlayed,
    matchState.consecutiveSixes,
  ]);

  // Live 100ms Player Turn Countdown Timer (Online Server-Synced & Local Auto-Play)
  useEffect(() => {
    if (gameState !== 'playing') return;

    const interval = window.setInterval(() => {
      const {
        gameState: gs,
        isOnlineMode: online,
        onlineRoom: room,
        matchState: ms,
        legalMoves: moves,
        activeAnimationMove: anim,
      } = stateRef.current;

      if (gs !== 'playing') return;
      if (
        ms.turnPhase !== TurnPhase.WAITING_FOR_ROLL &&
        ms.turnPhase !== TurnPhase.SELECTING_MOVE
      ) {
        return;
      }
      if (anim) return;

      if (online && room && room.turnDeadlineMs > 0) {
        const rem = Math.max(0, (room.turnDeadlineMs - Date.now()) / 1000);
        setTurnRemainingSec(rem);
        const whole = Math.ceil(rem);
        if (whole >= 1 && whole <= 4 && whole !== lastTickSoundSecRef.current) {
          lastTickSoundSecRef.current = whole;
          soundEngine.playTimerTick(whole);
        }
        return;
      }

      // Local Mode countdown
      setTurnRemainingSec((prev) => {
        const next = Math.max(0, prev - 0.1);
        const whole = Math.ceil(next);
        if (whole >= 1 && whole <= 4 && whole !== lastTickSoundSecRef.current) {
          lastTickSoundSecRef.current = whole;
          soundEngine.playTimerTick(whole);
        }
        if (next <= 0 && prev > 0) {
          // Time expired in Local Mode: auto-roll or auto-move!
          window.setTimeout(() => {
            const cur = stateRef.current;
            if (cur.gameState !== 'playing' || cur.isOnlineMode) return;
            if (cur.matchState.turnPhase === TurnPhase.WAITING_FOR_ROLL) {
              showCelebrationBanner(
                'party',
                cur.matchState.currentTurnColor,
                'TURN TIMER EXPIRED!',
                `Auto-rolling die for ${cur.matchState.players[cur.matchState.currentTurnColor].name}...`,
                2200
              );
              triggerRollDice();
            } else if (
              cur.matchState.turnPhase === TurnPhase.SELECTING_MOVE &&
              cur.legalMoves.length > 0
            ) {
              showCelebrationBanner(
                'party',
                cur.matchState.currentTurnColor,
                'TURN TIMER EXPIRED!',
                `Auto-advancing Goti #${cur.legalMoves[0].tokenIndex + 1} for ${
                  cur.matchState.players[cur.matchState.currentTurnColor].name
                }...`,
                2200
              );
              executeMoveOption(cur.matchState, cur.legalMoves[0]);
            }
          }, 20);
          return TURN_TIME_LIMIT_SECONDS;
        }
        return next;
      });
    }, 100);

    return () => window.clearInterval(interval);
  }, [gameState, executeMoveOption, showCelebrationBanner, triggerRollDice]);

  // Global Keyboard Shortcuts (Ignore when typing in an input field)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      const gs = stateRef.current.gameState;

      if (gs === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleStartMatch();
        }
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        handlePauseToggle();
        return;
      }

      if (e.code === 'KeyM') {
        e.preventDefault();
        handleToggleMute();
        return;
      }

      if (e.code === 'KeyH') {
        e.preventDefault();
        setDockCollapsed((prev) => !prev);
        return;
      }

      if (e.code === 'KeyD' && gs === 'playing') {
        e.preventDefault();
        handleTriggerDanceParty();
        return;
      }

      if (e.code === 'KeyK' && gs === 'playing') {
        e.preventDefault();
        handleTriggerSmashDemo();
        return;
      }

      if (e.code === 'KeyR' && gs === 'playing') {
        e.preventDefault();
        handleRestartMatch();
        return;
      }

      if (e.code === 'KeyC' && gs === 'playing') {
        e.preventDefault();
        setCameraPreset((prev) =>
          prev === 'isometric' ? 'overhead' : prev === 'overhead' ? 'pov' : 'isometric'
        );
        return;
      }

      if (gs === 'playing') {
        const ms = stateRef.current.matchState;
        if (e.code === 'Space' && ms.turnPhase === TurnPhase.WAITING_FOR_ROLL) {
          e.preventDefault();
          triggerRollDice();
          return;
        }

        if (ms.turnPhase === TurnPhase.SELECTING_MOVE) {
          if (e.code === 'Digit1' || e.code === 'Numpad1') handleSelectMoveByTokenIndex(0);
          else if (e.code === 'Digit2' || e.code === 'Numpad2') handleSelectMoveByTokenIndex(1);
          else if (e.code === 'Digit3' || e.code === 'Numpad3') handleSelectMoveByTokenIndex(2);
          else if (e.code === 'Digit4' || e.code === 'Numpad4') handleSelectMoveByTokenIndex(3);
        }
      }
    }

    function onWindowBlur() {
      setHoveredTokenIndex(null);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [
    handleStartMatch,
    handlePauseToggle,
    handleToggleMute,
    handleRestartMatch,
    handleTriggerDanceParty,
    handleTriggerSmashDemo,
    triggerRollDice,
    handleSelectMoveByTokenIndex,
  ]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#120d0a] select-none">
      {/* Isolated Full-Viewport 3D WebGL Canvas */}
      <LudoBoard3D
        gameState={gameState}
        matchState={matchState}
        legalMoves={legalMoves}
        selectedMoveTokenIndex={null}
        hoveredTokenIndex={hoveredTokenIndex}
        cameraPreset={cameraPreset}
        woodFinish={woodFinish}
        activeAnimationMove={activeAnimationMove}
        diceRollTrigger={diceRollTrigger}
        celebrationTrigger={celebrationTrigger}
        onSelectTokenMove={handleSelectMoveByTokenIndex}
        onTriggerRollDice={triggerRollDice}
        onTriggerCelebrationEvent={(kind, color, headline, subtext) => {
          showCelebrationBanner(kind, color, headline, subtext, 3800);
        }}
      />

      {/* Compact, Hideable, Mobile-Friendly HUD & Online Room Lobby */}
      <GameHudAndModals
        gameState={gameState}
        matchState={matchState}
        legalMoves={legalMoves}
        hoveredTokenIndex={hoveredTokenIndex}
        setHoveredTokenIndex={setHoveredTokenIndex}
        cameraPreset={cameraPreset}
        setCameraPreset={setCameraPreset}
        woodFinish={woodFinish}
        setWoodFinish={setWoodFinish}
        dockCollapsed={dockCollapsed}
        setDockCollapsed={setDockCollapsed}
        muted={muted}
        onToggleMute={handleToggleMute}
        onStartMatch={handleStartMatch}
        onPauseToggle={handlePauseToggle}
        onRestartMatch={handleRestartMatch}
        onReturnToTitle={handleReturnToTitle}
        onChangeSeatType={handleChangeSeatType}
        onApplyPresetMode={handleApplyPresetMode}
        onRollDice={triggerRollDice}
        onSelectMove={handleSelectMoveByTokenIndex}
        tacticalAdvice={tacticalAdvice}
        tacticalLoading={tacticalLoading}
        tacticalOpen={tacticalOpen}
        setTacticalOpen={setTacticalOpen}
        onRequestTacticalAdvice={handleRequestTacticalAdvice}
        celebrationBanner={celebrationBanner}
        onTriggerDanceParty={handleTriggerDanceParty}
        onTriggerSmashDemo={handleTriggerSmashDemo}
        onPlayViralSound={handlePlayViralSound}
        isOnlineMode={isOnlineMode}
        clientId={clientId}
        playerName={playerName}
        setPlayerName={setPlayerName}
        onlineRoom={onlineRoom}
        availableRooms={availableRooms}
        wsConnected={wsConnected}
        onlineError={onlineError}
        onCreateOnlineRoom={handleCreateOnlineRoom}
        onJoinOnlineRoom={handleJoinOnlineRoom}
        onLeaveOnlineRoom={handleLeaveOnlineRoom}
        onClaimOnlineSeat={handleClaimOnlineSeat}
        onRefreshOnlineRooms={handleRefreshOnlineRooms}
        turnRemainingSec={turnRemainingSec}
        turnMaxSec={TURN_TIME_LIMIT_SECONDS}
      />
    </main>
  );
}
