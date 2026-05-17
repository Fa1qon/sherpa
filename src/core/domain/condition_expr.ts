/**
 * ConditionExpr DSL v1 — parser, AST, formatter.
 *
 * A small expression language used by `Gate.auto_pass_when`, Edge branch
 * exprs, and Phase conditional activations. Grammar:
 *
 *   expr        := orExpr
 *   orExpr      := andExpr ('OR' andExpr)*
 *   andExpr     := notExpr ('AND' notExpr)*
 *   notExpr     := 'NOT' notExpr | atom
 *   atom        := predicate | comparison | '(' expr ')'
 *   predicate   := IDENT '(' arglist? ')'
 *   arglist     := value (',' value)*
 *   comparison  := path operator value
 *   path        := IDENT ('.' IDENT)+
 *   operator    := '==' | '!=' | '<' | '>' | '<=' | '>=' | 'in'
 *   value       := STRING | NUMBER | BOOLEAN | '[' valuelist ']'
 *   valuelist   := value (',' value)*
 *
 * Persistence remains the raw string (`ConditionExpr.expr` in
 * `methodology.ts`). The AST is recomputed on demand for evaluation
 * (Task 8) and editor assistance.
 *
 * Hand-written recursive-descent; zero runtime dependencies.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export const ALLOWED_PREDICATES = [
  'artifact_exists',
  'reviewer_passed',
  'all_reviewers_passed',
  'confidence_at_least',
  'scope_unchanged',
  // Plan 8 Task 6: count `## <name>` sections inside the produced artifact.
  'artifact_section_count',
] as const;
export type AllowedPredicate = (typeof ALLOWED_PREDICATES)[number];

// 'artifact' path root resolves against the produced artifact's frontmatter
// (used by ArtifactSpec.conditional_paths + ArtifactSpec.invariants).
export const ALLOWED_PATH_ROOTS = ['meta', 'signals', 'artifact'] as const;
export type AllowedPathRoot = (typeof ALLOWED_PATH_ROOTS)[number];

export type ComparisonOp = '==' | '!=' | '<' | '>' | '<=' | '>=' | 'in';

export type Value =
  | { readonly vkind: 'string'; readonly v: string }
  | { readonly vkind: 'number'; readonly v: number }
  | { readonly vkind: 'boolean'; readonly v: boolean }
  | { readonly vkind: 'list'; readonly v: ReadonlyArray<Value> };

export type AstNode =
  | { readonly kind: 'or'; readonly left: AstNode; readonly right: AstNode }
  | { readonly kind: 'and'; readonly left: AstNode; readonly right: AstNode }
  | { readonly kind: 'not'; readonly child: AstNode }
  | {
      readonly kind: 'predicate';
      readonly name: AllowedPredicate;
      readonly args: ReadonlyArray<Value>;
    }
  | {
      readonly kind: 'comparison';
      readonly path: ReadonlyArray<string>;
      readonly op: ComparisonOp;
      readonly value: Value;
    };

export interface ParseOk {
  readonly ok: true;
  readonly ast: AstNode;
}
export interface ParseError {
  readonly ok: false;
  readonly message: string;
  readonly position: number;
}
export type ParseResult = ParseOk | ParseError;

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

type Token =
  | { kind: 'IDENT'; value: string; pos: number }
  | { kind: 'NUMBER'; value: number; pos: number }
  | { kind: 'STRING'; value: string; pos: number }
  | { kind: 'BOOLEAN'; value: boolean; pos: number }
  | { kind: 'OP'; value: Exclude<ComparisonOp, 'in'>; pos: number }
  | { kind: 'AND'; pos: number }
  | { kind: 'OR'; pos: number }
  | { kind: 'NOT'; pos: number }
  | { kind: 'IN'; pos: number }
  | { kind: 'LPAREN'; pos: number }
  | { kind: 'RPAREN'; pos: number }
  | { kind: 'LBRACK'; pos: number }
  | { kind: 'RBRACK'; pos: number }
  | { kind: 'COMMA'; pos: number }
  | { kind: 'DOT'; pos: number }
  | { kind: 'EOF'; pos: number };

interface TokenizeOk {
  readonly ok: true;
  readonly tokens: ReadonlyArray<Token>;
}
interface TokenizeErr {
  readonly ok: false;
  readonly message: string;
  readonly position: number;
}
type TokenizeResult = TokenizeOk | TokenizeErr;

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;

function tokenize(input: string): TokenizeResult {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;

  while (i < n) {
    const ch = input[i];

    // whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }

    // two-char operators first (longest match)
    if (i + 1 < n) {
      const two = input.slice(i, i + 2);
      if (two === '==' || two === '!=' || two === '<=' || two === '>=') {
        tokens.push({ kind: 'OP', value: two as Exclude<ComparisonOp, 'in'>, pos: i });
        i += 2;
        continue;
      }
    }

    // single-char operators
    if (ch === '<' || ch === '>') {
      tokens.push({ kind: 'OP', value: ch as Exclude<ComparisonOp, 'in'>, pos: i });
      i += 1;
      continue;
    }

    // structural single-chars
    if (ch === '(') {
      tokens.push({ kind: 'LPAREN', pos: i });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'RPAREN', pos: i });
      i += 1;
      continue;
    }
    if (ch === '[') {
      tokens.push({ kind: 'LBRACK', pos: i });
      i += 1;
      continue;
    }
    if (ch === ']') {
      tokens.push({ kind: 'RBRACK', pos: i });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ kind: 'COMMA', pos: i });
      i += 1;
      continue;
    }
    if (ch === '.') {
      tokens.push({ kind: 'DOT', pos: i });
      i += 1;
      continue;
    }

    // strings
    if (ch === '"' || ch === "'") {
      const startPos = i;
      const quote = ch;
      i += 1;
      let value = '';
      let closed = false;
      while (i < n) {
        const c = input[i];
        if (c === quote) {
          closed = true;
          i += 1;
          break;
        }
        value += c;
        i += 1;
      }
      if (!closed) {
        return { ok: false, message: `unclosed string literal`, position: startPos };
      }
      tokens.push({ kind: 'STRING', value, pos: startPos });
      continue;
    }

    // numbers
    if (DIGIT.test(ch)) {
      const startPos = i;
      let raw = '';
      while (i < n && DIGIT.test(input[i])) {
        raw += input[i];
        i += 1;
      }
      if (i < n && input[i] === '.' && i + 1 < n && DIGIT.test(input[i + 1])) {
        raw += '.';
        i += 1;
        while (i < n && DIGIT.test(input[i])) {
          raw += input[i];
          i += 1;
        }
      }
      const num = Number(raw);
      tokens.push({ kind: 'NUMBER', value: num, pos: startPos });
      continue;
    }

    // identifiers / keywords
    if (IDENT_START.test(ch)) {
      const startPos = i;
      let raw = '';
      while (i < n && IDENT_PART.test(input[i])) {
        raw += input[i];
        i += 1;
      }
      if (raw === 'AND') {
        tokens.push({ kind: 'AND', pos: startPos });
      } else if (raw === 'OR') {
        tokens.push({ kind: 'OR', pos: startPos });
      } else if (raw === 'NOT') {
        tokens.push({ kind: 'NOT', pos: startPos });
      } else if (raw === 'in') {
        tokens.push({ kind: 'IN', pos: startPos });
      } else if (raw === 'true') {
        tokens.push({ kind: 'BOOLEAN', value: true, pos: startPos });
      } else if (raw === 'false') {
        tokens.push({ kind: 'BOOLEAN', value: false, pos: startPos });
      } else {
        tokens.push({ kind: 'IDENT', value: raw, pos: startPos });
      }
      continue;
    }

    return { ok: false, message: `unexpected character '${ch}'`, position: i };
  }

  tokens.push({ kind: 'EOF', pos: n });
  return { ok: true, tokens };
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class ParseException {
  constructor(
    public readonly message: string,
    public readonly position: number,
  ) {}
}

class Parser {
  private idx = 0;

  constructor(private readonly tokens: ReadonlyArray<Token>) {}

  private peek(offset = 0): Token {
    const t = this.tokens[this.idx + offset];
    // tokens always end with EOF, so out-of-range still returns EOF safely.
    return t ?? this.tokens[this.tokens.length - 1];
  }

  private consume(): Token {
    const t = this.tokens[this.idx];
    this.idx += 1;
    return t;
  }

  private expect<K extends Token['kind']>(kind: K, label?: string): Extract<Token, { kind: K }> {
    const t = this.peek();
    if (t.kind !== kind) {
      throw new ParseException(
        `expected ${label ?? kind} but got ${describe(t)}`,
        t.pos,
      );
    }
    return this.consume() as Extract<Token, { kind: K }>;
  }

  parseExpr(): AstNode {
    return this.parseOr();
  }

  private parseOr(): AstNode {
    let left = this.parseAnd();
    while (this.peek().kind === 'OR') {
      this.consume();
      const right = this.parseAnd();
      left = { kind: 'or', left, right };
    }
    return left;
  }

  private parseAnd(): AstNode {
    let left = this.parseNot();
    while (this.peek().kind === 'AND') {
      this.consume();
      const right = this.parseNot();
      left = { kind: 'and', left, right };
    }
    return left;
  }

  private parseNot(): AstNode {
    if (this.peek().kind === 'NOT') {
      this.consume();
      const child = this.parseNot();
      return { kind: 'not', child };
    }
    return this.parseAtom();
  }

  private parseAtom(): AstNode {
    const t = this.peek();

    if (t.kind === 'LPAREN') {
      this.consume();
      const inner = this.parseExpr();
      this.expect('RPAREN', "')'");
      return inner;
    }

    if (t.kind === 'IDENT') {
      const next = this.peek(1);
      if (next.kind === 'LPAREN') {
        // predicate
        const nameTok = this.consume() as Extract<Token, { kind: 'IDENT' }>;
        return this.parsePredicate(nameTok.value, nameTok.pos);
      }
      if (next.kind === 'DOT') {
        // comparison path
        const firstTok = this.consume() as Extract<Token, { kind: 'IDENT' }>;
        return this.parseComparison(firstTok.value, firstTok.pos);
      }
      throw new ParseException(
        `bare identifier '${t.value}' — expected predicate call or dotted path`,
        t.pos,
      );
    }

    throw new ParseException(`unexpected ${describe(t)}`, t.pos);
  }

  private parsePredicate(name: string, namePos: number): AstNode {
    this.expect('LPAREN', "'('");
    const args: Value[] = [];
    if (this.peek().kind !== 'RPAREN') {
      args.push(this.parseValue());
      while (this.peek().kind === 'COMMA') {
        this.consume();
        args.push(this.parseValue());
      }
    }
    this.expect('RPAREN', "')'");

    if (!(ALLOWED_PREDICATES as ReadonlyArray<string>).includes(name)) {
      throw new ParseException(`Unknown predicate '${name}'`, namePos);
    }
    return { kind: 'predicate', name: name as AllowedPredicate, args };
  }

  private parseComparison(firstIdent: string, firstPos: number): AstNode {
    const path: string[] = [firstIdent];
    while (this.peek().kind === 'DOT') {
      this.consume();
      const seg = this.expect('IDENT', 'identifier');
      path.push(seg.value);
    }

    if (!(ALLOWED_PATH_ROOTS as ReadonlyArray<string>).includes(path[0])) {
      throw new ParseException(
        `path root '${path[0]}' not allowed (expected one of: ${ALLOWED_PATH_ROOTS.join(', ')})`,
        firstPos,
      );
    }

    const opTok = this.peek();
    let op: ComparisonOp;
    if (opTok.kind === 'OP') {
      op = opTok.value;
      this.consume();
    } else if (opTok.kind === 'IN') {
      op = 'in';
      this.consume();
    } else {
      throw new ParseException(`expected comparison operator, got ${describe(opTok)}`, opTok.pos);
    }

    const value = this.parseValue();
    return { kind: 'comparison', path, op, value };
  }

  private parseValue(): Value {
    const t = this.peek();
    if (t.kind === 'NUMBER') {
      this.consume();
      return { vkind: 'number', v: t.value };
    }
    if (t.kind === 'STRING') {
      this.consume();
      return { vkind: 'string', v: t.value };
    }
    if (t.kind === 'BOOLEAN') {
      this.consume();
      return { vkind: 'boolean', v: t.value };
    }
    if (t.kind === 'LBRACK') {
      this.consume();
      const items: Value[] = [];
      if (this.peek().kind !== 'RBRACK') {
        items.push(this.parseValue());
        while (this.peek().kind === 'COMMA') {
          this.consume();
          items.push(this.parseValue());
        }
      }
      this.expect('RBRACK', "']'");
      return { vkind: 'list', v: items };
    }
    throw new ParseException(`expected value, got ${describe(t)}`, t.pos);
  }

  expectEof(): void {
    const t = this.peek();
    if (t.kind !== 'EOF') {
      throw new ParseException(`unexpected trailing ${describe(t)}`, t.pos);
    }
  }
}

function describe(t: Token): string {
  switch (t.kind) {
    case 'IDENT':
      return `identifier '${t.value}'`;
    case 'NUMBER':
      return `number ${t.value}`;
    case 'STRING':
      return `string '${t.value}'`;
    case 'BOOLEAN':
      return `boolean ${t.value}`;
    case 'OP':
      return `operator '${t.value}'`;
    case 'AND':
      return `'AND'`;
    case 'OR':
      return `'OR'`;
    case 'NOT':
      return `'NOT'`;
    case 'IN':
      return `'in'`;
    case 'LPAREN':
      return `'('`;
    case 'RPAREN':
      return `')'`;
    case 'LBRACK':
      return `'['`;
    case 'RBRACK':
      return `']'`;
    case 'COMMA':
      return `','`;
    case 'DOT':
      return `'.'`;
    case 'EOF':
      return `end of input`;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseConditionExpr(input: string): ParseResult {
  const tokRes = tokenize(input);
  if (!tokRes.ok) {
    return { ok: false, message: tokRes.message, position: tokRes.position };
  }
  // EOF only → empty.
  if (tokRes.tokens.length === 1) {
    return { ok: false, message: 'expression is empty', position: 0 };
  }
  const parser = new Parser(tokRes.tokens);
  try {
    const ast = parser.parseExpr();
    parser.expectEof();
    return { ok: true, ast };
  } catch (err) {
    if (err instanceof ParseException) {
      return { ok: false, message: err.message, position: err.position };
    }
    throw err;
  }
}

const PREC = { or: 1, and: 2, not: 3, atom: 4 } as const;

export function formatConditionExpr(ast: AstNode): string {
  return formatNode(ast, 0);
}

function formatNode(ast: AstNode, parentPrec: number): string {
  switch (ast.kind) {
    case 'or': {
      const s = `${formatNode(ast.left, PREC.or)} OR ${formatNode(ast.right, PREC.or)}`;
      return parentPrec > PREC.or ? `(${s})` : s;
    }
    case 'and': {
      const s = `${formatNode(ast.left, PREC.and)} AND ${formatNode(ast.right, PREC.and)}`;
      return parentPrec > PREC.and ? `(${s})` : s;
    }
    case 'not':
      return `NOT ${formatNode(ast.child, PREC.not)}`;
    case 'predicate':
      return `${ast.name}(${ast.args.map(formatValue).join(', ')})`;
    case 'comparison':
      return `${ast.path.join('.')} ${ast.op} ${formatValue(ast.value)}`;
  }
}

function formatValue(v: Value): string {
  switch (v.vkind) {
    case 'string':
      return `'${v.v}'`;
    case 'number':
      return String(v.v);
    case 'boolean':
      return v.v ? 'true' : 'false';
    case 'list':
      return `[${v.v.map(formatValue).join(', ')}]`;
  }
}
