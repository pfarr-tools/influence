<template>
  <header class="app-header border-bottom">
    <div class="container py-3 d-flex align-items-center gap-3">
      <img alt="Influence" class="app-header__logo" src="/branding/logo-mark.svg" />
      <div>
        <h1 class="h4 mb-0">Influence</h1>
      </div>
      <details class="app-header__menu ms-auto">
        <summary class="btn btn-outline-secondary" aria-label="Navigation öffnen">
          <span class="app-header__hamburger" aria-hidden="true">☰</span>
          <span class="visually-hidden">Navigation</span>
        </summary>
        <nav class="card shadow-sm app-header__popover" aria-label="Hauptnavigation">
          <RouterLink class="dropdown-item" to="/">Wochenübersicht</RouterLink>
          <RouterLink class="dropdown-item" to="/publication-queue">Veröffentlichungswarteschlange</RouterLink>
        </nav>
      </details>
    </div>
  </header>
</template>

<style scoped>
.app-header__logo {
  height: 2.75rem;
  width: 2.75rem;
}

.app-header__menu { position: relative; }
.app-header__menu summary { list-style: none; }
.app-header__menu summary::-webkit-details-marker { display: none; }
.app-header__hamburger { font-size: 1.2rem; line-height: 1; }
.app-header__popover {
  min-width: 17rem;
  padding: .5rem;
  position: absolute;
  right: 0;
  top: calc(100% + .5rem);
  z-index: 10;
}
</style>
