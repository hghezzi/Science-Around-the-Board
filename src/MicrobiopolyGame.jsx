// src/MicrobiopolyGame.jsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Button,
  Modal,
  Box,
  Typography,
  Card,
  Grid,
  Chip,
  LinearProgress,
  Collapse,
  Divider,
  Alert,
} from '@mui/material';
import { LAB_MISHAPS } from './questionBank';
import {
  getSubgroupTiles, getRentMultiplier, computeRent, rankPlayers, nextActivePlayer, activePlayers,
} from './gameRules';
import { prepareQuestion, checkAnswer, parseMishapAmount } from './questionFormats';
import { resolveImage } from './images';
import QuestionInput from './QuestionInput';

const THEME = {
  bg: '#f0f2f5',
  boardBg: '#ffffff',
  text: '#2c3e50',
  accent: '#2196f3',
  danger: '#e91e63',
  success: '#4caf50',
  gridLine: '#e0e0e0',
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
  borderTop: `6px solid ${THEME.accent}`,
};

// ------------------------------------------------------------------
//  HELPER FUNCTIONS
// ------------------------------------------------------------------

function downloadCSV(rows, filename = 'microbiopoly_log.csv') {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((r) =>
      headers.map((h) => {
          const val = r[h] ?? '';
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        }).join(',')
    ),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const DiceBox = ({ num }) => (
  <div
    style={{
      width: 50,
      height: 50,
      border: `2px solid ${THEME.text}`,
      borderRadius: 8,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      fontSize: 24,
      fontWeight: 'bold',
      background: '#fff',
      color: THEME.text,
    }}
  >
    {num}
  </div>
);

// ------------------------------------------------------------------
//  MAIN COMPONENT
// ------------------------------------------------------------------

export default function MicrobiopolyGame({
  boardData,
  playerCount,
  startingPlayerIndex = 0,
  onExit,
  onEndGame,
  imageMap = {},
  tsvRows = [],
  sessionMinutes = 0,
}) {
  const generatePlayers = (count) => {
    const colors = ['#e57373', '#64b5f6', '#81c784', '#ffb74d'];
    const names = ['Red Team', 'Blue Team', 'Green Team', 'Orange Team'];
    let p = [];
    for (let i = 0; i < count; i++) {
      p.push({
        id: i,
        name: names[i],
        color: colors[i],
        position: 0,
        money: 2500,
        jailed: false,
        chaosTokens: 0,
        rescueUsed: false,
        eliminated: false,
      });
    }
    if (count === 1) p[0].name = 'Candidate';
    return p;
  };

  const [board, setBoard] = useState(boardData);
  const [players, setPlayers] = useState(generatePlayers(playerCount));
  const getImgSrc = (imgName) => resolveImage(imgName, imageMap);
  const [turn, setTurn] = useState(startingPlayerIndex || 0);
  const turnRef = useRef(startingPlayerIndex || 0);

  const [totalTurns, setTotalTurns] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const [dice, setDice] = useState([1, 1]);
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

  const [manualUnlocked, setManualUnlocked] = useState(false);
  const [showManual, setShowManual] = useState(false);
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
        eliminatePlayer(player.id, 'Insolvent after using Emergency Grant');
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
        eliminatePlayer(currentPlayer.id, 'Emergency Grant denied');
        return;
    }
    const debt = Math.abs(currentPlayer.money);
    handleTransaction(currentPlayer.id, debt + 500, { action: 'EMERGENCY_GRANT', notes: 'Grant Approved' });
    setPlayers(prev => prev.map(p => p.id === currentPlayer.id ? { ...p, rescueUsed: true } : p));
    setFeedback(`Grant Approved! Your $${debt} debt is cleared and you receive $500 in emergency funding. This was your team's only rescue: if you go bankrupt again, you are out.`);
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
  const getTileStyle = (index) => {
    const style = {
      gridColumn: 'auto', gridRow: 'auto', border: '1px solid #bbb', position: 'relative',
      display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: 'white',
      justifyContent: 'flex-start', minWidth: '85px', minHeight: '85px', fontSize: '10px',
    };
    if (index >= 0 && index <= 9) { style.gridRow = 10; style.gridColumn = 10 - index; }
    else if (index >= 9 && index <= 18) { style.gridColumn = 1; style.gridRow = 10 - (index - 9); }
    else if (index >= 18 && index <= 27) { style.gridRow = 1; style.gridColumn = 1 + (index - 18); }
    else if (index >= 27 && index <= 35) { style.gridColumn = 10; style.gridRow = 1 + (index - 27); }
    return style;
  };

  const toggleManual = () => {
    if (manualUnlocked) setShowManual((prev) => !prev);
    else {
      if (players[turnRef.current].money >= 50) {
        handleTransaction(turnRef.current, -50, { action: 'CONSULT_MANUAL' });
        setManualUnlocked(true);
        setShowManual(true);
        addLog('Manual purchased (-$50).');
      } else alert('Insufficient funds.');
    }
  };

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
        addLog(`MASTERY: ${players[turnRef.current].name} captured ${tile.name}!`);
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
        setFeedback(`Impressive! Fees reduced to $${halfRent}.`);
        setModalStage('FEEDBACK_INCORRECT');
      } else {
        const fullRent = baseRent;
        handleTransaction(turnRef.current, -fullRent, { action: 'MILESTONE_CHALLENGE_FAIL', tileId: tile.id, tileName: tile.name, rentPaid: fullRent, correct: false });
        if (tile.owner !== 99 && tile.owner != null) handleTransaction(tile.owner, fullRent, { action: 'MILESTONE_RENT_RECEIVED', tileId: tile.id, tileName: tile.name });
        setFeedback(`Quiz Failed. Paying full expert fees: $${fullRent}.`);
        setModalStage('FEEDBACK_INCORRECT');
      }
    }
  };

  const checkLanding = (didPassGo) => {
    setPlayers((currentPlayers) => {
      const currentTurnIndex = turnRef.current;
      const p = currentPlayers[currentTurnIndex];
      const tile = board[p.position];

      if (didPassGo) {
        handleTransaction(p.id, 200, { action: 'PASS_GO' });
        addLog('Grant Renewal (+$200).');
      }

      setManualUnlocked(false);
      setShowManual(false);
      setFeedback(null);

      if (tile.owner === p.id) {
        setActiveCard({ type: 'MSG', data: tile, msg: 'Welcome back to your lab. Operations are normal.' });
        setModalStage('MSG');
        setModalOpen(true);
        return currentPlayers;
      }

      if (tile.type === 'milestone') {
        if (tile.owner == null) {
          if (p.money >= tile.price) {
            setActiveCard({ type: 'MILESTONE', data: tile });
            setModalStage('MILESTONE_INTRO');
            setModalOpen(true);
          } else {
            setActiveCard({ type: 'MSG', data: tile, msg: 'Insufficient funds for mastery certification.' });
            setModalStage('MSG');
            setModalOpen(true);
          }
        } else if (tile.owner !== p.id) {
          setActiveCard({ type: 'MILESTONE_CHALLENGE', data: tile, ownerId: tile.owner });
          setModalStage('MILESTONE_CHALLENGE_INTRO');
          setModalOpen(true);
        }
        return currentPlayers;
      }

      if (tile.questions && tile.questions.length > 0) {
        if (tile.owner != null && tile.owner !== p.id) {
          const rentBase = tile.type === 'sequencing_core' ? tile.baseRent : computeRent(board, tile);
          const qPool = tile.questions || [];
          const randomQ = prepareQuestion(qPool[Math.floor(Math.random() * qPool.length)]);
          setActiveCard({ type: 'RENT_DEFENSE', data: tile, rent: rentBase, ownerName: players[tile.owner]?.name || 'Rival Lab', ownerId: tile.owner, payerId: p.id, payerName: p.name, q: randomQ });
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
            .filter(r => (r.type || '').trim().toLowerCase() === 'mishap')
            .map(r => ({ msg: r.question, fact: r.explanation }));

          // 2. Use TSV mishaps if found; otherwise fallback to defaults
          const mishapPool = tsvMishaps.length > 0 ? tsvMishaps : (LAB_MISHAPS || []);
          
          const randomMishap = mishapPool.length > 0 ? mishapPool[Math.floor(Math.random() * mishapPool.length)] : { msg: 'Equipment Malfunction (-$100)', fact: null };
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
      return currentPlayers;
    });
  };

  const handleRoll = () => {
    if (isMoving || timeUp || players[turn].eliminated) return;
    if (players[turn].money < 0) {
        alert("You are in debt! You must resolve your funding crisis before continuing.");
        return;
    }
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    setDice([d1, d2]);
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

  const handleExportCSV = () => { if (!logRows.length) { alert('No logged events.'); return; } downloadCSV(logRows); };
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

  return (
    <div style={{ backgroundColor: THEME.bg, minHeight: '100vh', width: '100vw', padding: '20px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '1400px', margin: '0 auto 20px auto', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ color: THEME.text, fontWeight: 'bold' }}>THE SEQUENCING RUN <Chip label={`TURN ${totalTurns}`} size="small" sx={{ ml: 2, bgcolor: THEME.accent, color: '#fff' }} />
          {endsAt && (
            <Chip
              label={timeUp ? "TIME'S UP" : `⏱ ${formatClock(timeLeftMs)}`}
              size="small"
              color={timeUp ? 'error' : timeLeftMs <= 5 * 60000 ? 'warning' : 'default'}
              sx={{ ml: 1, fontWeight: 'bold' }}
              aria-label="Time remaining"
            />
          )}</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" color="warning" onClick={() => openStandings(false, 'ended')}>END GAME</Button>
          <Button variant="outlined" color="secondary" onClick={handleExportCSV}>Export CSV</Button>
          <Button color="error" variant="outlined" onClick={onExit}>EXIT SESSION</Button>
        </Box>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 40, alignItems: 'flex-start', transform: 'scale(0.85)', transformOrigin: 'top center' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 85px)', gridTemplateRows: 'repeat(10, 85px)', gap: '4px', padding: '20px', background: 'white', borderRadius: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', position: 'relative' }}>
          <div style={{ gridColumn: '2 / span 8', gridRow: '2 / span 8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.1, zIndex: 1, pointerEvents: 'none' }}>
            <Typography variant="h1" sx={{ fontWeight: 'bold', fontSize: '8rem' }}>HGPvS</Typography>
            <Typography variant="caption" sx={{ fontSize: '1rem', marginTop: '10px', opacity: 1, fontWeight: 'bold' }}>© 2025 Hans Ghezzi – Science Around the Board</Typography>
          </div>
          {board.map((tile, index) => {
            const isRival = tile.owner === 99;
            const ownerColor = isRival ? '#000' : tile.owner != null ? players[tile.owner]?.color : null;
            const isCorner = tile.type === 'milestone';
            const onMouseEnter = () => handleTileHover(tile);
            const onMouseLeave = () => clearHover();
            if (isCorner) return (
                <div key={tile.id} style={{ ...getTileStyle(index), border: `3px solid ${tile.owner != null ? ownerColor : '#1a237e'}`, backgroundColor: ownerColor ? `${ownerColor}22` : '#f5f5f5', justifyContent: 'center' }} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
                  <div style={{ fontSize: '20px' }}>🏆</div>
                  <div style={{ textAlign: 'center', fontWeight: 'bold', color: '#1a237e', fontSize: '11px', lineHeight: 1.2 }}>{tile.name}</div>
                  {tile.sub && <div style={{ fontSize: '10px', fontWeight: 'bold', color: THEME.danger, marginTop: 2 }}>{tile.sub}</div>}
                  {tile.price > 0 && !tile.sub && <div style={{ fontSize: '10px', marginTop: 2 }}>${tile.price}</div>}
                  <div style={{ display: 'flex', gap: 1, position: 'absolute', bottom: 4 }}>
                    {players.map((p) => p.position === index && !p.eliminated && <motion.div key={p.id} layoutId={`p-${p.id}`} transition={{ duration: 0.2, ease: 'linear' }} style={{ width: 14, height: 14, borderRadius: '50%', background: p.color, border: '2px solid white', zIndex: 10 }} />)}
                  </div>
                </div>
              );
            return (
              <div key={tile.id} style={{ ...getTileStyle(index), border: ownerColor ? `3px solid ${ownerColor}` : '1px solid #ccc' }} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
                {tile.type === 'property' && <div style={{ width: '100%', height: '20%', background: tile.color, borderBottom: '1px solid #eee' }} />}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '4px' }}>
                  <div style={{ textAlign: 'center', fontWeight: 'bold', color: isRival ? '#000' : '#444', fontSize: '10px', lineHeight: 1.1, overflow: 'hidden' }}>{tile.name} {isRival && '(RIVAL)'}</div>
                  {tile.sub && <div style={{ fontSize: '8px', color: '#999' }}>{tile.sub}</div>}
                  <div style={{ fontSize: '11px', marginTop: 'auto', fontWeight: 'bold' }}>
                    {tile.level > 0 ? '⭐'.repeat(tile.level) : ''}
                    {tile.price > 0 && !tile.valDisplay && <span style={{ color: '#777' }}>${tile.price}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 1, marginBottom: 2, position: 'absolute', bottom: -6, zIndex: 10 }}>
                  {players.map((p) => p.position === index && !p.eliminated && <motion.div key={p.id} layoutId={`p-${p.id}`} transition={{ duration: 0.2, ease: 'linear' }} style={{ width: 14, height: 14, borderRadius: '50%', background: p.color, border: '2px solid white', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }} />)}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ width: 340 }}>
          <Card sx={{ p: 2, mb: 2, borderRadius: 2 }}>
            <Typography variant="subtitle2" color="textSecondary" gutterBottom>RESEARCH GROUPS</Typography>
            {players.map((p, i) => (
              <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, p: 1, borderRadius: 1, bgcolor: turn === i ? `${p.color}22` : 'transparent', borderLeft: `4px solid ${p.color}`, position: 'relative' }}>
                <span style={{ fontWeight: turn === i ? 'bold' : 'normal', textDecoration: p.eliminated ? 'line-through' : 'none', opacity: p.eliminated ? 0.5 : 1 }}>
                  {p.name} {p.rescueUsed && !p.eliminated && <span title="Emergency Grant used">🛟</span>}
                </span>
                <span style={{ color: p.money < 0 ? 'red' : 'inherit' }}>{p.eliminated ? 'OUT' : `$${p.money}`}</span>
                <AnimatePresence>
                  {moneyFloats[p.id]?.visible && (
                    <motion.span key={moneyFloats[p.id].id} initial={{ opacity: 0, y: 10, scale: 0.5 }} animate={{ opacity: 1, y: -20, scale: 1.2 }} exit={{ opacity: 0 }}
                      style={{ position: 'absolute', right: 10, top: 0, color: moneyFloats[p.id].amount > 0 ? THEME.success : THEME.danger, fontWeight: 'bold', fontSize: '1.2rem', textShadow: '0 1px 2px white' }}>
                      {moneyFloats[p.id].amount > 0 ? '+' : ''}{moneyFloats[p.id].amount}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Box>
            ))}
            <Typography variant="caption">Chaos Tokens (current): <strong>{currentPlayer?.chaosTokens ?? 0}</strong></Typography>
          </Card>

          <Card sx={{ p: 3, mb: 2, borderRadius: 2, textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 20 }}>
              <DiceBox num={dice[0]} />
              <DiceBox num={dice[1]} />
            </div>
            <Button variant="contained" size="large" fullWidth onClick={handleRoll} disabled={isMoving || timeUp || currentPlayer.money < 0} sx={{ bgcolor: currentPlayer?.color || '#555', color: '#fff', mb: 1 }}>
              {timeUp ? "TIME'S UP" : isMoving ? 'PROCESSING...' : (currentPlayer.money < 0 ? 'IN DEBT' : 'ROLL')}
            </Button>
            <Grid container spacing={1}>
              <Grid item xs={6}><Button variant="outlined" fullWidth onClick={openLabManager}>LAB MANAGER</Button></Grid>
              <Grid item xs={6}><Button variant="outlined" fullWidth color="warning" onClick={openChaosSelect}>USE CHAOS</Button></Grid>
            </Grid>
          </Card>

          {hoverTile && (
            <Card sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: '#f5f5f5', border: '1px solid #e0e0e0' }}>
              <Typography variant="subtitle2" gutterBottom>Tile Info</Typography>
              <Typography variant="body2"><strong>{hoverTile.name}</strong> {hoverTile.sub ? `(${hoverTile.sub})` : ''}</Typography>
              <Typography variant="caption" display="block">Type: {hoverTile.type}</Typography>
              {hoverTile.owner != null && <Typography variant="caption" display="block">Owner: {hoverTile.owner === 99 ? 'Rival Lab' : players[hoverTile.owner]?.name}</Typography>}
              {(hoverTile.type === 'property' || hoverTile.type === 'sequencing_core') && (
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                  Base rent: ${hoverTile.baseRent} — Mult: {hoverTile.multiplier.toFixed(2)} — Rent: <strong>${hoverTile.rent}</strong>
                </Typography>
              )}
            </Card>
          )}

          <Card sx={{ p: 2, height: 200, overflowY: 'auto', borderRadius: 2, bgcolor: '#fafafa', boxShadow: 'none', border: '1px solid #eee' }}>
            <ul style={{ listStyle: 'none', padding: 0, fontSize: '0.75rem', color: '#555' }}>{logs.map((l, i) => <li key={i} style={{ marginBottom: 4, borderBottom: '1px solid #eee' }}>{l}</li>)}</ul>
          </Card>
        </div>
      </div>

      <Modal open={modalOpen} disableEscapeKeyDown>
        <Box sx={modalStyle}>
          {activeCard?.type === 'LIQUIDATION' && modalStage === 'LIQUIDATION' && (
            <>
                <Typography variant="h4" color="error" gutterBottom>Funding Crisis</Typography>
                <Typography variant="body1" paragraph>
                    You are in debt (<strong>${activeCard.debt}</strong>). You must liquidate assets to continue.
                </Typography>
                <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #eee', padding: '10px', marginBottom: '20px' }}>
                    {activeCard.assets.map(t => {
                        const isDowngrade = t.level > 0;
                        const sellValue = Math.floor((isDowngrade ? (t.houseCost||t.price) : t.price) * 0.5);
                        
                        const actionLabel = isDowngrade ? `DOWNGRADE GROUP (Lvl ${t.level}->${t.level-1})` : "SELL DEED";
                        
                        return (
                            <Box key={t.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, p: 1, border: '1px solid #ddd' }}>
                                <div>
                                    <strong>{t.name}</strong> ({t.sub})
                                    <div style={{ fontSize: '0.8rem', color: '#666' }}>Lvl {t.level}</div>
                                </div>
                                <Button variant="contained" color="error" size="small" onClick={() => handleSellAsset(t)}>
                                    {actionLabel} (+${sellValue} per tile)
                                </Button>
                            </Box>
                        )
                    })}
                </div>
            </>
          )}

          {activeCard?.type === 'GRANT' && modalStage === 'GRANT_INTRO' && (
            <>
                <Typography variant="h4" color="error" gutterBottom>Academic Probation</Typography>
                <Typography variant="body1" paragraph>
                    You are insolvent (<strong>${activeCard.debt} in debt</strong>) and have no assets left to sell.
                    Your lab is on the verge of shutdown.
                </Typography>
                <Typography variant="body1" paragraph>
                    You may apply for an <strong>Emergency Grant</strong>: a 3-question review. Answer at least 2 correctly to be rescued.
                </Typography>
                <Alert severity="warning" sx={{ mb: 3 }}>
                    Each team gets <strong>one</strong> rescue per game. If approved, your debt is cleared and you receive $500.
                    If denied, or if you go bankrupt again later, your team is eliminated and its properties return to the bank.
                </Alert>
                <Button fullWidth variant="contained" onClick={startGrantExam}>APPLY FOR EMERGENCY GRANT</Button>
            </>
          )}

          {modalStage === 'GRANT_QUIZ' && quizState.active && (
            <>
              <Typography variant="overline">Grant Review: Question {quizState.qIndex + 1} of 3</Typography>
              <LinearProgress variant="determinate" value={(quizState.qIndex / 3) * 100} sx={{ mb: 3 }} />
              {renderQuestion(quizState.questions[quizState.qIndex], handleQuizAnswer, {
                variant: 'h6', key: `grant-${quizState.qIndex}`,
                reveal: quizState.waiting ? { ...quizState.result, response: quizState.selected } : null,
              })}
              {quizState.waiting && (
                <Box sx={{ mt: 3, p: 2, bgcolor: '#f9f9f9', borderRadius: 2, borderLeft: `4px solid ${quizState.isCorrect ? THEME.success : THEME.danger}` }}>
                  <Typography variant="subtitle2" fontWeight="bold" color={quizState.isCorrect ? 'success.main' : 'error.main'}>
                    {quizState.isCorrect ? 'Correct!' : 'Incorrect'}
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>{quizState.questions[quizState.qIndex].explanation || 'No explanation provided.'}</Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button variant="contained" onClick={handleNextQuestion}>
                      {quizState.qIndex < quizState.questions.length - 1 ? 'NEXT QUESTION' : 'SUBMIT APPLICATION'}
                    </Button>
                  </Box>
                </Box>
              )}
            </>
          )}

          {modalStage === 'GRANT_RESULT' && (
            <>
                <Typography variant="h5" color="success.main">Application Successful</Typography>
                <Typography variant="body1" paragraph>{feedback}</Typography>
                <Button fullWidth variant="contained" onClick={passTurn}>RESUME OPERATIONS</Button>
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
              <Typography variant="h4" color="error" gutterBottom>Lab Closed</Typography>
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
                <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', mb: 2, '& td, & th': { p: 1, borderBottom: '1px solid #eee', textAlign: 'right' }, '& td:nth-of-type(2), & th:nth-of-type(2)': { textAlign: 'left' } }}>
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
                <Alert severity="info" sx={{ mb: 2 }}>Next: the post-game survey. Then export your CSV from the summary screen.</Alert>
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
              <Typography variant="h4" color="error">⚠️ EXPERT CHALLENGE</Typography>
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
                 <Box sx={{ mt: 3, p: 2, bgcolor: '#f9f9f9', borderRadius: 2, borderLeft: `4px solid ${quizState.isCorrect ? THEME.success : THEME.danger}` }}>
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
                <Typography variant="h6">Data Validation</Typography>
                {activeCard.data.manual && <Button size="small" variant="outlined" onClick={toggleManual}>{manualUnlocked ? showManual ? 'HIDE MANUAL' : 'SHOW MANUAL' : 'MANUAL ($50)'}</Button>}
              </Box>
              <Collapse in={showManual}><Alert severity="info" sx={{ mb: 3 }}><Typography variant="body2" style={{ whiteSpace: 'pre-wrap' }}>{activeCard.data.manual}</Typography></Alert></Collapse>
              <Divider sx={{ my: 2 }} />
              
              {renderQuestion(activeCard.q, handleAnswer)}
            </>
          )}

          {activeCard?.type === 'QUESTION' && modalStage === 'DECISION' && (
            <>
              <Typography variant="h5" color="success.main">Correct</Typography>
              <Typography sx={{ mt: 1, mb: 2, fontStyle: 'italic', color: '#555' }}>{feedback}</Typography>
              <Divider />
              <Typography sx={{ my: 2 }}>Publish (Buy) for ${activeCard.data.price}?</Typography>
              <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
                <Button fullWidth variant="contained" onClick={handleBuy}>PUBLISH</Button>
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
              <Typography variant="h5" gutterBottom>{activeCard.data.name}</Typography>
              <Typography variant="body1">{activeCard.msg}</Typography>
              {activeCard.data.fact && <Alert severity="info" sx={{ mt: 2 }}><Typography variant="body2">{activeCard.data.fact}</Typography></Alert>}
              <Button fullWidth variant="contained" sx={{ mt: 3 }} onClick={passTurn}>CONTINUE</Button>
            </>
          )}

          {modalStage === 'FEEDBACK_INCORRECT' && activeCard?.type !== 'MISHAP' && activeCard?.type !== 'WIN' && (
            <>
              <Typography variant="h5" color={feedback?.startsWith('Correct') ? 'success.main' : 'error'}>{feedback?.startsWith('Correct') ? 'Success!' : 'Notice'}</Typography>
              <Typography variant="body1" sx={{ mt: 2 }}>{feedback}</Typography>
              <Button fullWidth variant="contained" sx={{ mt: 3 }} onClick={passTurn}>CONTINUE</Button>
            </>
          )}

          {activeCard?.type === 'UPGRADE_OFFER' && (
            <>
              <Typography variant="h5">Upgrade Infrastructure</Typography>
              <Button fullWidth variant="contained" onClick={handleUpgrade} sx={{ mt: 2 }}>UPGRADE SUB-THEME</Button>
              <Button fullWidth onClick={() => setModalOpen(false)} sx={{ mt: 1 }}>CANCEL</Button>
            </>
          )}

          {activeCard?.type === 'RENT_DEFENSE' && modalStage === 'QUESTION' && (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" sx={{ color: THEME.danger }}>Rent Due: ${activeCard.rent}</Typography>
                {activeCard.data.manual && <Button size="small" variant="outlined" onClick={toggleManual}>{manualUnlocked ? showManual ? 'HIDE MANUAL' : 'SHOW MANUAL' : 'MANUAL ($50)'}</Button>}
              </Box>
              <Box sx={{ bgcolor: '#e3f2fd', p: 2, borderRadius: 2, mb: 2 }}>
                <Typography variant="subtitle2" sx={{ color: THEME.accent, fontWeight: 'bold' }}>{activeCard.payerName} (You) must answer!</Typography>
              </Box>
              <Collapse in={showManual}><Alert severity="info" sx={{ mb: 3 }}><Typography variant="body2" style={{ whiteSpace: 'pre-wrap' }}>{activeCard.data.manual}</Typography></Alert></Collapse>
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
          <Typography variant="h5">Lab Manager</Typography>
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
    </div>
  );
}