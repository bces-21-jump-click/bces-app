<script setup lang="ts">
import { useRoute } from 'vue-router'
import NavigationDrawer from '@/components/NavigationDrawer.vue'

const route = useRoute()
const hideNav = () => route.name === 'connexion' || route.name === 'maintenance'
</script>

<template>
  <NavigationDrawer v-if="!hideNav()" />
  <main class="app-content">
    <RouterView />
  </main>
</template>

<style lang="scss">
@use '@/assets/styles/main.scss';
@import '@fortawesome/fontawesome-free/css/all.min.css';

#app {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
  isolation: isolate;
}

.app-content {
  flex: 1;
  overflow: auto;
  background: linear-gradient(180deg, var(--app-top-sheen) 0%, transparent 28%), var(--bg);
  animation: appReveal 0.28s ease-out;
}

[data-theme='light'] .app-content {
  background:
    radial-gradient(circle at 0% 0%, rgba(15, 118, 110, 0.14), transparent 34%),
    radial-gradient(circle at 100% 0%, rgba(153, 99, 0, 0.1), transparent 34%),
    linear-gradient(
      180deg,
      rgba(255, 252, 245, 0.8) 0%,
      rgba(248, 241, 230, 0.56) 18%,
      transparent 48%
    ),
    var(--bg);
}

@keyframes appReveal {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
