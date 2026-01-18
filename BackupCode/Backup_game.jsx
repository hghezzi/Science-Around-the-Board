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
  AlertTitle,
  Paper,
} from '@mui/material';
import { LAB_MISHAPS } from './questionBank';

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
  width: 700,
  bgcolor: 'background.paper',
  boxShadow: 24,
  p: 4,
  borderRadius: 3,
  outline: 'none',
  borderTop: `6px solid ${THEME.accent}`,
};

// Simple internal bank of *code-flavoured* questions for chaos / property challenges
const CODE_CHALLENGE_BANK = [
  {
    prompt:
      'You receive a QIIME2 artifact with feature table data. Which command would you use to summarize feature counts per sample?',
    options: [
      'qiime tools view table.qza',
      'qiime feature-table summarize --i-table table.qza --o-visualization table.qzv',
      'qiime taxa barplot --i-table table.qza',
      'qiime demux summarize --i-data demux.qza',
    ],
    answer: 1,
    explanation:
      'feature-table summarize generates counts per-sample and per-feature, with sampling depth summaries; this is typically the first command after denoising.',
  },
  {
    prompt:
      'You want to compute a Bray–Curtis distance matrix from an ASV table in R using phyloseq. Which function is appropriate?',
    options: [
      'ordinate(ps, method = "PCoA", distance = "unifrac")',
      'vegdist(otu_table(ps), method = "bray")',
      'distance(ps, method = "bray")',
      'adonis(ps ~ treatment)',
    ],
    answer: 2,
    explanation:
      'In phyloseq, distance(ps, method = "bray") computes a Bray–Curtis distance matrix directly from the phyloseq object.',
  },
  {
    prompt:
      'You have paired-end 16S reads with primers still attached. In QIIME2, where do you normally remove primers before denoising with DADA2?',
    options: [
      'Use cutadapt trim-paired before qiime dada2 denoise-paired',
      'Use qiime feature-table filter-samples',
      'Use qiime phylogeny align-to-tree-mafft-fasttree',
      'Primers do not need to be removed for 16S analysis',
    ],
    answer: 0,
    explanation:
      'Primer removal should be done before denoising. cutadapt trim-paired is commonly used to trim primers from both forward and reverse reads.',
  },
];

// Rent multiplier logic based on ownership + development level
function getSubgroupTiles(board, tile) {
  if (!tile || tile.type !== 'property') return [];
  return board.filter(
    (t) =>
      t.type === 'property' &&
      t.group === tile.group &&
      t.sub === tile.sub
  );
}

function ownsFullSubgroup(board, tile, ownerId) {
  const groupTiles = getSubgroupTiles(board, tile);
  if (groupTiles.length === 0) return false;
  return groupTiles.every((t) => t.owner === ownerId);
}

// Levels: 0 = no node, 1–3 = nodes, 4 = castle
function getRentMultiplier(board, tile) {
  if (!tile) return 0;

  // Milestones, sequencing cores: flat
  if (tile.type === 'milestone') return 1.0;
  if (tile.type === 'sequencing_core') return 1.0;

  if (tile.type !== 'property') return 1.0;

  const ownerId = tile.owner;
  if (ownerId === null || ownerId === undefined) return 0;

  const fullGroup = ownsFullSubgroup(board, tile, ownerId);

  if (!fullGroup) {
    // Incomplete sub-theme
    return 0.5;
  }

  // Full group owned
  if (tile.level === 0) return 1.0;
  if (tile.level === 1) return 1.5;
  if (tile.level === 2) return 2.0;
  if (tile.level === 3) return 3.0;
  if (tile.level >= 4) return 5.0;

  return 1.0;
}

function computeRent(board, tile) {
  if (!tile) return 0;
  const base = tile.baseRent || 0;
  const mult = getRentMultiplier(board, tile);
  return Math.floor(base * mult);
}

// CSV utility
function downloadCSV(rows, filename = 'microbiopoly_log.csv') {
  if (!rows || rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const val = r[h] ?? '';
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        })
        .join(',')
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

