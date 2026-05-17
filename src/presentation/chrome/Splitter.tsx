import { useEffect, useRef, useState, type ReactElement } from 'react';
import styles from './Splitter.module.css';

interface Props {
  /** Called with the pixel delta on each mousemove. Positive = right/down. */
  onResize: (delta: number) => void;
  /** 'vertical' = col-resize handle (default), 'horizontal' = row-resize handle */
  direction?: 'vertical' | 'horizontal';
}

export function Splitter({ onResize, direction = 'vertical' }: Props): ReactElement {
  const [dragging, setDragging] = useState(false);
  const lastPos = useRef(0);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent): void => {
      const pos = direction === 'vertical' ? e.clientX : e.clientY;
      const delta = pos - lastPos.current;
      lastPos.current = pos;
      onResize(delta);
    };
    const up = (): void => setDragging(false);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
  }, [dragging, onResize, direction]);

  if (direction === 'horizontal') {
    return (
      <div
        className={styles.splitterH}
        data-dragging={dragging}
        onMouseDown={(e) => { setDragging(true); lastPos.current = e.clientY; }}
        role="separator"
        aria-orientation="horizontal"
      />
    );
  }

  return (
    <div
      className={styles.splitter}
      data-dragging={dragging}
      onMouseDown={(e) => { setDragging(true); lastPos.current = e.clientX; }}
      role="separator"
      aria-orientation="vertical"
    />
  );
}
