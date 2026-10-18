export type SetupLang = "javascript" | "typescript" | "python";

/** Identity scripts. Each language keeps its own text so a switch does not reuse another language's source. */
export const SETUP_PLACEHOLDERS: Record<SetupLang, string> = {
  javascript: `function setup({ data, formula }) {
  return { data, formula };
}
`,
  typescript: `function setup({ data, formula }: { data: Record<string, unknown>; formula: string }) {
  return { data, formula };
}
`,
  python: `def setup(evaluator, data, formula):
    return {"data": data, "formula": formula}
`,
};

export function blankDrafts(): Record<SetupLang, string> {
  return { ...SETUP_PLACEHOLDERS };
}
