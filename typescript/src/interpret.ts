import { compare, equal, toBoolean, toNumber, toString } from "./coerce.js";
import { host } from "./host.js";
import type { Ast } from "./parser.js";
import { ExcelError, ListValue, NonScalar, RecordValue, err, isError, type Scalar } from "./value.js";

export interface EvalOptions {
  strict: boolean;
  maxRangeCells: number;
  timeoutMs?: number;
  started: number;
  /** When set, aggregation arguments that are not already lists are evaluated once per row. */
  rowTable?: Map<string, Scalar>[];
}

export class RangeValue {
  constructor(readonly values: Scalar[]) {}
}

type Runtime = Scalar | RangeValue;

const XFD = 16384;
const MAX_ROW = 1048576;

function colLetters(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function finite(n: number): Scalar {
  return Number.isFinite(n) ? n : err("#NUM!");
}

/** Round the 15-significant-digit decimal of `n` (spec §12.2). */
function roundSig(n: number, places: number, mode: "half" | "up" | "down"): number {
  if (n === 0 || !Number.isFinite(n)) return n;
  const neg = n < 0;
  const m = /^(\d)\.(\d+)e([+-]?\d+)$/.exec(Math.abs(n).toExponential(14));
  if (!m) return n;
  const digits = (m[1]! + m[2]!).split("").map(Number);
  const exp = Number(m[3]);
  const cut = exp + places;
  if (cut < -1) return 0;
  const rest = digits.slice(Math.max(cut + 1, 0));
  const next = cut + 1 >= 0 && cut + 1 < digits.length ? digits[cut + 1]! : 0;
  const bump = mode === "down" ? false : mode === "up" ? rest.some((d) => d !== 0) : next >= 5;
  if (cut >= digits.length - 1 && !bump) return n;
  const kept = digits.slice(0, Math.max(cut + 1, 0));
  let lead = exp;
  if (bump) {
    if (cut < 0) return (neg ? -1 : 1) * 10 ** (exp + 1);
    let i = kept.length - 1;
    kept[i] = (kept[i] ?? 0) + 1;
    while (kept[i]! >= 10) {
      kept[i] = 0;
      i--;
      if (i < 0) {
        kept.unshift(1);
        lead = exp + 1;
        break;
      }
      kept[i] = (kept[i] ?? 0) + 1;
    }
  }
  return fromDigits(kept, lead, neg);
}

function fromDigits(digits: number[], exp: number, neg: boolean): number {
  const intLen = exp + 1;
  const body =
    intLen <= 0
      ? `0.${"0".repeat(-intLen)}${digits.join("")}`
      : intLen >= digits.length
        ? digits.join("") + "0".repeat(intLen - digits.length)
        : `${digits.join("").slice(0, intLen)}.${digits.join("").slice(intLen)}`;
  const v = Number(body.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""));
  return neg ? -v : v;
}

