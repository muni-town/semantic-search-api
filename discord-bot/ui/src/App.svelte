<script lang="ts">
  import { onMount } from "svelte";

  let searching = $state(false);
  let noMoreToLoad = $state(false);

  let searchPhrase = $state("");

  const toggles = $state([
    ["Keyword", true],
    ["Semantic", true],
    ["Filter", false],
  ]) as [string, boolean][];

  let config = $state({ searchEndpoint: "" });
  onMount(async () => {
    config = await (await fetch("/config.json")).json();
  });

  let lastSearch = $state.raw(undefined) as
    | undefined
    | { keyword: boolean; semantic: boolean; filter: boolean; phrase: string };

  type SearchResult = {
    score: number;
    channelId: string;
    messageId: string;
    guildId: string;
    content: string;
    author: string;
    link: string;
  };

  let results: SearchResult[] = $state.raw([]);

  async function submit(e: SubmitEvent) {
    e.preventDefault();

    searching = true;
    noMoreToLoad = false;

    lastSearch = {
      keyword: toggles[0][1],
      semantic: toggles[1][1],
      filter: toggles[2][1],
      phrase: searchPhrase,
    };

    const resp = await fetch(
      `${config.searchEndpoint}/search?bm25=${lastSearch.keyword}&dense=${lastSearch.semantic}&filter=${lastSearch.filter}`,
      {
        method: "post",
        body: searchPhrase,
      }
    );

    results = await resp.json();

    searching = false;
  }

  async function loadMore() {
    if (!lastSearch) return;
    const resp = await fetch(
      `${config.searchEndpoint}/search?bm25=${lastSearch.keyword}&dense=${lastSearch.semantic}&filter=${lastSearch.filter}&offset=${results.length}`,
      {
        method: "post",
        body: searchPhrase,
      }
    );

    const newResults: typeof results = await resp.json();

    if (newResults.length > 0) {
      results = [...results, ...newResults];
    } else {
      noMoreToLoad = true;
    }
  }
</script>

<header class="bg-slate-800 p-3 shadow-md">
  <h1 class="text-xl font-bold">Discord Searcher</h1>
</header>

<div>
  <div class="flex flex-col items-center pt-12 px-10 gap-10">
    <form class="flex flex-col gap-4 w-full max-w-[70em]" onsubmit={submit}>
      <div class="flex gap-8 justify-center">
        {#each toggles as _toggle, i}
          <label class="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              value=""
              class="sr-only peer"
              bind:checked={toggles[i][1] as boolean}
            />
            <div
              class="relative w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 dark:peer-checked:bg-blue-600"
            ></div>
            <span
              class="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300"
              >{toggles[i][0]}</span
            >
          </label>
        {/each}
      </div>
      <div class="flex w-full justify-center gap-3">
        <input
          class="bg-slate-700 p-2 text-3xl w-full max-w-[40em]"
          placeholder="Search phrase..."
          bind:value={searchPhrase}
        />
        <button class="bg-green-700 rounded-xl px-3 text-xl">Search</button>
      </div>
    </form>

    <div class="flex flex-col gap-2 p-10 max-w-[50em] items-center w-full">
      {#if searching}
        <svg
          fill="#f0f0f0"
          class="animate-spin w-30"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
          ><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g
            id="SVGRepo_tracerCarrier"
            stroke-linecap="round"
            stroke-linejoin="round"
          ></g><g id="SVGRepo_iconCarrier">
            <g> <path d="M10,1V3a7,7,0,1,1-7,7H1a9,9,0,1,0,9-9Z"></path> </g>
          </g></svg
        >
      {:else}
        {#each results as result}
          <div class="p-2 bg-gray-800 w-full">
            <a href={result.link} target="_blank"
              ><span class="text-blue-400">@{result.author}</span>: {result.content}</a
            >
          </div>
        {/each}
        {#if results.length > 0 && !noMoreToLoad}
          <button
            class="bg-gray-700 px-3 py-2 rounded-md hover:bg-gray-600 shadow-md mt-3"
            onclick={loadMore}>Load More</button
          >
        {/if}
      {/if}
    </div>
  </div>
</div>
