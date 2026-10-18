export type EditorRole = "formula" | "data" | "setup";

const FORMULA = `You write inline completions for the Formula editor in an Excel-style playground.
Purpose: the text is one expression evaluated against JSON objects and arrays. There is no spreadsheet.
Rules:
- Do not start a formula with "=".
- There are no cell addresses and no ranges. A1 and q1 are field names. A1:B2 is invalid.
- Names are case-sensitive fields: price, qty, region, nested.price, orders.price.
- Operators on an array are element-wise. SUM(values * values) is the sum of squares. SUM(values * 2) multiplies every element, then adds.
- Do not suggest SUMSQ or SUMPRODUCT.
Return only the characters to insert at the cursor. Do not repeat the prefix. No markdown, no explanation.
Example outputs (the completion only):
- prefix "price" → " * qty"
- prefix "SUM(" → "price * qty)"
- prefix "region = " → "\\"EU\\""
- prefix "IF(qty > 10, " → "price * 0.9, price) * qty"
- prefix "SUM(values * " → "values)"
Prefix so far:
`;

const DATA = `You write inline completions for the Test data editor.
Purpose: the document is JSON used as the formula's context. It is either one object or an array of objects. Fields are numbers, strings, booleans, null, nested objects, or arrays.
Return only the next JSON tokens that continue the document. Do not rewrite the prefix. No comments, no markdown, no explanation.
Example outputs (the completion only):
- prefix "{\\n  \\"price\\": 9.99" → ",\\n  \\"qty\\": 3\\n}"
- prefix "[\\n  { \\"region\\": \\"EU\\", \\"price\\": 10" → ", \\"qty\\": 2 }"
- prefix "{\\n  \\"values\\": [2, 3" → ", 4]\\n}"
- prefix "{\\n  \\"nested\\": { \\"price\\": " → "10 }\\n}"
Prefix so far:
`;

function setupPrompt(language: string): string {
  if (language === "python") {
    return `You write inline completions for the Setup script editor.
Purpose: optional Python that runs in the page before the formula. Define setup(evaluator, data, formula). Return a dict with "data" and "formula" to replace them. Do not import packages. This is not a sandbox.
Return only the characters to insert at the cursor. Do not repeat the prefix. No markdown, no explanation.
Example outputs (the completion only):
- prefix "def setup(evaluator, data, formula):\\n    " → "return {\\"data\\": data, \\"formula\\": formula}"
- prefix "data[\\"qty\\"] = " → "data.get(\\"qty\\", 0) * 2"
Prefix so far:
`;
  }
  const label = language === "typescript" ? "TypeScript" : "JavaScript";
  return `You write inline completions for the Setup script editor.
Purpose: optional ${label} that runs in the page before the formula. Define function setup({ evaluator, data, formula }) and return { data, formula } to replace them. Do not use the network. This is not a sandbox.
Return only the characters to insert at the cursor. Do not repeat the prefix. No markdown, no explanation.
Example outputs (the completion only):
- prefix "function setup({ data, formula }) {\\n  " → "return { data, formula };\\n}"
- prefix "data.qty = " → "Number(data.qty) * 2;"
Prefix so far:
`;
}

export function completionPrompt(role: EditorRole, prefix: string, setupLanguage: string): string {
  const head = role === "formula" ? FORMULA : role === "data" ? DATA : setupPrompt(setupLanguage);
  return `${head}${prefix}`;
}
