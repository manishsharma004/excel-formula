import type * as Monaco from "monaco-editor";
import { completionPrompt, type EditorRole } from "./prompts";

type PromptSession = {
  prompt: (input: string) => Promise<string>;
};

type LanguageModelApi = {
  availability: () => Promise<string>;
  create: (options?: object) => Promise<PromptSession>;
};

let enabled = false;
let session: PromptSession | undefined;
let busy = 0;
const listeners = new Set<(count: number) => void>();

export function subscribeAiBusy(listener: (count: number) => void): () => void {
  listeners.add(listener);
  listener(busy);
  return () => listeners.delete(listener);
}

function setBusy(delta: number) {
  busy = Math.max(0, busy + delta);
  for (const listener of listeners) listener(busy);
}

export function setAiEnabled(on: boolean) {
  enabled = on;
}

function roleOf(path: string): EditorRole | undefined {
  if (path.endsWith("/formula")) return "formula";
  if (path.endsWith("/data")) return "data";
  if (path.endsWith("/setup")) return "setup";
  return undefined;
}

export async function startAiSession(): Promise<string> {
  const LM = (globalThis as { LanguageModel?: LanguageModelApi }).LanguageModel;
  if (!LM) return "Prompt API is not in this browser. Editing still works.";
  const availability = await LM.availability();
  if (availability === "unavailable") return "On-device model is unavailable.";
  session = await LM.create();
  return availability === "downloadable"
    ? "Model downloaded. On-device completions on."
    : "On-device completions on.";
}

export function registerAiCompletions(monaco: typeof Monaco, setupLanguage: () => string): Monaco.IDisposable[] {
  const provide = async (
    model: Monaco.editor.ITextModel,
    position: Monaco.Position,
    _context: Monaco.languages.InlineCompletionContext,
    token: Monaco.CancellationToken,
  ): Promise<Monaco.languages.InlineCompletions> => {
    const role = roleOf(model.uri.path);
    if (!enabled || !session || !role) return { items: [] };
    const cancelled = new Promise<null>((resolve) => {
      if (token.isCancellationRequested) resolve(null);
      else token.onCancellationRequested(() => resolve(null));
    });
    const wait = new Promise<true>((resolve) => {
      const timer = setTimeout(() => resolve(true), 280);
      token.onCancellationRequested(() => {
        clearTimeout(timer);
      });
    });
    const ready = await Promise.race([wait, cancelled]);
    if (ready !== true || token.isCancellationRequested || !enabled || !session) return { items: [] };
    const prefix = model.getValueInRange({
      startLineNumber: Math.max(1, position.lineNumber - 20),
      startColumn: 1,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    });
    setBusy(1);
    try {
      const text = await Promise.race([
        session.prompt(completionPrompt(role, prefix, setupLanguage())),
        cancelled.then(() => ""),
      ]);
      if (token.isCancellationRequested || !text) return { items: [] };
      const insert = text.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
      const clipped = insert.split("\n").slice(0, 3).join("\n").slice(0, 240);
      if (!clipped.trim()) return { items: [] };
      return { items: [{ insertText: clipped }] };
    } catch {
      return { items: [] };
    } finally {
      setBusy(-1);
    }
  };

  return ["formula", "json", "javascript", "typescript", "python"].map((language) =>
    monaco.languages.registerInlineCompletionsProvider(language, {
      provideInlineCompletions: provide,
      freeInlineCompletions() {},
    }),
  );
}
