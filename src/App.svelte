<script lang="ts">
  import Layout from "./lib/Layout.svelte";
  import { theme } from "./stores/theme";

  theme.subscribe((t) => {
    document.documentElement.classList.toggle("dark", t === "dark");
  });
</script>

<div class="app">
  <Layout />
</div>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica,
      Arial, sans-serif;
    overflow: hidden;
    height: 100vh;
  }

  :global(.dark) {
    color-scheme: dark;
  }

  .app {
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
</style>
