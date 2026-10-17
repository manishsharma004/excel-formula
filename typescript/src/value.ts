/** Runtime values (spec §7). Spreadsheet errors are values, not exceptions. */

export const ERROR_CODES = [
  "#DIV/0!",
  "#VALUE!",
  "#REF!",
  "#NAME?",
  "#NUM!",
  "#N/A",
  "#NULL!",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class ExcelError {
  readonly code: ErrorCode;
  constructor(code: ErrorCode) {
    this.code = code;
  }
}

/** A context object or array used where a scalar is required (spec §7.2). */
export class NonScalar {
  readonly label = "non-scalar";
}

/** Nested JSON object (spec §6.7). */
export class RecordValue extends NonScalar {
  constructor(readonly fields: Map<string, Scalar>) {
    super();
  }
}

/** Nested JSON array (spec §6.7). */
export class ListValue extends NonScalar {
  constructor(readonly items: Scalar[]) {
    super();
  }
}

export type Scalar = number | string | boolean | null | ExcelError | NonScalar;

export function err(code: ErrorCode): ExcelError {
  return new ExcelError(code);
}

export function isError(v: Scalar): v is ExcelError {
  return v instanceof ExcelError;
}

/** First error in a list, if any. */
export function firstError(values: Scalar[]): ExcelError | undefined {
  for (const v of values) {
    if (v instanceof ExcelError) return v;
  }
  return undefined;
}

export function decodeJson(input: unknown): Scalar {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return err("#NUM!");
    return input;
  }
  if (typeof input === "string" || typeof input === "boolean") return input;
  if (Array.isArray(input)) return new ListValue(input.map((item) => decodeJson(item)));
  if (typeof input === "object") {
    const o = input as { $type?: string; code?: string; value?: string };
    if (o.$type === "error" && typeof o.code === "string") {
      return err(o.code as ErrorCode);
    }
    if (o.$type === "number" && typeof o.value === "string") {
      const n = Number(o.value);
      return Number.isFinite(n) ? n : err("#NUM!");
    }
    const fields = new Map<string, Scalar>();
    for (const [k, v] of Object.entries(o)) fields.set(k, decodeJson(v));
    return new RecordValue(fields);
  }
  return new NonScalar();
}

export function encodeJson(value: Scalar): unknown {
  if (value instanceof ExcelError) return { $type: "error", code: value.code };
  if (value instanceof ListValue) return value.items.map((item) => encodeJson(item));
  if (value instanceof RecordValue) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of value.fields) out[k] = encodeJson(v);
    return out;
  }
  if (value instanceof NonScalar) return { $type: "error", code: "#VALUE!" };
  return value;
}
