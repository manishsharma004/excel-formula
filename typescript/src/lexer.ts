import { host } from "./host.js";

export type Token =
  | { t: "num"; v: string }
  | { t: "str"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "name"; v: string }
  | { t: "op"; v: string }
  | { t: "p"; v: "(" | ")" | "," | ":" }
  | { t: "eof" };

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const NUM = /^([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?/;

export function lex(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === '"') {
      i++;
      let s = "";
      let closed = false;
      while (i < n) {
        if (src[i] === '"') {
          if (src[i + 1] === '"') {
            s += '"';
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        s += src[i];
        i++;
      }
      if (!closed) host("parse", "Unterminated string");
      out.push({ t: "str", v: s });
      continue;
    }
    if (c === "(" || c === ")" || c === "," || c === ":") {
      out.push({ t: "p", v: c });
      i++;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "<>") {
      out.push({ t: "op", v: two });
      i += 2;
      continue;
    }
    if ("+-*/^&=<>%".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (c === "." || (c >= "0" && c <= "9")) {
      const m = NUM.exec(src.slice(i));
      if (!m) host("parse", `Unexpected '${c}'`);
      out.push({ t: "num", v: m[0] });
      i += m[0].length;
      continue;
    }
    if ((c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || c === "_") {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_.]/.test(src[j]!)) j++;
      const raw = src.slice(i, j);
      i = j;
      const folded = raw.toUpperCase();
      if (folded === "TRUE" || folded === "FALSE") {
        out.push({ t: "bool", v: folded === "TRUE" });
        continue;
      }
      if (!IDENT.test(raw)) host("parse", `Invalid name '${raw}'`);
      out.push({ t: "name", v: raw });
      continue;
    }
    host("parse", `Unexpected character '${c}'`);
  }
  out.push({ t: "eof" });
  return out;
}
