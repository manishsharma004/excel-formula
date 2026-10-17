import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import { Evaluator, HostError } from "@excel-formula/core";
import guideMd from "../../REFERENCE.md?raw";
import { renderGuide } from "./guide.ts";
import "./style.css";

self.MonacoEnvironment = {
  getWorker(_id, label) {
    if (label === "json") return new jsonWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};

monaco.languages.register({ id: "formula" });
monaco.languages.setMonarchTokensProvider("formula", {
  tokenizer: {
    root: [
      [/"(?:[^"]|"")*"/, "string"],
      [/\b\d+(\.\d+)?([eE][+-]?\d+)?\b/, "number"],
      [/\b(TRUE|FALSE)\b/i, "keyword"],
      [/[A-Za-z_][A-Za-z0-9_]*(?=\()/, "type"],
      [/[A-Za-z_][A-Za-z0-9_.]*/, "identifier"],
    ],
  },
});

type Engine = "js" | "python";
type ScriptLang = "javascript" | "typescript";
type Shape = "record" | "rows";
type RowMode = "map" | "filter" | "aggregate";

const AGG = /\b(SUM|AVERAGE|MIN|MAX|COUNT|COUNTA|AND|OR|SUMX|AVERAGEX|MINX|MAXX|COUNTX|COUNTAX|COUNTROWS|FILTER|CONCAT)\s*\(/i;

const app = document.querySelector("#app")!;
app.innerHTML = `
<header>
  <h1>Excel formula playground</h1>
  <span>spec 0.7.0 · frontend only</span>
  <button class="link" id="help" type="button">Formula guide</button>
</header>
<article id="guide" class="guide" hidden>
  <div class="guide-bar"><button class="link" id="guide-back" type="button">Back to playground</button></div>
  <div id="guide-body"></div>
</article>
<div id="work">
<div class="tabs" role="tablist">
  <button id="tab-js" role="tab" aria-selected="true">JavaScript / TypeScript</button>
  <button id="tab-py" role="tab" aria-selected="false">Python</button>
</div>
<main>
  <div class="bar">
    <label>Setup <select id="script-lang"><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option></select></label>
    <label>Data <select id="shape"><option value="record">Single record</option><option value="rows">Array of records</option></select></label>
    <label id="row-mode-label">Rows <select id="row-mode"><option value="map">Calculate (map)</option><option value="filter">Query (filter)</option><option value="aggregate">Aggregate</option></select></label>
    <button class="link" id="sample" type="button">Load sample orders</button>
    <label><input id="ai" type="checkbox" /> Chrome AI completion</label>
    <span class="note" id="ai-status"></span>
  </div>
  <div class="panel"><h2>Formula</h2><div id="formula" class="editor"></div></div>
  <div class="grid">
    <div class="panel"><h2>Test data (JSON)</h2><div id="data" class="editor"></div></div>
    <div class="panel"><h2>Setup script</h2><div id="setup" class="editor"></div></div>
  </div>
  <div class="bar">
    <button class="run" id="run" type="button">Run</button>
    <span class="note" id="hint"></span>
  </div>
  <div class="panel"><h2 class="result-head">Result</h2><div id="result" class="editor"></div></div>
  <p class="note">The setup script runs in this page before the formula. It is not a sandbox. Python runs in Pyodide in the browser. Completions use Chrome’s on-device Prompt API and stay off until you enable them. The <button class="link" id="help-inline" type="button">formula guide</button> is the same text as REFERENCE.md.</p>
</main>
</div>`;

const guideBody = document.querySelector("#guide-body")!;
guideBody.innerHTML = renderGuide(guideMd);
const guideEl = document.querySelector("#guide") as HTMLElement;
const workEl = document.querySelector("#work") as HTMLElement;

function showGuide(on: boolean) {
  guideEl.hidden = !on;
  workEl.hidden = on;
  const next = on ? "#guide" : location.pathname + location.search;
  if ((on && location.hash !== "#guide") || (!on && location.hash === "#guide")) {
    history.replaceState(null, "", next);
  }
}

document.querySelector("#help")!.addEventListener("click", () => showGuide(true));
document.querySelector("#help-inline")!.addEventListener("click", () => showGuide(true));
document.querySelector("#guide-back")!.addEventListener("click", () => showGuide(false));
window.addEventListener("hashchange", () => showGuide(location.hash === "#guide"));
if (location.hash === "#guide") showGuide(true);

const editors = {
  formula: monaco.editor.create(document.querySelector("#formula")!, {
    value: "price * qty",
    language: "formula",
    minimap: { enabled: false },
    fontSize: 14,
  }),
  data: monaco.editor.create(document.querySelector("#data")!, {
    value: '{\n  "price": 9.99,\n  "qty": 3\n}\n',
    language: "json",
    minimap: { enabled: false },
    fontSize: 13,
  }),
  setup: monaco.editor.create(document.querySelector("#setup")!, {
    value: "// optional: return { data, formula } or register functions later\n",
    language: "javascript",
    minimap: { enabled: false },
    fontSize: 13,
  }),
  result: monaco.editor.create(document.querySelector("#result")!, {
    value: "",
    language: "json",
    readOnly: true,
    minimap: { enabled: false },
    fontSize: 13,
  }),
};

let engine: Engine = "js";
const scriptLang = document.querySelector("#script-lang") as HTMLSelectElement;
const shapeEl = document.querySelector("#shape") as HTMLSelectElement;
const rowModeEl = document.querySelector("#row-mode") as HTMLSelectElement;
const hint = document.querySelector("#hint")!;
const aiStatus = document.querySelector("#ai-status")!;

function show(text: string) {
  editors.result.setValue(text);
}

function shape(): Shape {
  return shapeEl.value as Shape;
}

document.querySelector("#tab-js")!.addEventListener("click", () => setEngine("js"));
document.querySelector("#tab-py")!.addEventListener("click", () => setEngine("python"));
scriptLang.addEventListener("change", () => {
  monaco.editor.setModelLanguage(editors.setup.getModel()!, scriptLang.value as ScriptLang);
});
shapeEl.addEventListener("change", updateHint);
rowModeEl.addEventListener("change", updateHint);
editors.formula.onDidChangeModelContent(updateHint);

function setEngine(next: Engine) {
  engine = next;
  document.querySelector("#tab-js")!.setAttribute("aria-selected", String(next === "js"));
  document.querySelector("#tab-py")!.setAttribute("aria-selected", String(next === "python"));
  scriptLang.disabled = next === "python";
  if (next === "python") monaco.editor.setModelLanguage(editors.setup.getModel()!, "python");
  else monaco.editor.setModelLanguage(editors.setup.getModel()!, scriptLang.value);
  updateHint();
}

function updateHint() {
  const formula = editors.formula.getValue();
  const agg = AGG.test(formula);
  const rows = shape() === "rows";
  (document.querySelector("#row-mode-label") as HTMLElement).style.display = rows ? "" : "none";
  if (!rows && agg) hint.textContent = "This formula calls an aggregate. Switch data to an array of records.";
  else if (rows && (rowModeEl.value === "map" || rowModeEl.value === "filter"))
    hint.textContent = "Calculate returns one value per record. Query keeps records where the formula is TRUE. Aggregate runs SUM, PRODUCT, SUMSQ, SUMPRODUCT, AVERAGE, MIN, MAX, COUNT, and COUNTA once per record.";
  else hint.textContent = engine === "python" ? "Python runs in Pyodide on first Run." : "JavaScript and TypeScript share one engine.";
}

document.querySelector("#sample")!.addEventListener("click", () => {
  shapeEl.value = "rows";
  editors.formula.setValue('region = "EU"');
  editors.data.setValue(JSON.stringify([
    { id: 1, region: "EU", price: 10, qty: 2, discount: 0.1, paid: true },
    { id: 2, region: "US", price: 5, qty: 10, paid: false },
    { id: 3, region: "eu", price: 20, qty: 1, discount: null, paid: true },
    { id: 4, region: "APAC", price: "n/a", qty: 3, discount: 0 },
  ], null, 2));
  rowModeEl.value = "filter";
  updateHint();
});

document.querySelector("#run")!.addEventListener("click", () => void run());

async function run() {
  let data: unknown;
  try {
    data = JSON.parse(editors.data.getValue() || "null");
  } catch (e) {
    show(String(e));
    return;
  }
  const formula = editors.formula.getValue();
  const rows = shape() === "rows";
  if (!rows && (data === null || typeof data !== "object" || Array.isArray(data))) {
    show("Single record mode expects a JSON object.");
    return;
  }
  if (rows && !Array.isArray(data)) {
    show("Array mode expects a JSON array of records.");
    return;
  }
  if (!rows && AGG.test(formula)) {
    show("Aggregate formulas need an array of records. Switch the data shape.");
    return;
  }
  try {
    if (engine === "js") show(JSON.stringify(await runJs(formula, data, rows), null, 2));
    else show(JSON.stringify(await runPy(formula, data, rows), null, 2));
  } catch (e) {
    if (e instanceof HostError) show(JSON.stringify({ $type: "host", kind: e.kind, message: e.message }, null, 2));
    else show(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
}

async function prepare(formula: string, data: unknown): Promise<{ formula: string; data: unknown }> {
  const src = editors.setup.getValue();
  if (!src.trim() || src.trim().startsWith("//")) return { formula, data };
  if (engine === "python") return { formula, data };
  let js = src;
  if (scriptLang.value === "typescript") {
    const ts = await import("typescript");
    const out = ts.transpileModule(src, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      reportDiagnostics: true,
    });
    const errors = (out.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
    if (errors.length) {
      throw new Error(errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n"));
    }
    js = out.code;
  }
  const fn = new Function("evaluator", "data", "formula", `${js}\nreturn typeof setup === "function" ? setup({ evaluator, data, formula }) : undefined;`);
  const ev = new Evaluator();
  const ret = await fn(ev, data, formula);
  if (ret && typeof ret === "object") {
    const r = ret as { data?: unknown; formula?: string };
    return { data: r.data ?? data, formula: r.formula ?? formula };
  }
  return { formula, data };
}

async function runJs(formula: string, data: unknown, rows: boolean) {
  const prepared = await prepare(formula, data);
  const mode = rowModeEl.value as RowMode;
  const ev = new Evaluator();
  if (rows && mode === "map") return ev.map(prepared.formula, prepared.data as unknown[]);
  if (rows && mode === "filter") return ev.filter(prepared.formula, prepared.data as unknown[]);
  if (rows && mode === "aggregate") return ev.aggregate(prepared.formula, prepared.data as unknown[]);
  const context = rows ? { rows: prepared.data } : (prepared.data as Record<string, unknown>);
  return ev.evaluate(prepared.formula, context);
}

let pyodide: { runPythonAsync: (s: string) => Promise<unknown>; FS: { writeFile: (p: string, d: string) => void; mkdirTree: (p: string) => void } } | undefined;

async function runPy(formula: string, data: unknown, rows: boolean) {
  if (!pyodide) {
    show("Loading Pyodide…");
    const mod = await import(/* @vite-ignore */ "https://cdn.jsdelivr.net/pyodide/v0.27.5/full/pyodide.mjs");
    pyodide = await mod.loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.5/full/" });
    const pkgUrl = `${import.meta.env.BASE_URL}python-package.json`;
    const files = await fetch(pkgUrl).then((r) => r.json()) as Record<string, string>;
    for (const [path, text] of Object.entries(files)) {
      const dir = path.split("/").slice(0, -1).join("/");
      if (dir) pyodide.FS.mkdirTree(dir);
      pyodide.FS.writeFile(path, text);
    }
  }
  const mode = rows ? rowModeEl.value : "evaluate";
  const payload = JSON.stringify({ formula, data, rows, mode, setup: editors.setup.getValue() });
  const raw = await pyodide!.runPythonAsync(`
import json, sys
sys.path.insert(0, "/pkg")
from excel_formula import Evaluator, EvaluationError
req = json.loads(${JSON.stringify(payload)})
def main():
    data, formula = req["data"], req["formula"]
    setup = (req.get("setup") or "").strip()
    if setup and not setup.startswith("#"):
        ns = {}
        exec(setup, ns, ns)
        if "setup" in ns:
            out = ns["setup"](Evaluator(), data, formula)
            if isinstance(out, dict):
                data = out.get("data", data)
                formula = out.get("formula", formula)
    ev = Evaluator()
    try:
        if req["rows"] and req["mode"] == "map":
            return ev.map(formula, data)
        if req["rows"] and req["mode"] == "filter":
            return ev.filter(formula, data)
        if req["rows"] and req["mode"] == "aggregate":
            return ev.aggregate(formula, data)
        ctx = {"rows": data} if req["rows"] else data
        return ev.evaluate(formula, ctx)
    except EvaluationError as e:
        return {"$type": "host", "kind": e.kind, "message": str(e)}
json.dumps(main())
`);
  return JSON.parse(String(raw));
}

const aiBox = document.querySelector("#ai") as HTMLInputElement;
aiBox.addEventListener("change", () => void enableAi(aiBox.checked));

async function enableAi(on: boolean) {
  if (!on) {
    aiStatus.textContent = "";
    return;
  }
  const LM = (globalThis as { LanguageModel?: { availability: () => Promise<string>; create: (o?: object) => Promise<{ prompt: (s: string) => Promise<string> }> } }).LanguageModel;
  if (!LM) {
    aiStatus.textContent = "Prompt API is not in this browser. Editing still works.";
    aiBox.checked = false;
    return;
  }
  const availability = await LM.availability();
  if (availability === "unavailable") {
    aiStatus.textContent = "On-device model is unavailable.";
    aiBox.checked = false;
    return;
  }
  if (availability === "downloadable") {
    aiStatus.textContent = "Model needs a download. Creating a session may prompt Chrome.";
  }
  const session = await LM.create();
  aiStatus.textContent = "On-device completions on.";
  for (const lang of ["formula", "json", "javascript", "typescript", "python"]) {
    monaco.languages.registerInlineCompletionsProvider(lang, {
      provideInlineCompletions: async (model, position, _ctx, token) => {
        if (!aiBox.checked || token.isCancellationRequested) return { items: [] };
        const prefix = model.getValueInRange({ startLineNumber: Math.max(1, position.lineNumber - 20), startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column });
        const text = await session.prompt(`Continue this ${lang} snippet with a short inline completion only, no commentary:\n${prefix}`);
        const insert = text.split("\n")[0]?.slice(0, 120) ?? "";
        if (!insert.trim()) return { items: [] };
        return { items: [{ insertText: insert }] };
      },
      disposeInlineCompletions() {},
    });
  }
}

updateHint();
