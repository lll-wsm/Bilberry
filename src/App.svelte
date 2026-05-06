<script lang="ts">
  import Layout from "./lib/Layout.svelte";
  import "./app.css";
</script>

<div class="app">
  <Layout />
</div>

<style>
  :global(html), :global(body) {
    background: transparent !important;
  }

  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  .app {
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-primary);
    border-radius: 10px;
    border: 1px solid var(--border-divider);
  }
</style>
