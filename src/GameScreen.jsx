// src/GameScreen.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Button,
  Modal,
  Box,
  Typography,
  Card,
  Chip,
  LinearProgress,
  Divider,
  Alert,
} from '@mui/material';
import { DEFAULT_CHANCE_CARDS } from './questionBank';
import { LABELS, teamDisplayName } from './labels';
import { matchesTopicAndModule } from './tsvBoardBuilder';
import { BOARD_SIZE } from './gameData';
import {
  getSubgroupTiles, getRentMultiplier, computeRent, rankPlayers, nextActivePlayer, activePlayers,
  ECONOMY, QUIZ_RULES, drawQuestions, pickRandom, canUpgradeSubgroup, nextUpgradeLevel, upgradeCost, applyUpgrade,
  bankruptcyAction, downgradeSubgroup, sellDeed, releaseTiles, chaosStealCost, chaosFailPenalty, chaosTargets, chaosTokensForSale,
} from './gameRules';
import { prepareQuestion, checkAnswer, parseMishapAmount } from './questionFormats';
import { resolveImage } from './images';
import QuestionInput from './QuestionInput';
import Board from './components/Board';
import Dice from './components/Dice';
import TeamPanel from './components/TeamPanel';
import { celebrate } from './components/confetti';
import { TEAM_COLORS, TEAM_SYMBOLS } from './theme';

// Status colours as theme CSS variables (light/dark aware).
const THEME = {
  danger: 'var(--mui-palette-error-main)',
  success: 'var(--mui-palette-success-main)',
};

const modalStyle = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'min(700px, 94vw)',
  maxHeight: '92vh',
  overflowY: 'auto',
  bgcolor: 'background.paper',
  boxShadow: 24,
  p: 4,
  borderRadius: 3,
  outline: 'none',
  borderTop: '6px solid var(--mui-palette-primary-main)',
  color: 'text.primary',
};

const HOP_MS = 200; // pawn speed, per tile
const LANDING_PAUSE_MS = 600; // pause on the destination tile before its dialog opens

// Milestone exam or Rescue Quiz in progress.
const NO_QUIZ = {
  active: false,
  mode: null, // 'MILESTONE_ACQUIRE' | 'MILESTONE_CHALLENGE' | 'GRANT'
  tile: null,
  questions: [],
  qIndex: 0,
  score: 0,
  mistakes: 0,
  targetScore: 0,
  maxMistakes: Infinity,
  waiting: false, // answered; showing the explanation and the Next button
  selected: null,
  result: null,
  isCorrect: null,
};

function generatePlayers(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    name: teamDisplayName(i, count),
    color: TEAM_COLORS[i],
    position: 0,
    money: ECONOMY.startMoney,
    jailed: false,
    chaosTokens: 0,
    rescueUsed: false,
    eliminated: false,
  }));
}

/**
 * useState plus a ref that always holds the newest value, updated in the same
 * call as the setter. Handlers and timers read the ref, so several updates in
 * one handler (or a timer created renders ago) never see stale data.
 * The setter accepts a value or a pure updater, like useState's.
 */
function useLatestState(initial) {
  const [value, setValue] = useState(initial);
  const ref = useRef(value);
  const set = useCallback((next) => {
    ref.current = typeof next === 'function' ? next(ref.current) : next;
    setValue(ref.current);
  }, []);
  return [value, set, ref];
}

// ------------------------------------------------------------------
//  MAIN COMPONENT
//
//  Turn flow: Roll -> pawn hops -> checkLanding opens a dialog -> the dialog
//  ends with passTurn(). passTurn is the single place where a team in debt
//  is sent to liquidation / the Rescue Quiz / elimination, so the feedback and
//  explanation that caused the debt are always shown first.
// ------------------------------------------------------------------

