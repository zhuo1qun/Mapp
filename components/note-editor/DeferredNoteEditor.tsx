import React, { Suspense, useEffect, useState } from 'react';
import type { NoteEditorProps } from '../NoteEditor';

const LazyNoteEditor = React.lazy(async () => {
  const module = await import('../NoteEditor');
  return { default: module.NoteEditor };
});

/**
 * Keeps the editor out of view bundles until a note is actually opened.
 * Once activated it stays mounted for the session so close animations and
 * draft refs keep the same lifecycle as the eager editor.
 */
export function DeferredNoteEditor(props: NoteEditorProps) {
  const [activated, setActivated] = useState(props.isOpen);

  useEffect(() => {
    if (props.isOpen) setActivated(true);
  }, [props.isOpen]);

  if (!activated && !props.isOpen) return null;

  return (
    <Suspense fallback={null}>
      <LazyNoteEditor {...props} />
    </Suspense>
  );
}
