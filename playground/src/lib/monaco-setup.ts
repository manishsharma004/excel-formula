import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

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

export { monaco };
