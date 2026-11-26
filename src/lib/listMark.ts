/* The square last clicked in the word list (it keeps another background so you can see where you got to). It is kept per list (per study run / per
   deck list), not inside the list component: opening the search box, a filter, closing and opening the list again, or the component being
   built again all leave it as it is. Only clicking another word or moving the mouse over another square changes it. */
import { ref, type Ref } from 'vue';

const marks = new WeakMap<object, Ref<string | null>>();

export function markOf(session: object): Ref<string | null> {
  let mark = marks.get(session);
  if (!mark) {
    mark = ref<string | null>(null);
    marks.set(session, mark);
  }
  return mark;
}
