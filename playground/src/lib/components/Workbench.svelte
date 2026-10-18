<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { registerAiCompletions, setAiEnabled, startAiSession, subscribeAiBusy } from "$lib/ai";
  import { rowModeLabel, samples, type RowMode, type Sample, type Shape } from "$lib/samples";
  import { formatError, formulaUsesAggregate, runJavaScript, runPython } from "$lib/run";
  import { blankDrafts, SETUP_PLACEHOLDERS, type SetupLang } from "$lib/setup";

  let engine = $state<"js" | "python">("js");
  let scriptLang = $state<"javascript" | "typescript">("javascript");
  let shape = $state<Shape>("record");
  let rowMode = $state<RowMode>("map");
  let hint = $state("JavaScript and TypeScript share one engine.");
  let aiOn = $state(false);
  let aiStatus = $state("");
  let aiBusy = $state(0);
  let running = $state(false);
  let customSetup = $state(false);
  const drafts = blankDrafts();
  let activeSetup: SetupLang = "javascript";
  let monacoApi: typeof import("monaco-editor") | undefined;

  let formulaHost: HTMLDivElement | undefined = $state();
  let dataHost: HTMLDivElement | undefined = $state();
  let setupHost: HTMLDivElement | undefined = $state();
  let resultHost: HTMLDivElement | undefined = $state();
  let dataDialog: HTMLDialogElement | undefined = $state();

  type Editor = import("monaco-editor").editor.IStandaloneCodeEditor;
  let editors: { formula: Editor; data: Editor; setup: Editor; result: Editor } | undefined;
  let disposables: { dispose: () => void }[] = [];

  function updateHint() {
    const formula = editors?.formula.getValue() ?? "price * qty";
    const agg = formulaUsesAggregate(formula);
    if (shape !== "rows" && agg) hint = "This formula calls an aggregate. Switch data to an array of records, or keep the array on one object.";
    else if (shape === "rows") hint = "Calculate returns one value per record. Query keeps records where the formula is TRUE. Aggregate runs SUM, PRODUCT, AVERAGE, MIN, MAX, COUNT, and COUNTA once per record.";
    else hint = engine === "python" ? "Python runs in Pyodide on first Run." : "JavaScript and TypeScript share one engine.";
  }

  function setupLang(): SetupLang {
    return engine === "python" ? "python" : scriptLang;
  }

  function showSetup(next: SetupLang) {
    const changed = next !== activeSetup;
    if (editors && changed) drafts[activeSetup] = editors.setup.getValue();
    activeSetup = next;
    const text = drafts[next]?.trim() ? drafts[next] : SETUP_PLACEHOLDERS[next];
    drafts[next] = text;
    if (changed) editors?.setup.setValue(text);
    const model = editors?.setup.getModel();
    if (model && monacoApi) monacoApi.editor.setModelLanguage(model, next);
  }

  function setEngine(next: "js" | "python") {
    engine = next;
    showSetup(next === "python" ? "python" : scriptLang);
    updateHint();
  }

  function applySample(sample: Sample) {
    shape = sample.shape;
    rowMode = sample.rowMode;
    editors?.formula.setValue(sample.formula);
    editors?.data.setValue(`${JSON.stringify(sample.data, null, 2)}\n`);
    if (sample.setup) {
      for (const lang of ["javascript", "typescript", "python"] as const) {
        if (sample.setup[lang]) drafts[lang] = sample.setup[lang];
      }
      customSetup = true;
      const lang = setupLang();
      activeSetup = lang;
      editors?.setup.setValue(drafts[lang] || SETUP_PLACEHOLDERS[lang]);
      const model = editors?.setup.getModel();
      if (model && monacoApi) monacoApi.editor.setModelLanguage(model, lang);
      queueMicrotask(() => editors?.setup.layout());
    } else {
      customSetup = false;
    }
    dataDialog?.close();
    updateHint();
  }

  function toggleCustomSetup(on: boolean) {
    customSetup = on;
    if (on) {
      showSetup(setupLang());
      queueMicrotask(() => editors?.setup.layout());
    }
  }

  async function toggleAi(on: boolean) {
    aiOn = on;
    setAiEnabled(on);
    if (!on) {
      aiStatus = "";
      return;
    }
    aiStatus = "Starting on-device model…";
    const message = await startAiSession();
    if (message.startsWith("Prompt API") || message.startsWith("On-device model")) {
      aiOn = false;
      setAiEnabled(false);
    }
    aiStatus = message;
  }

  async function run() {
    if (!editors) return;
    let data: unknown;
    try {
      data = JSON.parse(editors.data.getValue() || "null");
    } catch (error) {
      editors.result.setValue(String(error));
      return;
    }
    const formula = editors.formula.getValue();
    const rows = shape === "rows";
    if (!rows && (data === null || typeof data !== "object" || Array.isArray(data))) {
      editors.result.setValue("Single record mode expects a JSON object.");
      return;
    }
    if (rows && !Array.isArray(data)) {
      editors.result.setValue("Array mode expects a JSON array of records.");
      return;
    }
    running = true;
    try {
      const value =
        engine === "js"
          ? await runJavaScript({
              formula,
              data,
              rows,
              mode: rowMode,
              setupSource: customSetup ? editors.setup.getValue() : "",
              typescript: scriptLang === "typescript",
            })
          : await runPython({
              formula,
              data,
              rows,
              mode: rowMode,
              setupSource: customSetup ? editors.setup.getValue() : "",
              onStatus: (text) => editors?.result.setValue(text),
            });
      editors.result.setValue(JSON.stringify(value, null, 2));
    } catch (error) {
      editors.result.setValue(formatError(error));
    } finally {
      running = false;
    }
  }

  onMount(() => {
    const stopBusy = subscribeAiBusy((count) => {
      aiBusy = count;
    });
    let cancelled = false;
    void (async () => {
      const { monaco } = await import("$lib/monaco-setup");
      monacoApi = monaco;
      if (cancelled || !formulaHost || !dataHost || !setupHost || !resultHost) return;
      const common = { minimap: { enabled: false }, fontSize: 13, automaticLayout: true, scrollBeyondLastLine: false };
      editors = {
        formula: monaco.editor.create(formulaHost, { ...common, value: "price * qty", language: "formula", fontSize: 14 }),
        data: monaco.editor.create(dataHost, { ...common, value: '{\n  "price": 9.99,\n  "qty": 3\n}\n', language: "json" }),
        setup: monaco.editor.create(setupHost, { ...common, value: SETUP_PLACEHOLDERS.javascript, language: "javascript" }),
        result: monaco.editor.create(resultHost, { ...common, value: "", language: "json", readOnly: true }),
      };
      const models = {
        formula: monaco.editor.createModel(editors.formula.getValue(), "formula", monaco.Uri.parse("inmemory://playground/formula")),
        data: monaco.editor.createModel(editors.data.getValue(), "json", monaco.Uri.parse("inmemory://playground/data")),
        setup: monaco.editor.createModel(editors.setup.getValue(), "javascript", monaco.Uri.parse("inmemory://playground/setup")),
        result: monaco.editor.createModel("", "json", monaco.Uri.parse("inmemory://playground/result")),
      };
      editors.formula.setModel(models.formula);
      editors.data.setModel(models.data);
      editors.setup.setModel(models.setup);
      editors.result.setModel(models.result);
      disposables = registerAiCompletions(monaco, () => (engine === "python" ? "python" : scriptLang));
      editors.formula.onDidChangeModelContent(updateHint);
      updateHint();
    })();
    return () => {
      cancelled = true;
      stopBusy();
    };
  });

  onDestroy(() => {
    for (const item of disposables) item.dispose();
    editors?.formula.dispose();
    editors?.data.dispose();
    editors?.setup.dispose();
    editors?.result.dispose();
  });

  function changeScriptLang(value: "javascript" | "typescript") {
    scriptLang = value;
    if (engine === "python") return;
    showSetup(value);
  }
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4">
  <div role="tablist" class="tabs tabs-box w-fit">
    <button type="button" role="tab" class="tab" class:tab-active={engine === "js"} onclick={() => setEngine("js")}>JavaScript / TypeScript</button>
    <button type="button" role="tab" class="tab" class:tab-active={engine === "python"} onclick={() => setEngine("python")}>Python</button>
  </div>

  <div class="flex flex-wrap items-end gap-3 rounded-box border border-base-300 bg-base-100 p-3">
    <label class="flex w-40 flex-col gap-1 text-xs">
      <span>Setup</span>
      <select class="select select-bordered select-sm" value={scriptLang} disabled={engine === "python"} onchange={(event) => changeScriptLang((event.currentTarget as HTMLSelectElement).value as "javascript" | "typescript")}>
        <option value="javascript">JavaScript</option>
        <option value="typescript">TypeScript</option>
      </select>
    </label>
    <label class="flex w-44 flex-col gap-1 text-xs">
      <span>Data</span>
      <select class="select select-bordered select-sm" bind:value={shape} onchange={updateHint}>
        <option value="record">Single record</option>
        <option value="rows">Array of records</option>
      </select>
    </label>
    {#if shape === "rows"}
      <label class="flex w-48 flex-col gap-1 text-xs">
        <span>Rows</span>
        <select class="select select-bordered select-sm" bind:value={rowMode} onchange={updateHint}>
          <option value="map">Calculate (map)</option>
          <option value="filter">Query (filter)</option>
          <option value="aggregate">Aggregate</option>
        </select>
      </label>
    {/if}
    <label class="label cursor-pointer gap-2 px-1 py-0">
      <input type="checkbox" class="toggle toggle-sm" checked={customSetup} onchange={(event) => toggleCustomSetup((event.currentTarget as HTMLInputElement).checked)} />
      <span>Custom setup</span>
    </label>
    <button type="button" class="btn btn-outline btn-sm" onclick={() => dataDialog?.showModal()}>Load test data</button>
    <label class="label cursor-pointer gap-2 px-1 py-0">
      <input type="checkbox" class="checkbox checkbox-sm" checked={aiOn} onchange={(event) => void toggleAi((event.currentTarget as HTMLInputElement).checked)} />
      <span>Chrome AI completion</span>
      {#if aiBusy > 0}
        <span class="loading loading-spinner loading-xs" role="status" aria-label="Fetching suggestions"></span>
      {/if}
    </label>
    {#if aiStatus}
      <span class="text-sm text-base-content/70">{aiStatus}</span>
    {/if}
  </div>

  <section class="overflow-hidden rounded-box border border-base-300 bg-base-100">
    <h2 class="border-b border-base-300 bg-base-200 px-3 py-2 text-sm font-medium">Formula</h2>
    <div class="editor-host" bind:this={formulaHost}></div>
  </section>

  <section class="overflow-hidden rounded-box border border-base-300 bg-base-100">
    <h2 class="border-b border-base-300 bg-base-200 px-3 py-2 text-sm font-medium">Test data (JSON)</h2>
    <div class="editor-host" bind:this={dataHost}></div>
  </section>

  <section class="overflow-hidden rounded-box border border-base-300 bg-base-100" class:hidden={!customSetup}>
    <h2 class="border-b border-base-300 bg-base-200 px-3 py-2 text-sm font-medium">Setup script</h2>
    <div class="editor-host" bind:this={setupHost}></div>
  </section>

  <div class="flex flex-wrap items-center gap-3">
    <button type="button" class="btn btn-primary btn-sm" disabled={running} onclick={() => void run()}>{running ? "Running…" : "Run"}</button>
    <p class="text-sm text-base-content/70">{hint}</p>
  </div>

  <section class="overflow-hidden rounded-box border border-base-300 bg-base-100">
    <h2 class="border-b border-base-300 bg-base-200 px-3 py-2 text-sm font-medium">Result</h2>
    <div class="editor-host" bind:this={resultHost}></div>
  </section>

  <p class="text-sm text-base-content/70">Custom setup is off until you turn it on. The script then runs in this page before the formula. It is not a sandbox. Python runs in Pyodide in the browser. Completions use Chrome’s on-device Prompt API and stay off until you enable them. The formula guide opens with Ctrl+Shift+K.</p>
</div>

<dialog class="modal" bind:this={dataDialog}>
  <div class="modal-box max-w-2xl">
    <h3 class="text-lg font-semibold">Load test data</h3>
    <p class="mt-1 text-sm text-base-content/70">Each example sets the data shape, the row mode, and the formula that matches them. Custom setup is loaded only when the example includes a script.</p>
    <ul class="mt-4 flex flex-col gap-2">
      {#each samples as sample (sample.id)}
        <li>
          <button type="button" class="flex w-full flex-col items-start gap-2 rounded-box border border-base-300 px-3 py-2 text-left hover:bg-base-200" onclick={() => applySample(sample)}>
            <span class="font-medium">{sample.title}</span>
            <span class="text-sm text-base-content/70">{sample.blurb}</span>
            <dl class="grid w-full grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 text-xs">
              <dt class="text-base-content/60">Data</dt>
              <dd>{sample.shape === "rows" ? "Array of records" : "Single record"}</dd>
              <dt class="text-base-content/60">Rows</dt>
              <dd>{sample.shape === "rows" ? rowModeLabel(sample.rowMode) : "Not used"}</dd>
              <dt class="text-base-content/60">Setup</dt>
              <dd>{sample.setup ? "Custom setup for JavaScript, TypeScript, and Python" : "None"}</dd>
              <dt class="text-base-content/60">Formula</dt>
              <dd><code>{sample.formula}</code></dd>
            </dl>
          </button>
        </li>
      {/each}
    </ul>
    <div class="modal-action">
      <form method="dialog"><button class="btn btn-ghost btn-sm">Close</button></form>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button type="submit">close</button></form>
</dialog>
