import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Star, Share2, Palette, Settings, Check, Pause, Play, RotateCcw, Eraser, Pencil, Lightbulb, X, Lock, Home, Zap, Trophy } from 'lucide-react';

const LEVELS = [
  { id: 'Beginner', label: 'Начинающий', clues: 45, emoji: '😊', unlock: 0 },
  { id: 'Easy', label: 'Лёгкий', clues: 40, emoji: '🙂', unlock: 0 },
  { id: 'Medium', label: 'Средний', clues: 34, emoji: '😐', unlock: 0 },
  { id: 'Hard', label: 'Сложный', clues: 29, emoji: '😮', unlock: 0 },
  { id: 'Expert', label: 'Эксперт', clues: 25, emoji: '😨', unlock: 3, requirement: 'Пройдите 3 сложных игры, чтобы разблокировать' },
  { id: 'Extreme', label: 'Экстремальный', clues: 22, emoji: '🥵', unlock: 5, requirement: 'Пройдите 5 экспертных игр, чтобы разблокировать' },
];
const shuffle = a => { const b=[...a]; for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];} return b; };
function solutionGrid(){const groups=shuffle([0,1,2]);const rows=groups.flatMap(g=>shuffle([0,1,2]).map(n=>g*3+n));const cols=shuffle([0,1,2]).flatMap(g=>shuffle([0,1,2]).map(n=>g*3+n));const nums=shuffle([1,2,3,4,5,6,7,8,9]);return rows.map(r=>cols.map(c=>nums[(r*3+Math.floor(r/3)+c)%9]));}
function createPuzzle(level){const solution=solutionGrid();const board=solution.map(r=>[...r]);shuffle(Array.from({length:81},(_,i)=>i)).slice(0,81-level.clues).forEach(i=>board[Math.floor(i/9)][i%9]=0);return {solution,board};}
const clone=b=>b.map(r=>[...r]); const fmt=s=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
export default function App(){
 const [level,setLevel]=useState(LEVELS[2]); const [game,setGame]=useState(()=>createPuzzle(LEVELS[2])); const [board,setBoard]=useState(()=>clone(game.board)); const [selected,setSelected]=useState(null); const [notes,setNotes]=useState({}); const [noteMode,setNoteMode]=useState(false); const [mistakes,setMistakes]=useState(0); const [hints,setHints]=useState(3); const [seconds,setSeconds]=useState(0); const [paused,setPaused]=useState(false); const [won,setWon]=useState(false); const [showLevels,setShowLevels]=useState(false); const [history,setHistory]=useState([]); const [score,setScore]=useState(0); const [completed,setCompleted]=useState({Hard:0,Expert:0}); const [best,setBest]=useState({});
 const fixed=useMemo(()=>game.board.map(r=>r.map(v=>v!==0)),[game]);
 useEffect(()=>{if(paused||won||showLevels)return;const id=setInterval(()=>setSeconds(s=>s+1),1000);return()=>clearInterval(id)},[paused,won,showLevels]);
 const [r,c]=selected||[-1,-1]; const selectedValue=selected?board[r][c]:null; const filled=board.flat().filter(Boolean).length; const remaining=n=>Math.max(0,9-board.flat().filter(v=>v===n).length);
 const startGame=(next=level)=>{const g=createPuzzle(next);setLevel(next);setGame(g);setBoard(clone(g.board));setSelected([0,0]);setNotes({});setMistakes(0);setHints(3);setSeconds(0);setPaused(false);setWon(false);setNoteMode(false);setHistory([]);setScore(0);setShowLevels(false);};
 const snapshot=()=>setHistory(h=>[...h.slice(-39),{board:clone(board),notes:{...notes},mistakes,score}]);
 const enter=n=>{if(!selected||paused||won||fixed[r][c])return;if(noteMode){const k=r+'-'+c;setNotes(old=>{const s=new Set(old[k]||[]);s.has(n)?s.delete(n):s.add(n);return {...old,[k]:[...s].sort()}});return;}snapshot();const next=clone(board);next[r][c]=n;setBoard(next);setNotes(old=>({...old,[r+'-'+c]:[]}));if(game.solution[r][c]===n)setScore(v=>v+10);else setMistakes(v=>v+1);};
 const erase=()=>{if(!selected||paused||won||fixed[r][c]||!board[r][c]&&!notes[r+'-'+c]?.length)return;snapshot();const next=clone(board);next[r][c]=0;setBoard(next);setNotes(old=>({...old,[r+'-'+c]:[]}));};
 const undo=()=>{const last=history.at(-1);if(!last)return;setBoard(last.board);setNotes(last.notes);setMistakes(last.mistakes);setScore(last.score);setHistory(h=>h.slice(0,-1));};
 const hint=()=>{if(!selected||!hints||paused||won||fixed[r][c]||board[r][c]===game.solution[r][c])return;snapshot();const next=clone(board);next[r][c]=game.solution[r][c];setBoard(next);setHints(v=>v-1);setScore(v=>Math.max(0,v-30));setNotes(old=>({...old,[r+'-'+c]:[]}));};
 useEffect(()=>{if(board.every((row,i)=>row.every((v,j)=>v===game.solution[i][j]))&&!won){setWon(true);setBest(old=>({...old,[level.id]:!old[level.id]||seconds<old[level.id]?seconds:old[level.id]}));setCompleted(old=>({...old,[level.id]:(old[level.id]||0)+1}));}},[board,game,won,level,seconds]);
 const matched=selectedValue||null;
 const conflict=(rr,cc)=>{const v=board[rr][cc];if(!v)return false;return board[rr].some((x,j)=>j!==cc&&x===v)||board.some((row,i)=>i!==rr&&row[cc]===v)||board.some((row,i)=>i!==rr&&Math.floor(i/3)===Math.floor(rr/3)&&row.some((x,j)=>Math.floor(j/3)===Math.floor(cc/3)&&j!==cc&&x===v));};
 const accuracy=Math.round((filled-mistakes)/Math.max(1,filled)*100);
 const levelUnlocked=l=>!l.unlock||(completed.Hard||0)>=3&&l.id==='Expert'||l.id==='Extreme'&&(completed.Expert||0)>=5;
 return <main className="game-app">
  <header className="topbar">
   <button className="top-icon" aria-label="Назад"><ArrowLeft/></button>
   <div className="top-actions"><button className="top-icon" aria-label="Избранное"><Star/></button><button className="top-icon" aria-label="Поделиться"><Share2/></button><button className="top-icon" aria-label="Оформление"><Palette/></button><button className="top-icon" aria-label="Настройки"><Settings/></button></div>
  </header>
  <section className="game-status">
   <div className="status-left"><div className="progress-count"><span className="check-circle"><Check size={15}/></span>{filled- game.board.flat().filter(Boolean).length}/{81-game.board.flat().filter(Boolean).length}</div><div className="mistake-count">Ошибки: {mistakes}/3</div></div>
   <div className="status-center"><strong>Счёт: {score.toLocaleString('ru-RU')}</strong><span>{level.label}</span></div>
   <div className="status-right"><span>{fmt(seconds)}</span><button className="pause-button" onClick={()=>setPaused(v=>!v)}>{paused?<Play size={19}/>:<Pause size={19}/>}</button></div>
  </section>
  <section className="board-section">
   {paused&&<div className="pause-screen"><div className="pause-box"><Pause size={30}/><b>Пауза</b><button className="blue-button" onClick={()=>setPaused(false)}>Продолжить</button></div></div>}
   <div className="sudoku-board">{board.map((row,rr)=>row.map((v,cc)=>{const active=r===rr&&c===cc;const same=matched&&v===matched;return <button key={rr+'-'+cc} onClick={()=>setSelected([rr,cc])} className={['cell',cc%3===2&&cc!==8?'thick-right':'',rr%3===2&&rr!==8?'thick-bottom':'',active?'selected':'',same&&!active?'same-number':'',fixed[rr][cc]?'given':'editable',conflict(rr,cc)?'wrong':'',v&&!fixed[rr][cc]&&v!==game.solution[rr][cc]?'incorrect':''].join(' ')}>{v||<span className="cell-notes">{(notes[rr+'-'+cc]||[]).map(x=><i key={x}>{x}</i>)}</span>}</button>}))}</div>
   <div className="board-foot"><span>⚡</span></div>
  </section>
  <section className="action-tools">
   <button onClick={undo} disabled={!history.length}><RotateCcw/><span>Отменить</span></button>
   <button onClick={erase}><Eraser/><span>Стирать</span></button>
   <button className={noteMode?'tool-active':''} onClick={()=>setNoteMode(v=>!v)}><Pencil/><span>Карандаш</span></button>
   <button onClick={hint} disabled={!hints}><span className="hint-art"><Lightbulb/><i>{hints}</i></span><span>Умная подсказка</span></button>
  </section>
  <section className="number-pad">{[1,2,3,4,5,6,7,8,9].map(n=><button key={n} onClick={()=>enter(n)} disabled={remaining(n)===0||paused||won} className={selectedValue===n?'key-selected':''}><strong>{n}</strong><small>{remaining(n)}</small></button>)}</section>
  <button className="change-level" onClick={()=>setShowLevels(true)}>Новая игра · {level.label}</button>
  {won&&<div className="victory-screen"><div className="rays"/><button className="favorite-win"><Star/></button><div className="victory-card"><div className="star-trio"><span>🌟</span><span>🌟</span><span>🌟</span></div><div className="victory-heading"><h1>Молниеносно!</h1><p>Каждая цифра на своём месте — великолепно!</p></div><div className="result-list"><div><span>Трудность</span><b>{level.label}</b></div><div><span>Время</span><b>{fmt(seconds)}</b></div><div><span>Счёт</span><b>{score.toLocaleString('ru-RU')}</b></div><div><span>Лучшее время</span><b>{fmt(best[level.id]??seconds)}</b></div></div><div className="result-metrics"><span>◎ {accuracy}%</span><span>★ × {mistakes}</span><span>💡 {3-hints}</span></div></div><button className="new-game-button" onClick={()=>setShowLevels(true)}>Новая игра</button><div className="victory-bottom"><span>⌂　Главная</span><span>↗　ПОДЕЛИТЬСЯ</span></div></div>}
  {showLevels&&<div className="sheet-backdrop" onClick={()=>setShowLevels(false)}><section className="level-sheet" onClick={e=>e.stopPropagation()}><div className="sheet-handle"/><button className="sheet-close" onClick={()=>setShowLevels(false)}><X/></button><h2>Новая игра</h2><p className="weekly-rate">Еженедельный коэффициент побед: <b>100%</b></p><div className="level-options">{LEVELS.map(l=>{const locked=!levelUnlocked(l);return <button key={l.id} className={'level-row '+(locked?'locked':'')} disabled={locked} onClick={()=>startGame(l)}><span className="level-emoji">{l.emoji}</span><span className="level-name">{l.label}<small>Lv1</small>{locked&&<em>{l.requirement}</em>}</span>{l.id==='Medium'&&<span className="star-progress">⭐ 3/20</span>}{locked&&<Lock className="lock-icon"/>}</button>})}<div className="extra-modes"><button onClick={()=>startGame(LEVELS[0])}>🥳　Быстрое</button><button disabled>🐵　16×16　<Lock size={17}/></button></div></div></section></div>}
 </main>;
}
