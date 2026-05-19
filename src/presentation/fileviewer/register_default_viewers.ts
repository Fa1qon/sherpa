import { registerViewer } from './viewer_registry';

let registered = false;

export function registerDefaultViewers(): void {
  if (registered) return;
  registered = true;

  registerViewer({
    id: 'markdown',
    extensions: ['md', 'mdx'],
    loadMode: 'text',
    displayName: 'Markdown',
    loader: async () => ({ Viewer: (await import('./MarkdownViewer')).MarkdownViewer }),
  });

  registerViewer({
    id: 'csv',
    extensions: ['csv', 'tsv'],
    loadMode: 'text',
    displayName: 'CSV',
    loader: async () => ({ Viewer: (await import('./CsvViewer')).CsvViewer }),
  });

  registerViewer({
    id: 'image',
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif', 'tiff'],
    loadMode: 'binary',
    displayName: 'Image',
    loader: async () => ({ Viewer: (await import('./ImageViewer')).ImageViewer }),
  });

  registerViewer({
    id: 'html',
    extensions: ['html', 'htm'],
    loadMode: 'text',
    displayName: 'HTML',
    loader: async () => ({ Viewer: (await import('./HtmlViewer')).HtmlViewer }),
    priority: 5,
  });

  registerViewer({
    id: 'code',
    extensions: [
      'ts', 'tsx', 'js', 'jsx', 'mts', 'cts', 'mjs', 'cjs',
      'yaml', 'yml', 'py', 'pyw', 'pyi',
      'php', 'css', 'scss', 'sass', 'less', 'sql',
    ],
    loadMode: 'text',
    displayName: 'Code',
    loader: async () => ({ Viewer: (await import('./CodeViewer')).CodeViewer }),
  });

  registerViewer({
    id: 'json-tree',
    extensions: ['json', 'jsonc'],
    loadMode: 'text',
    displayName: 'JSON',
    priority: 10,
    loader: async () => ({ Viewer: (await import('./JsonViewer')).JsonViewer }),
  });

  registerViewer({
    id: 'mermaid',
    extensions: ['mmd', 'mermaid'],
    loadMode: 'text',
    displayName: 'Mermaid',
    loader: async () => ({ Viewer: (await import('./mermaid/MermaidViewer')).MermaidViewer }),
  });

  registerViewer({
    id: 'markmap',
    extensions: ['markmap', 'mmap'],
    loadMode: 'text',
    displayName: 'MindMap',
    loader: async () => ({ Viewer: (await import('./markmap/MarkmapViewer')).MarkmapViewer }),
  });

  registerViewer({
    id: 'bpmn',
    extensions: ['bpmn'],
    loadMode: 'text',
    displayName: 'BPMN',
    loader: async () => ({ Viewer: (await import('./bpmn/BpmnViewer')).BpmnViewer }),
  });

  registerViewer({
    id: 'excalidraw',
    extensions: ['excalidraw'],
    loadMode: 'text',
    displayName: 'Excalidraw',
    loader: async () => ({ Viewer: (await import('./excalidraw/ExcalidrawViewer')).ExcalidrawViewer }),
  });

  registerViewer({
    id: 'jupyter',
    extensions: ['ipynb'],
    loadMode: 'text',
    displayName: 'Jupyter',
    loader: async () => ({ Viewer: (await import('./JupyterViewer')).JupyterViewer }),
  });

  registerViewer({
    id: 'pdf',
    extensions: ['pdf'],
    loadMode: 'text', // content unused; native view loads file:// directly
    displayName: 'PDF',
    priority: 10,
    loader: async () => ({ Viewer: (await import('./PdfViewer')).PdfViewer }),
  });

  registerViewer({
    id: 'text',
    extensions: [
      'txt', 'log', 'gitignore', 'gitattributes',
      'editorconfig', 'npmrc', 'prettierignore', 'eslintignore',
    ],
    loadMode: 'text',
    displayName: 'Text',
    loader: async () => ({ Viewer: (await import('./CodeViewer')).CodeViewer }),
  });
}
