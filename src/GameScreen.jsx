// src/GameScreen.jsx
import React, { useState, useEffect, useRef } from 'react';
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
import { LABELS, RULES, teamDisplayName, money, signedMoney } from './labels';
import { matchesTopicAndModule } from './tsvBoardBuilder';
import {
  getSubgroupTiles, getRentMultiplier, computeRent, rankPlayers, nextActivePlayer, activePlayers,
} from './gameRules';
import { prepareQuestion, checkAnswer, parseMishapAmount } from './questionFormats';
import { resolveImage } from './images';
import QuestionInput from './QuestionInput';
import Board from './components/Board';
import Dice from './components/Dice';
import TeamPanel from './components/TeamPanel';
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

// ------------------------------------------------------------------
//  MAIN COMPONENT
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
  const generatePlayers = (count) => {
    const colors = TEAM_COLORS;
    let p = [];
    for (let i = 0; i < count; i++) {
      p.push({
        id: i,
        name: teamDisplayName(i, count),
        color: colors[i],
        position: 0,
        money: 2500,
        jailed: false,
        chaosTokens: 0,
        rescueUsed: false,
        eliminated: false,
      });
    }
    return p;
  };

  // A resumed game keeps the freshly built board (its tiles share question arrays)
  // and restores only what changes during play: each tile's owner and level.
  const [board, setBoard] = useState(() => (resume?.tiles
    ? boardData.map((t, i) => ({ ...t, owner: resume.tiles[i]?.[0] ?? null, level: resume.tiles[i]?.[1] ?? 0 }))
    : boardData));
  const [players, setPlayers] = useState(() => resume?.players ?? generatePlayers(playerCount));
  const getImgSrc = (imgName) => resolveImage(imgName, imageMap, imageBase);
  const [turn, setTurn] = useState(resume?.turn ?? (startingPlayerIndex || 0));
  const turnRef = useRef(resume?.turn ?? (startingPlayerIndex || 0));
  // True from the roll until the turn is passed: never autosave a half-finished turn.
  const turnInProgressRef = useRef(false);
  // Latest players for event handlers. Side effects must not run inside state
  // updaters: React runs those twice in development (it doubled payouts).
  const playersRef = useRef(players);
  useEffect(() => { playersRef.current = players; }, [players]);

  const [totalTurns, setTotalTurns] = useState(resume?.totalTurns ?? 0);
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
  const [rulesOpen, setRulesOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [moneyFloats, setMoneyFloats] = useState({});

  // Quiz state
  const [quizState, setQuizState] = useState({
    active: false,
    mode: null,
    qIndex: 0,
    score: 0,
    questions: [],
    waiting: false,
    selected: null,
    isCorrect: null,
    targetScore: 0,
    mistakes: 0,
    maxMistakes: 2,
    tile: null,
  });

  const [hoverTile, setHoverTile] = useState(null);
  const [, setChaosMode] = useState(null);
  const [chaosTargetTile, setChaosTargetTile] = useState(null);
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

  useEffect(() => {
    turnRef.current = turn;
  }, [turn]);

  // BANKRUPTCY CHECK
  useEffect(() => {
    const p = players[turnRef.current];
    if (!p || p.eliminated) return;
    if (p.money < 0 && !['LIQUIDATION', 'GRANT_INTRO', 'GRANT_QUIZ', 'GRANT_RESULT', 'ELIMINATED', 'STANDINGS', 'WIN'].includes(modalStage)) {
        checkBankruptcyStatus(p);
    }
  }, [players, turn, modalStage]);

  const checkBankruptcyStatus = (player) => {
    const ownedTiles = board.filter(t => t.owner === player.id);
    const assetValue = ownedTiles.reduce((sum, t) => {
        const buildValue = (t.level || 0) * (t.houseCost || 0);
        return sum + Math.floor((t.price + buildValue) * 0.5);
    }, 0);

    if (player.money + assetValue >= 0 && ownedTiles.length > 0) {
        setActiveCard({ type: 'LIQUIDATION', debt: Math.abs(player.money), assets: ownedTiles });
        setModalStage('LIQUIDATION');
        setModalOpen(true);
    } else if (player.rescueUsed) {
        eliminatePlayer(player.id, 'Bankrupt again after using the Rescue Quiz');
    } else {
        setActiveCard({ type: 'GRANT', debt: Math.abs(player.money) });
        setModalStage('GRANT_INTRO');
        setModalOpen(true);
    }
  };

  // A team that cannot pay its debts leaves the game; its tiles return to the bank.
  const eliminatePlayer = (playerId, reason) => {
    const name = players[playerId]?.name || 'Team';
    setBoard((prev) => prev.map((t) => (t.owner === playerId ? { ...t, owner: null, level: 0 } : t)));
    setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, eliminated: true, eliminatedAt: totalTurns, money: 0 } : p)));
    addLog(`${name} has been eliminated.`);
    addCSVEvent({ eventType: 'ELIMINATED', turn: totalTurns, playerIndex: playerId, playerName: name, notes: reason, timestamp: new Date().toISOString() });
    setActiveCard({ type: 'ELIMINATED', playerId, name, reason });
    setModalStage('ELIMINATED');
    setModalOpen(true);
  };

  const continueAfterElimination = () => {
    const remaining = activePlayers(players);
    if (players.length > 1 && remaining.length === 1) {
      setActiveCard({ type: 'WIN', msg: `${remaining[0].name} is the last team standing!` });
      setModalStage('WIN');
      addLog(`VICTORY: ${remaining[0].name} is the last team standing.`);
    } else if (remaining.length === 0) {
      openStandings(true, 'eliminated');
    } else {
      passTurn();
    }
  };

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
      turn: totalTurns,
      playerIndex: turnRef.current,
      playerName: players[turnRef.current]?.name || '',
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
  const allBoardQuestions = () => [...new Set(board.flatMap((t) => t.questions || []))];

  const currentPlayer = players[turnRef.current];

  // ------------------------------------------------------------------
  //  TRANSACTIONS
  // ------------------------------------------------------------------
  const handleTransaction = (playerId, amount, meta = {}) => {
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId ? { ...p, money: p.money + amount } : p
      )
    );

    const floatId = Date.now();
    setMoneyFloats((prev) => ({
      ...prev,
      [playerId]: { amount, visible: true, id: floatId },
    }));
    setTimeout(() => {
      setMoneyFloats((prev) => ({
        ...prev,
        [playerId]: { ...prev[playerId], visible: false },
      }));
    }, 2000);

    const before = (players.find(p => p.id === playerId)?.money) || 0;
    const after = before + amount;

    addCSVEvent({
      eventType: 'TRANSACTION',
      turn: totalTurns,
      playerIndex: playerId,
      playerName: players[playerId]?.name || '',
      playerColor: players[playerId]?.color || '',
      action: meta.action || 'MONEY_CHANGE',
      amount,
      moneyBefore: before,
      moneyAfter: after,
      tileId: meta.tileId ?? '',
      tileName: meta.tileName ?? '',
      notes: meta.notes ?? '',
    });
  };

  // ------------------------------------------------------------------
  //  LIQUIDATION (TOP-DOWN) + TURN PASSING
  // ------------------------------------------------------------------
  const handleSellAsset = (tile) => {
    // Logic: If upgraded, downgrade WHOLE GROUP by 1. If level 0, sell deed.
    
    if (tile.level > 0) {
        // --- DOWNGRADE MODE ---
        const groupTiles = getSubgroupTiles(board, tile);
        const groupSize = groupTiles.length;
        const singleUpgradeCost = tile.houseCost || tile.price; 
        const totalRefund = Math.floor((singleUpgradeCost * 0.5) * groupSize);

        handleTransaction(currentPlayer.id, totalRefund, {
            action: 'LIQUIDATION_DOWNGRADE',
            tileId: tile.id,
            tileName: tile.name,
            notes: `Downgraded sub-theme to Level ${tile.level - 1}`
        });

        setBoard(prev => prev.map(t => {
            if (t.type === 'property' && t.group === tile.group && t.sub === tile.sub) {
                return { ...t, level: t.level - 1 };
            }
            return t;
        }));
        
        // Refresh activeCard
        const newBoard = board.map(t => {
            if (t.type === 'property' && t.group === tile.group && t.sub === tile.sub) {
                return { ...t, level: t.level - 1 };
            }
            return t;
        });
        const updatedAssets = newBoard.filter(t => t.owner === currentPlayer.id);
        setActiveCard(prev => ({ ...prev, assets: updatedAssets }));

        if (currentPlayer.money + totalRefund >= 0) {
            addLog(`${currentPlayer.name} cleared debt. Turn ends.`);
            passTurn(); // <--- TURN ENDS HERE
        }

    } else {
        // --- SELL DEED MODE ---
        const sellValue = Math.floor(tile.price * 0.5);

        handleTransaction(currentPlayer.id, sellValue, {
            action: 'LIQUIDATION_SALE',
            tileId: tile.id,
            tileName: tile.name,
            notes: 'Sold deed'
        });

        const newBoard = board.map(t => t.id === tile.id ? { ...t, owner: null, level: 0 } : t);
        setBoard(newBoard);
        
        const updatedAssets = newBoard.filter(t => t.owner === currentPlayer.id);
        setActiveCard(prev => ({ ...prev, assets: updatedAssets }));

        if (currentPlayer.money + sellValue >= 0) {
            addLog(`${currentPlayer.name} cleared debt. Turn ends.`);
            passTurn(); // <--- TURN ENDS HERE
        }
    }
  };

  // ------------------------------------------------------------------
  //  GRANT & CHAOS LOGIC
  // ------------------------------------------------------------------
  const startGrantExam = () => {
    const allQuestions = allBoardQuestions();
    if (allQuestions.length === 0) { handleGrantResult(true); return; }
    let pool = [...allQuestions].sort(() => 0.5 - Math.random());
    while (pool.length < 3) pool = [...pool, ...allQuestions];
    pool = pool.slice(0, 3).map((q) => prepareQuestion(q));

    setQuizState({
        active: true, mode: 'GRANT', qIndex: 0, score: 0, questions: pool,
        targetScore: 2, waiting: false, selected: null, isCorrect: null, history: [],
    });
    setModalStage('GRANT_QUIZ');
  };

  const handleGrantResult = (passed) => {
    if (!passed) {
        eliminatePlayer(currentPlayer.id, 'Did not pass the Rescue Quiz');
        return;
    }
    const debt = Math.abs(currentPlayer.money);
    handleTransaction(currentPlayer.id, debt + 500, { action: 'EMERGENCY_GRANT', notes: 'Rescue Quiz passed' });
    setPlayers(prev => prev.map(p => p.id === currentPlayer.id ? { ...p, rescueUsed: true } : p));
    setFeedback({ tone: 'good', title: LABELS.rescued, detail: `Your ${money(debt)} debt is cleared and you receive $500 to keep playing.`, note: "This was your team's only rescue: if you go bankrupt again, you are out." });
    setModalStage('GRANT_RESULT');
  };

  const handleBuyChaosToken = () => {
    // 1. NEW CHECK: Ensure all 4 milestones are owned (by anyone)
    const milestones = board.filter(t => t.type === 'milestone');
    const allCaptured = milestones.every(t => t.owner !== null);

    if (!allCaptured) {
        alert("Chaos Tokens are locked! They only become available after ALL 4 Milestones have been captured.");
        return;
    }

    // 2. Existing Money Check
    if (currentPlayer.money < 500) {
        alert("Insufficient funds to buy a Chaos Token ($500).");
        return;
    }

    // 3. Process Transaction
    handleTransaction(currentPlayer.id, -500, { action: 'BUY_CHAOS', notes: 'Purchased token' });
    setPlayers(prev => prev.map(p => p.id === currentPlayer.id ? { ...p, chaosTokens: p.chaosTokens + 1 } : p));
    addLog(`${currentPlayer.name} bought a Chaos Token.`);
  };

  // ------------------------------------------------------------------
  //  GAME LOGIC
  // ------------------------------------------------------------------
  // QUIZ LOGIC
  const startQuiz = (tile, mode) => {
    if (!tile.quiz || tile.quiz.length === 0) return;
    let pool = [...tile.quiz];
    while (pool.length < 10) pool = [...pool, ...tile.quiz];
    pool.sort(() => Math.random() - 0.5);

    // NEW LOGIC: Milestones now have 6 questions. 
    // Target is 5 (Allows < 2 errors, i.e., 0 or 1 mistake).
    const isMilestone = mode === 'MILESTONE_ACQUIRE' || mode === 'MILESTONE_CHALLENGE';
    const qCount = isMilestone ? 6 : 10;
    const target = isMilestone ? 5 : 9;

    setQuizState({
      active: true, mode, qIndex: 0, score: 0, questions: pool.slice(0, qCount).map((q) => prepareQuestion(q)), tile,
      wrongAnswers: 0, waiting: false, selected: null, isCorrect: null,
      targetScore: target, mistakes: 0, maxMistakes: 2, // maxMistakes 2 means you fail on the 2nd error
      history: [], // UI only: right/wrong per answered question
    });
    setLastAnswer(null);
    setModalStage('QUIZ_START');
    setModalOpen(true);
  };

  const handleQuizAnswer = (response) => {
    if (quizState.waiting) return;
    const currentQ = quizState.questions[quizState.qIndex];
    const result = checkAnswer(currentQ, response);
    const isCorrect = result.correct;
    logAnswer(quizState.mode === 'GRANT' ? 'GRANT_Q' : 'MILESTONE_Q', currentQ, result, {
      tileId: quizState.tile?.id ?? '', tileName: quizState.tile?.name ?? '', questionNumber: quizState.qIndex + 1,
    });

    // Calculate score updates immediately
    let newScore = quizState.score;
    let newMistakes = quizState.mistakes;
    if (isCorrect) newScore++;
    else newMistakes++;

    // Set waiting to true to show Explanation + Next Button
    setQuizState((prev) => ({ 
      ...prev, 
      waiting: true, 
      selected: response, 
      result,
      isCorrect, 
      score: newScore, 
      mistakes: newMistakes,
      history: [...(prev.history || []), isCorrect],
    }));
  };

  // 2. Handle moving to next question (Called by Next Button)
  const handleNextQuestion = () => {
    const maxQs = quizState.questions.length;
    const isGrant = quizState.mode === 'GRANT';

    // Check for failure (unless it's a Grant exam which finishes regardless)
    if (!isGrant && quizState.mistakes >= quizState.maxMistakes) {
         finishQuiz(false, quizState.score, quizState.mistakes);
         return;
    }

    if (quizState.qIndex < maxQs - 1) {
        // Advance to next question
        setQuizState((prev) => ({
            ...prev,
            qIndex: prev.qIndex + 1,
            waiting: false,
            selected: null,
            isCorrect: null
        }));
    } else {
        // Finish Quiz
        if (isGrant) {
            handleGrantResult(quizState.score >= quizState.targetScore);
        } else {
            finishQuiz(quizState.score >= quizState.targetScore, quizState.score, quizState.mistakes);
        }
    }
  };

  const finishQuiz = (passed, score) => {
    const tile = quizState.tile;
    const mode = quizState.mode;

    if (mode === 'MILESTONE_ACQUIRE') {
      // CHANGED: Score needs to be >= 5 (since total is 6)
      if (passed && score >= 5) {
        handleTransaction(turnRef.current, -tile.price, { action: 'MILESTONE_ACQUIRE', tileId: tile.id, tileName: tile.name });
        const newBoard = board.map((t) => t.id === tile.id ? { ...t, owner: turnRef.current } : t);
        setBoard(newBoard);
        setPlayers((prev) => prev.map((p) => p.id === turnRef.current ? { ...p, chaosTokens: p.chaosTokens + 1 } : p));
        addLog(`${players[turnRef.current].name} captured the ${tile.name} milestone!`);
        setModalStage('MILESTONE_SUCCESS');
      } else {
        addLog(`${players[turnRef.current].name} didn't pass the ${tile.name} exam.`);
        setModalStage('MILESTONE_FAIL');
      }
    } else if (mode === 'MILESTONE_CHALLENGE') {
      const baseRent = tile.baseRent || 0;
      // CHANGED: Score >= 5 (Allows 1 mistake)
      if (passed && score >= 5) {
        const halfRent = Math.floor(baseRent / 2);
        handleTransaction(turnRef.current, -halfRent, { action: 'MILESTONE_CHALLENGE_SUCCESS', tileId: tile.id, tileName: tile.name, rentPaid: halfRent, correct: true });
        if (tile.owner !== 99 && tile.owner != null) handleTransaction(tile.owner, halfRent, { action: 'MILESTONE_RENT_RECEIVED', tileId: tile.id, tileName: tile.name });
        setFeedback({ tone: 'good', title: 'Exam passed!', detail: `You pay only half the milestone fee: ${money(halfRent)}.` });
        addLog(`${players[turnRef.current].name} passed the ${tile.name} exam and paid half the fee.`);
        setModalStage('FEEDBACK_INCORRECT');
      } else {
        const fullRent = baseRent;
        handleTransaction(turnRef.current, -fullRent, { action: 'MILESTONE_CHALLENGE_FAIL', tileId: tile.id, tileName: tile.name, rentPaid: fullRent, correct: false });
        if (tile.owner !== 99 && tile.owner != null) handleTransaction(tile.owner, fullRent, { action: 'MILESTONE_RENT_RECEIVED', tileId: tile.id, tileName: tile.name });
        setFeedback({ tone: 'bad', title: 'Exam not passed', detail: `You pay the full milestone fee: ${money(fullRent)}.` });
        addLog(`${players[turnRef.current].name} paid the full ${tile.name} fee.`);
        setModalStage('FEEDBACK_INCORRECT');
      }
    }
  };

  const checkLanding = (didPassGo) => {
    const currentPlayers = playersRef.current;
    const currentTurnIndex = turnRef.current;
    const p = currentPlayers[currentTurnIndex];
    const tile = board[p.position];

    if (didPassGo) {
      handleTransaction(p.id, 200, { action: 'PASS_GO' });
      addLog(LABELS.passStart);
    }

    setFeedback(null);
    setLastAnswer(null);

    if (tile.owner === p.id) {
      setActiveCard({ type: 'MSG', data: tile, msg: LABELS.ownTile });
      setModalStage('MSG');
      setModalOpen(true);
      return;
    }

    if (tile.type === 'milestone') {
      if (tile.owner == null) {
        if (p.money >= tile.price) {
          setActiveCard({ type: 'MILESTONE', data: tile });
          setModalStage('MILESTONE_INTRO');
          setModalOpen(true);
        } else {
          setActiveCard({ type: 'MSG', data: tile, msg: LABELS.cannotAffordMilestone(tile.price) });
          setModalStage('MSG');
          setModalOpen(true);
        }
      } else if (tile.owner !== p.id) {
        setActiveCard({ type: 'MILESTONE_CHALLENGE', data: tile, ownerId: tile.owner });
        setModalStage('MILESTONE_CHALLENGE_INTRO');
        setModalOpen(true);
      }
      return;
    }

    if (tile.questions && tile.questions.length > 0) {
      if (tile.owner != null && tile.owner !== p.id) {
        const rentBase = tile.type === 'sequencing_core' ? tile.baseRent : computeRent(board, tile);
        const qPool = tile.questions || [];
        const randomQ = prepareQuestion(qPool[Math.floor(Math.random() * qPool.length)]);
        setActiveCard({ type: 'RENT_DEFENSE', data: tile, rent: rentBase, ownerName: players[tile.owner]?.name || LABELS.rivalTeam, ownerId: tile.owner, payerId: p.id, payerName: p.name, q: randomQ });
        setModalStage('QUESTION');
        setModalOpen(true);
      } else {
        const qPool = tile.questions || [];
        const randomQ = prepareQuestion(qPool[Math.floor(Math.random() * qPool.length)]);
        setActiveCard({ type: 'QUESTION', data: tile, q: randomQ });
        setModalStage('QUESTION');
        setModalOpen(true);
      }
    } else {
      let msg = 'Event triggered.';
      let amount = 0;
      let fact = null;
      if (tile.type === 'chance') {
        // 1. Look for 'mishap' rows in the TSV
        const tsvMishaps = tsvRows
          .filter(r => (r.type || '').trim().toLowerCase() === 'mishap' && matchesTopicAndModule(r, bigTopic, module))
          .map(r => ({ msg: r.question, fact: r.explanation }));

        // 2. Use TSV mishaps if found; otherwise fallback to defaults
        const mishapPool = tsvMishaps.length > 0 ? tsvMishaps : DEFAULT_CHANCE_CARDS;
        
        const randomMishap = mishapPool.length > 0 ? mishapPool[Math.floor(Math.random() * mishapPool.length)] : { msg: 'Unexpected expense (-$100)', fact: null };
        amount = parseMishapAmount(randomMishap.msg);
        msg = randomMishap.msg;
        fact = randomMishap.fact || null;
        if (amount !== 0) handleTransaction(currentTurnIndex, amount, { action: 'LAB_MISHAP', tileId: tile.id, tileName: tile.name, notes: msg });
        addLog(`${LABELS.chanceCard} for ${p.name}${amount ? ` (${signedMoney(amount)})` : ''}.`);
        setActiveCard({ type: 'MISHAP', data: { ...tile, fact }, msg, amount });
        setModalStage('MISHAP');
        setModalOpen(true);
      } else {
        setActiveCard({ type: 'MSG', data: tile, msg });
        setModalStage('MSG');
        setModalOpen(true);
      }
    }
  };

  const handleRoll = () => {
    if (isMoving || timeUp || players[turn].eliminated) return;
    if (players[turn].money < 0) {
        alert("Your team is in debt! Sort out your debt before rolling again.");
        return;
    }
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    setDice([d1, d2]);
    setRollId((n) => n + 1);
    turnInProgressRef.current = true;
    setIsMoving(true);

    const startPos = players[turn].position;
    const steps = d1 + d2;
    const passesGo = startPos + steps >= 36;
    let stepsTaken = 0;

    const hopInterval = setInterval(() => {
      setPlayers((prevPlayers) => prevPlayers.map((player, index) => index === turnRef.current ? { ...player, position: (player.position + 1) % 36 } : player));
      stepsTaken++;
      if (stepsTaken >= steps) {
        clearInterval(hopInterval);
        setIsMoving(false);
        setTotalTurns((prev) => prev + 1);
        setTimeout(() => checkLanding(passesGo), 600);
      }
    }, 200);
  };

  const handleAnswer = (response) => {
    const q = activeCard.q;
    const result = checkAnswer(q, response);
    logAnswer('PROPERTY_Q', q, result, { tileId: activeCard.data.id, tileName: activeCard.data.name });
    setLastAnswer({ q, response, result });
    if (result.correct) {
      setFeedback({ tone: 'good', title: 'Correct!', explanation: q.explanation || '' });
      setModalStage('DECISION');
    } else {
      setFeedback({ tone: 'bad', title: 'Not quite', detail: 'That costs your team $20.', explanation: q.explanation || '' });
      handleTransaction(turnRef.current, -20, { action: 'QUESTION_PENALTY', tileId: activeCard.data.id, notes: 'Incorrect on acquisition question' });
      setModalStage('FEEDBACK_INCORRECT');
    }
  };

  const handleBuy = () => {
    const tile = activeCard.data;
    if (currentPlayer.money < tile.price) { alert("Insufficient funds!"); return; }
    handleTransaction(turnRef.current, -tile.price, { action: 'BUY_PROPERTY', tileId: tile.id, tileName: tile.name });
    setBoard((prev) => prev.map((t) => t.id === tile.id ? { ...t, owner: turnRef.current } : t));
    addLog(`${currentPlayer.name} bought ${tile.type === 'property' ? tile.sub : tile.name} for ${money(tile.price)}.`);
    passTurn();
  };

  const passTurn = () => {
    turnInProgressRef.current = false;
    setModalOpen(false);
    setTurn((prev) => nextActivePlayer(players, prev));
  };

  // Autosave between turns only: a refresh in the middle of a turn returns to its start.
  useEffect(() => {
    if (!onSnapshot || isMoving || modalOpen || manageOpen || turnInProgressRef.current) return;
    onSnapshot({ tiles: board.map((t) => [t.owner ?? null, t.level || 0]), players, turn, totalTurns, logs, logRows, dice, endsAt });
  }, [board, players, turn, totalTurns, logRows, isMoving, modalOpen, manageOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRentChallengeAnswer = (response) => {
    const tile = activeCard.data;
    const result = checkAnswer(activeCard.q, response);
    const isCorrect = result.correct;
    logAnswer('RENT_Q', activeCard.q, result, { tileId: tile.id, tileName: tile.name });
    const rentBase = tile.type === 'sequencing_core' ? tile.baseRent : computeRent(board, tile);
    const rentToPay = isCorrect ? Math.floor(rentBase / 2) : rentBase;
    setLastAnswer({ q: activeCard.q, response, result });
    setFeedback(isCorrect
      ? { tone: 'good', title: 'Correct: half rent!', detail: `You pay ${money(rentToPay)} to ${activeCard.ownerName} instead of ${money(rentBase)}.`, explanation: activeCard.q.explanation || '' }
      : { tone: 'bad', title: 'Not quite: full rent', detail: `You pay ${money(rentToPay)} to ${activeCard.ownerName}.`, explanation: activeCard.q.explanation || '' });
    addLog(`${activeCard.payerName} paid ${money(rentToPay)} rent to ${activeCard.ownerName}.`);
    handleTransaction(activeCard.payerId, -rentToPay, { action: 'RENT_PAYMENT', tileId: tile.id, tileName: tile.name, rentPaid: rentToPay, correct: isCorrect });
    if (activeCard.ownerId !== 99 && activeCard.ownerId != null) handleTransaction(activeCard.ownerId, rentToPay, { action: 'RENT_RECEIVED', tileId: tile.id, tileName: tile.name });
    setModalStage('FEEDBACK_INCORRECT');
  };

  const openChaosSelect = () => {
    setChaosMode('SELECT_PROPERTY');
    setFeedback(null);
    setLastAnswer(null);
    setModalStage('CHAOS_SELECT');
    setActiveCard({ type: 'CHAOS_SELECT' });
    setModalOpen(true);
  };

  const handleSelectChaosTarget = (tile) => {
    if (currentPlayer.chaosTokens <= 0) { alert('No chaos tokens available.'); return; }
    // Duel on the target tile's own questions (fallback: any board question).
    const pool = tile.questions?.length ? tile.questions : allBoardQuestions();
    if (pool.length === 0) { alert('This question file has no questions for a Chaos challenge.'); return; }
    setChaosTargetTile(tile);
    const q = prepareQuestion(pool[Math.floor(Math.random() * pool.length)]);
    setActiveCard({ type: 'CHAOS_CHALLENGE', data: tile, q, ownerId: tile.owner });
    setChaosMode('CHALLENGE');
    setModalStage('CHAOS_QUESTION');
  };

  const handleChaosAnswer = (response) => {
    const q = activeCard.q;
    const tile = chaosTargetTile;
    const result = checkAnswer(q, response);
    const isCorrect = result.correct;
    logAnswer('CHAOS_Q', q, result, { tileId: tile?.id ?? '', tileName: tile?.name ?? '' });
    if (!tile) { setModalStage('FEEDBACK_INCORRECT'); setFeedback({ tone: 'neutral', title: 'Something went wrong', detail: 'No target tile was chosen.' }); return; }
    setLastAnswer({ q, response, result });
    const ownerName = players[tile.owner]?.name || LABELS.rivalTeam;
    setPlayers((prev) => prev.map((p) => p.id === currentPlayer.id ? { ...p, chaosTokens: Math.max(0, p.chaosTokens - 1) } : p));

    if (isCorrect) {
      const cost = Math.floor((tile.price || 0) * 0.5);
      if (currentPlayer.money < cost) { setFeedback({ tone: 'neutral', title: 'Correct, but not enough cash', detail: `Taking this tile costs ${money(cost)} and your team has ${money(currentPlayer.money)}.`, explanation: q.explanation || '' }); setModalStage('FEEDBACK_INCORRECT'); return; }
      handleTransaction(currentPlayer.id, -cost, { action: 'CHAOS_STEAL', tileId: tile.id, tileName: tile.name });
      if (tile.owner != null && tile.owner !== 99) handleTransaction(tile.owner, cost, { action: 'CHAOS_SELL', tileId: tile.id, tileName: tile.name });
      setBoard((prev) => prev.map((t) => t.id === tile.id ? { ...t, owner: currentPlayer.id, level: 0 } : t));
      setFeedback({ tone: 'good', title: 'Chaos success!', detail: `You take ${tile.sub || tile.name} from ${ownerName} for ${money(cost)}.`, explanation: q.explanation || '' });
      addLog(`${currentPlayer.name} took ${tile.sub || tile.name} from ${ownerName} with a chaos token.`);
      setModalStage('FEEDBACK_INCORRECT');
    } else {
      const penalty = Math.floor((tile.baseRent || 20) * 0.5) || 20;
      handleTransaction(currentPlayer.id, -penalty, { action: 'CHAOS_FAIL', tileId: tile.id, tileName: tile.name });
      setFeedback({ tone: 'bad', title: 'Chaos challenge failed', detail: `Penalty: ${money(penalty)}.`, explanation: q.explanation || '' });
      setModalStage('FEEDBACK_INCORRECT');
    }
  };

  const canUpgradeSubgroup = (tile, playerId) => {
    if (!tile || tile.type !== 'property') return false;
    if (tile.owner !== playerId) return false;
    const groupTiles = getSubgroupTiles(board, tile);
    if (groupTiles.length === 0) return false;
    if (!groupTiles.every((t) => t.owner === playerId)) return false;
    return true;
  };

  const nextAllowedLevel = (tile) => {
    const groupTiles = getSubgroupTiles(board, tile);
    if (groupTiles.length === 0) return tile.level;
    const levels = groupTiles.map((t) => t.level || 0);
    const minLevel = Math.min(...levels);
    const maxLevel = Math.max(...levels);
    if (minLevel !== maxLevel) return tile.level;
    if (maxLevel >= 4) return 4;
    return maxLevel + 1;
  };

  const getUpgradeCostForLevel = (tile, newLevel) => {
    if (!tile || tile.type !== 'property') return 0;
    if (newLevel >= 4) return tile.castleCost || tile.price * 2;
    return tile.houseCost || tile.price;
  };

  const handleUpgrade = () => {
    const tile = activeCard.data;
    const playerId = turnRef.current;
    if (!canUpgradeSubgroup(tile, playerId)) { alert('You must own all tiles in this sub-theme and keep node levels even.'); return; }
    const desiredLevel = nextAllowedLevel(tile, playerId);
    if (desiredLevel <= tile.level) { alert('No upgrades available.'); return; }
    const cost = getUpgradeCostForLevel(tile, desiredLevel);
    if (players[playerId].money < cost) { alert('Insufficient funds.'); return; }
    handleTransaction(playerId, -cost, { action: 'UPGRADE_SUBTHEME', tileId: tile.id, tileName: tile.name, notes: `Level ${desiredLevel}` });
    setBoard((prev) => prev.map((t) => {
        if (t.type === 'property' && t.group === tile.group && t.sub === tile.sub && t.owner === playerId) {
          return { ...t, level: desiredLevel };
        }
        return t;
      })
    );
    addLog(`${players[playerId].name} upgraded ${tile.sub} to level ${desiredLevel}.`);
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

  // Final standings: opened by END GAME, by the timer, or after a last-standing win.
  const openStandings = (forced, reason) => {
    setActiveCard({ type: 'STANDINGS', forced, reason });
    setModalStage('STANDINGS');
    setModalOpen(true);
  };

  useEffect(() => {
    if (timeUp && !standingsShownRef.current && !modalOpen && !isMoving && !manageOpen) {
      standingsShownRef.current = true;
      addLog("Time's up!");
      openStandings(true, 'time');
    }
  });

  useEffect(() => {
    if (modalOpen && modalStage === 'WIN') celebrate();
    if (modalOpen && modalStage === 'MILESTONE_SUCCESS') celebrate(players[turnRef.current]?.color);
    if (modalOpen && modalStage === 'STANDINGS' && players.length > 1) celebrate();
  }, [modalOpen, modalStage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEndGame = (reason = 'ended') => {
    const standings = rankPlayers(players, board);
    const resultRows = standings.map((r) => ({
      eventType: 'GAME_RESULT',
      turn: totalTurns,
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
  const rollLabel = timeUp ? "Time's up" : isMoving ? 'Moving…' : (inDebt ? 'In debt' : `Roll — ${currentPlayer.name}`);
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
      const next = nextAllowedLevel(t);
      const canLevel = full && next > level;
      const cost = canLevel ? getUpgradeCostForLevel(t, next) : 0;
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
          <Button variant="outlined" color="warning" onClick={() => openStandings(false, 'ended')}>End game</Button>
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
              disabled={timeUp || inDebt}
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
              <Button variant="outlined" onClick={openLabManager} startIcon={<span aria-hidden>⭐</span>}>{LABELS.upgrades}</Button>
              <Button variant="outlined" color="secondary" onClick={openChaosSelect} startIcon={<span aria-hidden>⚡</span>}>
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
                rows.push({ t, kind: 'downgrade', value: Math.floor((t.houseCost || t.price) * 0.5 * n), n });
              } else rows.push({ t, kind: 'sell', value: Math.floor(t.price * 0.5) });
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
                One last chance: the <strong>{LABELS.rescueQuiz}</strong>. Answer <strong>2 of 3</strong> questions correctly and your debt is cleared, plus $500 to keep playing.
              </Typography>
              <Alert severity="warning" sx={{ mb: 3 }}>
                Each team gets <strong>one</strong> rescue per game. If you don't pass, or you go bankrupt again later, your team is out and its tiles return to the bank.
              </Alert>
              <Button fullWidth size="large" variant="contained" autoFocus onClick={startGrantExam}>Start the rescue quiz</Button>
            </>
          )}

          {modalStage === 'GRANT_QUIZ' && quizState.active && (
            <>
              <QuizProgress title={LABELS.rescueQuiz} quiz={quizState} need={2} rescue />
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
                  <Button sx={{ flex: '1 1 200px' }} size="large" variant="outlined" onClick={() => {
                    const fullRent = board.find((t) => t.id === activeCard.data.id)?.baseRent;
                    handleTransaction(turnRef.current, -fullRent, { action: 'MILESTONE_FULL_FEE', tileId: activeCard.data.id, tileName: activeCard.data.name, rentPaid: fullRent });
                    if (activeCard.ownerId !== 99) handleTransaction(activeCard.ownerId, fullRent, { action: 'MILESTONE_RENT_RECEIVED', tileId: activeCard.data.id, tileName: activeCard.data.name });
                    setModalOpen(false); passTurn();
                  }}>Pay full fee ({money(fee)})</Button>
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
                onQuit={quizState.waiting ? null : () => finishQuiz(false, quizState.score, quizState.mistakes)}
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
              <Stakes good={`you may buy this tile for ${money(activeCard.data.price)}.`} bad="your team pays $20." />
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
            const targets = board.filter((t) => t.type === 'property' && t.owner != null && t.owner !== currentPlayer.id && t.owner !== 99);
            const allCaptured = board.filter((t) => t.type === 'milestone').every((t) => t.owner !== null);
            const tokens = currentPlayer.chaosTokens;
            const buyBlocked = !allCaptured ? 'Unlocks once all 4 milestones have been captured.' : currentPlayer.money < 500 ? 'Your team needs $500.' : '';
            return (
              <>
                <Typography id={TITLE_ID} variant="h5" component="h2" gutterBottom><span aria-hidden>⚡ </span>Chaos tokens</Typography>
                <Typography sx={{ mb: 2 }}>
                  Your team has <strong>{tokens} token{tokens === 1 ? '' : 's'}</strong>. Spend one to challenge for a rival's tile: answer its question right to take it for half price. Answer wrong and you pay a small penalty.
                </Typography>
                {tokens === 0 && <Alert severity="info" sx={{ mb: 2 }}>Capture a milestone (corner tile) to earn a token.</Alert>}
                {targets.length === 0 ? (
                  <Typography color="text.secondary" sx={{ mb: 2 }}>No rival tiles to challenge yet.</Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 320, overflowY: 'auto', mb: 2 }}>
                    {targets.map((t) => (
                      <Box key={t.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.25, border: '1px solid', borderColor: 'divider', borderLeft: `6px solid ${t.color}`, borderRadius: 2 }}>
                        <TeamDot player={players[t.owner]} size={22} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 800 }}>{t.sub} {t.level > 0 && <Stars level={t.level} inline />}</Typography>
                          <Typography variant="body2" color="text.secondary">{t.group} · owned by {ownerName(t.owner)} · take it for {money(Math.floor(t.price * 0.5))}</Typography>
                        </Box>
                        <Button variant="contained" disabled={tokens <= 0} onClick={() => handleSelectChaosTarget(t)} aria-label={`Challenge for ${t.sub} owned by ${ownerName(t.owner)}`}>Challenge</Button>
                      </Box>
                    ))}
                  </Box>
                )}
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                  <Box sx={{ flex: '1 1 200px' }}>
                    <Typography sx={{ fontWeight: 800 }}>Buy a token for $500</Typography>
                    <Typography variant="body2" color="text.secondary">{buyBlocked || 'Available now.'}</Typography>
                  </Box>
                  <Button variant="outlined" color="secondary" disabled={Boolean(buyBlocked)} onClick={handleBuyChaosToken}>Buy token</Button>
                </Box>
                <Button fullWidth size="large" autoFocus sx={{ mt: 2 }} onClick={() => { setModalOpen(false); setChaosMode(null); }}>Cancel</Button>
              </>
            );
          })()}

          {modalStage === 'CHAOS_QUESTION' && activeCard?.type === 'CHAOS_CHALLENGE' && (
            <>
              <Typography id={TITLE_ID} variant="h5" component="h2" sx={{ mb: 0.5 }}>Chaos challenge · {tileLabel(chaosTargetTile)}</Typography>
              <Typography sx={{ mb: 1.5 }}>Owned by <strong>{ownerName(chaosTargetTile?.owner)}</strong>. One question decides it.</Typography>
              <Stakes
                good={`take the tile for ${money(Math.floor((chaosTargetTile?.price || 0) * 0.5))}.`}
                bad={`pay a ${money(Math.floor((chaosTargetTile?.baseRent || 20) * 0.5) || 20)} penalty.`}
              />
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

      <Dialog open={rulesOpen} onClose={() => setRulesOpen(false)} aria-labelledby="rules-title" maxWidth="sm" fullWidth>
        <DialogTitle id="rules-title">{LABELS.howToPlay}</DialogTitle>
        <DialogContent dividers>
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
            {RULES.map((r) => (
              <Box component="li" key={r.title} sx={{ display: 'flex', gap: 1.5 }}>
                <Box aria-hidden sx={{ fontSize: 24, lineHeight: 1.2, width: 32, textAlign: 'center', flexShrink: 0 }}>{r.icon}</Box>
                <Box>
                  <Typography sx={{ fontWeight: 800 }}>{r.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{r.text}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 3 }}>
          <Button href="./guide/students.html" target="_blank" rel="noopener">Full student guide<span aria-hidden>&nbsp;↗</span><Box component="span" sx={SR_ONLY}> (opens in a new tab)</Box></Button>
          <Button variant="contained" onClick={() => setRulesOpen(false)}>Got it</Button>
        </DialogActions>
      </Dialog>

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
