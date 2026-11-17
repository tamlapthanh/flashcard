import { createRouter, createWebHashHistory } from 'vue-router';
import DeckView from './views/DeckView.vue';
import SettingsView from './views/SettingsView.vue';
import StudyView from './views/StudyView.vue';

/*
 * Hash history so GitHub Pages needs no server rewrite rules. When a login screen exists, add a '/login' route
 * and a beforeEach guard here; nothing else has to change.
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'decks', component: DeckView },
    { path: '/study', name: 'study', component: StudyView },
    { path: '/settings', name: 'settings', component: SettingsView },
    { path: '/:rest(.*)*', redirect: '/' }
  ]
});
