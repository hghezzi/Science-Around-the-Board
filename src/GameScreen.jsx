// src/GameScreen.jsx
import React, { useState, useEffect, useRef } from 'react';
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

  const [board, setBoard] = useState(boardData);
  const [players, setPlayers] = useState(generatePlayers(playerCount));
  const getImgSrc = (imgName) => resolveImage(imgName, imageMap, imageBase);
  const [turn, setTurn] = useState(startingPlayerIndex || 0);
  const turnRef = useRef(startingPlayerIndex || 0);
  // Latest players for event handlers. Side effects must not run inside state
  // updaters: React runs those twice in development (it doubled payouts).
  const playersRef = useRef(players);
  useEffect(() => { playersRef.current = players; }, [players]);

  const [totalTurns, setTotalTurns] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const [dice, setDice] = useState([1, 1]);
  const [rollId, setRollId] = useState(0);
  const [logs, setLogs] = useState(() => [
    playerCount > 1 ? `${generatePlayers(playerCount)[startingPlayerIndex || 0].name} starts (best pre-game survey score).` : 'System initialized.',
  ]);

  // Modal + flow state
  const [modalOpen, setModalOpen] = useState(false);
  const [activeCard, setActiveCard] = useState(null);
  const [modalStage, setModalStage] = useState('QUESTION');
  const [feedback, setFeedback] = useState(null);
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
  const [logRows, setLogRows] = useState([]);

  // Optional session timer: when it runs out, the game ends on net worth.
  const [endsAt] = useState(() => (sessionMinutes > 0 ? Date.now() + sessionMinutes * 60000 : null));
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
        targetScore: 2, waiting: false, selected: null, isCorrect: null,
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
    setFeedback(`Your $${debt} debt is cleared and you receive $500 to keep playing. This was your team's only rescue: if you go bankrupt again, you are out.`);
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
    });
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
      mistakes: newMistakes 
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
        setModalStage('MILESTONE_FAIL');
      }
    } else if (mode === 'MILESTONE_CHALLENGE') {
      const baseRent = tile.baseRent || 0;
      // CHANGED: Score >= 5 (Allows 1 mistake)
      if (passed && score >= 5) {
        const halfRent = Math.floor(baseRent / 2);
        handleTransaction(turnRef.current, -halfRent, { action: 'MILESTONE_CHALLENGE_SUCCESS', tileId: tile.id, tileName: tile.name, rentPaid: halfRent, correct: true });
        if (tile.owner !== 99 && tile.owner != null) handleTransaction(tile.owner, halfRent, { action: 'MILESTONE_RENT_RECEIVED', tileId: tile.id, tileName: tile.name });
        setFeedback(`Impressive! Milestone fee halved to $${halfRent}.`);
        setModalStage('FEEDBACK_INCORRECT');
      } else {
        const fullRent = baseRent;
        handleTransaction(turnRef.current, -fullRent, { action: 'MILESTONE_CHALLENGE_FAIL', tileId: tile.id, tileName: tile.name, rentPaid: fullRent, correct: false });
        if (tile.owner !== 99 && tile.owner != null) handleTransaction(tile.owner, fullRent, { action: 'MILESTONE_RENT_RECEIVED', tileId: tile.id, tileName: tile.name });
        setFeedback(`Quiz Failed. Paying the full milestone fee: $${fullRent}.`);
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
        setActiveCard({ type: 'MISHAP', data: { ...tile, fact }, msg });
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
    if (result.correct) {
      setFeedback(q.explanation || '');
      setModalStage('DECISION');
    } else {
      setFeedback(`Incorrect (-$20). Correct answer: ${result.correctText}${q.explanation ? `\n\n${q.explanation}` : ''}`);
      handleTransaction(turnRef.current, -20, { action: 'QUESTION_PENALTY', tileId: activeCard.data.id, notes: 'Incorrect on acquisition question' });
      setModalStage('FEEDBACK_INCORRECT');
    }
  };

  const handleBuy = () => {
    const tile = activeCard.data;
    if (currentPlayer.money < tile.price) { alert("Insufficient funds!"); return; }
    handleTransaction(turnRef.current, -tile.price, { action: 'BUY_PROPERTY', tileId: tile.id, tileName: tile.name });
    setBoard((prev) => prev.map((t) => t.id === tile.id ? { ...t, owner: turnRef.current } : t));
    passTurn();
  };

  const passTurn = () => {
    setModalOpen(false);
    setTurn((prev) => nextActivePlayer(players, prev));
  };

  const handleRentChallengeAnswer = (response) => {
    const tile = activeCard.data;
    const result = checkAnswer(activeCard.q, response);
    const isCorrect = result.correct;
    logAnswer('RENT_Q', activeCard.q, result, { tileId: tile.id, tileName: tile.name });
    const rentBase = tile.type === 'sequencing_core' ? tile.baseRent : computeRent(board, tile);
    const rentToPay = isCorrect ? Math.floor(rentBase / 2) : rentBase;
    setFeedback((isCorrect ? 'Correct! Rent discounted.' : `Incorrect. Paying full rent. Correct answer: ${result.correctText}`) + `\n\n${activeCard.q.explanation || ''}`);
    handleTransaction(activeCard.payerId, -rentToPay, { action: 'RENT_PAYMENT', tileId: tile.id, tileName: tile.name, rentPaid: rentToPay, correct: isCorrect });
    if (activeCard.ownerId !== 99 && activeCard.ownerId != null) handleTransaction(activeCard.ownerId, rentToPay, { action: 'RENT_RECEIVED', tileId: tile.id, tileName: tile.name });
    setModalStage('FEEDBACK_INCORRECT');
  };

  const openChaosSelect = () => {
    setChaosMode('SELECT_PROPERTY');
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
    if (!tile) { setModalStage('FEEDBACK_INCORRECT'); setFeedback('Error: no target tile.'); return; }
    setPlayers((prev) => prev.map((p) => p.id === currentPlayer.id ? { ...p, chaosTokens: Math.max(0, p.chaosTokens - 1) } : p));

    if (isCorrect) {
      const cost = Math.floor((tile.price || 0) * 0.5);
      if (currentPlayer.money < cost) { setFeedback('Correct, but insufficient funds.'); setModalStage('FEEDBACK_INCORRECT'); return; }
      handleTransaction(currentPlayer.id, -cost, { action: 'CHAOS_STEAL', tileId: tile.id, tileName: tile.name });
      if (tile.owner != null && tile.owner !== 99) handleTransaction(tile.owner, cost, { action: 'CHAOS_SELL', tileId: tile.id, tileName: tile.name });
      setBoard((prev) => prev.map((t) => t.id === tile.id ? { ...t, owner: currentPlayer.id, level: 0 } : t));
      setFeedback(`Chaos success! Acquired ${tile.name} for $${cost}.`);
      setModalStage('FEEDBACK_INCORRECT');
    } else {
      const penalty = Math.floor((tile.baseRent || 20) * 0.5) || 20;
      handleTransaction(currentPlayer.id, -penalty, { action: 'CHAOS_FAIL', tileId: tile.id, tileName: tile.name });
      setFeedback(`Chaos failed. Penalty: $${penalty}. Correct answer: ${result.correctText}${q.explanation ? `\n\n${q.explanation}` : ''}`);
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
  const rollLabel = timeUp ? "Time's up" : isMoving ? 'Moving…' : (currentPlayer.money < 0 ? 'In debt' : `Roll — ${currentPlayer.name}`);

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
          <Button variant="contained" color="warning" onClick={() => openStandings(false, 'ended')}>End game</Button>
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
              disabled={isMoving || timeUp || currentPlayer.money < 0}
              sx={{ bgcolor: currentPlayer.color, color: '#fff', px: 5, py: 1.25, fontSize: '1.1rem', boxShadow: 3, '&:hover': { bgcolor: currentPlayer.color, filter: 'brightness(0.92)' }, textShadow: '0 1px 2px rgba(0,0,0,.35)' }}
            >
              {rollLabel}
            </Button>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="outlined" onClick={openLabManager}>🏗️ {LABELS.upgrades}</Button>
              <Button variant="outlined" color="warning" onClick={openChaosSelect}>⚡ Use chaos ({currentPlayer.chaosTokens})</Button>
            </Box>

            <Box sx={{ minHeight: '7cqw', width: '80%', maxWidth: 420 }}>
              {hoverTile ? (
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'background.paper', borderLeft: `6px solid ${hoverTile.color}`, boxShadow: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>{hoverTile.type === 'property' ? `${hoverTile.sub} · ${hoverTile.name}` : hoverTile.name}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {LABELS.tileTypes[hoverTile.type] || hoverTile.type}
                    {hoverTile.owner != null && ` · Owner: ${hoverTile.owner === 99 ? LABELS.rivalTeam : players[hoverTile.owner]?.name}`}
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
              <Typography variant="overline">{LABELS.rescueQuiz}: Question {quizState.qIndex + 1} of 3</Typography>
              <LinearProgress variant="determinate" value={(quizState.qIndex / 3) * 100} sx={{ mb: 3 }} />
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
                <Button fullWidth variant="outlined" onClick={() => {
                    const fullRent = board.find((t) => t.id === activeCard.data.id)?.baseRent;
                    handleTransaction(turnRef.current, -fullRent, { action: 'MILESTONE_FULL_FEE', tileId: activeCard.data.id, tileName: activeCard.data.name, rentPaid: fullRent });
                    if (activeCard.ownerId !== 99) handleTransaction(activeCard.ownerId, fullRent, { action: 'MILESTONE_RENT_RECEIVED', tileId: activeCard.data.id, tileName: activeCard.data.name });
                    setModalOpen(false); passTurn();
                }}>PAY FULL</Button>
              </Box>
            </>
          )}

          {modalStage === 'QUIZ_START' && quizState.active && quizState.mode !== 'GRANT' && (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                {/* NUMBERING */}
                <Typography variant="overline">Question {quizState.qIndex + 1} of {quizState.questions.length}</Typography>
                <Button size="small" color="error" onClick={() => finishQuiz(false, quizState.score, quizState.mistakes)}>QUIT</Button>
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
                {board.filter((t) => t.type === 'property' && t.owner != null && t.owner !== currentPlayer.id && t.owner !== 99).map((t) => (
                  <Box key={t.id} sx={{ p: 1, mb: 1, display: 'flex', justifyContent: 'space-between', border: `1px solid ${t.color}`, borderRadius: 1 }}>
                    <div><strong>{t.name}</strong> ({t.sub})</div>
                    <Button size="small" variant="contained" onClick={() => handleSelectChaosTarget(t)}>CHALLENGE</Button>
                  </Box>
                ))}
              </div>
              <Button fullWidth sx={{ mt: 2 }} onClick={() => { setModalOpen(false); setChaosMode(null); }}>CANCEL</Button>
            </>
          )}

          {modalStage === 'CHAOS_QUESTION' && activeCard?.type === 'CHAOS_CHALLENGE' && (
            <>
              <Typography variant="h6">Chaos Challenge</Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>Target: {chaosTargetTile?.name}</Typography>
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
