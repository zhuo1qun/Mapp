import React, { Suspense, useEffect, useState } from 'react';
import type { NoteEditorProps } from '../NoteEditor';
import { loadEditorResource } from '../../utils/resources/featureResources';
import { ModuleLoadProgress } from '../ui/ModuleLoadProgress';
import { THEME_COLOR } from '../../constants';

const LazyNoteEditor = React.lazy(async () => {
  const module = await loadEditorResource();
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
    <Suspense
      fallback={
        <ModuleLoadProgress
          resourceId="editor"
          title="正在打开编辑器"
          description="首次使用正在准备编辑工具"
          themeColor={props.themeColor ?? THEME_COLOR}
          transparent
        />
      }
    >
      <LazyNoteEditor {...props} />
    </Suspense>
  );
}
