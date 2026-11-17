import { createRouter, createWebHashHistory } from 'vue-router';
import { isLoggedIn } from './auth';
import DeckView from './views/DeckView.vue';
import LoginView from './views/LoginView.vue';
import SettingsView from './views/SettingsView.vue';
import StudyView from './views/StudyView.vue';

/*
 * Hash history so GitHub Pages needs no server rewrite rules. Everything except /login needs a login.
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    { path: '/', name: 'decks', component: DeckView },
    { path: '/study', name: 'study', component: StudyView },
    { path: '/settings', name: 'settings', component: SettingsView },
    { path: '/:rest(.*)*', redirect: '/' }
  ]
});

router.beforeEach((to) => {
  if (to.name === 'login') return isLoggedIn() ? { path: '/' } : true;
  return isLoggedIn() ? true : { name: 'login' };
});
