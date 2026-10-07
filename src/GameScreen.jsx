// src/GameScreen.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MotionConfig, motion } from 'framer-motion';
import {
  Button,
  Modal,
  Box,
  Typography,
  Card,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { DEFAULT_CHANCE_CARDS } from './questionBank';
import { LABELS, teamDisplayName, money, signedMoney } from './labels';
import { matchesTopicAndModule } from './tsvBoardBuilder';
import { BOARD_SIZE } from './gameData';
import {
  getSubgroupTiles, getRentMultiplier, computeRent, rankPlayers, nextActivePlayer, activePlayers,
  ECONOMY, QUIZ_RULES, pickRandom, canUpgradeSubgroup, nextUpgradeLevel, upgradeCost, applyUpgrade,
  bankruptcyAction, downgradeSubgroup, sellDeed, releaseTiles, acquireTile, chaosStealCost, chaosFailPenalty, chaosTargets, chaosTokensForSale,
} from './gameRules';
import { prepareQuestion, checkAnswer, parseMishapAmount } from './questionFormats';
import { resolveImage } from './images';
import { pickQuestion, pickQuestions, recordAnswer } from './questionPicker';
import QuestionInput from './QuestionInput';
import Board from './components/Board';
import Dice from './components/Dice';
import TeamPanel from './components/TeamPanel';
import RulesDialog from './components/RulesDialog';
import { celebrate } from './components/confetti';
import { TEAM_COLORS, TEAM_SYMBOLS, TEAM_INK, SR_ONLY } from './theme';

// Ids for the game dialog's accessible name and the latest outcome (read with the next action).
const TITLE_ID = 'game-dialog-title';
const OUTCOME_ID = 'game-dialog-outcome';

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

const HOP_MS = 170; // pawn speed, per tile
const LANDING_PAUSE_MS = 400; // pause on the destination tile before its dialog opens

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
  history: [], // UI only: right/wrong per answered question
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
    ? boardData.map((t, i) => {
      const [owner = null, level = 0, paid] = resume.tiles[i] || [];
      return { ...t, owner, level, paid: owner == null ? 0 : paid ?? t.price };
    })
    : boardData));
  const [players, setPlayers, playersRef] = useLatestState(() => resume?.players ?? generatePlayers(playerCount));
  const [turn, setTurn, turnRef] = useLatestState(resume?.turn ?? (startingPlayerIndex || 0));
  const [totalTurns, setTotalTurns, totalTurnsRef] = useLatestState(resume?.totalTurns ?? 0);
  // Which questions were asked and missed (questionPicker.js): unseen first, missed ones again later.
  const [asked, setAsked, askedRef] = useLatestState(resume?.asked ?? {});
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
  // Result of the last answer or event: { tone: 'good'|'bad'|'neutral', title, detail, explanation, note }.
  const [feedback, setFeedback] = useState(null);
  // The question just answered, shown again with the answer revealed (UI only).
  const [lastAnswer, setLastAnswer] = useState(null);
  const [exitOpen, setExitOpen] = useState(false);
  // A new game opens with the quick rules; a resumed one doesn't.
  const [rulesOpen, setRulesOpen] = useState(() => !resume);
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
    setAsked((h) => recordAnswer(h, q, result.correct, totalTurnsRef.current));
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
      timestamp: new Date().toISOString(),
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
    const pool = pickQuestions(allBoardQuestions(), QUIZ_RULES.rescue.questions, askedRef.current, totalTurnsRef.current);
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
    setFeedback({ tone: 'good', title: LABELS.rescued, detail: `Your ${money(debt)} debt is cleared and you receive ${money(ECONOMY.rescueBonus)} to keep playing.`, note: "This was your team's only rescue: if you go bankrupt again, you are out." });
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
      questions: pickQuestions(source, rules.questions, askedRef.current, totalTurnsRef.current).map((q) => prepareQuestion(q)),
      targetScore: rules.pass, maxMistakes: rules.maxMistakes,
    });
    setLastAnswer(null);
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
      history: [...(prev.history || []), result.correct],
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
        setBoard((prev) => acquireTile(prev, tile, playerId, tile.price));
        setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, chaosTokens: p.chaosTokens + 1 } : p)));
        addLog(`${activePlayer().name} captured the ${tile.name} milestone!`);
        setModalStage('MILESTONE_SUCCESS');
      } else {
        addLog(`${activePlayer().name} didn't pass the ${tile.name} exam.`);
        setModalStage('MILESTONE_FAIL');
      }
    } else if (mode === 'MILESTONE_CHALLENGE') {
      const baseRent = tile.baseRent || 0;
      const fee = passed ? Math.floor(baseRent / 2) : baseRent;
      handleTransaction(playerId, -fee, { action: passed ? 'MILESTONE_CHALLENGE_SUCCESS' : 'MILESTONE_CHALLENGE_FAIL', tileId: tile.id, tileName: tile.name });
      if (owner != null) handleTransaction(owner, fee, { action: 'MILESTONE_RENT_RECEIVED', tileId: tile.id, tileName: tile.name });
      setFeedback(passed
        ? { tone: 'good', title: 'Exam passed!', detail: `You pay only half the milestone fee: ${money(fee)}.` }
        : { tone: 'bad', title: 'Exam not passed', detail: `You pay the full milestone fee: ${money(fee)}.` });
      addLog(`${activePlayer().name} paid ${money(fee)} on the ${tile.name} milestone.`);
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
    setLastAnswer(null);

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
      const q = prepareQuestion(pickQuestion(tile.questions, askedRef.current, totalTurnsRef.current));
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
      addLog(`${LABELS.chanceCard} for ${p.name}${amount ? ` (${signedMoney(amount)})` : ''}.`);
      openCard({ type: 'MISHAP', data: { ...tile, fact: card.fact || null }, msg: card.msg, amount }, 'MISHAP');
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
    setLastAnswer({ q, response, result });
    if (result.correct) {
      setFeedback({ tone: 'good', title: 'Correct!', explanation: q.explanation || '' });
      setModalStage('DECISION');
    } else {
      setFeedback({ tone: 'bad', title: 'Not quite', detail: `That costs your team ${money(ECONOMY.wrongAnswerPenalty)}.`, explanation: q.explanation || '' });
      handleTransaction(turnRef.current, -ECONOMY.wrongAnswerPenalty, { action: 'QUESTION_PENALTY', tileId: tile.id, tileName: tile.name, notes: 'Incorrect on acquisition question' });
      setModalStage('FEEDBACK_INCORRECT');
    }
  };

  const handleBuy = () => {
    const tile = activeCard.data;
    if (activePlayer().money < tile.price) { alert('Insufficient funds!'); return; }
    handleTransaction(turnRef.current, -tile.price, { action: 'BUY_PROPERTY', tileId: tile.id, tileName: tile.name });
    setBoard((prev) => acquireTile(prev, tile, turnRef.current, tile.price));
    addLog(`${activePlayer().name} bought ${tile.type === 'property' ? tile.sub : tile.name} for ${money(tile.price)}.`);
    passTurn();
  };

  // Rival's tile: a right answer halves the rent.
  const handleRentChallengeAnswer = (response) => {
    const { q, data: tile, rent, payerId, ownerId } = activeCard;
    const result = checkAnswer(q, response);
    logAnswer('RENT_Q', q, result, { tileId: tile.id, tileName: tile.name });
    const rentToPay = result.correct ? Math.floor(rent / 2) : rent;
    const ownerName = activeCard.ownerName;
    setLastAnswer({ q, response, result });
    setFeedback(result.correct
      ? { tone: 'good', title: 'Correct: half rent!', detail: `You pay ${money(rentToPay)} to ${ownerName} instead of ${money(rent)}.`, explanation: q.explanation || '' }
      : { tone: 'bad', title: 'Not quite: full rent', detail: `You pay ${money(rentToPay)} to ${ownerName}.`, explanation: q.explanation || '' });
    addLog(`${activeCard.payerName} paid ${money(rentToPay)} rent to ${ownerName}.`);
    handleTransaction(payerId, -rentToPay, { action: 'RENT_PAYMENT', tileId: tile.id, tileName: tile.name });
    if (ownerId != null) handleTransaction(ownerId, rentToPay, { action: 'RENT_RECEIVED', tileId: tile.id, tileName: tile.name });
    setModalStage('FEEDBACK_INCORRECT');
  };

  // Autosave between turns only: a refresh in the middle of a turn returns to its start.
  useEffect(() => {
    if (!onSnapshot || isMoving || modalOpen || manageOpen || turnInProgressRef.current) return;
    onSnapshot({ tiles: board.map((t) => [t.owner ?? null, t.level || 0, t.paid || 0]), players, turn, totalTurns, logs, logRows, dice, endsAt, asked });
  }, [onSnapshot, board, players, turn, totalTurns, logs, logRows, dice, endsAt, asked, isMoving, modalOpen, manageOpen]);

  // ------------------------------------------------------------------
  //  CHAOS CHALLENGE (spend a token to try to steal a rival's property)
  // ------------------------------------------------------------------
  const openChaosSelect = () => {
    setFeedback(null);
    setLastAnswer(null);
    openCard({ type: 'CHAOS_SELECT' }, 'CHAOS_SELECT');
  };

  const handleSelectChaosTarget = (tile) => {
    if (activePlayer().chaosTokens <= 0) { alert('No chaos tokens available.'); return; }
    // Duel on the target tile's own questions (fallback: any board question).
    const pool = tile.questions?.length ? tile.questions : allBoardQuestions();
    if (pool.length === 0) { alert('This question file has no questions for a Chaos challenge.'); return; }
    setActiveCard({ type: 'CHAOS_CHALLENGE', data: tile, q: prepareQuestion(pickQuestion(pool, askedRef.current, totalTurnsRef.current)), ownerId: tile.owner });
    setModalStage('CHAOS_QUESTION');
  };

  const handleChaosAnswer = (response) => {
    const { q } = activeCard;
    const player = activePlayer();
    const tile = boardRef.current[activeCard.data.id];
    const result = checkAnswer(q, response);
    logAnswer('CHAOS_Q', q, result, { tileId: tile.id, tileName: tile.name });
    setLastAnswer({ q, response, result });
    const ownerName = playersRef.current[tile.owner]?.name || LABELS.rivalTeam;
    setPlayers((prev) => prev.map((p) => (p.id === player.id ? { ...p, chaosTokens: Math.max(0, p.chaosTokens - 1) } : p)));

    if (result.correct) {
      const cost = chaosStealCost(tile);
      // The token is spent either way (no refund); the Challenge button is disabled when the team can't pay.
      if (player.money < cost) { setFeedback({ tone: 'neutral', title: 'Correct, but not enough cash', detail: `Taking this tile costs ${money(cost)} and your team has ${money(player.money)}. The token is used up.`, explanation: q.explanation || '' }); setModalStage('FEEDBACK_INCORRECT'); return; }
      handleTransaction(player.id, -cost, { action: 'CHAOS_STEAL', tileId: tile.id, tileName: tile.name });
      if (tile.owner != null) handleTransaction(tile.owner, cost, { action: 'CHAOS_SELL', tileId: tile.id, tileName: tile.name });
      setBoard((prev) => acquireTile(prev, tile, player.id, cost));
      setFeedback({ tone: 'good', title: 'Chaos success!', detail: `You take ${tile.sub || tile.name} from ${ownerName} for ${money(cost)}.`, explanation: q.explanation || '' });
      addLog(`${player.name} took ${tile.sub || tile.name} from ${ownerName} with a chaos token.`);
    } else {
      const penalty = chaosFailPenalty(tile);
      handleTransaction(player.id, -penalty, { action: 'CHAOS_FAIL', tileId: tile.id, tileName: tile.name });
      setFeedback({ tone: 'bad', title: 'Chaos challenge failed', detail: `Penalty: ${money(penalty)}.`, explanation: q.explanation || '' });
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
    addLog(`${activePlayer().name} upgraded ${tile.sub} to level ${level}.`);
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
    if (modalStage === 'MILESTONE_SUCCESS') celebrate(playersRef.current[turnRef.current]?.color);
  }, [modalOpen, modalStage, players.length, playersRef, turnRef]);

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
      <Typography component="p" sx={{ mb: 2, fontWeight: 800, fontSize: '1.15rem', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{q.prompt}</Typography>
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
  // The answered question again, locked, with the right answer marked.
  const renderAnswered = () => lastAnswer && renderQuestion(lastAnswer.q, () => {}, {
    key: `answered-${lastAnswer.q.id || lastAnswer.q.prompt}`,
    reveal: { ...lastAnswer.result, response: lastAnswer.response },
    imageMaxHeight: 160,
  });

  const title = module || bigTopic || 'Science Around the Board';
  const inDebt = currentPlayer.money < 0;
  // In debt (only possible with a game saved by an older version), Roll opens the debt dialog.
  const rollLabel = timeUp ? "Time's up" : isMoving ? 'Moving…' : (inDebt ? 'Settle debt' : `Roll — ${currentPlayer.name}`);
  const tileLabel = (t) => (t?.type === 'property' ? t.sub : t?.name) || '';
  const ownerName = (id) => (id === 99 || id == null ? LABELS.rivalTeam : players[id]?.name || LABELS.rivalTeam);

  // Upgrade groups the current team owns at least one tile of.
  const ownedGroups = (() => {
    const seen = new Map();
    board.forEach((t) => { if (t.type === 'property' && t.owner === turn && !seen.has(`${t.group}|${t.sub}`)) seen.set(`${t.group}|${t.sub}`, t); });
    return [...seen.values()].map((t) => {
      const groupTiles = getSubgroupTiles(board, t);
      const owned = groupTiles.filter((g) => g.owner === turn).length;
      const full = owned === groupTiles.length;
      const level = t.level || 0;
      const next = nextUpgradeLevel(board, t);
      const canLevel = full && next > level;
      const cost = canLevel ? upgradeCost(t, next) : 0;
      return { tile: t, size: groupTiles.length, owned, full, level, next, canLevel, cost };
    });
  })();
  // Rent of `tile` on a board where `change` has been applied to it (or to its group).
  const rentIf = (tile, change, wholeGroup = false) => {
    const hypo = board.map((t) => {
      const hit = wholeGroup ? (t.type === 'property' && t.group === tile.group && t.sub === tile.sub) : t.id === tile.id;
      return hit ? { ...t, ...change } : t;
    });
    return computeRent(hypo, hypo[tile.id]);
  };
  const quizTile = quizState.tile;
  const dialogTile = activeCard?.data || (['QUIZ_START', 'MILESTONE_SUCCESS', 'MILESTONE_FAIL'].includes(modalStage) ? quizTile : null);
  const showDialogTop = !['STANDINGS', 'WIN', 'ELIMINATED'].includes(modalStage) && !['STANDINGS', 'WIN', 'ELIMINATED'].includes(activeCard?.type);

  const resultHeading = () => {
    if (activeCard?.type === 'RENT_DEFENSE') return `Rent due · ${tileLabel(activeCard.data)}`;
    if (activeCard?.type === 'CHAOS_CHALLENGE') return `Chaos challenge · ${tileLabel(activeCard.data)}`;
    return `${LABELS.questionTitle} · ${tileLabel(activeCard?.data)}`;
  };

  return (
    <MotionConfig reducedMotion="user">
    <Box sx={{ bgcolor: 'background.default', color: 'text.primary', minHeight: '100vh', px: { xs: 1, md: 3 }, py: 2 }}>
      <Box component="header" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between', alignItems: 'center', maxWidth: 1500, mx: 'auto', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}><span aria-hidden>🎲 </span>Science Around the Board</Typography>
          <Chip label={`Turn ${totalTurns}`} size="small" color="primary" />
          {endsAt && (
            <Chip
              label={timeUp ? "Time's up" : `⏱ ${formatClock(timeLeftMs)}`}
              size="small"
              color={timeUp ? 'error' : timeLeftMs <= 5 * 60000 ? 'warning' : 'default'}
              aria-label={timeUp ? "Time's up" : `Time remaining ${formatClock(timeLeftMs)}`}
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="text" onClick={() => setRulesOpen(true)} startIcon={<span aria-hidden>📖</span>}>{LABELS.howToPlay}</Button>
          <Button variant="outlined" color="warning" disabled={isMoving} onClick={() => openStandings(false, 'ended')}>End game</Button>
          <Button variant="text" color="error" onClick={() => setExitOpen(true)}>Exit session</Button>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start', gap: { xs: 2, md: 2.5 }, maxWidth: 1500, mx: 'auto' }}>
        <Box sx={{ flex: '1 1 640px', display: 'flex', justifyContent: 'center', maxWidth: 1000, minWidth: 0 }}>
          <Board board={board} players={players} onTileHover={handleTileHover} onTileLeave={clearHover}>
            <Typography component="h2" sx={{ fontFamily: '"Fredoka", sans-serif', fontWeight: 600, fontSize: 'max(18px, 3.2cqw)', lineHeight: 1.1, textAlign: 'center', textWrap: 'balance' }}>{title}</Typography>
            {module && bigTopic && <Typography sx={{ fontSize: 'max(12px, 1.5cqw)', color: 'text.secondary', fontWeight: 700, mt: '-0.8cqw' }}>{bigTopic}</Typography>}

            <Box aria-live="polite" sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 0.75, pr: 2, py: 0.6, borderRadius: 99, bgcolor: 'background.paper', boxShadow: 1, border: '2px solid', borderColor: currentPlayer.color }}>
              <TeamDot player={currentPlayer} size={26} />
              <Typography sx={{ fontWeight: 800 }}>{currentPlayer.name}'s turn</Typography>
              <Typography sx={{ fontWeight: 700, color: inDebt ? 'error.main' : 'text.secondary' }}>· {money(currentPlayer.money)}</Typography>
            </Box>

            <Dice values={dice} rollId={rollId} />

            <Button
              variant="contained"
              size="large"
              onClick={handleRoll}
              disabled={timeUp}
              aria-disabled={isMoving || undefined}
              sx={{
                bgcolor: TEAM_INK[currentPlayer.id], color: 'common.white', px: 5, py: 1.25, fontSize: '1.15rem', boxShadow: 3, minWidth: 220,
                '&:hover': { bgcolor: TEAM_INK[currentPlayer.id], filter: 'brightness(1.12)' },
                ...(isMoving ? { opacity: 0.75, cursor: 'progress' } : {}),
              }}
            >
              {rollLabel}
            </Button>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button variant="outlined" disabled={isMoving} onClick={openLabManager} startIcon={<span aria-hidden>⭐</span>}>{LABELS.upgrades}</Button>
              <Button variant="outlined" color="secondary" disabled={isMoving} onClick={openChaosSelect} startIcon={<span aria-hidden>⚡</span>}>
                Chaos tokens: {currentPlayer.chaosTokens}
              </Button>
            </Box>

            <Box sx={{ minHeight: '7cqw', width: '80%', maxWidth: 420 }}>
              {hoverTile ? (
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'background.paper', borderLeft: `6px solid ${hoverTile.color}`, boxShadow: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>{hoverTile.type === 'property' ? `${hoverTile.sub} · ${hoverTile.name}` : hoverTile.name}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {LABELS.tileTypes[hoverTile.type] || hoverTile.type}
                    {hoverTile.price > 0 && ` · ${money(hoverTile.price)}`}
                    {hoverTile.owner != null ? ` · Owner: ${ownerName(hoverTile.owner)}` : (hoverTile.price > 0 ? ' · For sale' : '')}
                  </Typography>
                  {(hoverTile.type === 'property' || hoverTile.type === 'sequencing_core') && hoverTile.owner != null && (
                    <Typography variant="caption" sx={{ display: 'block' }}>
                      Rent now: <strong>{money(hoverTile.rent)}</strong> (base {money(hoverTile.baseRent)} × {hoverTile.multiplier.toFixed(1)}{hoverTile.level ? `, level ${hoverTile.level}` : ''})
                    </Typography>
                  )}
                </Box>
              ) : (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
                  Hover over or tab to a tile for details. New here? <Box component="button" type="button" onClick={() => setRulesOpen(true)} sx={{ font: 'inherit', color: 'primary.main', textDecoration: 'underline', background: 'none', border: 0, p: 0, cursor: 'pointer' }}>See how to play</Box>.
                </Typography>
              )}
            </Box>
            <Typography sx={{ fontSize: 'max(11px, 1.1cqw)', color: 'text.secondary' }}>© Hans Ghezzi · Science Around the Board</Typography>
          </Board>
        </Box>

        <Box component="aside" aria-label="Teams and game log" sx={{ flex: '1 1 260px', maxWidth: { lg: 380 }, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 2, alignItems: 'start' }}>
          <TeamPanel players={players} board={board} turn={turn} moneyFloats={moneyFloats} />
          <Card sx={{ p: 2 }}>
            <Typography variant="overline" component="h2" color="text.secondary" sx={{ fontWeight: 800 }}>Game log</Typography>
            <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, maxHeight: 260, overflowY: 'auto', fontSize: '0.85rem', color: 'text.secondary' }}>
              {logs.map((l, i) => (
                <Box component="li" key={i} sx={{ py: 0.6, borderBottom: '1px solid', borderColor: 'divider', color: i === 0 ? 'text.primary' : undefined, fontWeight: i === 0 ? 700 : 400 }}>{l}</Box>
              ))}
            </Box>
          </Card>
        </Box>
      </Box>

      <Modal open={modalOpen} disableEscapeKeyDown>
        <Box role="dialog" aria-modal="true" aria-labelledby={TITLE_ID} sx={{ ...modalStyle, ...(dialogTile?.color ? { borderTopColor: dialogTile.color } : {}) }}>
          {showDialogTop && <DialogTop tile={dialogTile} player={currentPlayer} />}

          {activeCard?.type === 'LIQUIDATION' && modalStage === 'LIQUIDATION' && (() => {
            const rows = [];
            const groupsSeen = new Set();
            activeCard.assets.forEach((a) => {
              const t = board.find((b) => b.id === a.id) || a;
              if (t.level > 0) {
                const key = `${t.group}|${t.sub}`;
                if (groupsSeen.has(key)) return;
                groupsSeen.add(key);
                const n = getSubgroupTiles(board, t).length;
                rows.push({ t, kind: 'downgrade', value: downgradeSubgroup(board, t, currentPlayer.id).refund, n });
              } else rows.push({ t, kind: 'sell', value: sellDeed(board, t).value });
            });
            return (
              <>
                <Typography id={TITLE_ID} variant="h4" component="h2" color="error" gutterBottom>{LABELS.outOfMoney}</Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', p: 1.5, mb: 2, borderRadius: 2, bgcolor: 'error.light' }}>
                  <Typography sx={{ fontWeight: 800 }}>Cash: <Box component="span" sx={{ color: 'error.main' }}>{money(currentPlayer.money)}</Box></Typography>
                  <Typography>Raise <strong>{money(Math.max(0, -currentPlayer.money))}</strong> to get back to $0 and end your turn.</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Sell a tile for half its price, or remove one upgrade level from a whole colour group for half its upgrade cost.</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {rows.map(({ t, kind, value, n }) => (
                    <Box key={t.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.25, border: '1px solid', borderColor: 'divider', borderLeft: `6px solid ${t.color}`, borderRadius: 2 }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800 }}>{tileLabel(t)}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {t.type === 'property' ? t.group : LABELS.tileTypes[t.type]}
                          {kind === 'downgrade' ? ` · ${n} tiles · level ${t.level}` : ` · bought for ${money(t.price)}`}
                        </Typography>
                      </Box>
                      <Button variant="contained" color="error" onClick={() => handleSellAsset(t)} sx={{ flexShrink: 0 }}>
                        {kind === 'downgrade' ? 'Downgrade group' : 'Sell deed'} {signedMoney(value)}
                      </Button>
                    </Box>
                  ))}
                </Box>
              </>
            );
          })()}

          {activeCard?.type === 'GRANT' && modalStage === 'GRANT_INTRO' && (
            <>
              <Typography id={TITLE_ID} variant="h4" component="h2" color="error" gutterBottom><span aria-hidden>🛟 </span>{LABELS.bankrupt}</Typography>
              <Typography sx={{ mb: 1.5 }}>
                Your team is <strong>{money(activeCard.debt)}</strong> in debt, and selling everything still wouldn't cover it.
              </Typography>
              <Typography sx={{ mb: 2 }}>
                One last chance: the <strong>{LABELS.rescueQuiz}</strong>. Answer <strong>2 of 3</strong> questions correctly and your debt is cleared, plus {money(ECONOMY.rescueBonus)} to keep playing.
              </Typography>
              <Alert severity="warning" sx={{ mb: 3 }}>
                Each team gets <strong>one</strong> rescue per game. If you don't pass, or you go bankrupt again later, your team is out and its tiles return to the bank.
              </Alert>
              <Button fullWidth size="large" variant="contained" autoFocus onClick={startGrantExam}>Start the rescue quiz</Button>
            </>
          )}

          {modalStage === 'GRANT_QUIZ' && quizState.active && (
            <>
              <QuizProgress title={LABELS.rescueQuiz} quiz={quizState} need={quizState.targetScore} rescue />
              {renderQuestion(quizState.questions[quizState.qIndex], handleQuizAnswer, {
                key: `grant-${quizState.qIndex}`,
                reveal: quizState.waiting ? { ...quizState.result, response: quizState.selected } : null,
              })}
              {quizState.waiting && (
                <OutcomePanel feedback={{ tone: quizState.isCorrect ? 'good' : 'bad', title: quizState.isCorrect ? 'Correct!' : 'Not quite', explanation: quizState.questions[quizState.qIndex].explanation || '' }}>
                  <Button fullWidth size="large" variant="contained" autoFocus aria-describedby={OUTCOME_ID} onClick={handleNextQuestion}>
                    {quizState.qIndex < quizState.questions.length - 1 ? 'Next question' : 'Finish quiz'}
                  </Button>
                </OutcomePanel>
              )}
            </>
          )}

          {modalStage === 'GRANT_RESULT' && (
            <OutcomePanel feedback={feedback} titleId={TITLE_ID} big>
              <Button fullWidth size="large" variant="contained" autoFocus onClick={passTurn}>Keep playing</Button>
            </OutcomePanel>
          )}

          {activeCard?.type === 'WIN' && modalStage === 'WIN' && (() => {
            const winner = activePlayers(players)[0];
            return (
              <Box sx={{ textAlign: 'center', py: 1 }}>
                <motion.div initial={{ scale: 0.3, rotate: -15 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 12 }}>
                  <Box aria-hidden sx={{ fontSize: 84, lineHeight: 1 }}>🏆</Box>
                </motion.div>
                <Typography id={TITLE_ID} variant="h3" component="h2" color="primary" sx={{ mt: 1 }}>Victory!</Typography>
                {winner && (
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mt: 1.5, px: 2, py: 0.75, borderRadius: 99, border: '2px solid', borderColor: winner.color }}>
                    <TeamDot player={winner} size={28} />
                    <Typography variant="h6" component="p">{winner.name}</Typography>
                  </Box>
                )}
                <Typography sx={{ mt: 1.5 }}>{activeCard.msg}</Typography>
                <Button fullWidth size="large" variant="contained" autoFocus sx={{ mt: 3 }} onClick={() => openStandings(true, 'last_standing')}>See final standings</Button>
              </Box>
            );
          })()}

          {activeCard?.type === 'ELIMINATED' && modalStage === 'ELIMINATED' && (
            <>
              <Typography id={TITLE_ID} variant="h4" component="h2" color="error" gutterBottom>{LABELS.eliminated}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, color: 'text.secondary' }}>
                {players[activeCard.playerId] && <TeamDot player={players[activeCard.playerId]} />}
                <Typography sx={{ fontWeight: 800, textDecoration: 'line-through' }}>{activeCard.name}</Typography>
              </Box>
              <Typography sx={{ mb: 1 }}>
                <strong>{activeCard.name}</strong> could not cover its debts and is out of the game. Its tiles return to the bank, ready to be bought again.
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Reason: {activeCard.reason}.</Typography>
              <Button fullWidth size="large" variant="contained" autoFocus onClick={continueAfterElimination}>Continue</Button>
            </>
          )}

          {activeCard?.type === 'STANDINGS' && modalStage === 'STANDINGS' && (() => {
            const standings = rankPlayers(players, board);
            const leader = standings[0];
            const tied = standings.filter((r) => !r.eliminated && r.netWorth === leader?.netWorth);
            const reasonText = {
              time: "Time's up! The team with the highest net worth (cash + tile value) wins.",
              last_standing: 'Last team standing!',
              eliminated: 'No teams remain.',
              ended: 'Ending the game now ranks teams by net worth (cash + tile value).',
            }[activeCard.reason];
            const medal = ['🥇', '🥈', '🥉'];
            return (
              <>
                <Typography id={TITLE_ID} variant="h4" component="h2" gutterBottom>Final Standings</Typography>
                <Typography sx={{ mb: 2 }}>{reasonText}</Typography>
                {players.length > 1 && leader && !leader.eliminated && (
                  <Alert severity="success" icon={<span aria-hidden>🏆</span>} sx={{ mb: 2, fontWeight: 700 }}>
                    {tied.length > 1 ? `It's a tie: ${tied.map((t) => t.name).join(' & ')}` : `${leader.name} wins`} with a net worth of {money(leader.netWorth)}.
                  </Alert>
                )}
                <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', mb: 2, '& td, & th': { p: 1, borderBottom: '1px solid', borderColor: 'divider', textAlign: 'right' }, '& th': { fontSize: '0.85rem', color: 'text.secondary' }, '& td:nth-of-type(2), & th:nth-of-type(2)': { textAlign: 'left' } }}>
                  <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Final standings by net worth</caption>
                  <thead><tr><th scope="col">Rank</th><th scope="col">Team</th><th scope="col">Cash</th><th scope="col">Tiles</th><th scope="col">Net worth</th></tr></thead>
                  <tbody>
                    {standings.map((r) => (
                      <Box component="tr" key={r.id} sx={{ bgcolor: r.rank === 1 && !r.eliminated && players.length > 1 ? 'action.selected' : undefined, color: r.eliminated ? 'text.secondary' : undefined }}>
                        <td><span aria-hidden>{!r.eliminated && players.length > 1 ? `${medal[r.rank - 1] || ''} ` : ''}</span>{r.rank}</td>
                        <td>
                          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                            <TeamDot player={players[r.id]} size={20} />
                            <strong>{r.name}</strong>{r.eliminated ? ' (eliminated)' : ''}
                          </Box>
                        </td>
                        <td>{money(r.cash)}</td>
                        <td>{money(r.assets)}</td>
                        <td><strong>{money(r.netWorth)}</strong></td>
                      </Box>
                    ))}
                  </tbody>
                </Box>
                <Alert severity="info" sx={{ mb: 2 }}>Next: the post-game survey. Then send or download your results on the final screen.</Alert>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  {!activeCard.forced && <Button sx={{ flex: '1 1 160px' }} size="large" variant="outlined" onClick={() => setModalOpen(false)}>Back to game</Button>}
                  <Button sx={{ flex: '1 1 220px' }} size="large" variant="contained" color="success" autoFocus onClick={() => handleEndGame(activeCard.reason)}>Continue to post-survey</Button>
                </Box>
              </>
            );
          })()}

          {activeCard?.type === 'MILESTONE' && modalStage === 'MILESTONE_INTRO' && (
            <>
              <Typography id={TITLE_ID} variant="h4" component="h2" color="primary"><span aria-hidden>🏆 </span>{activeCard.data.name} milestone</Typography>
              <Typography sx={{ mt: 1, mb: 2 }}>This corner is free. Capture it by passing a 6-question exam.</Typography>
              <Box component="ul" sx={{ m: 0, mb: 2, pl: 2.5, '& li': { mb: 0.75 } }}>
                <li>Get <strong>5 of 6</strong> right. Your second mistake ends the exam.</li>
                <li>Pass: pay <strong>{money(activeCard.data.price)}</strong>, own the corner (rivals pay {money(activeCard.data.baseRent)} when they land) and earn a <strong>⚡ {LABELS.chaosToken.toLowerCase()}</strong>.</li>
                <li>Don't pass: nothing is charged.</li>
              </Box>
              <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                <Button fullWidth size="large" variant="contained" autoFocus onClick={() => startQuiz(activeCard.data, 'MILESTONE_ACQUIRE')}>Start exam</Button>
                <Button fullWidth size="large" variant="outlined" onClick={() => { setModalOpen(false); passTurn(); }}>Decline</Button>
              </Box>
            </>
          )}

          {activeCard?.type === 'MILESTONE_CHALLENGE' && modalStage === 'MILESTONE_CHALLENGE_INTRO' && (() => {
            const fee = board.find((t) => t.id === activeCard.data.id)?.baseRent || 0;
            return (
              <>
                <Typography id={TITLE_ID} variant="h4" component="h2" color="error"><span aria-hidden>⚠️ </span>{LABELS.rivalMilestone}</Typography>
                <Typography sx={{ mt: 1, mb: 2 }}>
                  <strong>{ownerName(activeCard.ownerId)}</strong> owns {activeCard.data.name}. The landing fee is <strong>{money(fee)}</strong>.
                </Typography>
                <Stakes good={`pass the 6-question exam (5 right) and pay half: ${money(Math.floor(fee / 2))}.`} bad={`fail it and pay the full ${money(fee)}.`} />
                <Box sx={{ mt: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Button sx={{ flex: '1 1 200px' }} size="large" variant="contained" color="warning" autoFocus onClick={() => startQuiz(activeCard.data, 'MILESTONE_CHALLENGE')}>Accept challenge</Button>
                  <Button sx={{ flex: '1 1 200px' }} size="large" variant="outlined" onClick={payMilestoneFee}>Pay full fee ({money(fee)})</Button>
                </Box>
              </>
            );
          })()}

          {modalStage === 'QUIZ_START' && quizState.active && quizState.mode !== 'GRANT' && (
            <>
              <QuizProgress
                title={`Milestone exam · ${quizTile?.name || ''}`}
                quiz={quizState}
                need={quizState.targetScore}
                onQuit={quizState.waiting ? null : () => finishQuiz(false)}
              />
              {renderQuestion(quizState.questions[quizState.qIndex], handleQuizAnswer, {
                key: `quiz-${quizState.qIndex}`,
                reveal: quizState.waiting ? { ...quizState.result, response: quizState.selected } : null,
              })}
              {quizState.waiting && (() => {
                const over = quizState.mistakes >= quizState.maxMistakes;
                const last = quizState.qIndex >= quizState.questions.length - 1;
                return (
                  <OutcomePanel feedback={{
                    tone: quizState.isCorrect ? 'good' : 'bad',
                    title: quizState.isCorrect ? 'Correct!' : 'Not quite',
                    detail: over ? 'That was your second mistake, so the exam ends here.' : (!quizState.isCorrect ? 'One mistake used. One more ends the exam.' : ''),
                    explanation: quizState.questions[quizState.qIndex].explanation || '',
                  }}>
                    <Button fullWidth size="large" variant="contained" autoFocus aria-describedby={OUTCOME_ID} onClick={handleNextQuestion}>
                      {over || last ? 'Finish exam' : 'Next question'}
                    </Button>
                  </OutcomePanel>
                );
              })()}
            </>
          )}

          {modalStage === 'MILESTONE_SUCCESS' && (
            <Box sx={{ textAlign: 'center' }}>
              <motion.div initial={{ scale: 0.3 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 12 }}>
                <Box aria-hidden sx={{ fontSize: 72, lineHeight: 1 }}>🏆</Box>
              </motion.div>
              <Typography id={TITLE_ID} variant="h4" component="h2" color="success.main" sx={{ mt: 1 }}>Milestone captured!</Typography>
              <Typography sx={{ mt: 1 }}>
                {quizState.score} of {quizState.questions.length} correct. <strong>{currentPlayer.name}</strong> now owns {quizTile?.name} ({signedMoney(-(quizTile?.price || 0))}) and earns a ⚡ {LABELS.chaosToken.toLowerCase()}.
              </Typography>
              <Button fullWidth size="large" variant="contained" autoFocus sx={{ mt: 3 }} onClick={passTurn}>Continue</Button>
            </Box>
          )}

          {modalStage === 'MILESTONE_FAIL' && (
            <Box sx={{ textAlign: 'center' }}>
              <Typography id={TITLE_ID} variant="h4" component="h2" color="error" sx={{ mt: 1 }}>Exam not passed</Typography>
              <Typography sx={{ mt: 1 }}>
                {quizState.score} of {quizState.questions.length} correct (you needed {quizState.targetScore}). Nothing is charged: try again next time you land here.
              </Typography>
              <Button fullWidth size="large" variant="contained" autoFocus sx={{ mt: 3 }} onClick={passTurn}>Continue</Button>
            </Box>
          )}

          {activeCard?.type === 'QUESTION' && modalStage === 'QUESTION' && (
            <>
              <Typography id={TITLE_ID} variant="h5" component="h2" sx={{ mb: 1.5 }}>{LABELS.questionTitle} · {tileLabel(activeCard.data)}</Typography>
              <Stakes good={`you may buy this tile for ${money(activeCard.data.price)}.`} bad={`your team pays ${money(ECONOMY.wrongAnswerPenalty)}.`} />
              {renderQuestion(activeCard.q, handleAnswer)}
            </>
          )}

          {activeCard?.type === 'QUESTION' && modalStage === 'DECISION' && (() => {
            const tile = activeCard.data;
            const canAfford = currentPlayer.money >= tile.price;
            const rentWhenOwned = rentIf(tile, { owner: currentPlayer.id });
            return (
              <>
                <Typography id={TITLE_ID} variant="h5" component="h2" sx={{ mb: 1.5 }}>{LABELS.questionTitle} · {tileLabel(tile)}</Typography>
                {renderAnswered()}
                <OutcomePanel feedback={feedback}>
                  <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
                    <Typography sx={{ fontWeight: 800, fontSize: '1.1rem' }}>{LABELS.buyPrompt(tile.price)}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      Your team has {money(currentPlayer.money)}{canAfford ? `, leaving ${money(currentPlayer.money - tile.price)}` : ''}.
                      {' '}Rivals who land here would pay {money(rentWhenOwned)}{tile.type === 'property' ? ', more once you own the whole colour group' : ''}.
                    </Typography>
                    {!canAfford && <Alert severity="warning" sx={{ mt: 1.5 }}>Not enough cash to buy this tile.</Alert>}
                    <Box sx={{ display: 'flex', gap: 1.5, mt: 2 }}>
                      <Button fullWidth size="large" variant="contained" autoFocus={canAfford} aria-describedby={OUTCOME_ID} onClick={handleBuy} disabled={!canAfford}>{LABELS.buy} for {money(tile.price)}</Button>
                      <Button fullWidth size="large" variant="outlined" autoFocus={!canAfford} onClick={passTurn}>{LABELS.skip}</Button>
                    </Box>
                  </Box>
                </OutcomePanel>
              </>
            );
          })()}

          {activeCard?.type === 'MSG' && modalStage === 'MSG' && (
            <>
              <Typography id={TITLE_ID} variant="h5" component="h2" gutterBottom>{tileLabel(activeCard.data)}</Typography>
              <Typography sx={{ fontSize: '1.1rem' }}>{activeCard.msg}</Typography>
              <Button fullWidth size="large" variant="contained" autoFocus sx={{ mt: 3 }} onClick={passTurn}>Continue</Button>
            </>
          )}

          {activeCard?.type === 'MISHAP' && modalStage === 'MISHAP' && (
            <Box sx={{ textAlign: 'center' }}>
              <motion.div initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ duration: 0.45 }}>
                <Box aria-hidden sx={{ fontSize: 56, lineHeight: 1 }}>🃏</Box>
                <Typography id={TITLE_ID} variant="h4" component="h2" sx={{ mt: 1 }}>{LABELS.chanceCard}</Typography>
                <Typography sx={{ mt: 1.5, fontSize: '1.15rem', fontWeight: 700 }}>{activeCard.msg}</Typography>
                {activeCard.amount ? (
                  <Box sx={{ display: 'inline-block', mt: 2, px: 2.5, py: 0.75, borderRadius: 99, fontWeight: 900, fontSize: '1.4rem', bgcolor: activeCard.amount > 0 ? 'success.light' : 'error.light', color: activeCard.amount > 0 ? 'success.main' : 'error.main' }}>
                    {signedMoney(activeCard.amount)}
                  </Box>
                ) : null}
              </motion.div>
              {activeCard.data.fact && (
                <Box sx={{ mt: 2.5, p: 2, borderRadius: 2, bgcolor: 'info.light', textAlign: 'left' }}>
                  <Typography variant="overline" sx={{ fontWeight: 800, color: 'info.main', lineHeight: 1.5 }}>Did you know?</Typography>
                  <Typography>{activeCard.data.fact}</Typography>
                </Box>
              )}
              <Button fullWidth size="large" variant="contained" autoFocus sx={{ mt: 3 }} onClick={passTurn}>Continue</Button>
            </Box>
          )}

          {modalStage === 'FEEDBACK_INCORRECT' && activeCard?.type !== 'MISHAP' && activeCard?.type !== 'WIN' && (
            <>
              {lastAnswer ? (
                <>
                  <Typography id={TITLE_ID} variant="h5" component="h2" sx={{ mb: 1.5 }}>{resultHeading()}</Typography>
                  {renderAnswered()}
                  <OutcomePanel feedback={feedback}>
                    <Button fullWidth size="large" variant="contained" autoFocus aria-describedby={OUTCOME_ID} onClick={passTurn}>Continue</Button>
                  </OutcomePanel>
                </>
              ) : (
                <OutcomePanel feedback={feedback} titleId={TITLE_ID} big>
                  <Button fullWidth size="large" variant="contained" autoFocus onClick={passTurn}>Continue</Button>
                </OutcomePanel>
              )}
            </>
          )}

          {activeCard?.type === 'UPGRADE_OFFER' && (() => {
            const tile = board.find((t) => t.id === activeCard.data.id) || activeCard.data;
            const g = ownedGroups.find((x) => x.tile.group === tile.group && x.tile.sub === tile.sub);
            if (!g) return null;
            const rentNow = computeRent(board, tile);
            const rentAfter = rentIf(tile, { level: g.next }, true);
            const canPay = currentPlayer.money >= g.cost;
            return (
              <>
                <Typography id={TITLE_ID} variant="h5" component="h2" sx={{ mb: 2 }}>{LABELS.upgradeTitle}: {tile.sub}</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 2, p: 2, borderRadius: 2, bgcolor: 'action.hover', textAlign: 'center' }}>
                  <Box>
                    <Typography variant="overline" color="text.secondary">Now</Typography>
                    <Stars level={g.level} />
                    <Typography sx={{ fontWeight: 800 }}>Rent {money(rentNow)}</Typography>
                  </Box>
                  <Box aria-hidden sx={{ fontSize: 28, color: 'text.secondary' }}>→</Box>
                  <Box>
                    <Typography variant="overline" color="text.secondary">After</Typography>
                    <Stars level={g.next} />
                    <Typography sx={{ fontWeight: 800, color: 'success.main' }}>Rent {money(rentAfter)}</Typography>
                  </Box>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                  Rent is per tile, for all {g.size} {tile.sub} tiles. Your team has {money(currentPlayer.money)}.
                </Typography>
                {!canPay && <Alert severity="warning" sx={{ mt: 1.5 }}>Not enough cash for this upgrade.</Alert>}
                <Button fullWidth size="large" variant="contained" autoFocus={canPay} disabled={!canPay || !g.canLevel} onClick={handleUpgrade} sx={{ mt: 2 }}>{LABELS.upgrade} for {money(g.cost)}</Button>
                <Button fullWidth size="large" autoFocus={!canPay} onClick={() => setModalOpen(false)} sx={{ mt: 1 }}>Cancel</Button>
              </>
            );
          })()}

          {activeCard?.type === 'RENT_DEFENSE' && modalStage === 'QUESTION' && (
            <>
              <Typography id={TITLE_ID} variant="h5" component="h2" sx={{ mb: 0.5 }}>Rent due: <Box component="span" sx={{ color: 'error.main' }}>{money(activeCard.rent)}</Box></Typography>
              <Typography sx={{ mb: 1.5 }}>
                <strong>{activeCard.ownerName}</strong> owns {tileLabel(activeCard.data)}. Answer to cut the rent in half.
              </Typography>
              <Stakes good={`pay only ${money(Math.floor(activeCard.rent / 2))}.`} bad={`pay the full ${money(activeCard.rent)}.`} />
              {renderQuestion(activeCard.q, handleRentChallengeAnswer, { imageMaxHeight: 200 })}
            </>
          )}

          {modalStage === 'CHAOS_SELECT' && activeCard?.type === 'CHAOS_SELECT' && (() => {
            const targets = chaosTargets(board, currentPlayer.id);
            const tokens = currentPlayer.chaosTokens;
            const buyBlocked = !chaosTokensForSale(board) ? 'Unlocks once all 4 milestones have been captured.' : currentPlayer.money < ECONOMY.chaosTokenPrice ? `Your team needs ${money(ECONOMY.chaosTokenPrice)}.` : '';
            return (
              <>
                <Typography id={TITLE_ID} variant="h5" component="h2" gutterBottom><span aria-hidden>⚡ </span>Chaos tokens</Typography>
                <Typography sx={{ mb: 2 }}>
                  Your team has <strong>{tokens} token{tokens === 1 ? '' : 's'}</strong>. Spend one to challenge for a rival's tile: answer its question right to take it for half price. Answer wrong and you pay a small penalty. Either way the token is used up and your turn ends. Complete sets are protected.
                </Typography>
                {tokens === 0 && <Alert severity="info" sx={{ mb: 2 }}>Capture a milestone (corner tile) to earn a token.</Alert>}
                {targets.length === 0 ? (
                  <Typography color="text.secondary" sx={{ mb: 2 }}>No rival tiles can be challenged right now (complete sets are protected).</Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 320, overflowY: 'auto', mb: 2 }}>
                    {targets.map((t) => {
                      const cost = chaosStealCost(t);
                      const short = currentPlayer.money < cost;
                      return (
                      <Box key={t.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.25, border: '1px solid', borderColor: 'divider', borderLeft: `6px solid ${t.color}`, borderRadius: 2 }}>
                        <TeamDot player={players[t.owner]} size={22} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 800 }}>{t.sub} {t.level > 0 && <Stars level={t.level} inline />}</Typography>
                          <Typography variant="body2" color="text.secondary">{t.group} · owned by {ownerName(t.owner)} · take it for {money(cost)}{short ? ` (your team needs ${money(cost)})` : ''}</Typography>
                        </Box>
                        <Button variant="contained" disabled={tokens <= 0 || short} onClick={() => handleSelectChaosTarget(t)} aria-label={`Challenge for ${t.sub} owned by ${ownerName(t.owner)}`}>Challenge</Button>
                      </Box>
                      );
                    })}
                  </Box>
                )}
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                  <Box sx={{ flex: '1 1 200px' }}>
                    <Typography sx={{ fontWeight: 800 }}>Buy a token for {money(ECONOMY.chaosTokenPrice)}</Typography>
                    <Typography variant="body2" color="text.secondary">{buyBlocked || 'Available now.'}</Typography>
                  </Box>
                  <Button variant="outlined" color="secondary" disabled={Boolean(buyBlocked)} onClick={handleBuyChaosToken}>Buy token</Button>
                </Box>
                <Button fullWidth size="large" autoFocus sx={{ mt: 2 }} onClick={() => setModalOpen(false)}>Cancel</Button>
              </>
            );
          })()}

          {modalStage === 'CHAOS_QUESTION' && activeCard?.type === 'CHAOS_CHALLENGE' && (
            <>
              <Typography id={TITLE_ID} variant="h5" component="h2" sx={{ mb: 0.5 }}>Chaos challenge · {tileLabel(activeCard.data)}</Typography>
              <Typography sx={{ mb: 1.5 }}>Owned by <strong>{ownerName(activeCard.data?.owner)}</strong>. One question decides it.</Typography>
              <Stakes good={`take the tile for ${money(chaosStealCost(activeCard.data))}.`} bad={`pay a ${money(chaosFailPenalty(activeCard.data))} penalty.`} />
              {renderQuestion(activeCard.q, handleChaosAnswer)}
            </>
          )}
        </Box>
      </Modal>

      <Modal open={manageOpen} onClose={() => setManageOpen(false)}>
        <Box role="dialog" aria-modal="true" aria-labelledby="upgrades-title" sx={modalStyle}>
          <DialogTop player={currentPlayer} />
          <Typography id="upgrades-title" variant="h5" component="h2" gutterBottom><span aria-hidden>⭐ </span>{LABELS.upgrades}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Own every tile of a colour group to upgrade it. Each level multiplies the rent rivals pay: 1× → 3× → 6× → 10× → 20×.
          </Typography>
          {ownedGroups.length === 0 ? (
            <Alert severity="info">Your team doesn't own any tiles yet. Answer a property question correctly to buy one.</Alert>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 360, overflowY: 'auto' }}>
              {ownedGroups.map((g) => {
                const reason = !g.full ? `Own all ${g.size} to upgrade (${g.owned}/${g.size})` : g.level >= 4 ? 'Maximum level' : !g.canLevel ? 'Levels must be even first' : currentPlayer.money < g.cost ? `Needs ${money(g.cost)}` : '';
                return (
                  <Box key={g.tile.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.25, border: '1px solid', borderColor: 'divider', borderLeft: `6px solid ${g.tile.color}`, borderRadius: 2 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 800 }}>{g.tile.sub} <Stars level={g.level} inline /></Typography>
                      <Typography variant="body2" color="text.secondary">{g.tile.group} · {g.owned} of {g.size} owned{reason ? ` · ${reason}` : ` · next level ${money(g.cost)}`}</Typography>
                    </Box>
                    <Button
                      variant="contained"
                      disabled={Boolean(reason)}
                      aria-label={`Upgrade ${g.tile.sub}`}
                      onClick={() => { setActiveCard({ type: 'UPGRADE_OFFER', data: g.tile }); setManageOpen(false); setModalOpen(true); }}
                    >
                      Upgrade
                    </Button>
                  </Box>
                );
              })}
            </Box>
          )}
          <Button fullWidth size="large" autoFocus onClick={() => setManageOpen(false)} sx={{ mt: 2 }}>Close</Button>
        </Box>
      </Modal>

      <RulesDialog
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        intro={totalTurns === 0 ? 'Quick rules before your first roll. Open them again any time with How to play at the top.' : ''}
      />

      <Dialog open={exitOpen} onClose={() => setExitOpen(false)} aria-labelledby="exit-title" aria-describedby="exit-text">
        <DialogTitle id="exit-title">Leave this game?</DialogTitle>
        <DialogContent>
          <Typography id="exit-text">The current game and its results will be lost. To finish properly, use End game instead.</Typography>
        </DialogContent>
        <DialogActions>
          <Button autoFocus onClick={() => setExitOpen(false)}>Stay in the game</Button>
          <Button color="error" variant="contained" onClick={() => { setExitOpen(false); onExit(); }}>Leave game</Button>
        </DialogActions>
      </Dialog>
    </Box>
    </MotionConfig>
  );
}

