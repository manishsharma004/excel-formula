import { Evaluator, HostError } from "@excel-formula/core";
import type { RowMode } from "./samples";

const AGG = /\b(SUM|AVERAGE|MIN|MAX|COUNT|COUNTA|AND|OR|SUMX|AVERAGEX|MINX|MAXX|COUNTX|COUNTAX|COUNTROWS|FILTER|CONCAT|PRODUCT)\s*\(/i;

export function formulaUsesAggregate(formula: string): boolean {
  return AGG.test(formula);
}

export async function runJavaScript(options: {
  formula: string;
  data: unknown;
  rows: boolean;
  mode: RowMode;
  setupSource: string;
  typescript: boolean;
}): Promise<unknown> {
  const prepared = await prepareJs(options.formula, options.data, options.setupSource, options.typescript);
  const ev = new Evaluator();
  if (options.rows && options.mode === "map") return ev.map(prepared.formula, prepared.data as unknown[]);
  if (options.rows && options.mode === "filter") return ev.filter(prepared.formula, prepared.data as unknown[]);
  if (options.rows && options.mode === "aggregate") return ev.aggregate(prepared.formula, prepared.data as unknown[]);
  const context = options.rows ? { rows: prepared.data } : (prepared.data as Record<string, unknown>);
  return ev.evaluate(prepared.formula, context);
}

async function prepareJs(
  formula: string,
  data: unknown,
  src: string,
  typescript: boolean,
): Promise<{ formula: string; data: unknown }> {
  if (!src.trim() || src.trim().startsWith("//")) return { formula, data };
  let js = src;
  if (typescript) {
    const ts = await import("typescript");
    const out = ts.transpileModule(src, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      reportDiagnostics: true,
    });
    const errors = (out.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
    if (errors.length) {
      throw new Error(errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n"));
    }
    js = out.outputText;
  }
  const fn = new Function(
    "evaluator",
    "data",
    "formula",
    `${js}\nreturn typeof setup === "function" ? setup({ evaluator, data, formula }) : undefined;`,
  );
  const ret = await fn(new Evaluator(), data, formula);
  if (ret && typeof ret === "object") {
    const record = ret as { data?: unknown; formula?: string };
    return { data: record.data ?? data, formula: record.formula ?? formula };
  }
  return { formula, data };
}

type Pyodide = {
  runPythonAsync: (source: string) => Promise<unknown>;
  FS: { writeFile: (path: string, data: string) => void; mkdirTree: (path: string) => void };
};

let pyodide: Pyodide | undefined;

export async function runPython(options: {
  formula: string;
  data: unknown;
  rows: boolean;
  mode: RowMode;
  setupSource: string;
  onStatus: (text: string) => void;
}): Promise<unknown> {
  if (!pyodide) {
    options.onStatus("Loading Pyodide…");
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<{
      loadPyodide: (options: { indexURL: string }) => Promise<Pyodide>;
    }>;
    const mod = await dynamicImport("https://cdn.jsdelivr.net/pyodide/v0.27.5/full/pyodide.mjs");
    const loaded = await mod.loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.5/full/" });
    const pkgUrl = `${import.meta.env.BASE_URL}python-package.json`;
    const files = (await fetch(pkgUrl).then((response) => response.json())) as Record<string, string>;
    for (const [path, text] of Object.entries(files)) {
      const dir = path.split("/").slice(0, -1).join("/");
      if (dir) loaded.FS.mkdirTree(dir);
      loaded.FS.writeFile(path, text);
    }
    pyodide = loaded;
  }
  const runtime = pyodide;
  if (!runtime) throw new Error("Pyodide failed to load");
  const mode = options.rows ? options.mode : "evaluate";
  const payload = JSON.stringify({
    formula: options.formula,
    data: options.data,
    rows: options.rows,
    mode,
    setup: options.setupSource,
  });
  const raw = await runtime.runPythonAsync(`
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

export function formatError(error: unknown): string {
  if (error instanceof HostError) {
    return JSON.stringify({ $type: "host", kind: error.kind, message: error.message }, null, 2);
  }
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
