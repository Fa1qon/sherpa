import { useState, type ReactElement } from 'react';
import type { ViewerProps } from './viewer_registry';
import styles from './ImageViewer.module.css';

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  avif: 'image/avif',
  tiff: 'image/tiff',
};

const ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 200, 300, 400];

export function ImageViewer({ content, ext }: ViewerProps): ReactElement {
  const mime = MIME_MAP[ext.toLowerCase()] ?? 'image/png';
  const src = `data:${mime};base64,${content}`;

  const [zoomIdx, setZoomIdx] = useState(ZOOM_STEPS.indexOf(100));
  const zoom = ZOOM_STEPS[zoomIdx] ?? 100;

  const zoomIn = (): void => setZoomIdx((i) => Math.min(i + 1, ZOOM_STEPS.length - 1));
  const zoomOut = (): void => setZoomIdx((i) => Math.max(i - 1, 0));
  const resetZoom = (): void => setZoomIdx(ZOOM_STEPS.indexOf(100));

  return (
    <div className={styles.wrapper}>
      <div className={styles.controls}>
        <button type="button" className={styles.zoomBtn} onClick={zoomOut} disabled={zoomIdx === 0} title="Zoom out">−</button>
        <button type="button" className={styles.zoomLabel} onClick={resetZoom} title="Reset zoom">{zoom}%</button>
        <button type="button" className={styles.zoomBtn} onClick={zoomIn} disabled={zoomIdx === ZOOM_STEPS.length - 1} title="Zoom in">+</button>
      </div>
      <div className={styles.imageWrap}>
        <img
          src={src}
          alt={ext}
          className={styles.image}
          style={{ width: `${zoom}%`, maxWidth: zoom > 100 ? 'none' : '100%' }}
          draggable={false}
        />
      </div>
    </div>
  );
}