export function interpret(
  ast: Ast,
  ctx: Map<string, Scalar>,
  opt: EvalOptions,
  scopes: Map<string, Scalar>[] = [],
): Scalar {
  function checkTime(): void {
    if (opt.timeoutMs !== undefined && performance.now() - opt.started > opt.timeoutMs) {
      host("timeout", "Evaluation timed out");
    }
  }

  function lookupCell(col: number, row: number): Scalar {
    if (col < 1 || col > XFD || row < 1 || row > MAX_ROW) return err("#REF!");
    const key = `${colLetters(col)}${row}`;
    if (!ctx.has(key)) return opt.strict ? err("#REF!") : null;
    return ctx.get(key) ?? null;
  }

  function lookupExact(name: string): { found: true; value: Scalar } | { found: false } {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const scope = scopes[i]!;
      if (scope.has(name)) return { found: true, value: scope.get(name) ?? null };
    }
    if (ctx.has(name)) return { found: true, value: ctx.get(name) ?? null };
    return { found: false };
  }

  function step(cur: Scalar, part: string): Scalar {
    if (isError(cur) || cur === null) return cur;
    if (cur instanceof RecordValue) {
      if (!cur.fields.has(part)) return opt.strict ? err("#REF!") : null;
      return cur.fields.get(part) ?? null;
    }
    if (cur instanceof ListValue) {
      const out: Scalar[] = [];
      for (const item of cur.items) {
        const next = step(item, part);
        if (next instanceof ListValue) out.push(...next.items);
        else out.push(next);
      }
      return new ListValue(out);
    }
    return err("#VALUE!");
  }

  function lookupName(name: string): Scalar {
    const exact = lookupExact(name);
    if (exact.found) return exact.value;
    const parts = name.split(".");
    if (parts.length < 2) return opt.strict ? err("#REF!") : null;
    const head = lookupExact(parts[0]!);
    if (!head.found) return opt.strict ? err("#REF!") : null;
    let value = head.value;
    for (let i = 1; i < parts.length; i++) value = step(value, parts[i]!);
    return value;
  }

  function expand(a: { col: number; row: number }, b: { col: number; row: number }): Scalar[] {
    if (
      a.col < 1 || a.col > XFD || b.col < 1 || b.col > XFD ||
      a.row < 1 || a.row > MAX_ROW || b.row < 1 || b.row > MAX_ROW
    ) {
      return [err("#REF!")];
    }
    const c1 = Math.min(a.col, b.col);
    const c2 = Math.max(a.col, b.col);
    const r1 = Math.min(a.row, b.row);
    const r2 = Math.max(a.row, b.row);
    const count = (c2 - c1 + 1) * (r2 - r1 + 1);
    if (count > opt.maxRangeCells) host("limit", "Range is too large");
    const values: Scalar[] = [];
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) values.push(lookupCell(c, r));
    }
    return values;
  }

  function evalAny(node: Ast): Runtime {
    checkTime();
    switch (node.k) {
      case "num":
      case "str":
      case "bool":
        return node.v;
      case "name":
        return lookupName(node.v);
      case "cell":
        return lookupCell(node.col, node.row);
      case "range":
        return new RangeValue(expand(node.a, node.b));
      case "unary": {
        const x = scalar(evalAny(node.x));
        const n = toNumber(x);
        if (isError(n)) return n;
        return node.op === "-" ? finite(-n) : n;
      }
      case "pct": {
        const n = toNumber(scalar(evalAny(node.x)));
        if (isError(n)) return n;
        return finite(n * 0.01);
      }
      case "bin":
        return evalBin(node.op, node.l, node.r);
      case "call":
        return evalCall(node.name, node.args);
      default:
        return err("#VALUE!");
    }
  }

  function scalar(v: Runtime): Scalar {
    return v instanceof RangeValue ? err("#VALUE!") : v;
  }

  function evalBin(op: string, l: Ast, r: Ast): Scalar {
    const L = scalar(evalAny(l));
    const R = scalar(evalAny(r));
    if (op === "&") {
      const a = toString(L);
      if (isError(a)) return a;
      const b = toString(R);
      if (isError(b)) return b;
      return a + b;
    }
    if (op === "=" || op === "<>") {
      const e = equal(L, R);
      if (isError(e)) return e;
      return op === "=" ? e : !e;
    }
    if (op === "<" || op === ">" || op === "<=" || op === ">=") {
      const c = compare(L, R);
      if (c instanceof ExcelError) return c;
      if (op === "<") return c < 0;
      if (op === ">") return c > 0;
      if (op === "<=") return c <= 0;
      return c >= 0;
    }
    const a = toNumber(L);
    if (isError(a)) return a;
    const b = toNumber(R);
    if (isError(b)) return b;
    if (op === "+") return finite(a + b);
    if (op === "-") return finite(a - b);
    if (op === "*") return finite(a * b);
    if (op === "/") {
      if (b === 0) return err("#DIV/0!");
      return finite(a / b);
    }
    if (op === "^") {
      if (a === 0 && b === 0) return err("#NUM!");
      if (a === 0 && b < 0) return err("#DIV/0!");
      if (a < 0 && !Number.isInteger(b)) return err("#NUM!");
      return finite(a ** b);
    }
    return err("#VALUE!");
  }

  function evalCall(name: string, args: Ast[]): Scalar {
    const key = name.toLowerCase();
    const fn = FUNCS[key];
    if (!fn) return err("#NAME?");
    return fn(args);
  }

  type Arg =
    | { kind: "scalar"; value: Scalar }
    | { kind: "range"; values: Scalar[] };

  function evalArg(node: Ast): Arg {
    if (node.k === "range") return { kind: "range", values: expand(node.a, node.b) };
    return { kind: "scalar", value: scalar(evalAny(node)) };
  }

  function arity(args: Ast[], min: number, max: number): ExcelError | undefined {
    if (args.length < min || args.length > max) return err("#VALUE!");
    return undefined;
  }

  const FUNCS: Record<string, (args: Ast[]) => Scalar> = {
    if: (args) => {
      const bad = arity(args, 2, 3);
      if (bad) return bad;
      const c = toBoolean(scalar(evalAny(args[0]!)));
      if (isError(c)) return c;
      if (c) return scalar(evalAny(args[1]!));
      if (args.length === 2) return false;
      return scalar(evalAny(args[2]!));
    },
    and: (args) => logic(args, true),
    or: (args) => logic(args, false),
    not: (args) => {
      const bad = arity(args, 1, 1);
      if (bad) return bad;
      const a = evalArg(args[0]!);
      if (a.kind === "range") return err("#VALUE!");
      const b = toBoolean(a.value);
      if (isError(b)) return b;
      return !b;
    },
    sum: (args) => agg(args, "sum"),
    product: (args) => agg(args, "product"),
    sumsq: (args) => agg(args, "sumsq"),
    sumproduct: (args) => sumProduct(args),
    average: (args) => agg(args, "average"),
    min: (args) => agg(args, "min"),
    max: (args) => agg(args, "max"),
    count: (args) => count(args, false),
    counta: (args) => count(args, true),
    iferror: (args) => {
      const bad = arity(args, 2, 2);
      if (bad) return bad;
      const v = scalar(evalAny(args[0]!));
      if (isError(v)) return scalar(evalAny(args[1]!));
      return v;
    },
    ifna: (args) => {
      const bad = arity(args, 2, 2);
      if (bad) return bad;
      const v = scalar(evalAny(args[0]!));
      if (v instanceof ExcelError && v.code === "#N/A") return scalar(evalAny(args[1]!));
      return v;
    },
    len: (args) => {
      const bad = arity(args, 1, 1);
      if (bad) return bad;
      const s = toString(scalar(evalAny(args[0]!)));
      if (isError(s)) return s;
      return s.length;
    },
    left: (args) => side(args, "left"),
    right: (args) => side(args, "right"),
    mid: (args) => {
      const bad = arity(args, 3, 3);
      if (bad) return bad;
      const s = toString(scalar(evalAny(args[0]!)));
      if (isError(s)) return s;
      const start = toNumber(scalar(evalAny(args[1]!)));
      if (isError(start)) return start;
      const countN = toNumber(scalar(evalAny(args[2]!)));
      if (isError(countN)) return countN;
      const st = Math.trunc(start);
      const n = Math.trunc(countN);
      if (st < 1 || n < 0) return err("#VALUE!");
      return s.slice(st - 1, st - 1 + n);
    },
    concat: (args) => concat(args),
    concatenate: (args) => concat(args),
    round: (args) => roundFn(args, "half"),
    roundup: (args) => roundFn(args, "up"),
    rounddown: (args) => roundFn(args, "down"),
    int: (args) => {
      const bad = arity(args, 1, 1);
      if (bad) return bad;
      const n = toNumber(scalar(evalAny(args[0]!)));
      if (isError(n)) return n;
      return Math.floor(n);
    },
    trunc: (args) => {
      const bad = arity(args, 1, 2);
      if (bad) return bad;
      const n = toNumber(scalar(evalAny(args[0]!)));
      if (isError(n)) return n;
      let places = 0;
      if (args.length === 2) {
        const d = toNumber(scalar(evalAny(args[1]!)));
        if (isError(d)) return d;
        places = Math.trunc(d);
      }
      return roundSig(n, places, "down");
    },
  };

  function side(args: Ast[], dir: "left" | "right"): Scalar {
    const bad = arity(args, 1, 2);
    if (bad) return bad;
    const s = toString(scalar(evalAny(args[0]!)));
    if (isError(s)) return s;
    let n = 1;
    if (args.length === 2) {
      const c = toNumber(scalar(evalAny(args[1]!)));
      if (isError(c)) return c;
      n = Math.trunc(c);
    }
    if (n < 0) return err("#VALUE!");
    return dir === "left" ? s.slice(0, n) : s.slice(s.length - n);
  }

  function concat(args: Ast[]): Scalar {
    if (args.length < 1) return err("#VALUE!");
    let out = "";
    for (const arg of args) {
      const a = widen(evalArg(arg));
      const items = a.kind === "range" ? a.values : [a.value];
      for (const v of items) {
        const s = toString(v);
        if (isError(s)) return s;
        out += s;
      }
    }
    return out;
  }

  function roundFn(args: Ast[], mode: "half" | "up" | "down"): Scalar {
    const bad = arity(args, 2, 2);
    if (bad) return bad;
    const n = toNumber(scalar(evalAny(args[0]!)));
    if (isError(n)) return n;
    const d = toNumber(scalar(evalAny(args[1]!)));
    if (isError(d)) return d;
    return roundSig(n, Math.trunc(d), mode);
  }

  function widen(a: Arg): Arg {
    if (a.kind === "scalar" && a.value instanceof ListValue) return { kind: "range", values: a.value.items };
    return a;
  }

  function logic(args: Ast[], all: boolean): Scalar {
    if (args.length < 1) return err("#VALUE!");
    let seen = 0;
    let ok = all;
    for (const arg of args) {
      const a = widen(evalArg(arg));
      if (a.kind === "scalar") {
        if (isError(a.value)) return a.value;
        const b = toBoolean(a.value);
        if (isError(b)) return b;
        seen++;
        if (all) ok = ok && b;
        else ok = ok || b;
      } else {
        for (const v of a.values) {
          if (isError(v)) return v;
          if (v instanceof NonScalar) return err("#VALUE!");
          if (v === null) continue;
          if (typeof v === "string") {
            const n = toNumber(v);
            if (isError(n)) continue;
            seen++;
            const b = n !== 0;
            if (all) ok = ok && b;
            else ok = ok || b;
            continue;
          }
          if (typeof v === "number" || typeof v === "boolean") {
            const b = toBoolean(v);
            if (isError(b)) return b;
            seen++;
            if (all) ok = ok && b;
            else ok = ok || b;
          }
        }
      }
    }
    if (seen === 0) return err("#VALUE!");
    return ok;
  }

  function columnOf(arg: Ast): { direct: boolean; values: Scalar[] } | ExcelError {
    if (opt.rowTable) {
      const peeked = widen(evalArg(arg));
      if (peeked.kind === "range") return { direct: false, values: peeked.values };
      if (peeked.value instanceof ListValue) return { direct: false, values: peeked.value.items };
      const inner: EvalOptions = { ...opt, rowTable: undefined };
      const values: Scalar[] = [];
      for (const row of opt.rowTable) {
        const v = interpret(arg, ctx, inner, [...scopes, row]);
        if (v instanceof RangeValue) return err("#VALUE!");
        values.push(v);
      }
      return { direct: false, values };
    }
    const a = widen(evalArg(arg));
    return a.kind === "scalar" ? { direct: true, values: [a.value] } : { direct: false, values: a.values };
  }

  function factor(v: Scalar): Scalar {
    if (isError(v)) return v;
    if (v instanceof NonScalar) return err("#VALUE!");
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    return 0;
  }

  function sumProduct(args: Ast[]): Scalar {
    if (args.length < 1) return err("#VALUE!");
    const arrays: number[][] = [];
    let length = -1;
    for (const arg of args) {
      const col = columnOf(arg);
      if (col instanceof ExcelError) return col;
      const nums: number[] = [];
      for (const v of col.values) {
        const n = factor(v);
        if (isError(n)) return n;
        nums.push(n);
      }
      if (length < 0) length = nums.length;
      else if (nums.length !== length) return err("#VALUE!");
      arrays.push(nums);
    }
    let total = 0;
    for (let i = 0; i < length; i++) {
      let prod = 1;
      for (const arr of arrays) prod *= arr[i]!;
      total += prod;
    }
    return finite(total);
  }

  function agg(args: Ast[], kind: "sum" | "average" | "min" | "max" | "product" | "sumsq"): Scalar {
    if (args.length < 1) return err("#VALUE!");
    let total = 0;
    let squares = 0;
    let prod = 1;
    let n = 0;
    let min = Infinity;
    let max = -Infinity;
    const take = (num: number) => {
      total += num;
      squares += num * num;
      prod *= num;
      n++;
      if (num < min) min = num;
      if (num > max) max = num;
    };
    for (const arg of args) {
      const a = columnOf(arg);
      if (a instanceof ExcelError) return a;
      if (a.direct) {
        const v = a.values[0]!;
        if (v === null) continue;
        if (isError(v)) return v;
        const num = toNumber(v);
        if (isError(num)) return num;
        take(num);
      } else {
        for (const v of a.values) {
          if (isError(v)) return v;
          if (v === null || typeof v === "boolean" || typeof v === "string") continue;
          if (v instanceof NonScalar) return err("#VALUE!");
          take(v);
        }
      }
    }
    if (kind === "sum") return finite(total);
    if (kind === "sumsq") return finite(squares);
    if (kind === "product") return n === 0 ? 0 : finite(prod);
    if (n === 0) return kind === "average" ? err("#DIV/0!") : 0;
    if (kind === "average") return finite(total / n);
    if (kind === "min") return min;
    return max;
  }

  function count(args: Ast[], counta: boolean): Scalar {
    if (args.length < 1) return err("#VALUE!");
    let n = 0;
    for (const arg of args) {
      const a = columnOf(arg);
      if (a instanceof ExcelError) return a;
      const items = a.values;
      const direct = a.direct;
      for (const v of items) {
        if (counta) {
          if (v === null) continue;
          n++;
          continue;
        }
        if (isError(v) || v === null || v instanceof NonScalar) continue;
        if (direct) {
          if (typeof v === "number" || typeof v === "boolean") n++;
          else if (typeof v === "string" && !(toNumber(v) instanceof ExcelError)) n++;
        } else if (typeof v === "number") {
          n++;
        }
      }
    }
    return n;
  }

  const v = evalAny(ast);
  return v instanceof RangeValue ? err("#VALUE!") : v;
}