export default function MicrobiopolyGame({
  boardData,
  playerCount,
  startingPlayerIndex = 0,
  onExit,
  onEndGame, // NEW optional callback to trigger post-survey with game logs
}) {
  // Players: add chaosTokens & survey hooks
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
      });
    }
    if (count === 1) {
      p[0].name = 'Candidate';
    }
    return p;
  };

  const [board, setBoard] = useState(boardData);
  const [players, setPlayers] = useState(generatePlayers(playerCount));
  const [turn, setTurn] = useState(startingPlayerIndex || 0);
  const turnRef = useRef(startingPlayerIndex || 0);

  const [round, setRound] = useState(1);
  const [totalTurns, setTotalTurns] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const [dice, setDice] = useState([1, 1]);
  const [logs, setLogs] = useState(['System initialized.']);

  // Modal + flow state
  const [modalOpen, setModalOpen] = useState(false);
  const [activeCard, setActiveCard] = useState(null);
  const [modalStage, setModalStage] = useState('QUESTION');
  const [feedback, setFeedback] = useState(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [moneyFloats, setMoneyFloats] = useState({});

  // Quiz / milestone state
  const [quizState, setQuizState] = useState({
    active: false,
    mode: null, // 'MILESTONE_ACQUIRE' | 'MILESTONE_CHALLENGE'
    qIndex: 0,
    score: 0,
    questions: [],
    wrongAnswers: 0,
    waiting: false,
    selected: null,
    isCorrect: null,
    targetScore: 0,
    mistakes: 0, // NEW: show 0/2, 1/2, 2/2
    maxMistakes: 2,
    tile: null,
  });

  // Manual access
  const [manualUnlocked, setManualUnlocked] = useState(false);
  const [showManual, setShowManual] = useState(false);

  // Hovered tile
  const [hoverTile, setHoverTile] = useState(null);

  // Chaos modal
  const [chaosMode, setChaosMode] = useState(null); // 'SELECT_PROPERTY' | 'CHALLENGE'
  const [chaosTargetTile, setChaosTargetTile] = useState(null);

  // CSV log rows
  const [logRows, setLogRows] = useState([]);

  useEffect(() => {
    turnRef.current = turn;
  }, [turn]);

  const addLog = (msg) => {
    setLogs((prev) => {
      const time = new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      });
      return [`[${time}] ${msg}`, ...prev].slice(0, 10);
    });
  };

  const addCSVEvent = (event) => {
    setLogRows((prev) => [...prev, event]);
  };

  const currentPlayer = players[turnRef.current];

  // ------------------------------------------------------------------
  //  Transactions + money float
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

    const before = (currentPlayer && currentPlayer.money) || 0;
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
      rentPaid: meta.rentPaid ?? '',
      correct: meta.correct ?? '',
      chaosTokens: players[playerId]?.chaosTokens ?? '',
      timestamp: new Date().toISOString(),
      notes: meta.notes ?? '',
    });
  };

  const getTileStyle = (index) => {
    const style = {
      gridColumn: 'auto',
      gridRow: 'auto',
      border: '1px solid #bbb',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      backgroundColor: 'white',
      justifyContent: 'flex-start',
      minWidth: '85px',
      minHeight: '85px',
      fontSize: '10px',
    };
    if (index >= 0 && index <= 9) {
      style.gridRow = 10;
      style.gridColumn = 10 - index;
    } else if (index >= 9 && index <= 18) {
      style.gridColumn = 1;
      style.gridRow = 10 - (index - 9);
    } else if (index >= 18 && index <= 27) {
      style.gridRow = 1;
      style.gridColumn = 1 + (index - 18);
    } else if (index >= 27 && index <= 35) {
      style.gridColumn = 10;
      style.gridRow = 1 + (index - 27);
    }
    return style;
  };

  const checkForWin = (currentBoard, playerId) => {
    const milestones = currentBoard.filter((t) => t.type === 'milestone');
    const allOwned = milestones.every((m) => m.owner === playerId);
    if (allOwned) {
      setActiveCard({
        type: 'WIN',
        data: { name: 'GAME OVER' },
        msg: `${players[playerId].name} has unified all scientific milestones! VICTORY!`,
      });
      setModalStage('WIN');
      setModalOpen(true);
    }
  };

  const toggleManual = () => {
    if (manualUnlocked) {
      setShowManual((prev) => !prev);
    } else {
      if (players[turnRef.current].money >= 50) {
        handleTransaction(turnRef.current, -50, {
          action: 'CONSULT_MANUAL',
        });
        setManualUnlocked(true);
        setShowManual(true);
        addLog('Manual purchased (-$50).');
      } else {
        alert('Insufficient funds.');
      }
    }
  };

  // ---------------- QUIZ LOGIC (Milestones) ----------------

  const startQuiz = (tile, mode) => {
    if (!tile.quiz || tile.quiz.length === 0) {
      addLog('Error: No questions available.');
      setModalOpen(false);
      return;
    }
    let pool = [...tile.quiz];
    while (pool.length < 10) pool = [...pool, ...tile.quiz];
    pool.sort(() => Math.random() - 0.5);

    const qCount = mode === 'MILESTONE_CHALLENGE' ? 5 : 10;
    const target = mode === 'MILESTONE_CHALLENGE' ? 5 : 9;

    setQuizState({
      active: true,
      mode,
      qIndex: 0,
      score: 0,
      questions: pool.slice(0, qCount),
      tile,
      wrongAnswers: 0,
      waiting: false,
      selected: null,
      isCorrect: null,
      targetScore: target,
      mistakes: 0,
      maxMistakes: 2,
    });
    setModalStage('QUIZ_START');
    setModalOpen(true);
  };

  const handleQuizAnswer = (idx) => {
    if (quizState.waiting) return;
    const currentQ = quizState.questions[quizState.qIndex];
    const isCorrect = idx === currentQ.answer;

    setQuizState((prev) => ({
      ...prev,
      waiting: true,
      selected: idx,
      isCorrect,
    }));

    setTimeout(() => {
      const maxQs = quizState.questions.length;

      if (isCorrect) {
        const newScore = quizState.score + 1;
        if (quizState.qIndex < maxQs - 1) {
          setQuizState((prev) => ({
            ...prev,
            score: newScore,
            qIndex: prev.qIndex + 1,
            waiting: false,
            selected: null,
            isCorrect: null,
          }));
        } else {
          finishQuiz(true, newScore, quizState.mistakes);
        }
      } else {
        const newMistakes = quizState.mistakes + 1;
        const limit = quizState.maxMistakes; // 2

        if (newMistakes >= limit) {
          finishQuiz(false, quizState.score, newMistakes);
        } else {
          if (quizState.qIndex < maxQs - 1) {
            setQuizState((prev) => ({
              ...prev,
              mistakes: newMistakes,
              qIndex: prev.qIndex + 1,
              waiting: false,
              selected: null,
              isCorrect: null,
            }));
          } else {
            // end of quiz but still under max mistakes: check score vs target
            const passed = quizState.score >= quizState.targetScore;
            finishQuiz(passed, quizState.score, newMistakes);
          }
        }
      }
    }, 500);
  };

  const finishQuiz = (passed, score, mistakes) => {
    const tile = quizState.tile;
    const mode = quizState.mode;

    if (mode === 'MILESTONE_ACQUIRE') {
      if (passed && score >= 9) {
        // Pay AFTER passing, not to attempt
        handleTransaction(turnRef.current, -tile.price, {
          action: 'MILESTONE_ACQUIRE',
          tileId: tile.id,
          tileName: tile.name,
        });
        const newBoard = board.map((t) =>
          t.id === tile.id ? { ...t, owner: turnRef.current } : t
        );
        setBoard(newBoard);
        addLog(
          `MASTERY: ${players[turnRef.current].name} captured ${tile.name}! (+1 Chaos Token)`
        );

        // Award chaos token
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === turnRef.current
              ? { ...p, chaosTokens: p.chaosTokens + 1 }
              : p
          )
        );

        addCSVEvent({
          eventType: 'MILESTONE_PASS',
          turn: totalTurns,
          playerIndex: turnRef.current,
          playerName: players[turnRef.current]?.name || '',
          playerColor: players[turnRef.current]?.color || '',
          tileId: tile.id,
          tileName: tile.name,
          score,
          mistakes,
          chaosTokens:
            (players[turnRef.current]?.chaosTokens || 0) + 1,
          timestamp: new Date().toISOString(),
          notes: 'Milestone acquired, chaos token granted',
        });

        checkForWin(newBoard, turnRef.current);
        setModalStage('MILESTONE_SUCCESS');
      } else {
        setModalStage('MILESTONE_FAIL');
        addCSVEvent({
          eventType: 'MILESTONE_FAIL',
          turn: totalTurns,
          playerIndex: turnRef.current,
          playerName: players[turnRef.current]?.name || '',
          playerColor: players[turnRef.current]?.color || '',
          tileId: tile.id,
          tileName: tile.name,
          score,
          mistakes,
          timestamp: new Date().toISOString(),
          notes: 'Milestone exam failed',
        });
      }
    } else if (mode === 'MILESTONE_CHALLENGE') {
      const baseRent = tile.baseRent || 0;
      if (passed && score === 5 && mistakes === 0) {
        const halfRent = Math.floor(baseRent / 2);
        handleTransaction(turnRef.current, -halfRent, {
          action: 'MILESTONE_CHALLENGE_SUCCESS',
          tileId: tile.id,
          tileName: tile.name,
          rentPaid: halfRent,
          correct: true,
        });
        if (tile.owner !== 99 && tile.owner != null) {
          handleTransaction(tile.owner, halfRent, {
            action: 'MILESTONE_RENT_RECEIVED',
            tileId: tile.id,
            tileName: tile.name,
          });
        }
        setFeedback(
          `Impressive! You answered 5/5 correctly. Fees reduced to $${halfRent}.`
        );
        setModalStage('FEEDBACK_INCORRECT');
      } else {
        const fullRent = baseRent;
        handleTransaction(turnRef.current, -fullRent, {
          action: 'MILESTONE_CHALLENGE_FAIL',
          tileId: tile.id,
          tileName: tile.name,
          rentPaid: fullRent,
          correct: false,
        });
        if (tile.owner !== 99 && tile.owner != null) {
          handleTransaction(tile.owner, fullRent, {
            action: 'MILESTONE_RENT_RECEIVED',
            tileId: tile.id,
            tileName: tile.name,
          });
        }
        setFeedback(
          `Quiz Failed. Paying full expert fees: $${fullRent}.`
        );
        setModalStage('FEEDBACK_INCORRECT');
      }
    }
  };

  // ---------------- LANDING LOGIC ----------------

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

      // Landing on own tile (no automatic upgrade)
      if (tile.owner === p.id) {
        setActiveCard({
          type: 'MSG',
          data: tile,
          msg: 'Welcome back to your lab. Operations are normal.',
        });
        setModalStage('MSG');
        setModalOpen(true);
        return currentPlayers;
      }

      // Milestones
      if (tile.type === 'milestone') {
        if (tile.owner == null) {
          if (p.money >= tile.price) {
            setActiveCard({ type: 'MILESTONE', data: tile });
            setModalStage('MILESTONE_INTRO');
            setModalOpen(true);
          } else {
            setActiveCard({
              type: 'MSG',
              data: tile,
              msg: 'Insufficient funds for mastery certification.',
            });
            setModalStage('MSG');
            setModalOpen(true);
          }
        } else if (tile.owner !== p.id) {
          setActiveCard({
            type: 'MILESTONE_CHALLENGE',
            data: tile,
            ownerId: tile.owner,
          });
          setModalStage('MILESTONE_CHALLENGE_INTRO');
          setModalOpen(true);
        }
        return currentPlayers;
      }

      // Tiles with quiz questions (properties, sequencing cores)
      if (tile.questions && tile.questions.length > 0) {
        if (tile.owner != null && tile.owner !== p.id) {
          // RENT DEFENSE (code-based / theory question)
          const rentBase =
            tile.type === 'sequencing_core'
              ? tile.baseRent
              : computeRent(board, tile);
          const qPool = tile.questions || [];
          const randomQ =
            qPool.length > 0
              ? qPool[Math.floor(Math.random() * qPool.length)]
              : { prompt: 'Error', options: [], answer: 0 };

          setActiveCard({
            type: 'RENT_DEFENSE',
            data: tile,
            rent: rentBase,
            ownerName: players[tile.owner]?.name || 'Rival Lab',
            ownerId: tile.owner,
            payerId: p.id,
            payerName: p.name,
            q: randomQ,
          });
          setModalStage('QUESTION');
          setModalOpen(true);
        } else {
          // Empty tile question gate before buying
          const qPool = tile.questions || [];
          const randomQ =
            qPool.length > 0
              ? qPool[Math.floor(Math.random() * qPool.length)]
              : { prompt: 'Error', options: [], answer: 0 };
          setActiveCard({ type: 'QUESTION', data: tile, q: randomQ });
          setModalStage('QUESTION');
          setModalOpen(true);
        }
      } else {
        // CHANCE tile or neutral
        let msg = 'Event triggered.';
        let amount = 0;
        let fact = null;

        if (tile.type === 'chance') {
          const mishapPool = LAB_MISHAPS || [];
          const randomMishap =
            mishapPool.length > 0
              ? mishapPool[Math.floor(Math.random() * mishapPool.length)]
              : { msg: 'Equipment Malfunction (-$100)', fact: null };
          const isPositive = randomMishap.msg.includes('+');
          amount = isPositive ? 50 : -100;
          msg = randomMishap.msg;
          fact = randomMishap.fact || null;

          if (amount !== 0) {
            handleTransaction(currentTurnIndex, amount, {
              action: 'LAB_MISHAP',
              tileId: tile.id,
              tileName: tile.name,
            });
          }

          setActiveCard({
            type: 'MISHAP',
            data: { ...tile, fact },
            msg,
          });
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

  // ---------------- DICE + MOVEMENT ----------------

  const handleRoll = () => {
    if (isMoving) return;
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    setDice([d1, d2]);
    setIsMoving(true);

    const startPos = players[turn].position;
    const steps = d1 + d2;
    const passesGo = startPos + steps >= 36;
    let stepsTaken = 0;

    const hopInterval = setInterval(() => {
      setPlayers((prevPlayers) =>
        prevPlayers.map((player, index) =>
          index === turnRef.current
            ? { ...player, position: (player.position + 1) % 36 }
            : player
        )
      );
      stepsTaken++;
      if (stepsTaken >= steps) {
        clearInterval(hopInterval);
        setIsMoving(false);
        setTotalTurns((prev) => prev + 1);
        setTimeout(() => checkLanding(passesGo), 600);
      }
    }, 200);
  };

  // ---------------- SIMPLE QUESTION HANDLERS ----------------

  const handleAnswer = (idx) => {
    const isCorrect = idx === activeCard.q.answer;
    setFeedback(activeCard.q.explanation || '');
    if (isCorrect) {
      setModalStage('DECISION');
      addCSVEvent({
        eventType: 'PROPERTY_Q',
        turn: totalTurns,
        playerIndex: turnRef.current,
        playerName: currentPlayer?.name || '',
        playerColor: currentPlayer?.color || '',
        tileId: activeCard.data.id,
        tileName: activeCard.data.name,
        correct: true,
        timestamp: new Date().toISOString(),
      });
    } else {
      handleTransaction(turnRef.current, -20, {
        action: 'QUESTION_PENALTY',
        tileId: activeCard.data.id,
        tileName: activeCard.data.name,
        notes: 'Incorrect on acquisition question',
      });
      setModalStage('FEEDBACK_INCORRECT');
      addCSVEvent({
        eventType: 'PROPERTY_Q',
        turn: totalTurns,
        playerIndex: turnRef.current,
        playerName: currentPlayer?.name || '',
        playerColor: currentPlayer?.color || '',
        tileId: activeCard.data.id,
        tileName: activeCard.data.name,
        correct: false,
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleBuy = () => {
    const tile = activeCard.data;
    handleTransaction(turnRef.current, -tile.price, {
      action: 'BUY_PROPERTY',
      tileId: tile.id,
      tileName: tile.name,
    });
    setBoard((prev) =>
      prev.map((t) =>
        t.id === tile.id ? { ...t, owner: turnRef.current } : t
      )
    );
    setModalOpen(false);
    setTurn((prev) => (prev + 1) % players.length);
  };

  const passTurn = () => {
    setModalOpen(false);
    setTurn((prev) => {
      const next = (prev + 1) % players.length;
      turnRef.current = next;
      return next;
    });
  };

  const handleRentChallengeAnswer = (idx) => {
    const tile = activeCard.data;
    const isCorrect = idx === activeCard.q.answer;
    const rentBase =
      tile.type === 'sequencing_core'
        ? tile.baseRent
        : computeRent(board, tile);
    const rentToPay = isCorrect ? Math.floor(rentBase / 2) : rentBase;

    setFeedback(
      (isCorrect ? 'Correct! Rent discounted.' : 'Incorrect. Paying full rent.') +
        `\n\n${activeCard.q.explanation || ''}`
    );

    handleTransaction(activeCard.payerId, -rentToPay, {
      action: 'RENT_PAYMENT',
      tileId: tile.id,
      tileName: tile.name,
      rentPaid: rentToPay,
      correct: isCorrect,
    });

    if (activeCard.ownerId !== 99 && activeCard.ownerId != null) {
      handleTransaction(activeCard.ownerId, rentToPay, {
        action: 'RENT_RECEIVED',
        tileId: tile.id,
        tileName: tile.name,
      });
    }

    setModalStage('FEEDBACK_INCORRECT');
  };

  // ---------------- CHAOS TOKEN SYSTEM ----------------

  const openChaosSelect = () => {
    if (currentPlayer.chaosTokens <= 0) {
      alert('No chaos tokens available.');
      return;
    }
    setChaosMode('SELECT_PROPERTY');
    setModalStage('CHAOS_SELECT');
    setActiveCard({ type: 'CHAOS_SELECT' });
    setModalOpen(true);
  };

  const handleSelectChaosTarget = (tile) => {
    setChaosTargetTile(tile);

    // Pick a random code challenge
    const q =
      CODE_CHALLENGE_BANK[
        Math.floor(Math.random() * CODE_CHALLENGE_BANK.length)
      ];

    setActiveCard({
      type: 'CHAOS_CHALLENGE',
      data: tile,
      q,
      ownerId: tile.owner,
    });
    setChaosMode('CHALLENGE');
    setModalStage('CHAOS_QUESTION');
  };

  const handleChaosAnswer = (idx) => {
    const q = activeCard.q;
    const tile = chaosTargetTile;
    const isCorrect = idx === q.answer;

    if (!tile) {
      setModalStage('FEEDBACK_INCORRECT');
      setFeedback('Error: no target tile.');
      return;
    }

    // Spend token regardless
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === currentPlayer.id
          ? { ...p, chaosTokens: Math.max(0, p.chaosTokens - 1) }
          : p
      )
    );

    if (isCorrect) {
      // Pay 50% of tile price to steal
      const cost = Math.floor((tile.price || 0) * 0.5);
      if (currentPlayer.money < cost) {
        setFeedback(
          'You answered correctly, but do not have enough funds to acquire this lab.'
        );
        setModalStage('FEEDBACK_INCORRECT');
        return;
      }

      handleTransaction(currentPlayer.id, -cost, {
        action: 'CHAOS_STEAL',
        tileId: tile.id,
        tileName: tile.name,
        notes: 'Chaos challenge success',
      });
      if (tile.owner != null && tile.owner !== 99) {
        handleTransaction(tile.owner, cost, {
          action: 'CHAOS_SELL',
          tileId: tile.id,
          tileName: tile.name,
        });
      }

      setBoard((prev) =>
        prev.map((t) =>
          t.id === tile.id ? { ...t, owner: currentPlayer.id, level: 0 } : t
        )
      );

      setFeedback(
        `Chaos success! You acquired ${tile.name} (${tile.sub}) for $${cost}.`
      );
      setModalStage('FEEDBACK_INCORRECT');
    } else {
      // Fail: lose token + pay small penalty
      const penalty = Math.floor((tile.baseRent || 20) * 0.5) || 20;
      handleTransaction(currentPlayer.id, -penalty, {
        action: 'CHAOS_FAIL',
        tileId: tile.id,
        tileName: tile.name,
        notes: 'Chaos challenge failed',
      });
      setFeedback(
        `Chaos failed. You lost a token and paid $${penalty} in wasted sequencing reagents.\n\n${q.explanation}`
      );
      setModalStage('FEEDBACK_INCORRECT');
    }
  };

  // ---------------- UPGRADE SYSTEM (EVEN-BUILD RULE) ----------------

  const canUpgradeSubgroup = (tile, playerId) => {
    if (!tile || tile.type !== 'property') return false;
    if (tile.owner !== playerId) return false;

    const groupTiles = getSubgroupTiles(board, tile);
    if (groupTiles.length === 0) return false;
    if (!groupTiles.every((t) => t.owner === playerId)) return false;

    return true;
  };

  const nextAllowedLevel = (tile, playerId) => {
    const groupTiles = getSubgroupTiles(board, tile);
    if (groupTiles.length === 0) return tile.level;

    const levels = groupTiles.map((t) => t.level || 0);
    const minLevel = Math.min(...levels);
    const maxLevel = Math.max(...levels);

    if (minLevel !== maxLevel) {
      // uneven, do not allow upgrade
      return tile.level;
    }

    if (maxLevel >= 4) return 4;
    return maxLevel + 1;
  };

  const getUpgradeCostForLevel = (tile, newLevel) => {
    if (!tile || tile.type !== 'property') return 0;
    if (newLevel >= 4) {
      // castle
      return tile.castleCost || tile.price * 2;
    }
    // node cost = 100% property price
    return tile.houseCost || tile.price;
  };

  const handleUpgrade = () => {
    const tile = activeCard.data;
    const playerId = turnRef.current;

    if (!canUpgradeSubgroup(tile, playerId)) {
      alert(
        'You must own all tiles in this sub-theme and keep node levels even to upgrade.'
      );
      return;
    }

    const desiredLevel = nextAllowedLevel(tile, playerId);
    if (desiredLevel <= tile.level) {
      alert('No further upgrades available for this sub-theme.');
      return;
    }

    const cost = getUpgradeCostForLevel(tile, desiredLevel);
    if (players[playerId].money < cost) {
      alert('Insufficient funds for upgrade.');
      return;
    }

    // Apply cost
    handleTransaction(playerId, -cost, {
      action: 'UPGRADE_SUBTHEME',
      tileId: tile.id,
      tileName: tile.name,
      notes: `Level ${desiredLevel}`,
    });

    // Upgrade ALL tiles in subgroup to new level
    setBoard((prev) =>
      prev.map((t) => {
        if (
          t.type === 'property' &&
          t.group === tile.group &&
          t.sub === tile.sub &&
          t.owner === playerId
        ) {
          return { ...t, level: desiredLevel };
        }
        return t;
      })
    );

    setModalOpen(false);
    // IMPORTANT: upgrading does NOT end turn; player may still roll
  };

  // ---------------- LAB MANAGER VIEW ----------------

  const openLabManager = () => {
    setManageOpen(true);
  };

  // ---------------- HOVER HELPERS ----------------

  const handleTileHover = (tile) => {
    if (!tile) {
      setHoverTile(null);
      return;
    }
    const rent =
      tile.type === 'property' || tile.type === 'sequencing_core'
        ? computeRent(board, tile)
        : 0;
    const mult =
      tile.type === 'property' || tile.type === 'sequencing_core'
        ? getRentMultiplier(board, tile)
        : 0;

    setHoverTile({
      ...tile,
      rent,
      multiplier: mult,
    });
  };

  const clearHover = () => setHoverTile(null);

  // ---------------- RENDER OPTIONS HELPER ----------------

  const renderOptions = (options, handler, quizMode = false) => (
    <Grid container spacing={2}>
      {options.map((opt, i) => {
        let borderColor = '#999';
        let bgColor = 'transparent';
        let textColor = '#333';

        if (quizMode && quizState.selected !== null) {
          if (i === quizState.selected) {
            if (quizState.isCorrect) {
              borderColor = THEME.success;
              bgColor = '#e8f5e9';
              textColor = THEME.success;
            } else {
              borderColor = THEME.danger;
              bgColor = '#ffebee';
              textColor = THEME.danger;
            }
          } else if (
            i === quizState.questions[quizState.qIndex].answer &&
            !quizState.isCorrect
          ) {
            borderColor = THEME.success;
          }
        }

        return (
          <Grid item xs={12} key={i}>
            <Button
              variant="outlined"
              fullWidth
              disabled={quizMode && quizState.waiting}
              onClick={() => handler(i)}
              sx={{
                justifyContent: 'flex-start',
                textAlign: 'left',
                py: 1.5,
                px: 2,
                textTransform: 'none',
                borderColor: borderColor,
                backgroundColor: bgColor,
                color: textColor,
                borderWidth:
                  quizMode && quizState.selected === i ? '2px' : '1px',
                whiteSpace: 'normal',
              }}
            >
              <span
                style={{
                  fontWeight: 'bold',
                  marginRight: '10px',
                  minWidth: '20px',
                }}
              >
                {String.fromCharCode(65 + i)}.
              </span>{' '}
              {opt}
            </Button>
          </Grid>
        );
      })}
    </Grid>
  );

  // ---------------- CSV EXPORT ----------------

  const handleExportCSV = () => {
    if (!logRows.length) {
      alert('No logged events yet.');
      return;
    }
    downloadCSV(logRows);
  };

  // ---------------- END GAME HANDLER ----------------

  const handleEndGame = () => {
    if (typeof onEndGame === 'function') {
      onEndGame(logRows);
    }
  };

  // ---------------- MAIN RENDER ----------------

  return (
    <div
      style={{
        backgroundColor: THEME.bg,
        minHeight: '100vh',
        width: '100vw',
        padding: '20px',
        fontFamily: 'sans-serif',
      }}
    >
      {/* HEADER */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          width: '100%',
          maxWidth: '1400px',
          margin: '0 auto 20px auto',
          alignItems: 'center',
        }}
      >
        <Typography
          variant="h4"
          sx={{ color: THEME.text, fontWeight: 'bold' }}
        >
          THE SEQUENCING RUN{' '}
          <Chip
            label={`TURN ${totalTurns}`}
            size="small"
            sx={{ ml: 2, bgcolor: THEME.accent, color: '#fff' }}
          />
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            color="warning"
            onClick={handleEndGame}
          >
            END GAME
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            onClick={handleExportCSV}
          >
            Export CSV
          </Button>
          <Button color="error" variant="outlined" onClick={onExit}>
            EXIT SESSION
          </Button>
        </Box>
      </div>
{/* BOARD + SIDE PANEL */}
<div
  style={{
    display: 'flex',
    justifyContent: 'center',
    gap: 40,
    alignItems: 'flex-start',
    transform: 'scale(0.85)',
    transformOrigin: 'top center',
  }}
>

  {/* BOARD 10x10 */}
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(10, 85px)',
      gridTemplateRows: 'repeat(10, 85px)',
      gap: '4px',
      padding: '20px',
      background: 'white',
      borderRadius: '20px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
      position: 'relative',       // required for absolute positioning
    }}
  >

    {/* BOARD BACKGROUND LOGO + COPYRIGHT */}
<div
  style={{
    gridColumn: '2 / span 8',
    gridRow: '2 / span 8',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.1,                 // clearer but still subtle
    zIndex: 1,                    // behind tiles
    pointerEvents: 'none',
  }}
>
  <Typography
    variant="h1"
    sx={{ fontWeight: 'bold', fontSize: '8rem' }}
  >
    HGPvS
  </Typography>

  {/* COPYRIGHT JUST UNDER HGPvS */}
  <Typography
    variant="caption"
    sx={{
      fontSize: '1rem',
      marginTop: '10px',
      opacity: 1,
      fontWeight: 'bold',
    }}
  >
    © 2025 Hans Ghezzi – Science Around the Board
  </Typography>
</div>


    {/* TILE RENDERING */}
    {board.map((tile, index) => {
      const isRival = tile.owner === 99;
      const ownerColor = isRival
        ? '#000'
        : tile.owner != null
        ? players[tile.owner]?.color
        : null;
      const isCorner = tile.type === 'milestone';

      const onMouseEnter = () => handleTileHover(tile);
      const onMouseLeave = () => clearHover();


            if (isCorner) {
              return (
                <div
                  key={tile.id}
                  style={{
                    ...getTileStyle(index),
                    border: `3px solid ${
                      tile.owner != null ? ownerColor : '#1a237e'
                    }`,
                    backgroundColor: ownerColor
                      ? `${ownerColor}22`
                      : '#f5f5f5',
                    justifyContent: 'center',
                  }}
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                >
                  <div style={{ fontSize: '20px' }}>🏆</div>
                  <div
                    style={{
                      textAlign: 'center',
                      fontWeight: 'bold',
                      color: '#1a237e',
                      fontSize: '11px',
                      lineHeight: 1.2,
                    }}
                  >
                    {tile.name}
                  </div>
                  {tile.sub && (
                    <div
                      style={{
                        fontSize: '10px',
                        fontWeight: 'bold',
                        color: THEME.danger,
                        marginTop: 2,
                      }}
                    >
                      {tile.sub}
                    </div>
                  )}
                  {tile.price > 0 && !tile.sub && (
                    <div style={{ fontSize: '10px', marginTop: 2 }}>
                      ${tile.price}
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      gap: 1,
                      position: 'absolute',
                      bottom: 4,
                    }}
                  >
                    {players.map(
                      (p) =>
                        p.position === index && (
                          <motion.div
                            key={p.id}
                            layoutId={`p-${p.id}`}
                            transition={{ duration: 0.2, ease: 'linear' }}
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: '50%',
                              background: p.color,
                              border: '2px solid white',
                              zIndex: 10,
                            }}
                          />
                        )
                    )}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={tile.id}
                style={{
                  ...getTileStyle(index),
                  border: ownerColor
                    ? `3px solid ${ownerColor}`
                    : '1px solid #ccc',
                }}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
              >
                {tile.type === 'property' && (
                  <div
                    style={{
                      width: '100%',
                      height: '20%',
                      background: tile.color,
                      borderBottom: '1px solid #eee',
                    }}
                  />
                )}
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    padding: '4px',
                  }}
                >
                  <div
                    style={{
                      textAlign: 'center',
                      fontWeight: 'bold',
                      color: isRival ? '#000' : '#444',
                      fontSize: '10px',
                      lineHeight: 1.1,
                      overflow: 'hidden',
                    }}
                  >
                    {tile.name} {isRival && '(RIVAL)'}
                  </div>
                  {tile.sub && (
                    <div style={{ fontSize: '8px', color: '#999' }}>
                      {tile.sub}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: '11px',
                      marginTop: 'auto',
                      fontWeight: 'bold',
                    }}
                  >
                    {tile.level > 0 ? '⭐'.repeat(tile.level) : ''}
                    {tile.price > 0 && !tile.valDisplay && (
                      <span style={{ color: '#777' }}>${tile.price}</span>
                    )}
                    {tile.valDisplay && (
                      <span
                        style={{
                          color: tile.valDisplay.startsWith('-')
                            ? THEME.danger
                            : THEME.success,
                        }}
                      >
                        {tile.valDisplay}
                      </span>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 1,
                    marginBottom: 2,
                    position: 'absolute',
                    bottom: -6,
                    zIndex: 10,
                  }}
                >
                  {players.map(
                    (p) =>
                      p.position === index && (
                        <motion.div
                          key={p.id}
                          layoutId={`p-${p.id}`}
                          transition={{ duration: 0.2, ease: 'linear' }}
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                            background: p.color,
                            border: '2px solid white',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                          }}
                        />
                      )
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* SIDE PANEL */}
        <div style={{ width: 340 }}>
          <Card sx={{ p: 2, mb: 2, borderRadius: 2 }}>
            <Typography
              variant="subtitle2"
              color="textSecondary"
              gutterBottom
            >
              RESEARCH GROUPS
            </Typography>
            {players.map((p, i) => (
              <Box
                key={i}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  mb: 1,
                  p: 1,
                  borderRadius: 1,
                  bgcolor: turn === i ? `${p.color}22` : 'transparent',
                  borderLeft: `4px solid ${p.color}`,
                  position: 'relative',
                }}
              >
                <span style={{ fontWeight: turn === i ? 'bold' : 'normal' }}>
                  {p.name}
                </span>
                <span>${p.money}</span>
                <AnimatePresence>
                  {moneyFloats[p.id]?.visible && (
                    <motion.span
                      key={moneyFloats[p.id].id}
                      initial={{ opacity: 0, y: 10, scale: 0.5 }}
                      animate={{ opacity: 1, y: -20, scale: 1.2 }}
                      exit={{ opacity: 0 }}
                      style={{
                        position: 'absolute',
                        right: 10,
                        top: 0,
                        color:
                          moneyFloats[p.id].amount > 0
                            ? THEME.success
                            : THEME.danger,
                        fontWeight: 'bold',
                        fontSize: '1.2rem',
                        textShadow: '0 1px 2px white',
                      }}
                    >
                      {moneyFloats[p.id].amount > 0 ? '+' : ''}
                      {moneyFloats[p.id].amount}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Box>
            ))}
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption">
                Chaos Tokens (current player):{' '}
                <strong>{currentPlayer?.chaosTokens ?? 0}</strong>
              </Typography>
            </Box>
          </Card>

          <Card sx={{ p: 3, mb: 2, borderRadius: 2, textAlign: 'center' }}>
            <div
              style={{
                display: 'flex',
                gap: 10,
                justifyContent: 'center',
                marginBottom: 20,
              }}
            >
              <DiceBox num={dice[0]} />
              <DiceBox num={dice[1]} />
            </div>
            <Button
              variant="contained"
              size="large"
              fullWidth
              onClick={handleRoll}
              disabled={isMoving}
              sx={{ bgcolor: currentPlayer?.color || '#555', color: '#fff', mb: 1 }}
            >
              {isMoving ? 'PROCESSING...' : 'ROLL'}
            </Button>
            <Grid container spacing={1}>
              <Grid item xs={6}>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={openLabManager}
                >
                  LAB MANAGER
                </Button>
              </Grid>
              <Grid item xs={6}>
                <Button
                  variant="outlined"
                  fullWidth
                  color="warning"
                  onClick={openChaosSelect}
                >
                  USE CHAOS
                </Button>
              </Grid>
            </Grid>
          </Card>

          {hoverTile && (
            <Card
              sx={{
                p: 2,
                mb: 2,
                borderRadius: 2,
                bgcolor: '#f5f5f5',
                border: '1px solid #e0e0e0',
              }}
            >
              <Typography variant="subtitle2" gutterBottom>
                Tile Info
              </Typography>
              <Typography variant="body2">
                <strong>{hoverTile.name}</strong>{' '}
                {hoverTile.sub ? `(${hoverTile.sub})` : ''}
              </Typography>
              <Typography variant="caption" display="block">
                Type: {hoverTile.type}
              </Typography>
              {hoverTile.owner != null && (
                <Typography variant="caption" display="block">
                  Owner:{' '}
                  {hoverTile.owner === 99
                    ? 'Rival Lab'
                    : players[hoverTile.owner]?.name || 'Player'}
                </Typography>
              )}
              {(hoverTile.type === 'property' ||
                hoverTile.type === 'sequencing_core') && (
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                  Base rent: ${hoverTile.baseRent} — Multiplier:{' '}
                  {hoverTile.multiplier.toFixed(2)} — Rent:{' '}
                  <strong>${hoverTile.rent}</strong>
                </Typography>
              )}
            </Card>
          )}

          <Card
            sx={{
              p: 2,
              height: 200,
              overflowY: 'auto',
              borderRadius: 2,
              bgcolor: '#fafafa',
              boxShadow: 'none',
              border: '1px solid #eee',
            }}
          >
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                fontSize: '0.75rem',
                color: '#555',
              }}
            >
              {logs.map((l, i) => (
                <li
                  key={i}
                  style={{
                    marginBottom: 4,
                    borderBottom: '1px solid #eee',
                  }}
                >
                  {l}
                </li>
              ))}
            </ul>
          </Card>

          <Paper
            sx={{ p: 2, mt: 2, bgcolor: '#e8eaf6', borderRadius: 2 }}
          >
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 'bold', color: '#1a237e' }}
            >
              HOW TO PLAY
            </Typography>
            <ul
              style={{
                paddingLeft: 15,
                margin: '5px 0',
                fontSize: '0.75rem',
                color: '#333',
              }}
            >
              <li>Roll dice to move your research team.</li>
              <li>
                <strong>Land on empty tile:</strong> Answer a question then
                choose whether to "Publish" (buy).
              </li>
              <li>
                <strong>Land on owned tile:</strong> Answer a question. Correct
                = 50% rent. Incorrect = full rent.
              </li>
              <li>
                <strong>Milestones (corners):</strong> Pass the quiz (9/10) to
                own. Grants massive rent and a chaos token.
              </li>
              <li>
                <strong>Chaos tokens:</strong> Use them to challenge for other
                labs via a code question.
              </li>
              <li>
                <strong>Winning:</strong> Own all 4 milestones or have the most
                assets when time is up.
              </li>
            </ul>
          </Paper>
        </div>
      </div>

      {/* MAIN MODAL */}
      <Modal open={modalOpen} disableEscapeKeyDown>
        <Box sx={modalStyle}>
          {/* WIN */}
          {activeCard?.type === 'WIN' && modalStage === 'WIN' && (
            <>
              <Typography variant="h3" align="center">
                🏆
              </Typography>
              <Typography
                variant="h4"
                align="center"
                color="primary"
                gutterBottom
              >
                VICTORY!
              </Typography>
              <Typography variant="h6" align="center">
                {activeCard.msg}
              </Typography>
              <Button
                fullWidth
                variant="contained"
                sx={{ mt: 3 }}
                onClick={onExit}
              >
                RETURN TO MENU
              </Button>
            </>
          )}

          {/* MILESTONE INTRO */}
          {activeCard?.type === 'MILESTONE' &&
            modalStage === 'MILESTONE_INTRO' && (
              <>
                <Typography variant="h4" color="primary" gutterBottom>
                  {activeCard.data.name}
                </Typography>
                <Typography variant="body1" paragraph>
                  Acquire this Milestone? You will answer 10 questions. You must
                  get at least 9 correct, with at most 2 mistakes (shown as
                  0/2 → 2/2).
                </Typography>
                <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                  <Button
                    fullWidth
                    variant="contained"
                    onClick={() =>
                      startQuiz(activeCard.data, 'MILESTONE_ACQUIRE')
                    }
                  >
                    START EXAM
                  </Button>
                  <Button
                    fullWidth
                    variant="outlined"
                    onClick={() => {
                      setModalOpen(false);
                      passTurn();
                    }}
                  >
                    DECLINE
                  </Button>
                </Box>
              </>
            )}

          {/* MILESTONE CHALLENGE INTRO */}
          {activeCard?.type === 'MILESTONE_CHALLENGE' &&
            modalStage === 'MILESTONE_CHALLENGE_INTRO' && (
              <>
                <Typography variant="h4" color="error" gutterBottom>
                  ⚠️ EXPERT CHALLENGE
                </Typography>
                <Typography variant="body1" paragraph>
                  Rival Milestone!
                  <br />
                  <strong>
                    Base expert fee: $
                    {board.find((t) => t.id === activeCard.data.id)?.baseRent}
                  </strong>
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontStyle: 'italic' }}
                >
                  Answer 5 questions (100% accuracy, 0 mistakes) to reduce fees
                  by 50%.
                </Typography>
                <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                  <Button
                    fullWidth
                    variant="contained"
                    color="warning"
                    onClick={() =>
                      startQuiz(activeCard.data, 'MILESTONE_CHALLENGE')
                    }
                  >
                    ACCEPT CHALLENGE
                  </Button>
                  <Button
                    fullWidth
                    variant="outlined"
                    onClick={() => {
                      const fullRent = board.find(
                        (t) => t.id === activeCard.data.id
                      )?.baseRent;
                      handleTransaction(turnRef.current, -fullRent, {
                        action: 'MILESTONE_FULL_FEE',
                        tileId: activeCard.data.id,
                        tileName: activeCard.data.name,
                        rentPaid: fullRent,
                      });
                      if (activeCard.ownerId !== 99) {
                        handleTransaction(activeCard.ownerId, fullRent, {
                          action: 'MILESTONE_RENT_RECEIVED',
                          tileId: activeCard.data.id,
                          tileName: activeCard.data.name,
                        });
                      }
                      setModalOpen(false);
                      passTurn();
                    }}
                  >
                    PAY FULL AMOUNT
                  </Button>
                </Box>
              </>
            )}

          {/* QUIZ */}
          {modalStage === 'QUIZ_START' && quizState.active && (
            <>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 1,
                }}
              >
                <Typography variant="overline">
                  Question {quizState.qIndex + 1} of{' '}
                  {quizState.questions.length}
                </Typography>
                <Box
                  sx={{
                    display: 'flex',
                    gap: 2,
                    alignItems: 'center',
                  }}
                >
                  <Typography variant="caption" color="error">
                    Mistakes: {quizState.mistakes}/{quizState.maxMistakes}
                  </Typography>
                  <Button
                    size="small"
                    color="error"
                    onClick={() => finishQuiz(false, quizState.score, quizState.mistakes)}
                  >
                    QUIT QUIZ
                  </Button>
                </Box>
              </Box>
              <LinearProgress
                variant="determinate"
                value={
                  (quizState.qIndex / quizState.questions.length) * 100
                }
                sx={{ mb: 3 }}
              />
              <Typography variant="h6" gutterBottom>
                {quizState.questions[quizState.qIndex].prompt}
              </Typography>
              {renderOptions(
                quizState.questions[quizState.qIndex].options,
                handleQuizAnswer,
                true
              )}
            </>
          )}

          {modalStage === 'MILESTONE_SUCCESS' && (
            <>
              <Typography
                variant="h5"
                align="center"
                color="success.main"
                gutterBottom
              >
                SUCCESS!
              </Typography>
              <Typography
                variant="body2"
                align="center"
                sx={{ mb: 2 }}
              >
                Milestone acquired and chaos token granted.
              </Typography>
              <Button
                fullWidth
                variant="contained"
                sx={{ mt: 3 }}
                onClick={passTurn}
              >
                CONTINUE
              </Button>
            </>
          )}

          {modalStage === 'MILESTONE_FAIL' && (
            <>
              <Typography
                variant="h5"
                align="center"
                color="error"
                gutterBottom
              >
                FAILED
              </Typography>
              <Typography
                variant="body2"
                align="center"
                sx={{ mb: 2 }}
              >
                You did not meet the passing criteria for this exam.
              </Typography>
              <Button
                fullWidth
                variant="contained"
                sx={{ mt: 3 }}
                onClick={passTurn}
              >
                CONTINUE
              </Button>
            </>
          )}

          {/* PROPERTY QUESTION */}
          {activeCard?.type === 'QUESTION' && modalStage === 'QUESTION' && (
            <>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 2,
                }}
              >
                <Typography variant="h6">Data Validation Required</Typography>
                {activeCard.data.manual && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={toggleManual}
                  >
                    {manualUnlocked
                      ? showManual
                        ? 'HIDE MANUAL'
                        : 'SHOW MANUAL'
                      : 'CONSULT MANUAL ($50)'}
                  </Button>
                )}
              </Box>
              <Collapse in={showManual}>
                <Alert
                  severity="info"
                  sx={{ mb: 3, border: '1px solid #90caf9' }}
                >
                  <AlertTitle>Reference Manual</AlertTitle>
                  <Typography
                    variant="body2"
                    style={{ whiteSpace: 'pre-wrap' }}
                  >
                    {activeCard.data.manual}
                  </Typography>
                </Alert>
              </Collapse>
              <Divider sx={{ my: 2 }} />
              <Typography
                variant="body1"
                sx={{ mb: 3, fontWeight: 'bold' }}
              >
                {activeCard.q.prompt}
              </Typography>
              {renderOptions(activeCard.q.options, handleAnswer)}
            </>
          )}

          {/* DECISION AFTER CORRECT PROPERTY ANSWER */}
          {activeCard?.type === 'QUESTION' && modalStage === 'DECISION' && (
            <>
              <Typography variant="h5" color="success.main">
                Correct
              </Typography>
              <Typography
                sx={{
                  mt: 1,
                  mb: 2,
                  fontStyle: 'italic',
                  color: '#555',
                }}
              >
                {feedback}
              </Typography>
              <Divider />
              <Typography sx={{ my: 2 }}>
                Publish findings (Buy) for ${activeCard.data.price}?
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
                <Button
                  fullWidth
                  variant="contained"
                  onClick={handleBuy}
                >
                  PUBLISH (BUY)
                </Button>
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={passTurn}
                >
                  SKIP
                </Button>
              </Box>
            </>
          )}

          {/* GENERIC MESSAGE */}
          {activeCard?.type === 'MSG' && modalStage === 'MSG' && (
            <>
              <Typography variant="h5" gutterBottom>
                {activeCard.data.name}
              </Typography>
              <Typography variant="body1">{activeCard.msg}</Typography>
              <Button
                fullWidth
                variant="contained"
                sx={{ mt: 3 }}
                onClick={passTurn}
              >
                CONTINUE
              </Button>
            </>
          )}

          {/* LAB MISHAP (isolated, no leftover feedback) */}
          {activeCard?.type === 'MISHAP' && modalStage === 'MISHAP' && (
            <>
              <Typography variant="h5" gutterBottom>
                {activeCard.data.name}
              </Typography>
              <Typography variant="body1">{activeCard.msg}</Typography>
              {activeCard.data.fact && (
                <Alert
                  severity="info"
                  icon={false}
                  sx={{
                    mt: 2,
                    bgcolor: '#e1f5fe',
                    border: '1px solid #b3e5fc',
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 'bold' }}
                  >
                    {activeCard.data.fact}
                  </Typography>
                </Alert>
              )}
              <Button
                fullWidth
                variant="contained"
                sx={{ mt: 3 }}
                onClick={passTurn}
              >
                CONTINUE
              </Button>
            </>
          )}

          {/* FEEDBACK (incorrect or chaos outcomes) */}
          {modalStage === 'FEEDBACK_INCORRECT' &&
            activeCard?.type !== 'MISHAP' &&
            activeCard?.type !== 'WIN' && (
              <>
                <Typography
                  variant="h5"
                  color={
                    feedback &&
                    (feedback.startsWith('Correct') ||
                      feedback.startsWith('Impressive') ||
                      feedback.startsWith('Chaos success'))
                      ? 'success.main'
                      : 'error'
                  }
                >
                  {feedback &&
                  (feedback.startsWith('Correct') ||
                    feedback.startsWith('Impressive') ||
                    feedback.startsWith('Chaos success'))
                    ? 'Success!'
                    : 'Notice'}
                </Typography>
                <Typography
                  variant="body1"
                  sx={{ mt: 2, whiteSpace: 'pre-wrap' }}
                >
                  {feedback}
                </Typography>
                <Button
                  fullWidth
                  variant="contained"
                  sx={{ mt: 3 }}
                  onClick={passTurn}
                >
                  CONTINUE
                </Button>
              </>
            )}

          {/* UPGRADE OFFER (Lab Manager) */}
          {activeCard?.type === 'UPGRADE_OFFER' && (
            <>
              <Typography variant="h5">Upgrade Infrastructure</Typography>
              <Typography variant="body2" sx={{ mt: 1, mb: 2 }}>
                Upgrades apply evenly across all tiles in this sub-theme.
              </Typography>
              <Button
                fullWidth
                variant="contained"
                onClick={handleUpgrade}
                sx={{ mt: 2 }}
              >
                UPGRADE SUB-THEME
              </Button>
              <Button fullWidth onClick={passTurn} sx={{ mt: 1 }}>
                CANCEL
              </Button>
            </>
          )}

          {/* RENT DEFENSE */}
          {activeCard?.type === 'RENT_DEFENSE' &&
            modalStage === 'QUESTION' && (
              <>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 2,
                  }}
                >
                  <Typography
                    variant="h6"
                    sx={{ color: THEME.danger }}
                  >
                    Rent Due: ${activeCard.rent}
                  </Typography>
                  {activeCard.data.manual && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={toggleManual}
                    >
                      {manualUnlocked
                        ? showManual
                          ? 'HIDE MANUAL'
                          : 'SHOW MANUAL'
                        : 'CONSULT MANUAL ($50)'}
                    </Button>
                  )}
                </Box>
                <Box
                  sx={{
                    bgcolor: '#e3f2fd',
                    p: 2,
                    borderRadius: 2,
                    mb: 2,
                  }}
                >
                  <Typography
                    variant="subtitle2"
                    sx={{
                      color: THEME.accent,
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                    }}
                  >
                    {activeCard.payerName} (You) must answer!
                  </Typography>
                  <Typography variant="caption">
                    Correct answer reduces rent to:{' '}
                    <span style={{ fontWeight: 'bold' }}>
                      ${Math.floor(activeCard.rent / 2)}
                    </span>
                  </Typography>
                </Box>
                <Collapse in={showManual}>
                  <Alert
                    severity="info"
                    sx={{ mb: 3, border: '1px solid #90caf9' }}
                  >
                    <AlertTitle>Reference Manual</AlertTitle>
                    <Typography
                      variant="body2"
                      style={{ whiteSpace: 'pre-wrap' }}
                    >
                      {activeCard.data.manual}
                    </Typography>
                  </Alert>
                </Collapse>
                <Divider sx={{ my: 2 }} />
                <Typography
                  variant="body1"
                  sx={{ fontStyle: 'italic', mb: 2 }}
                >
                  {activeCard.q.prompt}
                </Typography>
                {renderOptions(
                  activeCard.q.options,
                  handleRentChallengeAnswer
                )}
              </>
            )}

          {/* CHAOS SELECT */}
          {modalStage === 'CHAOS_SELECT' &&
            activeCard?.type === 'CHAOS_SELECT' && (
              <>
                <Typography variant="h5" gutterBottom>
                  Use Chaos Token
                </Typography>
                <Typography variant="body2" sx={{ mb: 2 }}>
                  Select a property owned by another player to challenge. If you
                  answer a code question correctly, you can acquire their lab at
                  50% cost. A token will be consumed either way.
                </Typography>
                <div
                  style={{
                    maxHeight: '300px',
                    overflowY: 'auto',
                    marginTop: 10,
                  }}
                >
                  {board
                    .filter(
                      (t) =>
                        t.type === 'property' &&
                        t.owner != null &&
                        t.owner !== currentPlayer.id &&
                        t.owner !== 99
                    )
                    .map((t) => (
                      <Box
                        key={t.id}
                        sx={{
                          p: 1,
                          mb: 1,
                          display: 'flex',
                          justifyContent: 'space-between',
                          border: `1px solid ${t.color}`,
                          borderRadius: 1,
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 'bold' }}>
                            {t.name}
                          </span>{' '}
                          <span
                            style={{
                              fontSize: '0.8em',
                              color: '#666',
                            }}
                          >
                            ({t.sub}) — Owner:{' '}
                            {players[t.owner]?.name || 'Player'}
                          </span>
                        </div>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => handleSelectChaosTarget(t)}
                        >
                          CHALLENGE
                        </Button>
                      </Box>
                    ))}
                  {board.filter(
                    (t) =>
                      t.type === 'property' &&
                      t.owner != null &&
                      t.owner !== currentPlayer.id &&
                      t.owner !== 99
                  ).length === 0 && (
                    <Typography variant="body2">
                      No eligible properties owned by others.
                    </Typography>
                  )}
                </div>
                <Button
                  fullWidth
                  sx={{ mt: 2 }}
                  onClick={() => {
                    setModalOpen(false);
                    setChaosMode(null);
                    setChaosTargetTile(null);
                  }}
                >
                  CANCEL
                </Button>
              </>
            )}

          {/* CHAOS QUESTION */}
          {modalStage === 'CHAOS_QUESTION' &&
            activeCard?.type === 'CHAOS_CHALLENGE' && (
              <>
                <Typography variant="h6" gutterBottom>
                  Chaos Code Challenge
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ mb: 2, fontStyle: 'italic' }}
                >
                  Target lab: {chaosTargetTile?.name} ({chaosTargetTile?.sub})
                </Typography>
                <Typography
                  variant="body1"
                  sx={{ mb: 2, fontWeight: 'bold' }}
                >
                  {activeCard.q.prompt}
                </Typography>
                {renderOptions(activeCard.q.options, handleChaosAnswer)}
              </>
            )}
        </Box>
      </Modal>

      {/* LAB MANAGER MODAL */}
      <Modal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
      >
        <Box sx={modalStyle}>
          <Typography variant="h5">Lab Manager</Typography>
          <Typography variant="body2" sx={{ mt: 1, mb: 2 }}>
            Upgrade only when you own all tiles in a sub-theme. Nodes must be
            added evenly across the group. Upgrades do not end your turn.
          </Typography>
          <div
            style={{
              maxHeight: '300px',
              overflowY: 'auto',
              marginTop: 10,
            }}
          >
            {board.map((tile) => {
              if (tile.owner === turn && tile.type === 'property') {
                const groupTiles = getSubgroupTiles(board, tile);
                const allOwned = groupTiles.every(
                  (t) => t.owner === turn
                );
                const levels = groupTiles.map((t) => t.level || 0);
                const minLevel = levels.length
                  ? Math.min(...levels)
                  : 0;
                const maxLevel = levels.length
                  ? Math.max(...levels)
                  : 0;
                const isEven = minLevel === maxLevel;

                return (
                  <Box
                    key={tile.id}
                    sx={{
                      p: 1,
                      mb: 1,
                      display: 'flex',
                      justifyContent: 'space-between',
                      border: `1px solid ${tile.color}`,
                      borderRadius: 1,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 'bold' }}>
                        {tile.name}
                      </span>{' '}
                      <span
                        style={{
                          fontSize: '0.8em',
                          color: '#666',
                        }}
                      >
                        ({tile.sub}) — Lvl {tile.level}
                      </span>
                      {!allOwned && (
                        <div
                          style={{
                            fontSize: '0.7em',
                            color: THEME.danger,
                          }}
                        >
                          Complete the sub-theme ({tile.sub}) to upgrade.
                        </div>
                      )}
                      {allOwned && !isEven && (
                        <div
                          style={{
                            fontSize: '0.7em',
                            color: THEME.danger,
                          }}
                        >
                          Node levels must be even across this sub-theme.
                        </div>
                      )}
                    </div>
                    <Button
                      size="small"
                      variant="contained"
                      disabled={!allOwned}
                      onClick={() => {
                        setActiveCard({
                          type: 'UPGRADE_OFFER',
                          data: tile,
                        });
                        setManageOpen(false);
                        setModalOpen(true);
                      }}
                    >
                      UPGRADE
                    </Button>
                  </Box>
                );
              }
              return null;
            })}
          </div>
          <Button
            fullWidth
            onClick={() => setManageOpen(false)}
            sx={{ mt: 2 }}
          >
            CLOSE
          </Button>
        </Box>
      </Modal>
    </div>
  );
}
