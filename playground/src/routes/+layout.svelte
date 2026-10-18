<script lang="ts">
  import { base } from "$app/paths";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import GuidePanel from "$lib/components/GuidePanel.svelte";
  import "../app.css";

  let { children } = $props();
  const home = base ? `${base}/` : "/";
  let guideOpen = $state(false);
  let wide = $state(false);

  function toggleGuide() {
    guideOpen = !guideOpen;
    queueMicrotask(() => window.dispatchEvent(new Event("resize")));
  }

  function closeGuide() {
    guideOpen = false;
    queueMicrotask(() => window.dispatchEvent(new Event("resize")));
  }

  $effect(() => {
    if (page.url.pathname.endsWith("/guide") || page.url.pathname.endsWith("/guide/")) guideOpen = true;
  });

  onMount(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      wide = query.matches;
    };
    apply();
    query.addEventListener("change", apply);
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopPropagation();
        toggleGuide();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      query.removeEventListener("change", apply);
      window.removeEventListener("keydown", onKey, true);
    };
  });
</script>

<div class="flex min-h-screen bg-base-200 text-base-content">
  <div class="flex min-w-0 flex-1 flex-col">
    <header class="navbar border-b border-base-300 bg-base-100 px-4">
      <div class="flex flex-1 flex-wrap items-center gap-3">
        <a class="text-base font-semibold" href={home}>Excel formula playground</a>
        <span class="badge badge-ghost">spec 0.8.0 · frontend only</span>
      </div>
      <button
        type="button"
        class="btn btn-ghost btn-sm gap-2"
        class:btn-active={guideOpen}
        aria-pressed={guideOpen}
        aria-keyshortcuts="Control+Shift+K"
        aria-label="Formula guide"
        onclick={toggleGuide}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.7.3-1.2.9-1.2 1.6V14"></path>
          <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"></circle>
        </svg>
        Guide
        <kbd class="kbd kbd-xs hidden sm:inline-flex">Ctrl</kbd>
        <kbd class="kbd kbd-xs hidden sm:inline-flex">Shift</kbd>
        <kbd class="kbd kbd-xs hidden sm:inline-flex">K</kbd>
      </button>
    </header>
    {@render children()}
  </div>

  {#if guideOpen && wide}
    <aside class="sticky top-0 hidden h-screen w-[min(36rem,42vw)] shrink-0 overflow-y-auto border-l border-base-300 bg-base-100 lg:block">
      <GuidePanel onclose={closeGuide} />
    </aside>
  {/if}
</div>

{#if guideOpen && !wide}
  <dialog class="modal modal-open" aria-label="Formula guide">
    <div class="modal-box max-h-[85vh] max-w-3xl overflow-y-auto p-0">
      <GuidePanel onclose={closeGuide} />
    </div>
    <form method="dialog" class="modal-backdrop">
      <button type="button" onclick={closeGuide}>close</button>
    </form>
  </dialog>
{/if}
