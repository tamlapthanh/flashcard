import { createRouter, createWebHashHistory } from 'vue-router';
import { isLoggedIn } from './auth';
import AllResultsView from './views/AllResultsView.vue';
import DeckView from './views/DeckView.vue';
import LoginView from './views/LoginView.vue';
import NewPaperView from './views/NewPaperView.vue';
import ResultsView from './views/ResultsView.vue';
import SettingsView from './views/SettingsView.vue';
import StudyLoadView from './views/StudyLoadView.vue';
import TestHistoryView from './views/TestHistoryView.vue';
import TestView from './views/TestView.vue';

/*
 * Hash history so GitHub Pages needs no server rewrite rules. Everything except /login needs a login.
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    { path: '/', name: 'decks', component: DeckView },
    { path: '/study', name: 'study', component: StudyLoadView },
    { path: '/test', name: 'test', component: TestView },
    { path: '/tests', name: 'tests', component: TestHistoryView },
    { path: '/tests/new', name: 'tests-new', component: NewPaperView },
    { path: '/tests/results', name: 'tests-all-results', component: AllResultsView },
    { path: '/tests/results/:id', name: 'tests-results', component: ResultsView },
    { path: '/papers', redirect: '/tests' }, // the old list of assigned tests, now part of the Tests screen
    { path: '/manage', redirect: '/tests' },
    { path: '/results', redirect: '/tests' },
    { path: '/settings', name: 'settings', component: SettingsView },
    { path: '/:rest(.*)*', redirect: '/' }
  ]
});

router.beforeEach((to) => {
  if (to.name === 'login') return isLoggedIn() ? { path: '/' } : true;
  return isLoggedIn() ? true : { name: 'login' };
});
