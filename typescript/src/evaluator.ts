/** Stub evaluator — behavior defined in ../../spec/SPEC.md (not yet implemented). */

export const SPEC_REVISION = "0.1.0";

export type Value = unknown;

export type Context = Record<string, Value>;

export type EvaluatorOptions = {
  referenceStyle?: "A1" | "R1C1";
  formulaLocale?: string;
  strict?: boolean;
};

export class EvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationError";
  }
}

export class Evaluator {
  static readonly specRevision = SPEC_REVISION;

  readonly referenceStyle: "A1" | "R1C1";
  readonly formulaLocale: string;
  readonly strict: boolean;

  constructor(options: EvaluatorOptions = {}) {
    this.referenceStyle = options.referenceStyle ?? "A1";
    this.formulaLocale = options.formulaLocale ?? "en-US";
    this.strict = options.strict ?? false;
  }

  evaluate(_formula: string, _context: Context): Value {
    throw new Error(
      "Formula evaluation is not implemented yet; see spec/SPEC.md and open GitHub issues.",
    );
  }
}
