'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  // hard skills first, then soft, which is the order you'd want them pasted
  keywords: string[];
  label: string;
}

// copy the keywords for one role so you can paste them straight into a resume.
//
// navigator.clipboard needs a secure context and can be blocked outright, so there's
// an old-school textarea fallback. if both fail we show a cross rather than silently
// doing nothing, because you'd otherwise paste whatever was on your clipboard before.
export function CopyKeywords({ keywords, label }: Props) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    const text = keywords.join(', ');
    let ok = false;

    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // fallback for http origins and browsers that block the clipboard api
      try {
        const el = document.createElement('textarea');
        el.value = text;
        el.setAttribute('readonly', '');
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        ok = document.execCommand('copy');
        document.body.removeChild(el);
      } catch {
        ok = false;
      }
    }

    setState(ok ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 1600);
  }, [keywords]);

  if (keywords.length === 0) return null;

  return (
    <button
      type="button"
      onClick={copy}
      title={
        state === 'copied'
          ? 'Copied'
          : state === 'failed'
            ? 'Could not copy — your browser blocked it'
            : `Copy keywords: ${keywords.join(', ')}`
      }
      aria-label={`Copy the ${keywords.length} resume keywords for ${label}`}
      className="shrink-0 rounded p-0.5 text-text-faint transition-colors hover:bg-surface-hover hover:text-accent"
    >
      {state === 'copied' ? (
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 text-success"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : state === 'failed' ? (
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 text-danger"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h8" />
        </svg>
      )}
    </button>
  );
}
