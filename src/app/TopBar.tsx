import { useEffect, useRef, useState } from 'react'
import { Check, Ellipsis, LoaderCircle, RotateCcw, ScanSearch, Siren } from 'lucide-react'
import { ROUTE_INFO, navigate, useRoute } from './router'
import { ROUTES, openEvent, useApp } from '../state/store'
import { useScanOverlay } from '../pages/network/ScanOverlay'
import { BrandMark, Modal, Toast } from '../ui/components'
import { TasksButton } from './Tasks'
import { KnowledgebaseButton, KnowledgebaseDialog } from '../knowledge/Knowledgebase'
import { ChatButton, ChatPanel } from '../chat/Chatbot'

export function TopBar() {
  const route = useRoute((s) => s.route)
  const mode = useApp((s) => s.ramp.mode)
  const canScan = useApp((s) => s.level === 'healthy' && s.ramp.mode === 'healthy' && !openEvent(s))
  const [menu, setMenu] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [toast, setToast] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setMenu(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(false); btnRef.current?.focus() } }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    menuRef.current?.querySelector('button')?.focus()
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc) }
  }, [menu])

  return (
    <header className="topbar">
      <div className="brand" title="RhizoLah!">
        <BrandMark />
        <span className="brand-name">RhizoLah!</span>
      </div>
      <nav className="tabs" aria-label="Pages">
        {ROUTES.map((r) => {
          const info = ROUTE_INFO[r]
          return (
            <button
              key={r}
              className="tab"
              aria-current={route === r ? 'page' : undefined}
              onClick={() => navigate(r)}
              title={`${info.title}: ${info.sub} (press ${info.n})`}
            >
              <span className="tab-num" aria-hidden="true">{info.n}</span>
              <span className="tab-text">
                <span className="tab-title">{info.title}</span>
                <span className="tab-sub">{info.sub}</span>
              </span>
            </button>
          )
        })}
      </nav>
      <div className="bar-right">
        <ChatButton />
        <KnowledgebaseButton />
        <TasksButton />
        <button
          ref={btnRef}
          className="icon-btn"
          aria-label="More"
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
        >
          <Ellipsis size={22} />
        </button>
      </div>
      {menu && (
        <div className="menu" role="menu" ref={menuRef}>
          {mode === 'healthy' && (
            <button className="menu-item" role="menuitem" onClick={() => { setMenu(false); useApp.getState().simulateDanger() }} data-testid="simulate-danger">
              <Siren size={18} /> Simulate danger
            </button>
          )}
          {mode === 'danger' && (
            <button className="menu-item" role="menuitem" onClick={() => { setMenu(false); useApp.getState().restoreHealthy() }} data-testid="restore-healthy">
              <RotateCcw size={18} /> Restore healthy
            </button>
          )}
          {(mode === 'dropping' || mode === 'restoring') && (
            <button className="menu-item" role="menuitem" disabled>
              <LoaderCircle size={18} className="spin" /> {mode === 'dropping' ? 'Dropping…' : 'Restoring…'}
            </button>
          )}
          <button
            className="menu-item"
            role="menuitem"
            disabled={!canScan}
            title={canScan ? undefined : 'Available when all readings are Healthy'}
            onClick={() => { setMenu(false); navigate('network'); useScanOverlay.setState({ open: true }) }}
            data-testid="scan-replanting"
          >
            <ScanSearch size={18} /> Scan for replanting
          </button>
          <div className="menu-sep" role="separator" />
          <button className="menu-item" role="menuitem" onClick={() => { setMenu(false); setConfirm(true) }}>
            <RotateCcw size={18} /> Reset demo
          </button>
        </div>
      )}
      <Modal open={confirm} onClose={() => setConfirm(false)} label="Reset the demo">
        <div className="modal-body">
          <h2>Reset the demo?</h2>
          <p>This starts a fresh demo for the next audience.</p>
          <div className="modal-sub">What will be cleared</div>
          <ul className="modal-list clear">
            <li><RotateCcw size={17} /> The year goes back to 1</li>
            <li><RotateCcw size={17} /> Replant areas and tasks are cleared</li>
            <li><RotateCcw size={17} /> Readings go back to Healthy</li>
            <li><RotateCcw size={17} /> Added locations are removed</li>
          </ul>
          <div className="modal-sub">What is kept</div>
          <ul className="modal-list keep">
            <li><Check size={17} /> Camera photos and their history</li>
            <li><Check size={17} /> Knowledgebase uploads</li>
          </ul>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={() => setConfirm(false)} autoFocus>Cancel</button>
          <button
            className="btn btn-danger"
            onClick={() => { useApp.getState().resetDemo(); setConfirm(false); setToast(true) }}
          >
            <RotateCcw size={18} /> Reset
          </button>
        </div>
      </Modal>
      <ChatPanel />
      <KnowledgebaseDialog />
      {toast && <Toast onDone={() => setToast(false)}><Check size={18} /> Demo reset. Readings are back to Healthy.</Toast>}
    </header>
  )
}
