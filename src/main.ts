import '@mdi/font/css/materialdesignicons.css';
import { createApp } from 'vue';
import { createVuetify } from 'vuetify';
import 'vuetify/styles';
import App from './App.vue';
import { installTooltips } from './lib/tooltip';
import { router } from './router';
import './style.css';

/*
 * Fresh green theme: leaf-green buttons, deep forest-green panels, gold/orange accents, white rounded cards on a soft
 * green gradient. The gradient itself lives in style.css; `background` here is the fallback colour.
 */
const vuetify = createVuetify({
  icons: { defaultSet: 'mdi' },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          background: '#EAF6D3',
          surface: '#FFFCF0',
          'surface-variant': '#DCEFC0',
          primary: '#5DB82F', // leaf green: main buttons
          secondary: '#1F4D24', // forest green: dark panels
          success: '#3E9F2F',
          warning: '#F5A623', // orange / gold
          error: '#E5533D',
          info: '#3DA5D9',
          teal: '#2BB3A3',
          pink: '#E56B9B'
        }
      },
      dark: {
        dark: true,
        colors: {
          background: '#0E2312',
          surface: '#17361C',
          'surface-variant': '#245029',
          primary: '#7ED957',
          secondary: '#2E6B34',
          success: '#7ED957',
          warning: '#FFC247',
          error: '#FF7A66',
          info: '#6CC3EE',
          teal: '#55D6C6',
          pink: '#F58FB7'
        }
      }
    }
  },
  defaults: {
    VBtn: { rounded: 'pill' },
    VCard: { rounded: 'xl' },
    VChip: { rounded: 'pill' }
  }
});

createApp(App).use(vuetify).use(router).mount('#app');
installTooltips();
