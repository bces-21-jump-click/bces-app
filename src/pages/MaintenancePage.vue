<script setup lang="ts"></script>

<template>
  <div class="maintenance-page">
    <div class="maintenance-card">
      <h1>C'est tout cassé !</h1>
      <h2>L'application est actuellement en maintenance.</h2>
      <div class="emoji">🔧</div>
      <p>
        Si tu vois cette page, c'est que l'application est en cours de mise à jour. Reviens plus
        tard !
      </p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.maintenance-page {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: var(--bg);
}
.maintenance-card {
  background: var(--card-bg, rgba(10, 22, 34, 0.72));
  border: 1px solid var(--card-border, rgba(198, 220, 237, 0.14));
  border-radius: 16px;
  padding: 3rem;
  max-width: 500px;
  text-align: center;
}
h1 {
  font-size: 2rem;
  color: var(--accent);
  margin-bottom: 0.5rem;
}
h2 {
  font-size: 1rem;
  color: var(--text-secondary);
  font-weight: 400;
}
.emoji {
  font-size: 6rem;
  margin: 2rem 0;
}
p {
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.5;
}
</style>