// ------------------------------------------------------------------
//  PRESENTATION HELPERS
// ------------------------------------------------------------------

/** Round team token: symbol on a deep team colour (white text stays readable). */
function TeamDot({ player, size = 24 }) {
  if (!player) return null;
  return (
    <Box
      aria-hidden
      sx={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        bgcolor: TEAM_INK[player.id] || player.color, color: 'common.white', fontSize: Math.round(size * 0.5), lineHeight: 1,
        boxShadow: `0 0 0 2px ${player.color}`,
      }}
    >
      {TEAM_SYMBOLS[player.id]}
    </Box>
  );
}

function Stars({ level = 0, inline = false }) {
  return (
    <Box component="span" role="img" aria-label={`Level ${level} of 4`} sx={{ color: 'warning.main', letterSpacing: 1, fontSize: inline ? '0.9rem' : '1.3rem', display: inline ? 'inline' : 'block', whiteSpace: 'nowrap' }}>
      {'★'.repeat(level)}<Box component="span" sx={{ color: 'text.disabled' }}>{'☆'.repeat(Math.max(0, 4 - level))}</Box>
    </Box>
  );
}

/** Top strip of every game dialog: which tile, and whose turn. */
function DialogTop({ tile, player }) {
  const kind = tile ? ({ property: tile.group, sequencing_core: LABELS.tileTypes.sequencing_core, milestone: 'Milestone', chance: LABELS.chanceTile }[tile.type] || '') : '';
  const name = tile ? (tile.type === 'property' ? tile.sub : tile.name) : '';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 2, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider', flexWrap: 'wrap' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        {tile && <Box aria-hidden sx={{ width: 14, height: 14, borderRadius: 1, bgcolor: tile.color, flexShrink: 0 }} />}
        {tile && <Typography variant="body2" sx={{ fontWeight: 800 }}>{name}</Typography>}
        {kind && kind !== name && <Typography variant="body2" color="text.secondary">· {kind}</Typography>}
      </Box>
      {player && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TeamDot player={player} size={22} />
          <Typography variant="body2" sx={{ fontWeight: 800 }}>{player.name}</Typography>
          <Typography variant="body2" sx={{ fontWeight: 700, color: player.money < 0 ? 'error.main' : 'text.secondary' }}>{money(player.money)}</Typography>
        </Box>
      )}
    </Box>
  );
}

