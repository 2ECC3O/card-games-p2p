import { useRef, useState, type ReactNode } from 'react';

/** One step of the guide. Styles live in the shared room.css. */
export interface Page {
  title: string;
  text: ReactNode;
  picture?: ReactNode;
}

/** A row of little cards for the pictures: "7♥ 8♠ + 4♦". "?" is a face-down card; "+", "=", "→", "|" and "vs" are spacers. */
export function Hand({ cards, note }: { cards: string; note?: ReactNode }) {
  return (
    <div className="htp-row">
      {cards.split(' ').map((c, i) =>
        ['+', '=', '→', '|', 'vs'].includes(c) ? (
          <span key={i} className="htp-note">{c}</span>
        ) : (
          <span key={i} className={`htp-card${/[♥♦]/.test(c) ? ' htp-red' : ''}${c === '?' ? ' htp-back' : ''}`}>{c === '?' ? '' : c}</span>
        ),
      )}
      {note && <span className="htp-note">{note}</span>}
    </div>
  );
}

export const Tag = ({ children }: { children: ReactNode }) => <span className="htp-tag">{children}</span>;

/**
 * "How to play" button and its step-by-step guide. A modal dialog, so the table behind it keeps running (the
 * host's clock included); ← and → keys turn the pages.
 */
export default function HowToPlay({ pages, compact = false }: { pages: Page[]; compact?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(0);
  const last = pages.length - 1;
  const go = (n: number) => setPage(Math.max(0, Math.min(last, n)));
  const close = () => ref.current?.close();
  const { title, text, picture } = pages[page];

  return (
    <>
      <button type="button" className={`htp-open${compact ? ' htp-icon' : ''}`} aria-label="How to play" onClick={() => (setPage(0), ref.current?.showModal())}>
        {!compact && 'How to play'}
        <span className="htp-q" aria-hidden>?</span>
      </button>
      <dialog
        ref={ref}
        className="htp"
        aria-labelledby="htp-title"
        onClick={(e) => e.target === e.currentTarget && close()}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') go(page + 1);
          else if (e.key === 'ArrowLeft') go(page - 1);
          else if (e.key === 'Escape') close(); // some embedded browsers skip the native Esc close
        }}
      >
        <div className="htp-body">
          <p className="htp-count" aria-live="polite">
            How to play · {page + 1} / {pages.length}
          </p>
          <h2 id="htp-title">{title}</h2>
          {picture && <div className="htp-picture">{picture}</div>}
          <p className="htp-text">{text}</p>
        </div>
        <div className="htp-nav">
          <button type="button" onClick={() => go(page - 1)} disabled={page === 0}>
            ← Back
          </button>
          {page < last ? (
            <button type="button" className="htp-next" onClick={() => go(page + 1)}>
              Next →
            </button>
          ) : (
            <button type="button" className="htp-next" onClick={close}>
              Got it
            </button>
          )}
        </div>
        <button type="button" className="htp-close" aria-label="Close" onClick={close}>
          ×
        </button>
      </dialog>
    </>
  );
}
