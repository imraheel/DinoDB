import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import * as monaco from 'monaco-editor';
import { messageOf } from '../lib/errors';
import { isMonacoDark } from '../lib/monaco';
import { parseShellJson } from '../lib/shell-json';
import Button from './ui/Button';
import Modal, { ModalFooter, ModalHeader } from './ui/Modal';
import { FRAME_CLASS } from './ui/Input';

interface DocumentModalProps {
  title: string;
  initialText: string;
  onSave(text: string): void;
  onClose(): void;
  saving?: boolean;
  viewOnly?: boolean;
}

function validate(text: string): string | null {
  let parsed: unknown;
  try {
    parsed = parseShellJson(text);
  } catch (err) {
    return `Invalid JSON: ${messageOf(err)}`;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return 'Invalid JSON: document must be a plain object.';
  }
  return null;
}

export default function DocumentModal({
  title,
  initialText,
  onSave,
  onClose,
  saving,
  viewOnly = false
}: DocumentModalProps) {
  const [text, setText] = useState(initialText);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 680, height: 480 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);
  const error = validate(text);

  function handleResizeMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: size.width,
      startHeight: size.height
    };
    setDragging(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const drag = dragRef.current;
      if (drag === null) return;
      const nextWidth = drag.startWidth + (moveEvent.clientX - drag.startX);
      const nextHeight = drag.startHeight + (moveEvent.clientY - drag.startY);
      setSize({
        width: Math.min(1024, Math.max(320, nextWidth)),
        height: Math.min(800, Math.max(280, nextHeight))
      });
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      setDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const editor = monaco.editor.create(container, {
      value: initialText,
      language: 'mongodb',
      fontSize: 13,
      minimap: { enabled: false },
      wordWrap: 'on',
      tabSize: 2,
      detectIndentation: false,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      readOnly: viewOnly,
      theme: isMonacoDark() ? 'dinodb-dark' : 'dinodb-light'
    });
    const subscription = editor.onDidChangeModelContent(() => {
      setText(editor.getValue());
    });
    editor.focus();
    return () => {
      subscription.dispose();
      editor.dispose();
    };
  }, []);

  return (
    <Modal
      open
      onClose={onClose}
      dismissOnOverlay={false}
      className={dragging ? 'select-none' : ''}
      style={{ width: size.width, height: size.height }}
      aria-label={title}
    >
      <ModalHeader title={title} onClose={onClose} />
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-2 pt-3">
        <div ref={containerRef} className={`min-h-0 w-full flex-1 ${FRAME_CLASS}`} />
        {viewOnly ? null : error !== null ? (
          <p className="pt-2 text-xs text-danger">{error}</p>
        ) : null}
      </div>
      <ModalFooter>
        {viewOnly ? (
          <Button size="md" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => onSave(text)}
              disabled={error !== null || saving === true}
            >
              {saving === true ? 'Saving…' : 'Save'}
            </Button>
          </>
        )}
      </ModalFooter>
      <div
        role="separator"
        aria-label="Resize dialog"
        onMouseDown={handleResizeMouseDown}
        className="absolute right-0 bottom-0 z-10 h-3 w-3 cursor-nwse-resize"
      >
        <div className="absolute right-0.5 bottom-0.5 h-2 w-2 border-r-2 border-b-2 border-border-strong" />
      </div>
    </Modal>
  );
}
