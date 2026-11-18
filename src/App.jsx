import { useEffect, useMemo, useState } from 'react';
import { Award, Check, ChevronDown, CircleHelp, Clock3, Eraser, Flame, Lightbulb, Pause, Play, RotateCcw, Sparkles, Pencil, Trophy, Volume2, VolumeX, X } from 'lucide-react';

const SIZE = 9;
const LEVELS = {
  Easy: { label: 'Лёгкий', clues: 40 },
  Medium: { label: 'Средний', clues: 32 },
  Hard: { label: 'Сложный', clues: 27 },
  Expert: { label: 'Эксперт', clues: 23 },
};

function shuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeSolution() {
  const base = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const rows = shuffle([0, 1, 2]).flatMap(group => shuffle([0, 1, 2]).map(n => group * 3 + n));
  const cols = shuffle([0, 1, 2]).flatMap(group => shuffle([0, 1, 2]).map(n => group * 3 + n));
  const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  return rows.map(r => cols.map(c => nums[(base[r] * 3 + Math.floor(base[r] / 3) + c) % 9]));
}

function createPuzzle(level) {
  const solution = makeSolution();
  const board = solution.map(row => [...row]);
  const positions = shuffle(Array.from({ length: 81 }, (_, i) => i));
  const remove = 81 - LEVELS[level].clues;
  positions.slice(0, remove).forEach(pos => { board[Math.floor(pos / 9)][pos % 9] = 0; });
  return { board, solution };
}

