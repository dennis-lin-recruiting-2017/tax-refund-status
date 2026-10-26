import { useRef, useState } from 'react'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export default function CodeBlock({ children, label }) {
  const [status, setStatus] = useState('idle') // idle | copied | manual
  const codeRef = useRef(null)
  const text = String(children).trim()

  function flash(next) {
    setStatus(next)
    setTimeout(() => setStatus('idle'), next === 'copied' ? 1500 : 4000)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      flash('copied')
    } catch {
      // Clipboard access can be refused (permissions, embedded browsers). Select the text instead
      // so a keyboard shortcut copies it.
      const range = document.createRange()
      range.selectNodeContents(codeRef.current)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      flash('manual')
    }
  }

  const buttonText = { idle: 'Copy', copied: 'Copied', manual: isMac ? 'Press ⌘C' : 'Press Ctrl+C' }[status]

  return (
    <div className="code-block">
      {label && <div className="code-label">{label}</div>}
      <pre>
        <code ref={codeRef}>{text}</code>
      </pre>
      <button type="button" className="code-copy" onClick={copy} aria-label={`Copy ${label ?? 'command'}`}>
        {buttonText}
      </button>
      <span className="sr-only" aria-live="polite">
        {status === 'copied' ? 'Copied to clipboard' : status === 'manual' ? `Text selected. ${buttonText} to copy.` : ''}
      </span>
    </div>
  )
}
