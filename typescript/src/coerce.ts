import { ExcelError, NonScalar, err, isError, type Scalar } from "./value.js";

const NUM = /^([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$/;

/** Spec §8.1. Errors pass through. */
export function toNumber(v: Scalar): number | ExcelError {
  if (v instanceof ExcelError) return v;
  if (v instanceof NonScalar) return err("#VALUE!");
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === null) return 0;
  const s = trimSpace(v);
  if (!NUM.test(s)) return err("#VALUE!");
  const n = Number(s);
  return Number.isFinite(n) ? n : err("#NUM!");
}

/** Spec §8.2. Shortest round-trip via Number's default rendering. */
export function toString(v: Scalar): string | ExcelError {
  if (v instanceof ExcelError) return v;
  if (v instanceof NonScalar) return err("#VALUE!");
  if (typeof v === "string") return v;
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (Object.is(v, -0)) return "0";
  if (Number.isInteger(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER) return String(v);
  return String(v);
}

/** Spec §8.3. Strings fail, including "TRUE". */
export function toBoolean(v: Scalar): boolean | ExcelError {
  if (v instanceof ExcelError) return v;
  if (v instanceof NonScalar) return err("#VALUE!");
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (v === null) return false;
  return err("#VALUE!");
}

function trimSpace(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && s.charCodeAt(a) === 32) a++;
  while (b > a && s.charCodeAt(b - 1) === 32) b--;
  return s.slice(a, b);
}

/** A–Z only, spec §8.4. */
export function foldAz(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : s[i]!;
  }
  return out;
}

export function cmpStrings(a: string, b: string): number {
  const fa = foldAz(a);
  const fb = foldAz(b);
  if (fa < fb) return -1;
  if (fa > fb) return 1;
  return 0;
}

function emptyLike(other: Scalar): Scalar {
  if (typeof other === "number") return 0;
  if (typeof other === "string") return "";
  if (typeof other === "boolean") return false;
  if (other === null) return null;
  return err("#VALUE!");
}

function typeRank(v: Scalar): number {
  if (typeof v === "number") return 0;
  if (typeof v === "string") return 1;
  if (typeof v === "boolean") return 2;
  return 3;
}

/** Spec §8.4. */
export function equal(a: Scalar, b: Scalar): Scalar {
  if (isError(a)) return a;
  if (isError(b)) return b;
  if (a instanceof NonScalar || b instanceof NonScalar) return false;
  if (a === null && b === null) return true;
  if (a === null) a = emptyLike(b);
  else if (b === null) b = emptyLike(a);
  if (isError(a)) return a;
  if (isError(b)) return b;
  if (typeof a === "string" && typeof b === "string") return foldAz(a) === foldAz(b);
  if (typeof a === "boolean" && typeof b === "boolean") return a === b;
  if (typeof a === "number" && typeof b === "number") return a === b;
  return false;
}

/** Spec §8.5. Returns negative, zero, or positive, or an error. */
export function compare(a: Scalar, b: Scalar): number | ExcelError {
  if (isError(a)) return a;
  if (isError(b)) return b;
  if (a instanceof NonScalar || b instanceof NonScalar) return err("#VALUE!");
  if (a === null && b === null) return 0;
  if (a === null) a = emptyLike(b);
  else if (b === null) b = emptyLike(a);
  if (isError(a)) return a;
  if (isError(b)) return b;
  if (typeof a === "number" && typeof b === "number") return a === b ? 0 : a < b ? -1 : 1;
  if (typeof a === "string" && typeof b === "string") return cmpStrings(a, b);
  if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? 1 : -1;
  return typeRank(a) - typeRank(b);
}
