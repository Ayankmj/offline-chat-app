/**
 * safeEvaluateExpression — Recursive descent math parser
 * Source: llm-hub/utils/mathParser.ts
 *
 * Evaluates math expressions like "2 + 3 * (4 - 1)" safely.
 * No eval(), no Function() — secure for user input.
 */

type Token = number | '+' | '-' | '*' | '/' | '(' | ')';

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  const regex = /(\d+\.?\d*|[+\-*/()])/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(expr)) !== null) {
    const t = match[1];
    if (['+', '-', '*', '/', '(', ')'].includes(t)) {
      tokens.push(t as Token);
    } else {
      tokens.push(parseFloat(t));
    }
  }
  return tokens;
}

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  parseExpression(): number {
    let left = this.parseTerm();
    while (this.peek() === '+' || this.peek() === '-') {
      const op = this.consume();
      const right = this.parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  private parseTerm(): number {
    let left = this.parseFactor();
    while (this.peek() === '*' || this.peek() === '/') {
      const op = this.consume();
      const right = this.parseFactor();
      if (op === '/' && right === 0) throw new Error('Division by zero');
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  private parseFactor(): number {
    const t = this.peek();
    if (t === '-') {
      this.consume();
      return -this.parseFactor();
    }
    if (t === '(') {
      this.consume();
      const val = this.parseExpression();
      if (this.peek() !== ')') throw new Error('Missing closing parenthesis');
      this.consume();
      return val;
    }
    if (typeof t === 'number') {
      this.consume();
      return t;
    }
    throw new Error(`Unexpected token: ${t}`);
  }

  isDone(): boolean {
    return this.pos >= this.tokens.length;
  }
}

export function safeEvaluateExpression(expr: string): number {
  const cleaned = expr.replace(/\s+/g, '');
  if (!cleaned) throw new Error('Empty expression');
  const tokens = tokenize(cleaned);
  if (tokens.length === 0) throw new Error('No valid tokens');
  const parser = new Parser(tokens);
  const result = parser.parseExpression();
  if (!parser.isDone()) throw new Error('Unexpected characters in expression');
  return result;
}

/**
 * removeThinkingParts — strips <think>/<thought>/<thinking> tags from AI responses
 * Source: pocketpal-ai/src/utils/chat.ts
 *
 * Used when building prompt context to avoid polluting the context window
 * with reasoning tokens from previous turns.
 */
export function removeThinkingParts(text: string): string {
  if (
    !text.includes('<think>') &&
    !text.includes('<thought>') &&
    !text.includes('<thinking>')
  ) {
    return text;
  }
  return text
    .replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
    .replace(/<thought>[\s\S]*?(<\/thought>|$)/g, '')
    .replace(/<thinking>[\s\S]*?(<\/thinking>|$)/g, '')
    .trim();
}

/**
 * formatRelativeDate — human-friendly relative timestamps
 * Source: llm-hub/stores/conversationStore.ts
 */
export function formatRelativeDate(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const secs = Math.floor(diff / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (secs < 60) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString();
}

/**
 * exportConversation — format messages as shareable text
 * Source: llm-hub pattern
 */
export function exportConversationText(
  title: string,
  messages: Array<{role: 'user' | 'assistant' | 'system'; text: string}>,
): string {
  const lines = [`# ${title}`, `Exported: ${new Date().toLocaleString()}`, ''];
  messages
    .filter(m => m.role !== 'system' && m.text)
    .forEach(m => {
      const prefix = m.role === 'user' ? 'You' : 'AI';
      lines.push(`[${prefix}]: ${m.text}`);
      lines.push('');
    });
  return lines.join('\n');
}

/**
 * estimateTokenCount — rough token estimate for display
 * Used in ChatInput token counter
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.trim().length / 4);
}

/**
 * isLegacyQuantization — warn about deprecated quant formats
 * Source: pocketpal-ai/src/utils/modelSettings.ts
 */
const LEGACY_QUANTS = ['Q4_0_4_8', 'Q4_0_4_4', 'Q4_0_8_8'];
export function isLegacyQuantization(filename: string): boolean {
  return LEGACY_QUANTS.some(q => filename.toUpperCase().includes(q));
}
