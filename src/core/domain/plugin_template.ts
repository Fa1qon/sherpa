import type { PluginExecutionContext } from './plugin_context';

export function substituteString(template: string, ctx: PluginExecutionContext): string {
  return template.replace(/\{\{([^{}]+)\}\}/g, (_, path: string) => {
    const value = resolvePath(ctx as unknown as Record<string, unknown>, path.trim());
    return value === null || value === undefined ? '' : String(value);
  });
}

export function substituteValue(value: unknown, ctx: PluginExecutionContext): unknown {
  if (typeof value === 'string') return substituteString(value, ctx);
  if (Array.isArray(value)) return value.map(v => substituteValue(v, ctx));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = substituteValue(v, ctx);
    return out;
  }
  return value;
}

function resolvePath(root: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = root;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function evaluateCondition(expr: string | undefined, ctx: PluginExecutionContext): boolean {
  if (!expr) return true;
  const m = /^\s*(\{\{[^}]+\}\})\s*(==|!=)\s*(.+?)\s*$/.exec(expr);
  if (m) {
    const left = substituteString(m[1], ctx).trim();
    const right = m[3].replace(/^["']|["']$/g, '').trim();
    return m[2] === '==' ? left === right : left !== right;
  }
  const val = substituteString(expr, ctx).trim();
  return val !== '' && val !== 'false' && val !== '0';
}
