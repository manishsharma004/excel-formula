import { host } from "./host.js";
import { lex, type Token } from "./lexer.js";

export type Ast =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "bool"; v: boolean }
  | { k: "name"; v: string }
  | { k: "unary"; op: "+" | "-"; x: Ast }
  | { k: "pct"; x: Ast }
  | { k: "bin"; op: string; l: Ast; r: Ast }
  | { k: "call"; name: string; args: Ast[] };

const COMP = new Set(["=", "<>", "<", ">", "<=", ">="]);

export function parseFormula(src: string, maxAstNodes: number, maxFunctionArgs: number): Ast {
  const tokens = lex(src);
  let i = 0;
  let nodes = 0;
  const bump = () => {
    nodes++;
    if (nodes > maxAstNodes) host("limit", "Formula is too complex");
  };
  const peek = (): Token => tokens[i] ?? { t: "eof" };
  const at = (t: Token["t"], v?: string) => {
    const p = peek();
    return p.t === t && (v === undefined || ("v" in p && p.v === v));
  };
  const eat = () => {
    const p = peek();
    i++;
    return p;
  };

  if (at("eof")) host("parse", "Empty formula");
  if (at("op", "=")) host("parse", "Leading '=' is not allowed");

  const node = (ast: Ast): Ast => {
    bump();
    return ast;
  };

  function primary(): Ast {
    const p = peek();
    if (p.t === "num") {
      eat();
      return node({ k: "num", v: Number(p.v) });
    }
    if (p.t === "str") {
      eat();
      return node({ k: "str", v: p.v });
    }
    if (p.t === "bool") {
      eat();
      return node({ k: "bool", v: p.v });
    }
    if (p.t === "name") {
      eat();
      if (at("p", "(")) return call(p.v);
      return node({ k: "name", v: p.v });
    }
    if (at("p", "(")) {
      eat();
      const inner = expr();
      if (!at("p", ")")) host("parse", "Expected ')'");
      eat();
      return inner;
    }
    host("parse", "Expected a value");
  }

  function call(name: string): Ast {
    eat(); // (
    const args: Ast[] = [];
    if (!at("p", ")")) {
      for (;;) {
        if (at("p", ",") || at("p", ")")) host("parse", "Empty argument");
        args.push(expr());
        if (at("p", ",")) {
          eat();
          continue;
        }
        break;
      }
    }
    if (!at("p", ")")) host("parse", "Expected ')'");
    eat();
    if (args.length > maxFunctionArgs) host("limit", "Too many arguments");
    return node({ k: "call", name, args });
  }

  function unary(): Ast {
    if (at("op", "+") || at("op", "-")) {
      const op = (eat() as { v: string }).v as "+" | "-";
      return node({ k: "unary", op, x: unary() });
    }
    return primary();
  }

  function percent(): Ast {
    let x = unary();
    while (at("op", "%")) {
      eat();
      x = node({ k: "pct", x });
    }
    return x;
  }

  function bin(next: () => Ast, ops: Set<string> | ((op: string) => boolean)): Ast {
    let l = next();
    for (;;) {
      const p = peek();
      if (p.t !== "op") break;
      const ok = typeof ops === "function" ? ops(p.v) : ops.has(p.v);
      if (!ok) break;
      eat();
      l = node({ k: "bin", op: p.v, l, r: next() });
    }
    return l;
  }

  function power(): Ast {
    return bin(percent, new Set(["^"]));
  }
  function mul(): Ast {
    return bin(power, new Set(["*", "/"]));
  }
  function add(): Ast {
    return bin(mul, new Set(["+", "-"]));
  }
  function concat(): Ast {
    return bin(add, new Set(["&"]));
  }
  function expr(): Ast {
    return bin(concat, COMP);
  }

  const ast = expr();
  if (!at("eof")) host("parse", "Unexpected token");
  return ast;
}
