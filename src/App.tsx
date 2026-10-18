import { useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  ArrowRight, BookOpen, Bookmark, Check, ChevronLeft, ChevronRight,
  CircleHelp, Flame, Home, Moon, Play, RotateCcw, Sun, Target, Trophy, Shuffle, AlertCircle
} from 'lucide-react'
import questions from './data/questions.json'
import { AuthPanel } from './AuthPanel'
import { supabase, supabaseConfigured } from './lib/supabase'

type Question = {
  id: string
  week: number
  question: string
  options: { id: string; text: string }[]
  correctOptionIds: string[]
  explanation: string
  sourceReference: string
  verificationStatus: string
}
type View = 'home' | 'practice' | 'tests' | 'revision' | 'bookmarks' | 'progress'
type History = Record<string, { attempts: number; correct: number; incorrect: number }>
type CloudProgress = {
  user_id: string
  history: History
  answers: Record<string, string>
  bookmarks: string[]
  streak_days: number
  last_activity_date: string | null
  updated_at: string
}

const bank = questions as Question[]

/** Format a question id into a display label like W02-Q03 */
function stableLabel(q: Question): string {
  const [, wPart, qPart] = q.id.match(/^w(\d+)-q(\d+)$/) ?? []
  if (!wPart || !qPart) return q.id.toUpperCase()
  return `W${wPart.padStart(2, '0')}-Q${qPart.padStart(2, '0')}`
}