const cloneBoard = board => board.map(row => [...row]);
const formatTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export default function App() {
  const [level, setLevel] = useState('Medium');
  const [game, setGame] = useState(() => createPuzzle('Medium'));
  const [board, setBoard] = useState(() => cloneBoard(game.board));
  const [selected, setSelected] = useState([0, 0]);
  const [notes, setNotes] = useState({});
  const [noteMode, setNoteMode] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [hints, setHints] = useState(3);
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [won, setWon] = useState(false);
  const [sound, setSound] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const initial = game.board;
  const [solution, setSolution] = useState(game.solution);
  const fixed = useMemo(() => initial.map(row => row.map(v => v !== 0)), [initial]);

  useEffect(() => {
    if (paused || won) return;
    const id = window.setInterval(() => setSeconds(s => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [paused, won]);

  const newGame = (nextLevel = level) => {
    const next = createPuzzle(nextLevel);
    setLevel(nextLevel);
    setGame(next);
    setBoard(cloneBoard(next.board));
    setSolution(next.solution);
    setSelected([0, 0]);
    setNotes({});
    setMistakes(0);
    setHints(3);
    setSeconds(0);
    setPaused(false);
    setWon(false);
    setNoteMode(false);
  };

  const selectedValue = board[selected[0]][selected[1]];
  const sameNumber = selectedValue ? selectedValue : null;
  const complete = board.every((row, r) => row.every((v, c) => v === solution[r][c]));
  useEffect(() => { if (complete) setWon(true); }, [complete]);

  const enterNumber = number => {
    if (paused || won) return;
    const [r, c] = selected;
    if (fixed[r][c]) return;
    const key = `${r}-${c}`;
    if (noteMode) {
      setNotes(prev => {
        const current = new Set(prev[key] || []);
        current.has(number) ? current.delete(number) : current.add(number);
        return { ...prev, [key]: [...current].sort() };
      });
      return;
    }
    setBoard(prev => {
      const next = cloneBoard(prev);
      next[r][c] = number;
      return next;
    });
    setNotes(prev => ({ ...prev, [key]: [] }));
    if (solution[r][c] !== number) setMistakes(m => m + 1);
  };

  const erase = () => {
    const [r, c] = selected;
    if (fixed[r][c] || paused || won) return;
    setBoard(prev => {
      const next = cloneBoard(prev);
      next[r][c] = 0;
      return next;
    });
    setNotes(prev => ({ ...prev, [`${r}-${c}`]: [] }));
  };

  const useHint = () => {
    const [r, c] = selected;
    if (!hints || fixed[r][c] || board[r][c] === solution[r][c] || paused || won) return;
    setBoard(prev => {
      const next = cloneBoard(prev);
      next[r][c] = solution[r][c];
      return next;
    });
    setHints(h => h - 1);
    setNotes(prev => ({ ...prev, [`${r}-${c}`]: [] }));
  };

  const isRelated = (r, c) => r === selected[0] || c === selected[1] ||
    (Math.floor(r / 3) === Math.floor(selected[0] / 3) && Math.floor(c / 3) === Math.floor(selected[1] / 3));
  const isConflict = (r, c) => {
    const value = board[r][c];
    if (!value) return false;
    return board.some((row, rr) => rr !== r && row[c] === value) ||
      board[r].some((v, cc) => cc !== c && v === value) ||
      board.some((row, rr) => rr !== r && Math.floor(rr / 3) === Math.floor(r / 3) &&
        row.some((v, cc) => Math.floor(cc / 3) === Math.floor(c / 3) && cc !== c && v === value));
  };

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="topbar">
        <a className="brand" href="#" aria-label="Sudoku Premium home">
          <span className="brand-mark"><Sparkles size={19} /></span>
          <span> SUDOKU<span className="brand-light">.PRO</span></span>
        </a>
        <div className="top-actions">
          <button className="icon-button" onClick={() => setSound(v => !v)} aria-label="Toggle sound">{sound ? <Volume2 size={18}/> : <VolumeX size={18}/>}</button>
          <button className="icon-button" onClick={() => setShowHelp(true)} aria-label="Help"><CircleHelp size={18}/></button>
          <div className="avatar">N</div>
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow"><span className="live-dot" /> DAILY MIND TRAINING</div>
        <h1>Найди свой <span>ритм.</span></h1>
        <p className="hero-copy">Несколько минут тишины. Девять цифр. Идеальный фокус.</p>
      </section>

      <section className="stats-row">
        <div className="stat-card"><span className="stat-icon streak"><Flame size={17}/></span><div><strong>1 день</strong><small>Серия</small></div></div>
        <div className="stat-card"><span className="stat-icon time"><Clock3 size={17}/></span><div><strong>{formatTime(seconds)}</strong><small>Время игры</small></div></div>
        <div className="stat-card"><span className="stat-icon wins"><Trophy size={17}/></span><div><strong>—</strong><small>Победы</small></div></div>
      </section>

      <section className="game-layout">
        <div className="game-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">ТЕКУЩАЯ ИГРА</span><h2>Судоку <span className="difficulty">{LEVELS[level].label}</span></h2></div>
            <button className="restart-button" onClick={() => newGame()}><RotateCcw size={15}/> Новая игра</button>
          </div>
          <div className="board-wrap">
            {paused && <div className="pause-overlay"><div className="pause-card"><Pause size={26}/><strong>Пауза</strong><span>Отдохни. Игра подождёт.</span><button className="primary-button" onClick={() => setPaused(false)}><Play size={15}/> Продолжить</button></div></div>}
            {won && <div className="pause-overlay"><div className="pause-card win-card"><span className="win-spark">✦</span><strong>Идеально!</strong><span>Головоломка решена за {formatTime(seconds)}</span><button className="primary-button" onClick={() => newGame()}><Sparkles size={15}/> Следующая игра</button></div></div>}
            <div className="sudoku-board" role="grid" aria-label="Поле судоку">
              {board.map((row, r) => row.map((value, c) => {
                const key = `${r}-${c}`;
                const active = selected[0] === r && selected[1] === c;
                const related = isRelated(r, c);
                const conflict = isConflict(r, c);
                const matched = sameNumber && value === sameNumber;
                return <button key={key} role="gridcell" aria-label={`Строка ${r + 1}, столбец ${c + 1}, значение ${value || 'пусто'}`}
                  className={['cell', c % 3 === 2 && c !== 8 ? 'box-right' : '', r % 3 === 2 && r !== 8 ? 'box-bottom' : '',
                    active ? 'selected' : '', related && !active ? 'related' : '', matched && !active ? 'same-number' : '',
                    fixed[r][c] ? 'given' : 'editable', conflict ? 'conflict' : ''].join(' ')}
                  onClick={() => setSelected([r, c])}>
                  {value || <span className="notes">{(notes[key] || []).map(n => <i key={n}>{n}</i>)}</span>}
                </button>;
              }))}
            </div>
          </div>
          <div className="board-meta">
            <span><span className="legend-dot fixed-dot"/> Исходные числа</span>
            <span><span className="legend-dot selected-dot"/> Выбранная клетка</span>
            <span className="mistakes">Ошибки: <b>{mistakes}</b></span>
          </div>
          <div className="number-pad" aria-label="Выбор числа">
            {[1,2,3,4,5,6,7,8,9].map(n => <button key={n} className={sameNumber === n ? 'number active-number' : 'number'} onClick={() => enterNumber(n)} disabled={paused || won}>{n}</button>)}
          </div>
          <div className="tools-row">
            <button className={noteMode ? 'tool active-tool' : 'tool'} onClick={() => setNoteMode(v => !v)}><Pencil size={16}/><span>Заметки</span></button>
            <button className="tool" onClick={erase}><Eraser size={16}/><span>Стереть</span></button>
            <button className="tool hint-tool" onClick={useHint} disabled={!hints}><Lightbulb size={16}/><span>Подсказка <em>{hints}</em></span></button>
            <button className="tool" onClick={() => setPaused(v => !v)}>{paused ? <Play size={16}/> : <Pause size={16}/>}<span>{paused ? 'Играть' : 'Пауза'}</span></button>
          </div>
        </div>

        <aside className="side-column">
          <div className="side-card level-card">
            <div className="side-title"><span className="side-icon purple"><Award size={17}/></span><div><strong>Сложность</strong><small>Выбери свой вызов</small></div></div>
            <div className="level-list">
              {Object.entries(LEVELS).map(([key, data]) => <button key={key} className={level === key ? 'level-option chosen' : 'level-option'} onClick={() => newGame(key)}>
                <span>{data.label}</span><span className="level-dot" /><span className="level-check">{level === key && <Check size={13}/>}</span>
              </button>)}
            </div>
          </div>
          <div className="side-card focus-card">
            <div className="focus-glow"><Sparkles size={20}/></div>
            <span className="section-kicker">ТВОЙ ПРОГРЕСС</span>
            <h3>Каждый ход<br/>делает тебя <span>сильнее.</span></h3>
            <p>Регулярная практика помогает развивать концентрацию и логическое мышление.</p>
            <div className="progress-track"><span style={{width: `${Math.round(board.flat().filter(Boolean).length / 81 * 100)}%`}}/></div>
            <div className="progress-label"><span>Заполнено</span><b>{Math.round(board.flat().filter(Boolean).length / 81 * 100)}%</b></div>
          </div>
          <div className="side-card daily-card">
            <div className="daily-icon"><Flame size={18}/></div>
            <div><strong>Твоя ежедневная цель</strong><p>Реши одну головоломку сегодня</p></div>
            <span className="daily-arrow">↗</span>
          </div>
        </aside>
      </section>

      <footer className="footer"><span>© 2025 SUDOKU.PRO</span><span>Сделано для ясности ума <span className="footer-heart">✦</span></span><span>ИГРАЙ В СВОЁМ РИТМЕ</span></footer>

      {showHelp && <div className="modal-backdrop" onClick={() => setShowHelp(false)}><div className="help-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setShowHelp(false)}><X size={18}/></button><span className="section-kicker">КАК ИГРАТЬ</span><h2>Правила судоку</h2><p>Заполни сетку цифрами от 1 до 9. Каждая цифра должна встречаться ровно один раз в каждой строке, каждом столбце и каждом квадрате 3×3.</p><p>Выбери клетку, затем нажми цифру. В режиме «Заметки» можно сохранять кандидаты.</p><button className="primary-button" onClick={() => setShowHelp(false)}>Понятно</button></div></div>}
    </main>
  );
}