/** What a right and a wrong answer mean, shown before the question. */
function Stakes({ good, bad }) {
  const cell = (ok, text) => (
    <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: ok ? 'success.light' : 'error.light', display: 'flex', gap: 1, alignItems: 'baseline' }}>
      <Box component="span" aria-hidden sx={{ color: ok ? 'success.main' : 'error.main', fontWeight: 900 }}>{ok ? '✓' : '✗'}</Box>
      <Typography variant="body2"><strong>{ok ? 'Right:' : 'Wrong:'}</strong> {text}</Typography>
    </Box>
  );
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1, mb: 2.5 }}>
      {cell(true, good)}
      {cell(false, bad)}
    </Box>
  );
}

/** Result of an answer or event, with the explanation (the teaching moment) and the next action. */
function OutcomePanel({ feedback, titleId, big = false, children }) {
  if (!feedback) return children || null;
  const tone = feedback.tone || 'neutral';
  const c = tone === 'good' ? 'success' : tone === 'bad' ? 'error' : 'info';
  return (
    <Box sx={{ mt: big ? 0 : 2.5, p: { xs: 2, sm: 2.5 }, borderRadius: 3, border: '2px solid', borderColor: `${c}.main`, bgcolor: 'action.hover' }}>
      <Box id={OUTCOME_ID} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        <motion.div initial={{ scale: 0.4, rotate: -25 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 14 }}>
          <Box aria-hidden sx={{ width: big ? 48 : 40, height: big ? 48 : 40, borderRadius: '50%', bgcolor: `${c}.main`, color: `${c}.contrastText`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: big ? 26 : 22 }}>
            {tone === 'good' ? '✓' : tone === 'bad' ? '✗' : 'i'}
          </Box>
        </motion.div>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id={titleId} variant={big ? 'h4' : 'h5'} component={titleId ? 'h2' : 'p'} sx={{ color: `${c}.main`, lineHeight: 1.2 }}>{feedback.title}</Typography>
          {feedback.detail && <Typography sx={{ mt: 0.5, fontWeight: 700 }}>{feedback.detail}</Typography>}
        </Box>
      </Box>
      {feedback.explanation && (
        <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="overline" component="p" color="text.secondary" sx={{ fontWeight: 800, lineHeight: 1.6 }}>Why</Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{feedback.explanation}</Typography>
        </Box>
      )}
      {feedback.note && <Alert severity="warning" sx={{ mt: 2 }}>{feedback.note}</Alert>}
      {children && <Box sx={{ mt: 2.5 }}>{children}</Box>}
    </Box>
  );
}