export default function GameScreen({
  boardData,
  playerCount,
  startingPlayerIndex = 0,
  onExit,
  onEndGame,
  imageMap = {},
  imageBase = '',
  tsvRows = [],
  sessionMinutes = 0,
  bigTopic = '',
  module = '',
  resume = null, // autosaved game to continue (see App.jsx / autosave.js)
  onSnapshot,
}) {
  // A resumed game keeps the freshly built board (its tiles share question arrays)
  // and restores only what changes during play: each tile's owner and level.
  const [board, setBoard, boardRef] = useLatestState(() => (resume?.tiles
    ? boardData.map((t, i) => ({ ...t, owner: resume.tiles[i]?.[0] ?? null, level: resume.tiles[i]?.[1] ?? 0 }))
    : boardData));
  const [players, setPlayers, playersRef] = useLatestState(() => resume?.players ?? generatePlayers(playerCount));
  const [turn, setTurn, turnRef] = useLatestState(resume?.turn ?? (startingPlayerIndex || 0));
  const [totalTurns, setTotalTurns, totalTurnsRef] = useLatestState(resume?.totalTurns ?? 0);
  const getImgSrc = (imgName) => resolveImage(imgName, imageMap, imageBase);
  // True from the roll until the turn is passed: never autosave a half-finished turn.
  const turnInProgressRef = useRef(false);

  // Timers (pawn hops, landing pause, money floats) are cancelled if the game unmounts.
  const timersRef = useRef(new Set());
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach((id) => { clearTimeout(id); clearInterval(id); }); timers.clear(); };
  }, []);
  const later = (fn, ms) => {
    const id = setTimeout(() => { timersRef.current.delete(id); fn(); }, ms);
    timersRef.current.add(id);
  };

  // isMoving covers the whole move, up to the landing dialog: nothing else can open meanwhile.
  const [isMoving, setIsMoving] = useState(false);
  const [dice, setDice] = useState(resume?.dice ?? [1, 1]);
  const [rollId, setRollId] = useState(0);
  const [logs, setLogs] = useState(() => (resume
    ? ['Game resumed.', ...(resume.logs || [])].slice(0, 10)
    : [playerCount > 1 ? `${generatePlayers(playerCount)[startingPlayerIndex || 0].name} starts (best pre-game survey score).` : 'System initialized.']));

  // Modal + flow state
  const [modalOpen, setModalOpen] = useState(false);
  const [activeCard, setActiveCard] = useState(null);
  const [modalStage, setModalStage] = useState('QUESTION');
  const [feedback, setFeedback] = useState(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [moneyFloats, setMoneyFloats] = useState({});
  const [quizState, setQuizState] = useState(NO_QUIZ);
  const [hoverTile, setHoverTile] = useState(null);
  const [logRows, setLogRows] = useState(resume?.logRows ?? []);

  // Optional session timer: when it runs out, the game ends on net worth.
  const [endsAt] = useState(() => (resume ? resume.endsAt ?? null : (sessionMinutes > 0 ? Date.now() + sessionMinutes * 60000 : null)));
  const [now, setNow] = useState(() => Date.now());
  const standingsShownRef = useRef(false);
  useEffect(() => {
    if (!endsAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  const timeLeftMs = endsAt ? Math.max(0, endsAt - now) : null;
  const timeUp = endsAt != null && timeLeftMs === 0;

  // Wildcard cards: the file's `mishap` rows for this game, or the built-in neutral set.
  const mishapPool = useMemo(() => {
    const fromFile = tsvRows
      .filter((r) => (r.type || '').trim().toLowerCase() === 'mishap' && matchesTopicAndModule(r, bigTopic, module))
      .map((r) => ({ msg: r.question, fact: r.explanation }));
    return fromFile.length > 0 ? fromFile : DEFAULT_CHANCE_CARDS;
  }, [tsvRows, bigTopic, module]);

  const currentPlayer = players[turn];
  // The team whose turn it is, as of the latest update (for handlers and timers).
  const activePlayer = () => playersRef.current[turnRef.current];

  // ------------------------------------------------------------------
  //  LOGGING (game log + CSV rows)
  // ------------------------------------------------------------------
  const addLog = (msg) => {
    setLogs((prev) => {
      const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
      return [`[${time}] ${msg}`, ...prev].slice(0, 10);
    });
  };

  const addCSVEvent = (event) => {
    setLogRows((prev) => [...prev, event]);
  };

  // One row per answered question, whatever the format.
  const logAnswer = (eventType, q, result, meta = {}) => {
    addCSVEvent({
      eventType,
      turn: totalTurnsRef.current,
      playerIndex: turnRef.current,
      playerName: activePlayer()?.name || '',
      questionId: q?.id || '',
      format: q?.format || 'mcq',
      prompt: q?.prompt || '',
      response: result.responseText,
      correctAnswer: result.correctText,
      correct: result.correct,
      timestamp: new Date().toISOString(),
      ...meta,
    });
  };

  // Unique questions across the board (property tiles share question arrays).
  const allBoardQuestions = () => [...new Set(boardRef.current.flatMap((t) => t.questions || []))];

  // ------------------------------------------------------------------
  //  TRANSACTIONS
  //  CSV columns: action, amount, moneyBefore, moneyAfter, tileId, tileName, notes.
  // ------------------------------------------------------------------
  const handleTransaction = (playerId, amount, meta = {}) => {
    const player = playersRef.current.find((p) => p.id === playerId);
    const before = player?.money || 0;
    setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, money: p.money + amount } : p)));

    const floatId = Date.now();
    setMoneyFloats((prev) => ({ ...prev, [playerId]: { amount, visible: true, id: floatId } }));
    later(() => {
      setMoneyFloats((prev) => ({ ...prev, [playerId]: { ...prev[playerId], visible: false } }));
    }, 2000);

    addCSVEvent({
      eventType: 'TRANSACTION',
      turn: totalTurnsRef.current,
      playerIndex: playerId,
      playerName: player?.name || '',
      playerColor: player?.color || '',
      action: meta.action || 'MONEY_CHANGE',
      amount,
      moneyBefore: before,
      moneyAfter: before + amount,
      tileId: meta.tileId ?? '',
      tileName: meta.tileName ?? '',
      notes: meta.notes ?? '',
    });
  };

  // ------------------------------------------------------------------
  //  TURN PASSING, BANKRUPTCY, LIQUIDATION, ELIMINATION
  // ------------------------------------------------------------------

  // Liquidation if assets cover the debt, else the one Rescue Quiz, else elimination.
  const resolveDebt = (player) => {
    const action = bankruptcyAction(player, boardRef.current);
    if (action === 'liquidate') {
      setActiveCard({ type: 'LIQUIDATION', debt: Math.abs(player.money), assets: boardRef.current.filter((t) => t.owner === player.id) });
      setModalStage('LIQUIDATION');
      setModalOpen(true);
    } else if (action === 'eliminate') {
      eliminatePlayer(player.id, 'Bankrupt again after using the Rescue Quiz');
    } else if (action === 'rescue') {
      setActiveCard({ type: 'GRANT', debt: Math.abs(player.money) });
      setModalStage('GRANT_INTRO');
      setModalOpen(true);
    }
  };

  // End the current team's turn. A team in debt must settle it first.
  const passTurn = () => {
    const p = activePlayer();
    if (p && !p.eliminated && p.money < 0) {
      resolveDebt(p);
      return;
    }
    turnInProgressRef.current = false;
    setModalOpen(false);
    setTurn(nextActivePlayer(playersRef.current, turnRef.current));
  };

  // A team that cannot pay its debts leaves the game; its tiles return to the bank.
  const eliminatePlayer = (playerId, reason) => {
    const name = playersRef.current[playerId]?.name || 'Team';
    setBoard((prev) => releaseTiles(prev, playerId));
    setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, eliminated: true, eliminatedAt: totalTurnsRef.current, money: 0 } : p)));
    addLog(`${name} has been eliminated.`);
    addCSVEvent({ eventType: 'ELIMINATED', turn: totalTurnsRef.current, playerIndex: playerId, playerName: name, notes: reason, timestamp: new Date().toISOString() });
    setActiveCard({ type: 'ELIMINATED', playerId, name, reason });
    setModalStage('ELIMINATED');
    setModalOpen(true);
  };

  const continueAfterElimination = () => {
    const all = playersRef.current;
    const remaining = activePlayers(all);
    if (all.length > 1 && remaining.length === 1) {
      setActiveCard({ type: 'WIN', msg: `${remaining[0].name} is the last team standing!` });
      setModalStage('WIN');
      addLog(`VICTORY: ${remaining[0].name} is the last team standing.`);
    } else if (remaining.length === 0) {
      openStandings(true, 'eliminated');
    } else {
      passTurn();
    }
  };

  // Liquidation: an upgraded tile loses one level across its subgroup; an
  // unupgraded one is sold back to the bank. The turn ends once out of debt.
  const handleSellAsset = (listedTile) => {
    const player = activePlayer();
    const tile = boardRef.current[listedTile.id];
    if (!player || !tile || tile.owner !== player.id) return;
    let nextBoard;
    let cash;
    if (tile.level > 0) {
      const r = downgradeSubgroup(boardRef.current, tile, player.id);
      nextBoard = r.board;
      cash = r.refund;
      setBoard(nextBoard);
      handleTransaction(player.id, cash, { action: 'LIQUIDATION_DOWNGRADE', tileId: tile.id, tileName: tile.name, notes: `Downgraded sub-theme to Level ${tile.level - 1}` });
    } else {
      const r = sellDeed(boardRef.current, tile);
      nextBoard = r.board;
      cash = r.value;
      setBoard(nextBoard);
      handleTransaction(player.id, cash, { action: 'LIQUIDATION_SALE', tileId: tile.id, tileName: tile.name, notes: 'Sold deed' });
    }
    const money = player.money + cash;
    if (money >= 0) {
      addLog(`${player.name} cleared debt. Turn ends.`);
      passTurn();
    } else {
      setActiveCard((prev) => ({ ...prev, debt: Math.abs(money), assets: nextBoard.filter((t) => t.owner === player.id) }));
    }
  };

  // ------------------------------------------------------------------
  //  RESCUE QUIZ & CHAOS TOKENS
  // ------------------------------------------------------------------
  const startGrantExam = () => {
    const pool = drawQuestions(allBoardQuestions(), QUIZ_RULES.rescue.questions);
    if (pool.length === 0) { handleGrantResult(true); return; }
    setQuizState({
      ...NO_QUIZ, active: true, mode: 'GRANT', questions: pool.map((q) => prepareQuestion(q)), targetScore: QUIZ_RULES.rescue.pass,
    });
    setModalStage('GRANT_QUIZ');
  };

  const handleGrantResult = (passed) => {
    const player = activePlayer();
    if (!passed) {
      eliminatePlayer(player.id, 'Did not pass the Rescue Quiz');
      return;
    }
    const debt = Math.max(0, -player.money);
    handleTransaction(player.id, debt + ECONOMY.rescueBonus, { action: 'EMERGENCY_GRANT', notes: 'Rescue Quiz passed' });
    setPlayers((prev) => prev.map((p) => (p.id === player.id ? { ...p, rescueUsed: true } : p)));
    setFeedback(`Your $${debt} debt is cleared and you receive $${ECONOMY.rescueBonus} to keep playing. This was your team's only rescue: if you go bankrupt again, you are out.`);
    setModalStage('GRANT_RESULT');
  };

  const handleBuyChaosToken = () => {
    if (!chaosTokensForSale(boardRef.current)) {
      alert('Chaos Tokens are locked! They only become available after ALL 4 Milestones have been captured.');
      return;
    }
    const player = activePlayer();
    if (player.money < ECONOMY.chaosTokenPrice) {
      alert(`Insufficient funds to buy a Chaos Token ($${ECONOMY.chaosTokenPrice}).`);
      return;
    }
    handleTransaction(player.id, -ECONOMY.chaosTokenPrice, { action: 'BUY_CHAOS', notes: 'Purchased token' });
    setPlayers((prev) => prev.map((p) => (p.id === player.id ? { ...p, chaosTokens: p.chaosTokens + 1 } : p)));
    addLog(`${player.name} bought a Chaos Token.`);
  };

  // ------------------------------------------------------------------
  //  MILESTONE EXAMS (6 questions, 5 to pass, stop on the 2nd mistake)
  // ------------------------------------------------------------------
  const startQuiz = (tile, mode) => {
    // A milestone without its own questions (the validator reports it) borrows the board's.
    const source = tile.quiz?.length ? tile.quiz : allBoardQuestions();
    if (source.length === 0) return;
    const rules = QUIZ_RULES.milestone;
    setQuizState({
      ...NO_QUIZ, active: true, mode, tile,
      questions: drawQuestions(source, rules.questions).map((q) => prepareQuestion(q)),
      targetScore: rules.pass, maxMistakes: rules.maxMistakes,
    });
    setModalStage('QUIZ_START');
    setModalOpen(true);
  };

  const handleQuizAnswer = (response) => {
    if (quizState.waiting) return;
    const currentQ = quizState.questions[quizState.qIndex];
    const result = checkAnswer(currentQ, response);
    logAnswer(quizState.mode === 'GRANT' ? 'GRANT_Q' : 'MILESTONE_Q', currentQ, result, {
      tileId: quizState.tile?.id ?? '', tileName: quizState.tile?.name ?? '', questionNumber: quizState.qIndex + 1,
    });
    // Show the explanation and a Next button.
    setQuizState((prev) => ({
      ...prev,
      waiting: true,
      selected: response,
      result,
      isCorrect: result.correct,
      score: prev.score + (result.correct ? 1 : 0),
      mistakes: prev.mistakes + (result.correct ? 0 : 1),
    }));
  };

  const handleNextQuestion = () => {
    const isGrant = quizState.mode === 'GRANT';
    // A milestone exam stops at the 2nd mistake; the Rescue Quiz always runs to the end.
    if (!isGrant && quizState.mistakes >= quizState.maxMistakes) {
      finishQuiz(false);
      return;
    }
    if (quizState.qIndex < quizState.questions.length - 1) {
      setQuizState((prev) => ({ ...prev, qIndex: prev.qIndex + 1, waiting: false, selected: null, result: null, isCorrect: null }));
      return;
    }
    const passed = quizState.score >= quizState.targetScore;
    if (isGrant) handleGrantResult(passed);
    else finishQuiz(passed);
  };

  const finishQuiz = (passed) => {
    const { tile, mode } = quizState;
    const playerId = turnRef.current;
    const owner = boardRef.current[tile.id]?.owner;

    if (mode === 'MILESTONE_ACQUIRE') {
      if (passed) {
        handleTransaction(playerId, -tile.price, { action: 'MILESTONE_ACQUIRE', tileId: tile.id, tileName: tile.name });
        setBoard((prev) => prev.map((t) => (t.id === tile.id ? { ...t, owner: playerId } : t)));
        setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, chaosTokens: p.chaosTokens + 1 } : p)));
        addLog(`${activePlayer().name} captured the ${tile.name} milestone!`);
        setModalStage('MILESTONE_SUCCESS');
      } else {
        setModalStage('MILESTONE_FAIL');
      }
    } else if (mode === 'MILESTONE_CHALLENGE') {
      const baseRent = tile.baseRent || 0;
      const fee = passed ? Math.floor(baseRent / 2) : baseRent;
      handleTransaction(playerId, -fee, { action: passed ? 'MILESTONE_CHALLENGE_SUCCESS' : 'MILESTONE_CHALLENGE_FAIL', tileId: tile.id, tileName: tile.name });
      if (owner != null) handleTransaction(owner, fee, { action: 'MILESTONE_RENT_RECEIVED', tileId: tile.id, tileName: tile.name });
      setFeedback(passed ? `Impressive! Milestone fee halved to $${fee}.` : `Quiz Failed. Paying the full milestone fee: $${fee}.`);
      setModalStage('FEEDBACK_INCORRECT');
    }
  };

  // Landing on a rival's milestone and declining the exam.
  const payMilestoneFee = () => {
    const tile = boardRef.current[activeCard.data.id];
    const fee = tile.baseRent || 0;
    handleTransaction(turnRef.current, -fee, { action: 'MILESTONE_FULL_FEE', tileId: tile.id, tileName: tile.name });
    if (tile.owner != null) handleTransaction(tile.owner, fee, { action: 'MILESTONE_RENT_RECEIVED', tileId: tile.id, tileName: tile.name });
    passTurn();
  };

  // ------------------------------------------------------------------
  //  MOVING AND LANDING
  // ------------------------------------------------------------------
  const openCard = (card, stage) => {
    setActiveCard(card);
    setModalStage(stage);
    setModalOpen(true);
  };

  const checkLanding = (didPassGo) => {
    const p = activePlayer();
    const tile = boardRef.current[p.position];

    if (didPassGo) {
      handleTransaction(p.id, ECONOMY.lapBonus, { action: 'PASS_GO' });
      addLog(LABELS.passStart);
    }

    setFeedback(null);

    if (tile.owner === p.id) {
      openCard({ type: 'MSG', data: tile, msg: LABELS.ownTile }, 'MSG');
      return;
    }

    if (tile.type === 'milestone') {
      if (tile.owner != null) {
        openCard({ type: 'MILESTONE_CHALLENGE', data: tile, ownerId: tile.owner }, 'MILESTONE_CHALLENGE_INTRO');
      } else if (activePlayer().money >= tile.price) {
        openCard({ type: 'MILESTONE', data: tile }, 'MILESTONE_INTRO');
      } else {
        openCard({ type: 'MSG', data: tile, msg: LABELS.cannotAffordMilestone(tile.price) }, 'MSG');
      }
      return;
    }

    if (tile.questions && tile.questions.length > 0) {
      const q = prepareQuestion(pickRandom(tile.questions));
      if (tile.owner != null) {
        openCard({
          type: 'RENT_DEFENSE', data: tile, q, rent: computeRent(boardRef.current, tile),
          ownerName: playersRef.current[tile.owner]?.name || LABELS.rivalTeam, ownerId: tile.owner, payerId: p.id, payerName: p.name,
        }, 'QUESTION');
      } else {
        openCard({ type: 'QUESTION', data: tile, q }, 'QUESTION');
      }
      return;
    }

    if (tile.type === 'chance') {
      const card = pickRandom(mishapPool) || { msg: 'Unexpected expense (-$100)', fact: null };
      const amount = parseMishapAmount(card.msg);
      if (amount !== 0) handleTransaction(p.id, amount, { action: 'LAB_MISHAP', tileId: tile.id, tileName: tile.name, notes: card.msg });
      openCard({ type: 'MISHAP', data: { ...tile, fact: card.fact || null }, msg: card.msg }, 'MISHAP');
      return;
    }

    // A tile with no questions (e.g. no core rows in the file).
    openCard({ type: 'MSG', data: tile, msg: 'Event triggered.' }, 'MSG');
  };

  const handleRoll = () => {
    const p = activePlayer();
    if (isMoving || timeUp || turnInProgressRef.current || !p || p.eliminated) return;
    // Debts are settled before a turn ends, so this only happens with a game saved by an older version.
    if (p.money < 0) { resolveDebt(p); return; }
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    setDice([d1, d2]);
    setRollId((n) => n + 1);
    turnInProgressRef.current = true;
    setIsMoving(true);

    const steps = d1 + d2;
    const passesGo = p.position + steps >= BOARD_SIZE;
    let stepsTaken = 0;
    const hop = setInterval(() => {
      setPlayers((prev) => prev.map((player, index) => (index === turnRef.current ? { ...player, position: (player.position + 1) % BOARD_SIZE } : player)));
      stepsTaken++;
      if (stepsTaken < steps) return;
      clearInterval(hop);
      timersRef.current.delete(hop);
      setTotalTurns((n) => n + 1);
      later(() => { setIsMoving(false); checkLanding(passesGo); }, LANDING_PAUSE_MS);
    }, HOP_MS);
    timersRef.current.add(hop);
  };

  // ------------------------------------------------------------------
  //  QUESTIONS ON PROPERTY AND CORE TILES
  // ------------------------------------------------------------------

  // Unowned tile: right answer -> option to buy; wrong answer -> small fine.
  const handleAnswer = (response) => {
    const { q, data: tile } = activeCard;
    const result = checkAnswer(q, response);
    logAnswer('PROPERTY_Q', q, result, { tileId: tile.id, tileName: tile.name });
    if (result.correct) {
      setFeedback(q.explanation || '');
      setModalStage('DECISION');
    } else {
      setFeedback(`Incorrect (-$${ECONOMY.wrongAnswerPenalty}). Correct answer: ${result.correctText}${q.explanation ? `\n\n${q.explanation}` : ''}`);
      handleTransaction(turnRef.current, -ECONOMY.wrongAnswerPenalty, { action: 'QUESTION_PENALTY', tileId: tile.id, tileName: tile.name, notes: 'Incorrect on acquisition question' });
      setModalStage('FEEDBACK_INCORRECT');
    }
  };

  const handleBuy = () => {
    const tile = activeCard.data;
    if (activePlayer().money < tile.price) { alert('Insufficient funds!'); return; }
    handleTransaction(turnRef.current, -tile.price, { action: 'BUY_PROPERTY', tileId: tile.id, tileName: tile.name });
    setBoard((prev) => prev.map((t) => (t.id === tile.id ? { ...t, owner: turnRef.current } : t)));
    passTurn();
  };

  // Rival's tile: a right answer halves the rent.
  const handleRentChallengeAnswer = (response) => {
    const { q, data: tile, rent, payerId, ownerId } = activeCard;
    const result = checkAnswer(q, response);
    logAnswer('RENT_Q', q, result, { tileId: tile.id, tileName: tile.name });
    const rentToPay = result.correct ? Math.floor(rent / 2) : rent;
    setFeedback((result.correct ? 'Correct! Rent discounted.' : `Incorrect. Paying full rent. Correct answer: ${result.correctText}`) + `\n\n${q.explanation || ''}`);
    handleTransaction(payerId, -rentToPay, { action: 'RENT_PAYMENT', tileId: tile.id, tileName: tile.name });
    if (ownerId != null) handleTransaction(ownerId, rentToPay, { action: 'RENT_RECEIVED', tileId: tile.id, tileName: tile.name });
    setModalStage('FEEDBACK_INCORRECT');
  };

  // Autosave between turns only: a refresh in the middle of a turn returns to its start.
  useEffect(() => {
    if (!onSnapshot || isMoving || modalOpen || manageOpen || turnInProgressRef.current) return;
    onSnapshot({ tiles: board.map((t) => [t.owner ?? null, t.level || 0]), players, turn, totalTurns, logs, logRows, dice, endsAt });
  }, [onSnapshot, board, players, turn, totalTurns, logs, logRows, dice, endsAt, isMoving, modalOpen, manageOpen]);

  // ------------------------------------------------------------------
  //  CHAOS CHALLENGE (spend a token to try to steal a rival's property)
  // ------------------------------------------------------------------
  const openChaosSelect = () => {
    openCard({ type: 'CHAOS_SELECT' }, 'CHAOS_SELECT');
  };

  const handleSelectChaosTarget = (tile) => {
    if (activePlayer().chaosTokens <= 0) { alert('No chaos tokens available.'); return; }
    // Duel on the target tile's own questions (fallback: any board question).
    const pool = tile.questions?.length ? tile.questions : allBoardQuestions();
    if (pool.length === 0) { alert('This question file has no questions for a Chaos challenge.'); return; }
    setActiveCard({ type: 'CHAOS_CHALLENGE', data: tile, q: prepareQuestion(pickRandom(pool)), ownerId: tile.owner });
    setModalStage('CHAOS_QUESTION');
  };

  const handleChaosAnswer = (response) => {
    const { q } = activeCard;
    const player = activePlayer();
    const tile = boardRef.current[activeCard.data.id];
    const result = checkAnswer(q, response);
    logAnswer('CHAOS_Q', q, result, { tileId: tile.id, tileName: tile.name });
    setPlayers((prev) => prev.map((p) => (p.id === player.id ? { ...p, chaosTokens: Math.max(0, p.chaosTokens - 1) } : p)));

    if (result.correct) {
      const cost = chaosStealCost(tile);
      if (player.money < cost) { setFeedback('Correct, but insufficient funds.'); setModalStage('FEEDBACK_INCORRECT'); return; }
      handleTransaction(player.id, -cost, { action: 'CHAOS_STEAL', tileId: tile.id, tileName: tile.name });
      if (tile.owner != null) handleTransaction(tile.owner, cost, { action: 'CHAOS_SELL', tileId: tile.id, tileName: tile.name });
      setBoard((prev) => prev.map((t) => (t.id === tile.id ? { ...t, owner: player.id, level: 0 } : t)));
      setFeedback(`Chaos success! Acquired ${tile.name} for $${cost}.`);
    } else {
      const penalty = chaosFailPenalty(tile);
      handleTransaction(player.id, -penalty, { action: 'CHAOS_FAIL', tileId: tile.id, tileName: tile.name });
      setFeedback(`Chaos failed. Penalty: $${penalty}. Correct answer: ${result.correctText}${q.explanation ? `\n\n${q.explanation}` : ''}`);
    }
    setModalStage('FEEDBACK_INCORRECT');
  };

  // ------------------------------------------------------------------
  //  UPGRADES
  // ------------------------------------------------------------------
  const handleUpgrade = () => {
    const playerId = turnRef.current;
    const tile = boardRef.current[activeCard.data.id];
    if (!canUpgradeSubgroup(boardRef.current, tile, playerId)) { alert('You must own all tiles in this sub-theme and keep node levels even.'); return; }
    const level = nextUpgradeLevel(boardRef.current, tile);
    if (level <= tile.level) { alert('No upgrades available.'); return; }
    const cost = upgradeCost(tile, level);
    if (activePlayer().money < cost) { alert('Insufficient funds.'); return; }
    handleTransaction(playerId, -cost, { action: 'UPGRADE_SUBTHEME', tileId: tile.id, tileName: tile.name, notes: `Level ${level}` });
    setBoard((prev) => applyUpgrade(prev, tile, playerId, level));
    setModalOpen(false);
  };

  const openLabManager = () => {
    setFeedback(null);
    setModalStage(null);
    setManageOpen(true);
  };

  const handleTileHover = (tile) => {
    if (!tile) { setHoverTile(null); return; }
    const rent = (tile.type === 'property' || tile.type === 'sequencing_core') ? computeRent(board, tile) : 0;
    const mult = (tile.type === 'property' || tile.type === 'sequencing_core') ? getRentMultiplier(board, tile) : 0;
    setHoverTile({ ...tile, rent, multiplier: mult });
  };
  const clearHover = () => setHoverTile(null);

  // ------------------------------------------------------------------
  //  END OF GAME
  // ------------------------------------------------------------------

  // Final standings: opened by END GAME, by the timer, or after a last-standing win.
  const openStandings = (forced, reason) => {
    openCard({ type: 'STANDINGS', forced, reason }, 'STANDINGS');
  };

  // Time's up: let the current turn finish (no dialog open, pawn not moving), then end.
  useEffect(() => {
    if (timeUp && !standingsShownRef.current && !modalOpen && !isMoving && !manageOpen) {
      standingsShownRef.current = true;
      addLog("Time's up!");
      openStandings(true, 'time');
    }
  });

  useEffect(() => {
    if (!modalOpen) return;
    if (modalStage === 'WIN' || (modalStage === 'STANDINGS' && players.length > 1)) celebrate();
  }, [modalOpen, modalStage, players.length]);

  const handleEndGame = (reason = 'ended') => {
    const standings = rankPlayers(playersRef.current, boardRef.current);
    const resultRows = standings.map((r) => ({
      eventType: 'GAME_RESULT',
      turn: totalTurnsRef.current,
      playerIndex: r.id,
      playerName: r.name,
      rank: r.rank,
      netWorth: r.netWorth,
      cash: r.cash,
      assets: r.assets,
      eliminated: r.eliminated,
      endReason: reason,
      timestamp: new Date().toISOString(),
    }));
    if (typeof onEndGame === 'function') onEndGame([...logRows, ...resultRows]);
  };

  const formatClock = (ms) => {
    const total = Math.ceil(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  };

  // Shared question renderer (prompt + image + any answer format).
  const renderQuestion = (q, onSubmit, opts = {}) => (
    <>
      <Typography variant={opts.variant || 'body1'} sx={{ mb: 2, fontWeight: 'bold', whiteSpace: 'pre-wrap' }}>{q.prompt}</Typography>
      <QuestionInput
        key={opts.key || q.id || q.prompt}
        question={q}
        onSubmit={onSubmit}
        reveal={opts.reveal || null}
        resolveImage={getImgSrc}
        imageMaxHeight={opts.imageMaxHeight || 250}
      />
    </>
  );

  const title = module || bigTopic || 'Science Around the Board';
  const rollLabel = timeUp ? "Time's up" : isMoving ? 'Moving…' : (currentPlayer.money < 0 ? 'Settle debt' : `Roll — ${currentPlayer.name}`);

  return (
    <Box sx={{ bgcolor: 'background.default', color: 'text.primary', minHeight: '100vh', px: { xs: 1, md: 3 }, py: 2 }}>
      <Box component="header" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between', alignItems: 'center', maxWidth: 1500, mx: 'auto', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>🎲 Science Around the Board</Typography>
          <Chip label={`Turn ${totalTurns}`} size="small" color="primary" />
          {endsAt && (
            <Chip
              label={timeUp ? "Time's up" : `⏱ ${formatClock(timeLeftMs)}`}
              size="small"
              color={timeUp ? 'error' : timeLeftMs <= 5 * 60000 ? 'warning' : 'default'}
              aria-label="Time remaining"
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="contained" color="warning" disabled={isMoving} onClick={() => openStandings(false, 'ended')}>End game</Button>
          <Button variant="text" color="error" onClick={() => { if (window.confirm('Leave this game? The current game and its results will be lost.')) onExit(); }}>Exit session</Button>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start', gap: 3, maxWidth: 1500, mx: 'auto' }}>
        <Box sx={{ flex: '1 1 640px', display: 'flex', justifyContent: 'center', maxWidth: 1000 }}>
          <Board board={board} players={players} onTileHover={handleTileHover} onTileLeave={clearHover}>
            <Typography component="h2" sx={{ fontFamily: '"Fredoka", sans-serif', fontWeight: 600, fontSize: '3.2cqw', lineHeight: 1.1, textAlign: 'center' }}>{title}</Typography>
            {module && bigTopic && <Typography sx={{ fontSize: '1.5cqw', color: 'text.secondary', fontWeight: 700, mt: '-0.8cqw' }}>{bigTopic}</Typography>}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.75, borderRadius: 99, bgcolor: 'background.paper', boxShadow: 1 }}>
              <Box aria-hidden sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: currentPlayer.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, textShadow: '0 0 2px rgba(0,0,0,.7)' }}>{TEAM_SYMBOLS[currentPlayer.id]}</Box>
              <Typography sx={{ fontWeight: 800 }}>{currentPlayer.name}'s turn</Typography>
            </Box>

            <Dice values={dice} rollId={rollId} />

            <Button
              variant="contained"
              size="large"
              onClick={handleRoll}
              disabled={isMoving || timeUp}
              sx={{ bgcolor: currentPlayer.color, color: '#fff', px: 5, py: 1.25, fontSize: '1.1rem', boxShadow: 3, '&:hover': { bgcolor: currentPlayer.color, filter: 'brightness(0.92)' }, textShadow: '0 1px 2px rgba(0,0,0,.35)' }}
            >
              {rollLabel}
            </Button>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="outlined" disabled={isMoving} onClick={openLabManager}>🏗️ {LABELS.upgrades}</Button>
              <Button variant="outlined" color="warning" disabled={isMoving} onClick={openChaosSelect}>⚡ Use chaos ({currentPlayer.chaosTokens})</Button>
            </Box>

            <Box sx={{ minHeight: '7cqw', width: '80%', maxWidth: 420 }}>
              {hoverTile ? (
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'background.paper', borderLeft: `6px solid ${hoverTile.color}`, boxShadow: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>{hoverTile.type === 'property' ? `${hoverTile.sub} · ${hoverTile.name}` : hoverTile.name}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {LABELS.tileTypes[hoverTile.type] || hoverTile.type}
                    {hoverTile.owner != null && ` · Owner: ${players[hoverTile.owner]?.name ?? LABELS.rivalTeam}`}
                  </Typography>
                  {(hoverTile.type === 'property' || hoverTile.type === 'sequencing_core') && (
                    <Typography variant="caption" sx={{ display: 'block' }}>
                      Rent now: <strong>${hoverTile.rent}</strong> (base ${hoverTile.baseRent} × {hoverTile.multiplier.toFixed(1)})
                    </Typography>
                  )}
                </Box>
              ) : (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>Hover or tab to a tile for details.</Typography>
              )}
            </Box>
            <Typography sx={{ fontSize: 'max(11px, 1.1cqw)', color: 'text.secondary' }}>© Hans Ghezzi · Science Around the Board</Typography>
          </Board>
        </Box>

        <Box sx={{ flex: '0 1 340px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TeamPanel players={players} board={board} turn={turn} moneyFloats={moneyFloats} />
          <Card sx={{ p: 2 }}>
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>Game log</Typography>
            <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, maxHeight: 220, overflowY: 'auto', fontSize: '0.8rem', color: 'text.secondary' }}>
              {logs.map((l, i) => (
                <Box component="li" key={i} sx={{ py: 0.5, borderBottom: '1px solid', borderColor: 'divider', color: i === 0 ? 'text.primary' : undefined, fontWeight: i === 0 ? 700 : 400 }}>{l}</Box>
              ))}
            </Box>
          </Card>
        </Box>
      </Box>

      <Modal open={modalOpen} disableEscapeKeyDown>
        <Box sx={{ ...modalStyle, ...(activeCard?.data?.color ? { borderTopColor: activeCard.data.color } : {}) }}>
          {activeCard?.type === 'LIQUIDATION' && modalStage === 'LIQUIDATION' && (
            <>
                <Typography variant="h4" color="error" gutterBottom>{LABELS.outOfMoney}</Typography>
                <Typography variant="body1" paragraph>
                    Your team is <strong>${activeCard.debt}</strong> in debt. Sell properties or remove upgrades to get back above $0.
                </Typography>
                <Box sx={{ maxHeight: 300, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.25, mb: 2.5 }}>
                    {activeCard.assets.map(t => {
                        const isDowngrade = t.level > 0;
                        const sellValue = Math.floor((isDowngrade ? (t.houseCost||t.price) : t.price) * 0.5);
                        
                        const actionLabel = isDowngrade ? `DOWNGRADE GROUP (Lvl ${t.level}->${t.level-1})` : "SELL DEED";
                        
                        return (
                            <Box key={t.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
                                <div>
                                    <strong>{t.name}</strong> ({t.sub})
                                    <Typography variant="caption" color="text.secondary">Lvl {t.level}</Typography>
                                </div>
                                <Button variant="contained" color="error" size="small" onClick={() => handleSellAsset(t)}>
                                    {actionLabel} (+${sellValue} per tile)
                                </Button>
                            </Box>
                        )
                    })}
                </Box>
            </>
          )}

          {activeCard?.type === 'GRANT' && modalStage === 'GRANT_INTRO' && (
            <>
                <Typography variant="h4" color="error" gutterBottom>{LABELS.bankrupt}</Typography>
                <Typography variant="body1" paragraph>
                    Your team is <strong>${activeCard.debt}</strong> in debt and selling everything still wouldn't cover it.
                </Typography>
                <Typography variant="body1" paragraph>
                    You can take the <strong>{LABELS.rescueQuiz}</strong>: 3 questions. Answer at least 2 correctly to be rescued.
                </Typography>
                <Alert severity="warning" sx={{ mb: 3 }}>
                    Each team gets <strong>one</strong> rescue per game. If approved, your debt is cleared and you receive $500.
                    If denied, or if you go bankrupt again later, your team is eliminated and its properties return to the bank.
                </Alert>
                <Button fullWidth variant="contained" onClick={startGrantExam}>START THE RESCUE QUIZ</Button>
            </>
          )}

          {modalStage === 'GRANT_QUIZ' && quizState.active && (
            <>
              <Typography variant="overline">{LABELS.rescueQuiz}: Question {quizState.qIndex + 1} of {quizState.questions.length}</Typography>
              <LinearProgress variant="determinate" value={(quizState.qIndex / quizState.questions.length) * 100} sx={{ mb: 3 }} />
              {renderQuestion(quizState.questions[quizState.qIndex], handleQuizAnswer, {
                variant: 'h6', key: `grant-${quizState.qIndex}`,
                reveal: quizState.waiting ? { ...quizState.result, response: quizState.selected } : null,
              })}
              {quizState.waiting && (
                <Box sx={{ mt: 3, p: 2, bgcolor: 'action.hover', borderRadius: 2, borderLeft: `4px solid ${quizState.isCorrect ? THEME.success : THEME.danger}` }}>
                  <Typography variant="subtitle2" fontWeight="bold" color={quizState.isCorrect ? 'success.main' : 'error.main'}>
                    {quizState.isCorrect ? 'Correct!' : 'Incorrect'}
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>{quizState.questions[quizState.qIndex].explanation || 'No explanation provided.'}</Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button variant="contained" onClick={handleNextQuestion}>
                      {quizState.qIndex < quizState.questions.length - 1 ? 'NEXT QUESTION' : 'FINISH QUIZ'}
                    </Button>
                  </Box>
                </Box>
              )}
            </>
          )}

          {modalStage === 'GRANT_RESULT' && (
            <>
                <Typography variant="h5" color="success.main">{LABELS.rescued}</Typography>
                <Typography variant="body1" paragraph>{feedback}</Typography>
                <Button fullWidth variant="contained" onClick={passTurn}>KEEP PLAYING</Button>
            </>
          )}

          {activeCard?.type === 'WIN' && modalStage === 'WIN' && (
            <>
              <Typography variant="h3" align="center">🏆</Typography>
              <Typography variant="h4" align="center" color="primary">VICTORY!</Typography>
              <Typography variant="h6" align="center">{activeCard.msg}</Typography>
              <Button fullWidth variant="contained" sx={{ mt: 3 }} onClick={() => openStandings(true, 'last_standing')}>SEE FINAL STANDINGS</Button>
            </>
          )}

          {activeCard?.type === 'ELIMINATED' && modalStage === 'ELIMINATED' && (
            <>
              <Typography variant="h4" color="error" gutterBottom>{LABELS.eliminated}</Typography>
              <Typography variant="body1" paragraph>
                <strong>{activeCard.name}</strong> could not cover its debts and has been <strong>eliminated</strong>. Its properties return to the bank.
              </Typography>
              <Typography variant="body2" color="textSecondary" paragraph>Reason: {activeCard.reason}</Typography>
              <Button fullWidth variant="contained" onClick={continueAfterElimination}>CONTINUE</Button>
            </>
          )}

          {activeCard?.type === 'STANDINGS' && modalStage === 'STANDINGS' && (() => {
            const standings = rankPlayers(players, board);
            const leader = standings[0];
            const tied = standings.filter((r) => !r.eliminated && r.netWorth === leader?.netWorth);
            const reasonText = {
              time: "Time's up! The team with the highest net worth (cash + property value) wins.",
              last_standing: 'Last team standing!',
              eliminated: 'No teams remain.',
              ended: 'Ending the game now ranks teams by net worth (cash + property value).',
            }[activeCard.reason];
            return (
              <>
                <Typography variant="h4" gutterBottom>Final Standings</Typography>
                <Typography variant="body1" paragraph>{reasonText}</Typography>
                {players.length > 1 && leader && !leader.eliminated && (
                  <Alert severity="success" sx={{ mb: 2 }}>
                    🏆 {tied.length > 1 ? `Tie: ${tied.map((t) => t.name).join(' & ')}` : `${leader.name} wins`} with a net worth of ${leader.netWorth}.
                  </Alert>
                )}
                <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', mb: 2, '& td, & th': { p: 1, borderBottom: '1px solid', borderColor: 'divider', textAlign: 'right' }, '& td:nth-of-type(2), & th:nth-of-type(2)': { textAlign: 'left' } }}>
                  <thead><tr><th>#</th><th>Team</th><th>Cash</th><th>Property</th><th>Net worth</th></tr></thead>
                  <tbody>
                    {standings.map((r) => (
                      <tr key={r.id}>
                        <td>{r.rank}</td>
                        <td><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: r.color, marginRight: 6 }} />{r.name}{r.eliminated ? ' (eliminated)' : ''}</td>
                        <td>${r.cash}</td>
                        <td>${r.assets}</td>
                        <td><strong>${r.netWorth}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </Box>
                <Alert severity="info" sx={{ mb: 2 }}>Next: the post-game survey. Then send or download your results on the final screen.</Alert>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  {!activeCard.forced && <Button fullWidth variant="outlined" onClick={() => setModalOpen(false)}>BACK TO GAME</Button>}
                  <Button fullWidth variant="contained" color="success" onClick={() => handleEndGame(activeCard.reason)}>CONTINUE TO POST-SURVEY</Button>
                </Box>
              </>
            );
          })()}

          {activeCard?.type === 'MILESTONE' && modalStage === 'MILESTONE_INTRO' && (
            <>
              <Typography variant="h4" color="primary">{activeCard.data.name}</Typography>
              <Typography variant="body1" paragraph>Acquire Milestone? 5/6 correct required.</Typography>
              <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                <Button fullWidth variant="contained" onClick={() => startQuiz(activeCard.data, 'MILESTONE_ACQUIRE')}>START EXAM</Button>
                <Button fullWidth variant="outlined" onClick={() => { setModalOpen(false); passTurn(); }}>DECLINE</Button>
              </Box>
            </>
          )}

          {activeCard?.type === 'MILESTONE_CHALLENGE' && modalStage === 'MILESTONE_CHALLENGE_INTRO' && (
            <>
              <Typography variant="h4" color="error">⚠️ {LABELS.rivalMilestone}</Typography>
              <Typography variant="body1">Base fee: <strong>${board.find((t) => t.id === activeCard.data.id)?.baseRent}</strong></Typography>
              <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                <Button fullWidth variant="contained" color="warning" onClick={() => startQuiz(activeCard.data, 'MILESTONE_CHALLENGE')}>ACCEPT CHALLENGE</Button>
                <Button fullWidth variant="outlined" onClick={payMilestoneFee}>PAY FULL</Button>
              </Box>
            </>
          )}

          {modalStage === 'QUIZ_START' && quizState.active && quizState.mode !== 'GRANT' && (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                {/* NUMBERING */}
                <Typography variant="overline">Question {quizState.qIndex + 1} of {quizState.questions.length}</Typography>
                <Button size="small" color="error" onClick={() => finishQuiz(false)}>QUIT</Button>
              </Box>
              <LinearProgress variant="determinate" value={(quizState.qIndex / quizState.questions.length) * 100} sx={{ mb: 3 }} />
              
              {renderQuestion(quizState.questions[quizState.qIndex], handleQuizAnswer, {
                variant: 'h6', key: `quiz-${quizState.qIndex}`,
                reveal: quizState.waiting ? { ...quizState.result, response: quizState.selected } : null,
              })}

              {/* NEW: EXPLANATION + NEXT BUTTON */}
              {quizState.waiting && (
                 <Box sx={{ mt: 3, p: 2, bgcolor: 'action.hover', borderRadius: 2, borderLeft: `4px solid ${quizState.isCorrect ? THEME.success : THEME.danger}` }}>
                    <Typography variant="subtitle2" fontWeight="bold" color={quizState.isCorrect ? "success.main" : "error.main"}>
                        {quizState.isCorrect ? "Correct!" : "Incorrect"}
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        {quizState.questions[quizState.qIndex].explanation || "No explanation provided."}
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button variant="contained" onClick={handleNextQuestion}>
                            {quizState.qIndex < quizState.questions.length - 1 ? "NEXT QUESTION" : "FINISH EXAM"}
                        </Button>
                    </Box>
                 </Box>
              )}
            </>
          )}

          {modalStage === 'MILESTONE_SUCCESS' && (
            <>
              <Typography variant="h5" align="center" color="success.main">SUCCESS!</Typography>
              <Button fullWidth variant="contained" sx={{ mt: 3 }} onClick={passTurn}>CONTINUE</Button>
            </>
          )}

          {modalStage === 'MILESTONE_FAIL' && (
            <>
              <Typography variant="h5" align="center" color="error">FAILED</Typography>
              <Button fullWidth variant="contained" sx={{ mt: 3 }} onClick={passTurn}>CONTINUE</Button>
            </>
          )}

          {activeCard?.type === 'QUESTION' && modalStage === 'QUESTION' && (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">{LABELS.questionTitle} · {activeCard.data.type === 'property' ? activeCard.data.sub : activeCard.data.name}</Typography>
              </Box>
              <Divider sx={{ my: 2 }} />
              
              {renderQuestion(activeCard.q, handleAnswer)}
            </>
          )}

          {activeCard?.type === 'QUESTION' && modalStage === 'DECISION' && (
            <>
              <Typography variant="h5" color="success.main">✅ Correct!</Typography>
              {feedback && (
                <Box sx={{ mt: 1.5, mb: 2, p: 2, borderRadius: 2, bgcolor: 'action.hover', borderLeft: '4px solid', borderColor: 'success.main' }}>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{feedback}</Typography>
                </Box>
              )}
              <Divider />
              <Typography sx={{ my: 2 }}>{LABELS.buyPrompt(activeCard.data.price)}</Typography>
              {currentPlayer.money < activeCard.data.price && (
                <Alert severity="warning">Not enough cash: your team has ${currentPlayer.money}.</Alert>
              )}
              <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
                <Button fullWidth variant="contained" onClick={handleBuy} disabled={currentPlayer.money < activeCard.data.price}>{LABELS.buy.toUpperCase()}</Button>
                <Button fullWidth variant="outlined" onClick={passTurn}>SKIP</Button>
              </Box>
            </>
          )}

          {activeCard?.type === 'MSG' && modalStage === 'MSG' && (
            <>
              <Typography variant="h5" gutterBottom>{activeCard.data.name}</Typography>
              <Typography variant="body1">{activeCard.msg}</Typography>
              <Button fullWidth variant="contained" sx={{ mt: 3 }} onClick={passTurn}>CONTINUE</Button>
            </>
          )}

          {activeCard?.type === 'MISHAP' && modalStage === 'MISHAP' && (
            <>
              <Typography variant="h5" gutterBottom>🃏 {LABELS.chanceCard}</Typography>
              <Typography variant="body1">{activeCard.msg}</Typography>
              {activeCard.data.fact && <Alert severity="info" sx={{ mt: 2 }}><Typography variant="body2">{activeCard.data.fact}</Typography></Alert>}
              <Button fullWidth variant="contained" sx={{ mt: 3 }} onClick={passTurn}>CONTINUE</Button>
            </>
          )}

          {modalStage === 'FEEDBACK_INCORRECT' && activeCard?.type !== 'MISHAP' && activeCard?.type !== 'WIN' && (
            <>
              {(() => {
                const good = /^(Correct|Impressive|Chaos success)/.test(feedback || '');
                const bad = /^(Incorrect|Chaos failed|Quiz Failed)/.test(feedback || '');
                const [headline, ...rest] = (feedback || '').split('\n\n');
                return (
                  <>
                    <Typography variant="h5" color={good ? 'success.main' : bad ? 'error.main' : 'text.primary'}>
                      {good ? '✅ Correct!' : bad ? '❌ Not quite' : 'Notice'}
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 2, fontWeight: 700 }}>{headline}</Typography>
                    {rest.length > 0 && (
                      <Box sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: 'action.hover', borderLeft: '4px solid', borderColor: good ? 'success.main' : bad ? 'error.main' : 'divider' }}>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{rest.join('\n\n')}</Typography>
                      </Box>
                    )}
                  </>
                );
              })()}
              <Button fullWidth variant="contained" sx={{ mt: 3 }} onClick={passTurn}>CONTINUE</Button>
            </>
          )}

          {activeCard?.type === 'UPGRADE_OFFER' && (
            <>
              <Typography variant="h5">{LABELS.upgradeTitle}</Typography>
              <Button fullWidth variant="contained" onClick={handleUpgrade} sx={{ mt: 2 }}>{LABELS.upgrade.toUpperCase()}</Button>
              <Button fullWidth onClick={() => setModalOpen(false)} sx={{ mt: 1 }}>CANCEL</Button>
            </>
          )}

          {activeCard?.type === 'RENT_DEFENSE' && modalStage === 'QUESTION' && (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" sx={{ color: THEME.danger }}>Rent Due: ${activeCard.rent}</Typography>
              </Box>
              <Box sx={{ bgcolor: 'info.light', p: 2, borderRadius: 2, mb: 2 }}>
                <Typography variant="subtitle2" sx={{ color: 'info.main', fontWeight: 'bold' }}>{activeCard.payerName} (You) must answer!</Typography>
              </Box>
              <Divider sx={{ my: 2 }} />
              
              {renderQuestion(activeCard.q, handleRentChallengeAnswer, { imageMaxHeight: 200 })}
            </>
          )}

          {modalStage === 'CHAOS_SELECT' && activeCard?.type === 'CHAOS_SELECT' && (
            <>
              <Typography variant="h5" gutterBottom>Use Chaos Token</Typography>
              <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
                <Button variant="contained" color="secondary" onClick={handleBuyChaosToken}>BUY CHAOS TOKEN ($500)</Button>
              </Box>
              <Typography variant="body2" sx={{ mb: 2 }}>Or select a property to challenge (Cost: 1 Token).</Typography>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {chaosTargets(board, currentPlayer.id).map((t) => (
                  <Box key={t.id} sx={{ p: 1, mb: 1, display: 'flex', justifyContent: 'space-between', border: `1px solid ${t.color}`, borderRadius: 1 }}>
                    <div><strong>{t.name}</strong> ({t.sub})</div>
                    <Button size="small" variant="contained" onClick={() => handleSelectChaosTarget(t)}>CHALLENGE</Button>
                  </Box>
                ))}
              </div>
              <Button fullWidth sx={{ mt: 2 }} onClick={() => setModalOpen(false)}>CANCEL</Button>
            </>
          )}

          {modalStage === 'CHAOS_QUESTION' && activeCard?.type === 'CHAOS_CHALLENGE' && (
            <>
              <Typography variant="h6">Chaos Challenge</Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>Target: {activeCard.data?.name}</Typography>
              {renderQuestion(activeCard.q, handleChaosAnswer)}
            </>
          )}
        </Box>
      </Modal>

      <Modal open={manageOpen} onClose={() => setManageOpen(false)}>
        <Box sx={modalStyle}>
          <Typography variant="h5">{LABELS.upgrades}</Typography>
          <div style={{ maxHeight: '300px', overflowY: 'auto', marginTop: 10 }}>
            {board.map((tile) => {
              if (tile.owner === turn && tile.type === 'property') {
                const groupTiles = getSubgroupTiles(board, tile);
                const allOwned = groupTiles.every((t) => t.owner === turn);
                return (
                  <Box key={tile.id} sx={{ p: 1, mb: 1, display: 'flex', justifyContent: 'space-between', border: `1px solid ${tile.color}`, borderRadius: 1 }}>
                    <div><strong>{tile.name}</strong> ({tile.sub}) Lvl {tile.level}</div>
                    <Button size="small" variant="contained" disabled={!allOwned} onClick={() => { setActiveCard({ type: 'UPGRADE_OFFER', data: tile }); setManageOpen(false); setModalOpen(true); }}>UPGRADE</Button>
                  </Box>
                );
              }
              return null;
            })}
          </div>
          <Button fullWidth onClick={() => setManageOpen(false)} sx={{ mt: 2 }}>CLOSE</Button>
        </Box>
      </Modal>
    </Box>
  );
}