export default function App() {
  const [view, setView] = useState<View>('home')
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('swayam-theme')
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [history, setHistory] = useState<History>(() =>
    JSON.parse(localStorage.getItem('swayam-history') || '{}')
  )
  const [bookmarks, setBookmarks] = useState<string[]>(() =>
    JSON.parse(localStorage.getItem('swayam-bookmarks') || '[]')
  )
  const [session, setSession] = useState<string[] | null>(null)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [answerHistory, setAnswerHistory] = useState<Record<string, string>>(() =>
    JSON.parse(localStorage.getItem('swayam-answers') || '{}')
  )
  const [sessionSelections, setSessionSelections] = useState<Record<string, string>>({})
  const [optionOrder, setOptionOrder] = useState<Record<string, string[]>>({})
  const [mode, setMode] = useState<'practice' | 'test'>('practice')
  const [testSubmitted, setTestSubmitted] = useState(false)

  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(!supabaseConfigured)
  const [cloudReady, setCloudReady] = useState(!supabaseConfigured)
  const [authBusy, setAuthBusy] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const [authError, setAuthError] = useState('')
  const [streakDays, setStreakDays] = useState(() =>
    Number(localStorage.getItem('swayam-streak') || 0)
  )
  const cloudUpdatedAt = useRef<string | null>(null)

  // Persist state to localStorage
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('swayam-theme', dark ? 'dark' : 'light')
  }, [dark])
  useEffect(() => { localStorage.setItem('swayam-history', JSON.stringify(history)) }, [history])
  useEffect(() => { localStorage.setItem('swayam-answers', JSON.stringify(answerHistory)) }, [answerHistory])
  useEffect(() => { localStorage.setItem('swayam-bookmarks', JSON.stringify(bookmarks)) }, [bookmarks])
  useEffect(() => { localStorage.setItem('swayam-streak', String(streakDays)) }, [streakDays])

  async function loadCloudProgress(userId: string) {
    if (!supabase) return
    setCloudReady(false)
    const { data, error } = await supabase.from('progress').select('*').eq('user_id', userId).maybeSingle()
    if (error) { setAuthError(`Could not load cloud progress: ${error.message}`); setCloudReady(true); return }
    if (data) {
      const cloud = data as CloudProgress
      setHistory(cloud.history || {})
      setAnswerHistory(cloud.answers || {})
      setBookmarks(cloud.bookmarks || [])
      setStreakDays(cloud.streak_days || 0)
      cloudUpdatedAt.current = cloud.updated_at
    } else {
      setHistory({}); setAnswerHistory({}); setBookmarks([]); setStreakDays(0)
      cloudUpdatedAt.current = null
    }
    setCloudReady(true)
  }

  async function saveCloudProgress() {
    if (!supabase || !user || !cloudReady) return
    const { data: remote } = await supabase.from('progress')
      .select('history, answers, bookmarks, streak_days, last_activity_date, updated_at')
      .eq('user_id', user.id).maybeSingle()
    if (remote?.updated_at && cloudUpdatedAt.current && remote.updated_at > cloudUpdatedAt.current) {
      const cloud = remote as CloudProgress
      setHistory(cloud.history || {}); setAnswerHistory(cloud.answers || {})
      setBookmarks(cloud.bookmarks || []); setStreakDays(cloud.streak_days || 0)
      cloudUpdatedAt.current = cloud.updated_at
      setAuthMessage('Cloud progress changed on another device; the newest version was loaded.')
      return
    }
    const { data, error } = await supabase.from('progress').upsert(
      { user_id: user.id, history, answers: answerHistory, bookmarks, streak_days: streakDays, last_activity_date: new Date().toISOString().slice(0, 10) },
      { onConflict: 'user_id' }
    ).select().single()
    if (error) setAuthError(`Could not sync progress: ${error.message}`)
    else cloudUpdatedAt.current = (data as CloudProgress).updated_at
  }

  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setUser(data.session?.user || null)
      setAuthReady(true)
      if (data.session?.user) void loadCloudProgress(data.session.user.id)
      else setCloudReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setUser(s?.user || null)
      if (s?.user) void loadCloudProgress(s.user.id)
      else { setHistory({}); setBookmarks([]); setStreakDays(0); setCloudReady(true) }
    })
    return () => { active = false; data.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!user || !cloudReady) return
    const timer = window.setTimeout(() => void saveCloudProgress(), 500)
    return () => window.clearTimeout(timer)
  }, [history, answerHistory, bookmarks, streakDays, user, cloudReady])

  const attempted = Object.keys(history).length
  const correct = Object.values(history).reduce((sum, item) => sum + item.correct, 0)
  const totalAttempts = Object.values(history).reduce((sum, item) => sum + item.attempts, 0)
  const accuracy = totalAttempts ? Math.round(correct / totalAttempts * 100) : 0
  const weekCounts = useMemo(() => Array.from({ length: 12 }, (_, i) => bank.filter((q) => q.week === i + 1).length), [])
  const current = session ? bank.find((q) => q.id === session[index]) : undefined

  function start(nextMode: 'practice' | 'test', selected: Question[] = bank, shuffle = false) {
    if (!selected.length) return // Guard: never start with empty set
    const ordered = shuffle ? [...selected].sort(() => Math.random() - 0.5) : selected
    const chosen = ordered.map((q) => q.id)
    // Shuffle answer positions for every new session without changing the answer IDs.
    const nextOptionOrder: Record<string, string[]> = {}
    for (const question of ordered) {
      const correctId = question.correctOptionIds[0]
      const shuffledIds = [...question.options]
        .sort(() => Math.random() - 0.5)
        .map((option) => option.id)

      // If this question was seen in the previous session, make sure its
      // correct answer does not stay in the same displayed letter position.
      const previousIds = optionOrder[question.id]
      if (previousIds && shuffledIds.length > 1) {
        const previousCorrectPosition = previousIds.indexOf(correctId)
        const nextCorrectPosition = shuffledIds.indexOf(correctId)
        if (previousCorrectPosition === nextCorrectPosition) {
          const swapPosition = (nextCorrectPosition + 1) % shuffledIds.length
          ;[shuffledIds[nextCorrectPosition], shuffledIds[swapPosition]] =
            [shuffledIds[swapPosition], shuffledIds[nextCorrectPosition]]
        }
      }
      nextOptionOrder[question.id] = shuffledIds
    }
    setOptionOrder(nextOptionOrder)
    setMode(nextMode)
    setSession(chosen)
    setIndex(0)
    setAnswers({})
    setSessionSelections({})
    setTestSubmitted(false)
    setView(nextMode === 'test' ? 'tests' : 'practice')
  }

  function record(question: Question, selected: string) {
    const isCorrect = selected === question.correctOptionIds[0]
    setHistory((old) => ({
      ...old,
      [question.id]: {
        attempts: (old[question.id]?.attempts || 0) + 1,
        correct: (old[question.id]?.correct || 0) + (isCorrect ? 1 : 0),
        incorrect: (old[question.id]?.incorrect || 0) + (isCorrect ? 0 : 1),
      },
    }))
  }

  function selectAnswer(question: Question, selected: string) {
    setAnswers((old) => ({ ...old, [question.id]: selected }))
    setAnswerHistory((old) => ({ ...old, [question.id]: selected }))
    if (mode !== 'practice') return
    setStreakDays((old) => old || 1)
    setSessionSelections((oldSelections) => {
      const previous = oldSelections[question.id]
      if (previous === selected) return oldSelections
      setHistory((oldHistory) => {
        const previousCorrect = previous === question.correctOptionIds[0]
        const nextCorrect = selected === question.correctOptionIds[0]
        const existing = oldHistory[question.id] || { attempts: 0, correct: 0, incorrect: 0 }
        return {
          ...oldHistory,
          [question.id]: {
            attempts: existing.attempts + (previous ? 0 : 1),
            correct: existing.correct - (previous ? (previousCorrect ? 1 : 0) : 0) + (nextCorrect ? 1 : 0),
            incorrect: existing.incorrect - (previous ? (previousCorrect ? 0 : 1) : 0) + (nextCorrect ? 0 : 1),
          },
        }
      })
      return { ...oldSelections, [question.id]: selected }
    })
  }

  function submitTest() {
    // Record test answers in history
    if (session) {
      for (const qId of session) {
        const q = bank.find((b) => b.id === qId)
        const sel = answers[qId]
        if (q && sel) record(q, sel)
      }
      setStreakDays((old) => old || 1)
    }
    setTestSubmitted(true)
  }

  async function authenticate(authMode: 'login' | 'register', email: string, password: string) {
    if (!supabase) return
    setAuthBusy(true); setAuthError(''); setAuthMessage('')
    const result = authMode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })
    setAuthBusy(false)
    if (result.error) setAuthError(result.error.message)
    else setAuthMessage(
      authMode === 'register' && !result.data.session
        ? 'Check your email to confirm your account, then sign in.'
        : 'Signed in. Cloud progress is loading.'
    )
  }

  async function logout() {
    if (!supabase) return
    setAuthBusy(true)
    const { error } = await supabase.auth.signOut()
    setAuthBusy(false)
    if (error) setAuthError(error.message)
    else {
      setAuthMessage('Signed out.')
      setHistory({}); setAnswerHistory({}); setBookmarks([]); setStreakDays(0)
      setSession(null); setTestSubmitted(false); setView('home')
    }
  }

  function finish() {
    setSession(null)
    setTestSubmitted(false)
    setView('home')
  }

  function finishPractice() {
    setTestSubmitted(true)
  }

  if (!authReady) return <div className="auth-loading">Loading account...</div>

  const accountPanel = (
    <AuthPanel
      configured={supabaseConfigured}
      user={user}
      busy={authBusy}
      message={authMessage}
      error={authError}
      onSubmit={authenticate}
      onLogout={logout}
    />
  )

  // Final results view for both Practice and Mock Test
  if (session && testSubmitted) {
    return (
      <div className="app-root">
        {accountPanel}
        <TestResultsView
          session={session}
          answers={answers}
          bank={bank}
          optionOrder={optionOrder}
          mode={mode}
          view={view}
          dark={dark}
          setDark={setDark}
          setView={setView}
          onFinish={finish}
          onPracticeWrong={(wrong) => start('practice', wrong)}
        />
      </div>
    )
  }

  // Active session view
  if (session && current) {
    return (
      <div className="app-root">
        {accountPanel}
        <SessionView
          current={current}
          optionOrder={optionOrder[current.id] || current.options.map((option) => option.id)}
          index={index}
          total={session.length}
          selected={answers[current.id]}
          mode={mode}
          view={view}
          dark={dark}
          setDark={setDark}
          setView={setView}
          bookmarks={bookmarks}
          setBookmarks={setBookmarks}
          onSelect={selectAnswer}
          onPrevious={() => setIndex((v) => v - 1)}
          onNext={() => setIndex((v) => v + 1)}
          onFinish={finish}
          onPracticeFinish={finishPractice}
          onSubmitTest={submitTest}
        />
      </div>
    )
  }

  return (
    <div className="app-root">
      {accountPanel}
      <Shell view={view} setView={setView} dark={dark} setDark={setDark}>
        <main className="content">
          {view === 'home' && (
            <HomeView
              bank={bank}
              weekCounts={weekCounts}
              attempted={attempted}
              accuracy={accuracy}
              streakDays={streakDays}
              start={start}
              setView={setView}
            />
          )}
          {view === 'practice' && (
            <ConfigView
              title="Practice studio"
              description="Active recall with instant feedback and source-traced answers."
              action="Start practice"
              mode="practice"
              bank={bank}
              onStart={(selected, shuffle) => start('practice', selected, shuffle)}
            />
          )}
          {view === 'tests' && (
            <ConfigView
              title="Mock test"
              description="Choose a question scope. Answers stay hidden until you submit."
              action="Start mock test"
              mode="test"
              bank={bank}
              onStart={(selected, shuffle) => start('test', selected, shuffle)}
            />
          )}
          {view === 'revision' && (
            <RevisionView bank={bank} history={history} start={start} />
          )}
          {view === 'bookmarks' && (
            <BookmarksView bank={bank} bookmarks={bookmarks} setBookmarks={setBookmarks} start={start} />
          )}
          {view === 'progress' && (
            <ProgressView bank={bank} history={history} accuracy={accuracy} totalAttempts={totalAttempts} />
          )}
        </main>
      </Shell>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------
function Shell({
  children, view, setView, dark, setDark,
}: {
  children: React.ReactNode
  view: View
  setView: (v: View) => void
  dark: boolean
  setDark: (v: boolean) => void
}) {
  const nav: [View, string, React.ReactNode][] = [
    ['home', 'Home', <Home size={18} />],
    ['practice', 'Practice', <Play size={18} />],
    ['tests', 'Tests', <Target size={18} />],
    ['revision', 'Revision', <RotateCcw size={18} />],
    ['bookmarks', 'Bookmarks', <Bookmark size={18} />],
    ['progress', 'Progress', <Trophy size={18} />],
  ]
  return (
    <div className="app-shell">
      <aside>
        <div className="brand">
          <span>SA</span>
          <div>
            <strong>SWAYAM ACE</strong>
            <small>Wildlife Ecology</small>
          </div>
        </div>
        <nav>
          {nav.map(([id, label, icon]) => (
            <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>
              {icon}<span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button className="theme-button" onClick={() => setDark(!dark)}>
            {dark ? <Sun size={17} /> : <Moon size={17} />} {dark ? 'Light mode' : 'Dark mode'}
          </button>
          <p><CircleHelp size={14} /> Answers are sourced from supplied PDFs.</p>
        </div>
      </aside>
      <div className="mobile-top">
        <div className="brand">
          <span>SA</span>
          <strong>SWAYAM ACE</strong>
        </div>
        <button className="icon-button" aria-label={dark ? 'Use light theme' : 'Use dark theme'} onClick={() => setDark(!dark)}>
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// HomeView
// ---------------------------------------------------------------------------
function HomeView({
  bank, weekCounts, attempted, accuracy, streakDays, start, setView,
}: {
  bank: Question[]
  weekCounts: number[]
  attempted: number
  accuracy: number
  streakDays: number
  start: (m: 'practice' | 'test', q?: Question[]) => void
  setView: (v: View) => void
}) {
  return (
    <>
      <section className="hero">
        <div>
          <span className="eyebrow">Your study desk</span>
          <h1>Make the next answer <em>stick.</em></h1>
          <p>Build exam confidence through deliberate practice, clean feedback, and a question bank grounded in the supplied Wildlife Ecology solution papers.</p>
          <div className="hero-actions">
            <button
              className="button primary"
              onClick={() => setView('practice')}
            >
              <Play size={18} /> Start practice
            </button>

            <button
              className="button secondary"
              onClick={() => setView('tests')}
            >
              <Target size={18} /> Quick test
            </button>
          </div>
        </div>
        <div className="hero-mark">
          <div className="ring">
            <strong>{accuracy}%</strong>
            <span>accuracy</span>
          </div>
          <span className="hero-note">
            {attempted ? `${attempted} questions revisited` : 'Ready for your first session'}
          </span>
        </div>
      </section>

      <section className="stats">
        <Stat label="Question bank" value={bank.length.toString()} detail="verified source entries" icon={<BookOpen />} />
        <Stat label="Attempted" value={attempted.toString()} detail="unique questions" icon={<Check />} />
        <Stat label="Accuracy" value={`${accuracy}%`} detail="based on saved attempts" icon={<Target />} />
        <Stat label="Streak" value={`${streakDays} day${streakDays === 1 ? '' : 's'}`} detail="saved study streak" icon={<Flame />} />
      </section>

      <section className="section-heading">
        <div>
          <span className="eyebrow">The syllabus</span>
          <h2>12 weeks, one clear view</h2>
        </div>
        <button className="text-button" onClick={() => setView('progress')}>
          View progress <ArrowRight size={16} />
        </button>
      </section>

      <div className="week-grid">
        {weekCounts.map((count, i) => (
          <button
            className="week-tile"
            key={i}
            onClick={() => start('practice', bank.filter((q) => q.week === i + 1))}
          >
            <span>W{i + 1}</span>
            <strong>{count}</strong>
            <small>questions</small>
            <ArrowRight size={16} />
          </button>
        ))}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Stat
// ---------------------------------------------------------------------------
function Stat({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-icon">{icon}</div>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ConfigView — scope selector for both Practice and Test modes
// ---------------------------------------------------------------------------
function ConfigView({
  title, description, action, mode, bank, onStart,
}: {
  title: string
  description: string
  action: string
  mode: 'practice' | 'test'
  bank: Question[]
  onStart: (selected: Question[], shuffle: boolean) => void
}) {
  const availableWeeks = [...new Set(bank.map((q) => q.week))].sort((a, b) => a - b)
  const [selectedWeeks, setSelectedWeeks] = useState<number[]>(availableWeeks)
  const [shuffle, setShuffle] = useState(false)

  const selected = bank.filter((q) => selectedWeeks.includes(q.week))
  const isEmpty = selected.length === 0
  const allSelected = availableWeeks.length > 0 && availableWeeks.every((week) => selectedWeeks.includes(week))

  const scopeLabel = allSelected
    ? `All ${availableWeeks.length} weeks`
    : selectedWeeks.length
      ? `Weeks ${[...selectedWeeks].sort((a, b) => a - b).join(', ')}`
      : 'No weeks selected'

  function toggleWeek(week: number) {
    setSelectedWeeks((previous) =>
      previous.includes(week)
        ? previous.filter((w) => w !== week)
        : [...previous, week].sort((a, b) => a - b)
    )
  }

  function handleStart() {
    if (!isEmpty) onStart(selected, shuffle)
  }

  return (
    <>
      <section className="page-title">
        <span className="eyebrow">Choose your scope</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </section>

      <section className="config-panel">
        <div className="config-info">
          {isEmpty ? (
            <div className="config-empty">
              <AlertCircle size={20} />
              <span>No questions found for this selection. Select at least one week.</span>
            </div>
          ) : (
            <>
              <small>Question pool</small>
              <h2>{selected.length} question{selected.length !== 1 ? 's' : ''} selected</h2>
              <p>
                {scopeLabel}
                {selected.length > 0 && !allSelected && selectedWeeks.length === 1
                  ? ` · ${stableLabel(selected[0])} – ${stableLabel(selected[selected.length - 1])}`
                  : ''}
                {mode === 'test'
                  ? ' · Answers hidden until submission.'
                  : ' · Instant feedback after each answer.'}
              </p>
            </>
          )}
        </div>

        <div className="config-controls">
          <div className="week-picker">
            <strong>Choose one or more weeks</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                className="text-button"
                onClick={() => setSelectedWeeks(availableWeeks)}
              >
                Select all
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setSelectedWeeks([])}
              >
                Clear all
              </button>
            </div>

            <div
              className="week-checkbox-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 135px), 1fr))',
                gap: 8,
                marginTop: 12,
              }}
            >
              {availableWeeks.map((week) => {
                const count = bank.filter((q) => q.week === week).length
                const checked = selectedWeeks.includes(week)
                return (
                  <label
                    key={week}
                    className="week-checkbox"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      minWidth: 0,
                      padding: 10,
                      border: '1px solid var(--border, #ead6dc)',
                      borderRadius: 12,
                      cursor: 'pointer',
                      background: checked ? 'var(--selected-bg, rgba(236, 128, 151, 0.12))' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleWeek(week)}
                    />
                    <span style={{ flex: 1 }}>Week {week}</span>
                    <small>{count} Q</small>
                  </label>
                )
              })}
            </div>
            <p aria-live="polite">
              {selected.length} question{selected.length === 1 ? '' : 's'} selected
            </p>
          </div>

          <label className="shuffle-row" htmlFor={`shuffle-toggle-${mode}`}>
            <input
              id={`shuffle-toggle-${mode}`}
              type="checkbox"
              checked={shuffle}
              onChange={(e) => setShuffle(e.target.checked)}
            />
            <Shuffle size={15} />
            Shuffle questions
          </label>

          <div className="section-note">
            <CircleHelp size={13} />
            <span>Section filtering is unavailable because the source PDFs do not provide verified section mappings.</span>
          </div>

          <button
            className="button primary"
            onClick={handleStart}
            disabled={isEmpty}
            id={`start-${mode}-btn`}
          >
            {action} <ArrowRight size={18} />
          </button>
        </div>
      </section>
    </>
  )
}
// ---------------------------------------------------------------------------
// RevisionView
// ---------------------------------------------------------------------------
function RevisionView({ bank, history, start }: { bank: Question[]; history: History; start: (m: 'practice' | 'test', q?: Question[]) => void }) {
  const weak = bank.filter((q) => history[q.id]?.incorrect)
  return (
    <>
      <section className="page-title">
        <span className="eyebrow">Targeted recall</span>
        <h1>Weak areas</h1>
        <p>Questions you missed are collected here. Unanswered questions are never mislabeled as incorrect.</p>
      </section>
      <section className="empty-or-list">
        {weak.length ? (
          <>
            <div className="list-head">
              <strong>{weak.length} questions to revisit</strong>
              <button className="button primary" onClick={() => start('practice', weak)}>
                Practice weak areas <Play size={17} />
              </button>
            </div>
            {weak.map((q) => (
              <div className="row" key={q.id}>
                <span>{stableLabel(q)}</span>
                <p>{q.question}</p>
                <small>{history[q.id].incorrect} incorrect</small>
              </div>
            ))}
          </>
        ) : (
          <Empty icon={<RotateCcw />} title="Your weak-area list is clear" text="Complete a practice session and missed questions will appear here." />
        )}
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------
// BookmarksView
// ---------------------------------------------------------------------------
function BookmarksView({ bank, bookmarks, setBookmarks, start }: { bank: Question[]; bookmarks: string[]; setBookmarks: (v: string[]) => void; start: (m: 'practice' | 'test', q?: Question[]) => void }) {
  const saved = bank.filter((q) => bookmarks.includes(q.id))
  return (
    <>
      <section className="page-title">
        <span className="eyebrow">Saved for later</span>
        <h1>Bookmarks</h1>
        <p>Keep the questions that deserve another pass close at hand.</p>
      </section>
      <section className="empty-or-list">
        {saved.length ? (
          <>
            <div className="list-head">
              <strong>{saved.length} saved questions</strong>
              <button className="button primary" onClick={() => start('practice', saved)}>
                Practice bookmarks <Play size={17} />
              </button>
            </div>
            {saved.map((q) => (
              <div className="row" key={q.id}>
                <span>{stableLabel(q)}</span>
                <p>{q.question}</p>
                <button className="icon-button" aria-label="Remove bookmark" onClick={() => setBookmarks(bookmarks.filter((id) => id !== q.id))}>
                  <Bookmark size={17} />
                </button>
              </div>
            ))}
          </>
        ) : (
          <Empty icon={<Bookmark />} title="Nothing saved yet" text="Bookmark a question during practice or review to find it here." />
        )}
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------
// ProgressView
// ---------------------------------------------------------------------------
function ProgressView({ bank, history, accuracy, totalAttempts }: { bank: Question[]; history: History; accuracy: number; totalAttempts: number }) {
  return (
    <>
      <section className="page-title">
        <span className="eyebrow">Evidence, not vanity metrics</span>
        <h1>Your progress</h1>
        <p>Everything here is calculated from attempts stored on this device.</p>
      </section>
      <div className="progress-grid">
        <div className="big-metric">
          <span>Overall accuracy</span>
          <strong>{accuracy}%</strong>
          <div className="progress-line"><span style={{ width: `${accuracy}%` }} /></div>
          <small>{totalAttempts} recorded answers</small>
        </div>
        <div className="big-metric">
          <span>Coverage</span>
          <strong>{Object.keys(history).length} <em>/ {bank.length}</em></strong>
          <div className="progress-line"><span style={{ width: `${Object.keys(history).length / bank.length * 100}%` }} /></div>
          <small>unique questions attempted</small>
        </div>
      </div>
      <div className="source-note">
        <Check size={18} />
        <div>
          <strong>Source release: 2026 assignment solutions</strong>
          <p>12 PDFs, 10 questions per week. Correct options are read from bold answer markers in each supplied PDF. Progress stays local to this browser.</p>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Empty
// ---------------------------------------------------------------------------
function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SessionView — Practice and Test (pre-submission)
// ---------------------------------------------------------------------------
function SessionView({
  current, optionOrder, index, total, selected, mode, view, dark, setDark, setView,
  bookmarks, setBookmarks, onSelect, onPrevious, onNext, onFinish, onPracticeFinish, onSubmitTest,
}: {
  current: Question
  optionOrder: string[]
  index: number
  total: number
  selected?: string
  mode: 'practice' | 'test'
  view: View
  dark: boolean
  setDark: (value: boolean) => void
  setView: (value: View) => void
  bookmarks: string[]
  setBookmarks: React.Dispatch<React.SetStateAction<string[]>>
  onSelect: (question: Question, optionId: string) => void
  onPrevious: () => void
  onNext: () => void
  onFinish: () => void
  onPracticeFinish: () => void
  onSubmitTest: () => void
}) {
  const isPractice = mode === 'practice'
  const isCorrect = selected === current.correctOptionIds[0]
  const explanation = current.explanation.trim() ||
    `No verified explanation text was supplied for this question. The verified answer is recorded in ${current.sourceReference}.`
  const isLastQuestion = index === total - 1
  const orderedOptions = optionOrder
    .map((id) => current.options.find((option) => option.id === id))
    .filter((option): option is Question['options'][number] => Boolean(option))

  return (
    <Shell view={view} setView={setView} dark={dark} setDark={setDark}>
      <main className="content">
        <div className="session-head">
          <div>
            <span className="eyebrow">{isPractice ? 'Practice studio' : 'Mock test'}</span>
            <h1>
              Question {index + 1} <span className="muted">of {total}</span>
            </h1>
          </div>
          <button className="button ghost" onClick={onFinish}>Exit session</button>
        </div>

        <div className="progress-line">
          <span style={{ width: `${(index + 1) / total * 100}%` }} />
        </div>

        <section className="question-card">
          <div className="question-meta">
            <div className="question-id-row">
              <span className="question-id">{stableLabel(current)}</span>
              <span className="question-pos">Question {index + 1} of {total}</span>
            </div>
            <button
              className={`icon-button ${bookmarks.includes(current.id) ? 'active' : ''}`}
              aria-label="Toggle bookmark"
              onClick={() => setBookmarks((old) => old.includes(current.id) ? old.filter((id) => id !== current.id) : [...old, current.id])}
            >
              <Bookmark size={18} fill="currentColor" />
            </button>
          </div>

          <h2>{current.question}</h2>

          <div className="options" role="radiogroup" aria-label="Answer options">
            {orderedOptions.map((option, optionIndex) => {
              const optionIsCorrect = isPractice && selected && option.id === current.correctOptionIds[0]
              const optionIsIncorrect = isPractice && selected === option.id && !isCorrect
              return (
                <label
                  key={option.id}
                  className={`option ${selected === option.id ? 'selected' : ''} ${optionIsCorrect ? 'correct' : ''} ${optionIsIncorrect ? 'incorrect' : ''}`}
                >
                  <input
                    type="radio"
                    name={`question-${current.id}`}
                    value={option.id}
                    checked={selected === option.id}
                    onChange={() => onSelect(current, option.id)}
                  />
                  <span className="option-key">{String.fromCharCode(65 + optionIndex)}</span>
                  <span className="option-text">{option.text}</span>
                  {optionIsCorrect && <Check size={18} aria-label="Correct answer" />}
                  {optionIsIncorrect && <span className="option-status" aria-label="Selected incorrect answer">!</span>}
                </label>
              )
            })}
          </div>

          {/* Practice: show instant feedback after selection */}
          {isPractice && selected && (
            <div className={`feedback ${isCorrect ? 'good' : 'bad'}`} role="status" aria-live="polite">
              <strong>{isCorrect ? 'Correct!' : 'Review this answer'}</strong>
              <span>{isCorrect ? 'Your selected answer matches the verified answer key.' : 'The correct option is highlighted in green.'}</span>
              <div className="explanation">
                <strong>Explanation</strong>
                <span>{explanation}</span>
              </div>
            </div>
          )}

          {/* Test: subtle "answer recorded" indicator */}
          {!isPractice && selected && (
            <div className="test-answer-note" role="status">
              <Check size={14} /> Answer recorded. Revealed after submission.
            </div>
          )}
        </section>

        <div className="session-actions">
          <button className="button ghost" disabled={index === 0} onClick={onPrevious}>
            <ChevronLeft size={18} /> Previous
          </button>

          {isPractice ? (
            isLastQuestion ? (
              <button className="button primary" onClick={onPracticeFinish}>
                View results <Trophy size={18} />
              </button>
            ) : (
              <button className="button primary" disabled={!selected} onClick={onNext}>
                Next question <ChevronRight size={18} />
              </button>
            )
          ) : (
            isLastQuestion ? (
              <button className="button primary" onClick={onSubmitTest} id="submit-test-btn">
                Submit test <Trophy size={18} />
              </button>
            ) : (
              <button className="button primary" onClick={onNext}>
                Next question <ChevronRight size={18} />
              </button>
            )
          )}
        </div>
      </main>
    </Shell>
  )
}

// ---------------------------------------------------------------------------
// TestResultsView — shown after test submission
// ---------------------------------------------------------------------------
function TestResultsView({
  session, answers, bank, optionOrder, mode, view, dark, setDark, setView, onFinish, onPracticeWrong,
}: {
  session: string[]
  answers: Record<string, string>
  bank: Question[]
  optionOrder: Record<string, string[]>
  mode: 'practice' | 'test'
  view: View
  dark: boolean
  setDark: (v: boolean) => void
  setView: (v: View) => void
  onFinish: () => void
  onPracticeWrong: (wrong: Question[]) => void
}) {
  const sessionQuestions = session.map((id) => bank.find((q) => q.id === id)).filter(Boolean) as Question[]
  const scoreCorrect = sessionQuestions.filter((q) => answers[q.id] === q.correctOptionIds[0]).length
  const scoreTotal = sessionQuestions.length
  const pct = scoreTotal ? Math.round(scoreCorrect / scoreTotal * 100) : 0
  const wrongQuestions = sessionQuestions.filter((q) => answers[q.id] && answers[q.id] !== q.correctOptionIds[0])
  const unanswered = sessionQuestions.filter((q) => !answers[q.id])
  const incorrectCount = wrongQuestions.length + unanswered.length

  return (
    <Shell view={view} setView={setView} dark={dark} setDark={setDark}>
      <main className="content">
        <div className="session-head">
          <div>
            <span className="eyebrow">{mode === 'practice' ? 'Practice complete' : 'Test complete'}</span>
            <h1>{mode === 'practice' ? 'Practice results' : 'Your results'}</h1>
          </div>
          <button className="button ghost" onClick={onFinish}>Go home</button>
        </div>

        {/* Score card */}
        <section className="score-card">
          <div className="score-ring-wrap">
            <div className={`score-ring ${pct >= 60 ? 'pass' : 'fail'}`}>
              <strong>{pct}%</strong>
              <span>{pct >= 60 ? 'Pass' : 'Review'}</span>
            </div>
          </div>
          <div className="score-detail">
            <div className="score-fraction">
              <span className="score-num">{scoreCorrect}</span>
              <span className="score-sep"> / </span>
              <span className="score-den">{scoreTotal}</span>
              <span className="score-label"> correct</span>
            </div>
            <div className="result-summary-counts" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '12px 0 18px' }}>
              <span><strong>{scoreCorrect}</strong> correct</span>
              <span><strong>{wrongQuestions.length}</strong> incorrect</span>
              <span><strong>{unanswered.length}</strong> unanswered</span>
            </div>
            {unanswered.length > 0 && (
              <p className="score-unanswered">{unanswered.length} question{unanswered.length > 1 ? 's' : ''} left unanswered</p>
            )}
            <div className="score-actions">
              {incorrectCount > 0 && (
                <button className="button secondary" onClick={() => onPracticeWrong([...wrongQuestions, ...unanswered])}>
                  <RotateCcw size={16} /> Retry {incorrectCount} question{incorrectCount > 1 ? 's' : ''}
                </button>
              )}
              <button className="button primary" onClick={onFinish}>
                <Home size={16} /> Go home
              </button>
            </div>
          </div>
        </section>

        {/* Per-question breakdown */}
        <section className="results-list">
          <h2>Question breakdown</h2>
          {sessionQuestions.map((q, i) => {
            const sel = answers[q.id]
            const isCorrect = sel === q.correctOptionIds[0]
            const selectedOption = q.options.find((o) => o.id === sel)
            const correctOption = q.options.find((o) => o.id === q.correctOptionIds[0])
            const orderedIds = optionOrder[q.id] || q.options.map((option) => option.id)
            const selectedLetter = sel ? String.fromCharCode(65 + Math.max(0, orderedIds.indexOf(sel))) : ''
            const correctLetter = String.fromCharCode(65 + Math.max(0, orderedIds.indexOf(q.correctOptionIds[0])))
            const explanation = q.explanation.trim() ||
              `Verified answer is recorded in ${q.sourceReference}.`
            return (
              <div key={q.id} className={`result-item ${isCorrect ? 'result-correct' : 'result-wrong'}`}>
                <div className="result-header">
                  <span className="question-id">{stableLabel(q)}</span>
                  <span className="result-num">Q{i + 1}</span>
                  <span className={`result-badge ${isCorrect ? 'badge-correct' : sel ? 'badge-wrong' : 'badge-skip'}`}>
                    {isCorrect ? <><Check size={13} /> Correct</> : sel ? <><span>✗</span> Incorrect</> : <>— Skipped</>}
                  </span>
                </div>
                <p className="result-question">{q.question}</p>
                <div className="result-answers">
                  {!isCorrect && sel && (
                    <span className="result-ans wrong-ans">
                      Your answer: <strong>{selectedLetter}. {selectedOption?.text}</strong>
                    </span>
                  )}
                  <span className="result-ans correct-ans">
                    Correct: <strong>{correctLetter}. {correctOption?.text}</strong>
                  </span>
                </div>
                <div className="explanation result-explanation">
                  <strong>Explanation</strong>
                  <span>{explanation}</span>
                </div>
              </div>
            )
          })}
        </section>
      </main>
    </Shell>
  )
}