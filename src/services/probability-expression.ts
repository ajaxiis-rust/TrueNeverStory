/**
 * Safe expression evaluator for probability formulas.
 * Replaces world_core/probability/expression.py.
 *
 * Uses a recursive descent parser instead of `new Function()` for security.
 * Only supports: numbers, variables, +, -, *, /, %, **, (), and allowed math functions.
 */

const ALLOWED_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sqrt: Math.sqrt,
  pow: Math.pow,
  log: Math.log,
  log10: Math.log10,
  exp: Math.exp,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
};

class Parser {
  private pos = 0;
  private readonly src: string;
  private readonly vars: Record<string, number>;

  constructor(src: string, vars: Record<string, number>) {
    this.src = src;
    this.vars = vars;
  }

  private peek(): string {
    this.skipSpaces();
    return this.src[this.pos] ?? "";
  }

  private advance(): string {
    this.skipSpaces();
    return this.src[this.pos++] ?? "";
  }

  private skipSpaces(): void {
    while (this.pos < this.src.length && this.src[this.pos] === " ") this.pos++;
  }

  private expect(ch: string): void {
    const got = this.advance();
    if (got !== ch) throw new Error(`Expected '${ch}', got '${got}'`);
  }

  parse(): number {
    const result = this.parseExpr();
    this.skipSpaces();
    if (this.pos < this.src.length) {
      throw new Error(`Unexpected character at position ${this.pos}: '${this.src[this.pos]}'`);
    }
    return result;
  }

  private parseExpr(): number {
    let left = this.parseTerm();
    while (this.peek() === "+" || this.peek() === "-") {
      const op = this.advance();
      const right = this.parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  private parseTerm(): number {
    let left = this.parsePower();
    while (this.peek() === "*" || this.peek() === "/" || this.peek() === "%") {
      const op = this.advance();
      const right = this.parsePower();
      if (op === "*") left *= right;
      else if (op === "/") {
        if (right === 0) throw new Error("Division by zero");
        left /= right;
      } else left %= right;
    }
    return left;
  }

  private parsePower(): number {
    let base = this.parseUnary();
    if (this.peek() === "*") {
      this.advance();
      if (this.peek() === "*") {
        this.advance();
        const exp = this.parseUnary();
        base = Math.pow(base, exp);
      } else {
        // Single * is handled in parseTerm, this shouldn't happen
        // but if we consumed one *, we need to handle it
        const right = this.parseUnary();
        base *= right;
      }
    }
    return base;
  }

  private parseUnary(): number {
    if (this.peek() === "-") {
      this.advance();
      return -this.parsePrimary();
    }
    if (this.peek() === "+") {
      this.advance();
      return this.parsePrimary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    this.skipSpaces();

    // Parenthesized expression
    if (this.peek() === "(") {
      this.advance();
      const result = this.parseExpr();
      this.expect(")");
      return result;
    }

    // Number literal
    if (this.peek() >= "0" && this.peek() <= "9" || this.peek() === ".") {
      return this.parseNumber();
    }

    // Function call or variable
    if (this.peek() >= "a" && this.peek() <= "z" || this.peek() >= "A" && this.peek() <= "Z" || this.peek() === "_") {
      return this.parseIdentifier();
    }

    throw new Error(`Unexpected character: '${this.peek()}'`);
  }

  private parseNumber(): number {
    this.skipSpaces();
    let start = this.pos;
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (ch === undefined) break;
      if ((ch >= "0" && ch <= "9") || ch === ".") {
        this.pos++;
      } else {
        break;
      }
    }
    const num = parseFloat(this.src.slice(start, this.pos));
    if (isNaN(num)) throw new Error(`Invalid number at position ${start}`);
    return num;
  }

  private parseIdentifier(): number {
    this.skipSpaces();
    let start = this.pos;
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (ch === undefined) break;
      if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9") || ch === "_") {
        this.pos++;
      } else {
        break;
      }
    }
    const name = this.src.slice(start, this.pos);

    // Check for function call
    this.skipSpaces();
    if (this.peek() === "(") {
      this.advance();
      const args: number[] = [];
      if (this.peek() !== ")") {
        args.push(this.parseExpr());
        while (this.peek() === ",") {
          this.advance();
          args.push(this.parseExpr());
        }
      }
      this.expect(")");

      const fn = ALLOWED_FUNCTIONS[name];
      if (!fn) throw new Error(`Unknown function: ${name}`);
      return fn(...args);
    }

    // Variable lookup
    if (name in this.vars) return this.vars[name]!;
    throw new Error(`Unknown variable: ${name}`);
  }
}

export function safeEval(expr: string, context: Record<string, number>): number {
  if (!expr?.trim()) return 0;

  // Block dangerous patterns in raw input
  if (/[;{}[\]\\]|import|require|eval|Function|this|global|process|window|document|__proto__|constructor|prototype/i.test(expr)) {
    throw new Error("Unsafe expression");
  }

  try {
    const parser = new Parser(expr, context);
    const result = parser.parse();
    if (typeof result !== "number" || !isFinite(result)) {
      throw new Error(`Non-numeric result: ${result}`);
    }
    return result;
  } catch (err) {
    throw new Error(`Expression evaluation failed: ${err instanceof Error ? err.message : err}`);
  }
}
