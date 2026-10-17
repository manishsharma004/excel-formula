/**
 * Excel-style formula evaluation on a context object.
 * Behavior is defined in ../../spec/SPEC.md revision 0.8.0.
 */

import { toBoolean } from "./coerce.js";
import { host, HostError } from "./host.js";
import { interpret, type EvalOptions } from "./interpret.js";
import { parseFormula, type Ast } from "./parser.js";
import { decodeJson, encodeJson, isError, type Scalar } from "./value.js";

export const SPEC_REVISION = "0.8.0";

export type Value = unknown;

export type Context = Record<string, unknown>;

export type EvaluatorOptions = {
  formulaLocale?: string;
  strict?: boolean;
  maxFormulaLength?: number;
  maxAstNodes?: number;
  maxFunctionArgs?: number;
  maxRangeCells?: number;
  timeoutMs?: number;
  onRowError?: "raise" | "exclude";
};

export class EvaluationError extends HostError {}

function utf16Length(s: string): number {
  return s.length;
}

export class Evaluator {
  static readonly specRevision = SPEC_REVISION;

  readonly formulaLocale: string;
  readonly strict: boolean;
  readonly maxFormulaLength: number;
  readonly maxAstNodes: number;
  readonly maxFunctionArgs: number;
  readonly maxRangeCells: number;
  readonly timeoutMs: number | undefined;

  constructor(options: EvaluatorOptions = {}) {
    const locale = options.formulaLocale ?? "en-US";
    if (locale !== "en-US") host("unsupported", "Only en-US is supported");
    this.formulaLocale = locale;
    this.strict = options.strict ?? false;
    this.maxFormulaLength = options.maxFormulaLength ?? 8192;
    this.maxAstNodes = options.maxAstNodes ?? 4096;
    this.maxFunctionArgs = options.maxFunctionArgs ?? 255;
    this.maxRangeCells = options.maxRangeCells ?? 10000;
    this.timeoutMs = options.timeoutMs;
    this.onRowError = options.onRowError ?? "raise";
  }

  readonly onRowError: "raise" | "exclude";

  evaluate(formula: string, context: Context): Value {
    return encodeJson(this.evalAst(formula, context, []));
  }

  /**
   * Evaluate an aggregation over records.
   * `SUM(price * qty)` is the sum of that product on each record.
   * An argument that is already a list is aggregated once, not once per record.
   */
  aggregate(formula: string, rows: unknown[], context: Context = {}): Value {
    this.requireRows(rows);
    const ast = this.parse(formula);
    const opt: EvalOptions = {
      strict: this.strict,
      maxRangeCells: this.maxRangeCells,
      timeoutMs: this.timeoutMs,
      started: performance.now(),
      rowTable: rows.map((row) => this.rowScope(row)),
    };
    return encodeJson(interpret(ast, this.contextMap(context), opt, []));
  }

  /** One result per record, in order. A row error stays in that slot. */
  map(formula: string, rows: unknown[], context: Context = {}): Value[] {
    this.requireRows(rows);
    const ast = this.parse(formula);
    const root = this.contextMap(context);
    return rows.map((row) => encodeJson(this.evalParsed(ast, root, [this.rowScope(row)])));
  }

  /** Records whose formula is TRUE. */
  filter(formula: string, rows: unknown[], context: Context = {}): unknown[] {
    this.requireRows(rows);
    const ast = this.parse(formula);
    const root = this.contextMap(context);
    const kept: unknown[] = [];
    rows.forEach((row, index) => {
      const value = this.evalParsed(ast, root, [this.rowScope(row)]);
      const cond = isError(value) ? value : toBoolean(value);
      if (isError(cond)) {
        if (this.onRowError === "exclude") return;
        host("row", `Row ${index}: ${cond.code}`);
      }
      if (cond) kept.push(row);
    });
    return kept;
  }

  private evalAst(formula: string, context: Context, scopes: Map<string, Scalar>[]): Scalar {
    return this.evalParsed(this.parse(formula), this.contextMap(context), scopes);
  }

  private parse(formula: string): Ast {
    if (typeof formula !== "string") host("parse", "Formula must be a string");
    if (utf16Length(formula) > this.maxFormulaLength) host("limit", "Formula is too long");
    return parseFormula(formula, this.maxAstNodes, this.maxFunctionArgs);
  }

  private contextMap(context: Context): Map<string, Scalar> {
    const map = new Map<string, Scalar>();
    for (const [k, v] of Object.entries(context ?? {})) map.set(k, decodeJson(v));
    return map;
  }

  private rowScope(row: unknown): Map<string, Scalar> {
    if (row === null || typeof row !== "object" || Array.isArray(row)) host("parse", "Each row must be a record");
    const scope = new Map<string, Scalar>();
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) scope.set(k, decodeJson(v));
    return scope;
  }

  private requireRows(rows: unknown[]): void {
    if (!Array.isArray(rows)) host("parse", "rows must be an array");
  }

  private evalParsed(ast: Ast, root: Map<string, Scalar>, scopes: Map<string, Scalar>[]): Scalar {
    const opt: EvalOptions = {
      strict: this.strict,
      maxRangeCells: this.maxRangeCells,
      timeoutMs: this.timeoutMs,
      started: performance.now(),
    };
    return interpret(ast, root, opt, scopes);
  }
}

export { HostError };
