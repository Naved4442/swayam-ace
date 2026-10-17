import { FormEvent, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { LogIn, LogOut, UserPlus } from 'lucide-react'

export function AuthPanel({ configured, user, busy, message, error, onSubmit, onLogout }: { configured: boolean; user: User | null; busy: boolean; message: string; error: string; onSubmit: (mode: 'login' | 'register', email: string, password: string) => void; onLogout: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  if (!configured) return <div className="account-strip muted-account">Cloud sync is unavailable until Supabase is configured. Your local progress is still safe.</div>
  if (user) return <div className="account-strip"><span>Signed in as <strong>{user.email}</strong></span><button className="button ghost" onClick={onLogout} disabled={busy}><LogOut size={16} /> Log out</button></div>
  function submit(event: FormEvent) { event.preventDefault(); onSubmit(mode, email, password) }
  return <form className="account-strip auth-form" onSubmit={submit}><div><strong>{mode === 'login' ? 'Sign in to sync progress' : 'Create your study account'}</strong><span>Cloud progress stays private to your account.</span></div><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label><button className="button primary" disabled={busy}>{mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}{busy ? 'Working...' : mode === 'login' ? 'Sign in' : 'Register'}</button><button type="button" className="text-button auth-switch" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create account' : 'Back to sign in'}</button>{message && <span className="auth-message">{message}</span>}{error && <span className="auth-error" role="alert">{error}</span>}</form>
}
