<script lang="ts">
  import guideMd from "../../../../REFERENCE.md?raw";
  import { renderGuide } from "$lib/guide";

  let { onclose }: { onclose: () => void } = $props();
  const html = renderGuide(guideMd);
</script>

<div class="flex items-center justify-between gap-2 border-b border-base-300 px-4 py-3">
  <h2 class="text-base font-semibold">Formula guide</h2>
  <button type="button" class="btn btn-ghost btn-sm btn-square" aria-label="Close formula guide" onclick={onclose}>✕</button>
</div>
<article class="guide px-4 py-3">{@html html}</article>
