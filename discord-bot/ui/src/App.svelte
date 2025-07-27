<script lang="ts">
  let searching = $state(false);

  function submit(e: SubmitEvent) {
    e.preventDefault();

    searching = true;
  }
</script>

<header class="bg-slate-800 p-3 shadow-md">
  <h1 class="text-xl font-bold">Discord Searcher</h1>
</header>

<main class="flex flex-col items-center pt-12 px-10 gap-10">
  <form class="flex w-full justify-center gap-3" onsubmit={submit}>
    <input
      class="bg-slate-700 p-2 text-3xl w-full max-w-[40em]"
      placeholder="Search phrase..."
    />
    <button class="bg-green-700 rounded-xl px-3 text-xl">Search</button>
  </form>

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
  {/if}
</main>