/** Exam header: title, question count and one pip per question. */
function QuizProgress({ title, quiz, need, onQuit, rescue = false }) {
  const total = quiz.questions.length;
  const history = quiz.history || [];
  const mistakesLeft = Math.max(0, (quiz.maxMistakes || 2) - 1 - (quiz.mistakes || 0));
  const status = rescue
    ? `Need ${need} of ${total} correct · ${quiz.score} so far`
    : `Need ${need} of ${total} · ${mistakesLeft > 0 ? `${mistakesLeft} mistake allowed` : 'no more mistakes allowed'}`;
  return (
    <Box sx={{ mb: 2.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
        <Typography id={TITLE_ID} variant="h6" component="h2">{title}</Typography>
        {onQuit && <Button size="small" color="error" onClick={onQuit}>Give up</Button>}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mt: 1 }}>
        <Box role="img" aria-label={`${history.filter(Boolean).length} right, ${history.filter((h) => h === false).length} wrong, question ${quiz.qIndex + 1} of ${total}`} sx={{ display: 'flex', gap: 0.75 }}>
          {Array.from({ length: total }, (_, i) => {
            const h = history[i];
            const state = h === true ? 'right' : h === false ? 'wrong' : i === quiz.qIndex ? 'current' : 'todo';
            const filled = state === 'right' || state === 'wrong';
            const c = state === 'right' ? 'success' : 'error';
            return (
              <Box key={i} sx={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900,
                border: '2px solid', borderColor: filled ? `${c}.main` : state === 'current' ? 'primary.main' : 'divider',
                bgcolor: filled ? `${c}.main` : 'transparent', color: filled ? `${c}.contrastText` : state === 'current' ? 'primary.main' : 'text.secondary',
              }}>
                {state === 'right' ? '✓' : state === 'wrong' ? '✗' : i + 1}
              </Box>
            );
          })}
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 700 }} color="text.secondary">Question {quiz.qIndex + 1} of {total} · {status}</Typography>
      </Box>
    </Box>
  );
}
