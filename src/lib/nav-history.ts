const NAV_STACK_KEY = 'rubsax_nav_stack';
const MAX_STACK_ITEMS = 20;

function readNavStack(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(NAV_STACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.startsWith('/'))
      : [];
  } catch {
    return [];
  }
}

function writeNavStack(stack: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      NAV_STACK_KEY,
      JSON.stringify(stack.slice(-MAX_STACK_ITEMS))
    );
  } catch {
    // Ignore storage quota / private mode failures
  }
}

/**
 * Registra uma rota interna visitada no histórico da sessão atual.
 */
export function recordInternalRoute(path: string): void {
  if (!path || !path.startsWith('/')) return;
  const stack = readNavStack();
  if (stack[stack.length - 1] === path) return;
  stack.push(path);
  writeNavStack(stack);
}

/**
 * Remove a rota atual do topo e retorna exatamente a página interna anterior,
 * travando no editor caso não haja histórico interno anterior (ex: retorno de checkout).
 */
export function getBackTarget(
  currentPath: string,
  fallback = '/?view=editor'
): string {
  const stack = readNavStack();

  while (stack.length > 0 && stack[stack.length - 1] === currentPath) {
    stack.pop();
  }

  const prev = stack.pop();
  writeNavStack(stack);

  if (prev && prev.startsWith('/')) {
    return prev;
  }

  return fallback;
}
