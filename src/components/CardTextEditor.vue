<script setup lang="ts">
/* A copy of the running study screen inside Settings (menu + top buttons, the card, Auto play button, eye / counter / speaker), with sample data.
   Tap any text on it: its size / colour / italic bar appears right under it and the screen changes at once; Save keeps the changes, Cancel drops them. The chips turn the card to
   the back (details), switch furigana (front and back) and the Vietnamese -> Japanese mode (question, then answer). */
import { computed, onBeforeUnmount, provide, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { CARD_DRAFT, cloneCardStyles, defaultCardStyles, sameCardStyles, type CardTextStyles } from '../cardText';
import { t } from '../i18n';
import { settings } from '../settings';
import EdText from './EdText.vue';
import PitchLine from './PitchLine.vue';

/* Draft: every EdText edits this copy, so the preview changes at once, but nothing is stored or sent until Save.
   `base` is what the settings hold now; the draft is "dirty" while it differs from it. */
const draft = reactive<CardTextStyles>(cloneCardStyles(settings.cardText));
provide(CARD_DRAFT, draft);
const base = ref<CardTextStyles>(cloneCardStyles(settings.cardText));
const dirty = computed(() => !sameCardStyles(draft, base.value));
function copyInto(target: CardTextStyles, source: CardTextStyles): void {
  for (const k of Object.keys(source)) target[k] = { ...source[k]! };
}
/* Settings changed from outside (pulled from the server, saved here): follow them, unless there are unsaved edits. */
watch(
  () => settings.cardText,
  (now) => {
    const clean = !dirty.value;
    base.value = cloneCardStyles(now);
    if (clean) copyInto(draft, base.value);
  },
  { deep: true }
);
function save(): void {
  settings.cardText = cloneCardStyles(draft); // one write to this device and one push to the server
  sel.value = null;
}
function cancel(): void {
  copyInto(draft, base.value);
  sel.value = null;
}
onBeforeRouteLeave(() => {
  if (!dirty.value) return true;
  return window.confirm(settings.language === 'vi' ? 'Có thay đổi chưa lưu. Rời đi và bỏ các thay đổi?' : 'You have unsaved changes. Leave and discard them?');
});

const sel = ref<string | null>(null);
const back = ref(false);
const ruby = ref(false);
const reverse = ref(false);
const answered = ref(false); // Vietnamese -> Japanese only: false = the question, true = after the card was turned (the answer)
/* Full screen: the sample covers the whole window and the card fills it, exactly the room the real study screen has. Esc leaves it. */
const full = ref(false);
const onKey = (e: KeyboardEvent): void => {
  if (e.key === 'Escape') full.value = false;
};
watch(full, (on) => {
  sel.value = null;
  document.body.style.overflow = on ? 'hidden' : '';
  if (on) window.addEventListener('keydown', onKey);
  else window.removeEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.body.style.overflow = '';
  window.removeEventListener('keydown', onKey);
});
/* The four marks of the eye button, in the colours of the real one (lit = shown on the card). */
const marks = computed(() => [
  { key: 'reading', glyph: 'あ', on: settings.showReading },
  { key: 'meaning', glyph: 'V', on: settings.showMeaning },
  { key: 'english', glyph: 'E', on: settings.showEnglish },
  { key: 'hanviet', glyph: '漢', on: settings.showHanViet }
]);
/* 香り (かおり), pitch [0] heiban: the sample's pitch line. */
const morae = [
  { text: 'か', high: false, dropAfter: false, stepAfter: true },
  { text: 'お', high: true, dropAfter: false, stepAfter: false },
  { text: 'り', high: true, dropAfter: false, stepAfter: false }
];
const pick = (k: string): void => {
  sel.value = sel.value === k ? null : k;
};
const vi = (a: string, b: string): string => (settings.language === 'vi' ? a : b);
const word = computed(() => vi('Kanji chính (mặt trước và sau dùng chung)', 'Main kanji (front and back share it)'));
const labelName = computed(() => vi('Nhãn mục (KANJI, VÍ DỤ…): chung một kiểu', 'Section labels (KANJI, EXAMPLE…): one shared style'));
function resetAll(): void {
  copyInto(draft, defaultCardStyles()); // only the draft: Save keeps it
}
</script>

<template>
  <div class="ced" :class="{ full }" @click="sel = null">
    <p v-if="!full" class="hint">{{ vi('Đây là bản sao màn hình học. Bấm vào một chữ để đổi cỡ, màu, kiểu nghiêng ngay tại chỗ. Chỉnh xong bấm Lưu.', 'This is a copy of the study screen. Tap any text to change its size, colour and italic right there. Press Save when you are done.') }}</p>

    <div class="chips" @click.stop>
      <button type="button" class="chip" :class="{ on: back }" @click="back = !back; sel = null"><v-icon icon="mdi-rotate-3d-variant" size="16" /> {{ back ? vi('Mặt sau', 'Back') : vi('Mặt trước', 'Front') }}</button>
      <!-- furigana shows on the back too; on the front only in the Japanese -> Vietnamese direction -->
      <button type="button" class="chip" :class="{ on: ruby }" :disabled="!back && reverse" @click="ruby = !ruby; sel = null">{{ vi('Furigana', 'Furigana') }}</button>
      <button type="button" class="chip" :class="{ on: reverse }" :disabled="back" @click="reverse = !reverse; answered = false; sel = null">{{ vi('Việt → Nhật', 'Vietnamese → Japanese') }}</button>
      <!-- Vietnamese -> Japanese: the question first, the answer (Japanese word) once the card is turned -->
      <button v-if="reverse && !back" type="button" class="chip" :class="{ on: answered }" @click="answered = !answered; sel = null">{{ answered ? vi('Đáp án', 'Answer') : vi('Câu hỏi', 'Question') }}</button>
      <!-- full screen: the sample as big as the real study screen (Esc or the same button to leave) -->
      <button type="button" class="chip fullbtn" :class="{ on: full }" :aria-pressed="full" @click="full = !full">
        <v-icon :icon="full ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'" size="16" /> {{ full ? vi('Thu nhỏ', 'Exit full screen') : vi('Toàn màn hình', 'Full screen') }}
      </button>
      <button v-if="full" type="button" class="chip" @click="resetAll"><v-icon icon="mdi-restore" size="16" /> {{ vi('Đặt lại tất cả', 'Reset all') }}</button>
      <!-- Save writes the draft to the settings (and the server) once; Cancel drops the edits -->
      <button type="button" class="chip save" :class="{ on: dirty }" :disabled="!dirty" @click="save"><v-icon icon="mdi-content-save-outline" size="16" /> {{ vi('Lưu', 'Save') }}</button>
      <button type="button" class="chip cancel" :disabled="!dirty" @click="cancel"><v-icon icon="mdi-close" size="16" /> {{ vi('Hủy', 'Cancel') }}</button>
    </div>

    <!-- the screen: menu and the four buttons of the top bar, then the card that fills it -->
    <div class="screen">
      <div class="top">
        <span class="gbtn"><v-icon icon="mdi-menu" size="18" /></span>
        <span class="spacer" />
        <span class="gbtn"><v-icon icon="mdi-help-circle-outline" size="18" /></span>
        <span class="gbtn"><v-icon icon="mdi-check" size="18" /></span>
        <span class="gbtn"><v-icon icon="mdi-skip-next-outline" size="18" /></span>
        <span class="gbtn"><v-icon icon="mdi-format-list-bulleted" size="18" /></span>
      </div>

      <div class="pcard">
        <!-- FRONT -->
        <div v-if="!back" class="word-area">
          <template v-if="!reverse">
            <span v-if="ruby" class="rb">
              <span class="cellr"><EdText k="furigana" :sel="sel" :name="vi('Furigana', 'Furigana')" @pick="pick">か</EdText><EdText k="wordRuby" :sel="sel" :name="vi('Kanji chính (có furigana)', 'Main kanji (with furigana)')" class="jp bold" @pick="pick">香</EdText></span>
              <span class="cellr"><EdText k="furigana" nobar :sel="sel" :name="vi('Furigana', 'Furigana')" @pick="pick">&nbsp;</EdText><EdText k="wordRuby" nobar :sel="sel" :name="vi('Kanji chính (có furigana)', 'Main kanji (with furigana)')" class="jp bold" @pick="pick">り</EdText></span>
            </span>
            <template v-else>
              <EdText k="word" block :sel="sel" :name="word" class="jp bold lh" @pick="pick">香り</EdText>
              <EdText k="reading" block :sel="sel" :name="vi('Hiragana', 'Hiragana')" class="mt2" @pick="pick">かおり</EdText>
            </template>
            <div class="sep" />
            <EdText k="hanviet" block :sel="sel" :name="vi('Hán Việt', 'Sino-Vietnamese')" class="bold sp mb4" @pick="pick">HƯƠNG</EdText>
            <EdText k="meaning" block :sel="sel" :name="vi('Nghĩa tiếng Việt', 'Vietnamese meaning')" class="med" @pick="pick">mùi thơm</EdText>
            <EdText k="english" block :sel="sel" :name="vi('Nghĩa tiếng Anh', 'English meaning')" class="it mt4" @pick="pick">scent; aroma</EdText>
          </template>
          <!-- Vietnamese -> Japanese: the meaning is the question (its own size); once the card is turned it takes the normal meaning style and the Japanese word appears -->
          <template v-else>
            <EdText k="hanviet" block :sel="sel" :name="vi('Hán Việt', 'Sino-Vietnamese')" class="bold sp mb4" @pick="pick">HƯƠNG</EdText>
            <EdText v-if="!answered" k="question" block :sel="sel" :name="vi('Nghĩa là câu hỏi (Việt → Nhật)', 'Question meaning (Vietnamese → Japanese)')" class="jp" @pick="pick">mùi thơm</EdText>
            <EdText v-else k="meaning" block :sel="sel" :name="vi('Nghĩa tiếng Việt', 'Vietnamese meaning')" class="med" @pick="pick">mùi thơm</EdText>
            <EdText k="english" block :sel="sel" :name="vi('Nghĩa tiếng Anh', 'English meaning')" class="it mt4" @pick="pick">scent; aroma</EdText>
            <template v-if="answered">
              <div class="sep" />
              <EdText k="answerWord" block :sel="sel" :name="vi('Kanji đáp án (Việt → Nhật)', 'Answer kanji (Vietnamese → Japanese)')" class="jp bold lh" @pick="pick">香り</EdText>
              <EdText k="reading" block :sel="sel" :name="vi('Hiragana', 'Hiragana')" class="mt2" @pick="pick">かおり</EdText>
            </template>
          </template>
          <!-- the Auto play button under the last line of the card -->
          <span class="abtn"><v-icon icon="mdi-play" size="14" /></span>
        </div>

        <!-- BACK (details) -->
        <div v-else class="detail">
          <div class="back-head">
            <div class="bline">
              <span class="gbtn small"><v-icon icon="mdi-volume-high" size="16" /></span>
              <div class="bwcol">
                <!-- a card with furigana shows them on the back too (then the reading line is not shown) -->
                <span v-if="ruby" class="rb">
                  <span class="cellr"><EdText k="furigana" :sel="sel" :name="vi('Furigana', 'Furigana')" align="left" @pick="pick">か</EdText><EdText k="wordRuby" :sel="sel" :name="vi('Kanji chính (có furigana)', 'Main kanji (with furigana)')" align="left" class="jp bold" @pick="pick">香</EdText></span>
                  <span class="cellr"><EdText k="furigana" nobar :sel="sel" :name="vi('Furigana', 'Furigana')" @pick="pick">&nbsp;</EdText><EdText k="wordRuby" nobar :sel="sel" :name="vi('Kanji chính (có furigana)', 'Main kanji (with furigana)')" class="jp bold" @pick="pick">り</EdText></span>
                </span>
                <template v-else>
                  <EdText k="word" block :sel="sel" :name="word" align="left" class="jp bold lh" @pick="pick">香り</EdText>
                  <EdText k="backReading" block :sel="sel" :name="vi('Mặt sau: hiragana', 'Back: hiragana')" align="left" @pick="pick">かおり</EdText>
                </template>
              </div>
              <div class="bside">
                <EdText k="backHanviet" block :sel="sel" :name="vi('Mặt sau: Hán Việt', 'Back: Sino-Vietnamese')" align="left" class="bold sp" @pick="pick">HƯƠNG</EdText>
                <EdText k="backMeaning" block :sel="sel" :name="vi('Mặt sau: nghĩa tiếng Việt', 'Back: Vietnamese meaning')" align="left" class="semi" @pick="pick">mùi thơm</EdText>
              </div>
            </div>
          </div>

          <!-- every section has its small label, like the real Details; all labels share one style (the first one carries the size / colour bar) -->
          <div class="item">
            <v-icon icon="mdi-ideogram-cjk" color="teal" />
            <div class="grow">
              <EdText k="label" block :sel="sel" :name="labelName" align="left" class="lbl" @pick="pick">{{ t('detail.sinoViet') }}</EdText>
              <!-- one row per kanji, in aligned columns: kanji | Sino-Vietnamese sound | meaning -->
              <div class="hvpairs">
                <div class="hvp">
                  <EdText k="kanjiChar" :sel="sel" :name="vi('Từng chữ kanji', 'Each kanji')" align="left" class="jp kbox" @pick="pick">香</EdText>
                  <EdText k="kanjiSound" :sel="sel" :name="vi('Từng kanji: Hán Việt', 'Each kanji: Sino-Vietnamese')" align="left" class="sp" @pick="pick">HƯƠNG</EdText>
                  <EdText k="kanjiMeaning" :sel="sel" :name="vi('Từng kanji: nghĩa', 'Each kanji: meaning')" align="left" class="hm" @pick="pick">hương, mùi thơm</EdText>
                </div>
              </div>
            </div>
          </div>
          <div class="item">
            <v-icon icon="mdi-tag-outline" color="warning" />
            <div>
              <EdText k="label" block nobar :sel="sel" :name="labelName" align="left" class="lbl" @pick="pick">{{ t('detail.pos') }}</EdText>
              <EdText k="pos" :sel="sel" :name="vi('Loại từ', 'Part of speech')" align="left" @pick="pick">{{ vi('danh từ', 'noun') }}</EdText>
            </div>
          </div>
          <div class="item">
            <v-icon icon="mdi-alphabetical-variant" color="info" />
            <div>
              <EdText k="label" block nobar :sel="sel" :name="labelName" align="left" class="lbl" @pick="pick">English</EdText>
              <EdText k="detailEnglish" :sel="sel" :name="vi('Mặt sau: nghĩa tiếng Anh', 'Back: English meaning')" align="left" class="it" @pick="pick">scent; aroma</EdText>
            </div>
          </div>
          <div class="item">
            <v-icon icon="mdi-format-quote-open-outline" color="secondary" />
            <div class="grow">
              <EdText k="label" block nobar :sel="sel" :name="labelName" align="left" class="lbl" @pick="pick">{{ t('detail.example') }}</EdText>
              <div><EdText k="example" :sel="sel" :name="vi('Ví dụ tiếng Nhật', 'Japanese example')" align="left" class="jp" @pick="pick">いい香りがします。</EdText></div>
              <div><EdText k="exampleVi" :sel="sel" :name="vi('Ví dụ tiếng Việt', 'Vietnamese example')" align="left" class="it" @pick="pick">Có mùi thơm dễ chịu.</EdText></div>
            </div>
          </div>
          <div class="item">
            <v-icon icon="mdi-chart-line-variant" color="pink" />
            <div>
              <EdText k="label" block nobar :sel="sel" :name="labelName" align="left" class="lbl" @pick="pick">{{ t('detail.pitch') }}</EdText>
              <PitchLine :morae="morae" />
              <EdText k="pitchLabel" :sel="sel" :name="vi('Chữ ghi giọng (pitch)', 'Pitch accent text')" align="left" class="ml" @pick="pick">[0] heiban</EdText>
            </div>
          </div>
          <div class="item">
            <v-icon icon="mdi-note-text-outline" color="secondary" />
            <div class="grow">
              <EdText k="label" block nobar :sel="sel" :name="labelName" align="left" class="lbl" @pick="pick">{{ t('detail.notes') }}</EdText>
              <EdText k="notes" block :sel="sel" :name="vi('Ghi chú', 'Notes')" align="left" @pick="pick">{{ vi('Ghi chú mẫu cho từ này', 'Sample note for this word') }}</EdText>
            </div>
          </div>
          <div class="item">
            <v-icon icon="mdi-link-variant" color="primary" />
            <div class="grow">
              <EdText k="label" block nobar :sel="sel" :name="labelName" align="left" class="lbl" @pick="pick">{{ t('detail.related') }}</EdText>
              <div>
                <EdText k="related" :sel="sel" :name="vi('Từ liên quan (liên kết)', 'Related words (link)')" align="left" class="bold ul" @pick="pick">匂い(におい)</EdText>
                <EdText k="notes" nobar :sel="sel" :name="vi('Ghi chú', 'Notes')" align="left" @pick="pick"> = {{ vi('mùi', 'smell') }}</EdText>
              </div>
            </div>
          </div>
        </div>

        <!-- bottom strip: the eye button (left; its four marks are the Hiragana / Vietnamese / English / Hán Việt switches), counter (centre), speaker (right) -->
        <div v-if="!back" class="tools">
          <span class="gbtn eye4"><span class="marks"><span v-for="m in marks" :key="m.key" class="mk" :class="['k-' + m.key, { on: m.on }]">{{ m.glyph }}</span></span></span>
          <EdText k="counter" :sel="sel" :name="vi('Bộ đếm', 'Counter')" class="ctr" @pick="pick">1 / 706</EdText>
          <span class="gbtn"><v-icon icon="mdi-volume-high" size="18" /></span>
        </div>
      </div>
    </div>

    <div v-if="!full" class="d-flex justify-center mt-3">
      <v-btn variant="tonal" color="primary" size="small" prepend-icon="mdi-restore" @click.stop="resetAll">{{ vi('Đặt lại tất cả về mặc định', 'Reset all texts to default') }}</v-btn>
    </div>
  </div>
</template>

<style scoped>
.ced {
  padding-bottom: 20px;
}
/* Full screen: over everything (app bar, menu), the card takes all the room that is left, like the real study screen. */
.ced.full {
  position: fixed;
  inset: 0;
  z-index: 2400;
  display: flex;
  flex-direction: column;
  padding: 0;
  background: var(--page);
  overflow: hidden;
}
/* The chips become one slim toolbar above the screen (one line, scrolls sideways on a narrow window); everything under it is the study screen. */
.ced.full .chips {
  flex: none;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  height: 44px;
  margin: 0;
  padding: 0 8px;
  overflow-x: auto;
  scrollbar-width: none;
  background: var(--paper);
  border-bottom: 1px solid var(--paper-edge);
  box-shadow: 0 2px 6px rgba(31, 77, 36, 0.12);
}
.ced.full .chips::-webkit-scrollbar {
  display: none;
}
.ced.full .chip {
  flex: none;
  white-space: nowrap;
}
.ced.full .fullbtn {
  order: -3; /* the way out comes first, so it is always in reach */
  margin-left: 0;
}
.ced.full .save {
  order: -2; /* then Save and Cancel */
}
.ced.full .cancel {
  order: -1;
}
.ced.full .screen {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 6px 4px 4px; /* like the real stage: thin margins left, right and bottom */
  border-radius: 0;
}
.ced.full .pcard {
  flex: 1;
  min-height: 0;
}
.ced.full .detail {
  overflow-y: auto;
  min-height: 0;
}
.fullbtn {
  margin-left: auto;
}
.hint {
  margin: 0 0 8px;
  font-size: 0.8rem;
  opacity: 0.8;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border: 1px solid var(--paper-edge);
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}
.chip.on {
  background: rgb(var(--v-theme-primary));
  border-color: transparent;
  color: #fff;
}
.chip:disabled {
  opacity: 0.4;
  cursor: default;
}
.screen {
  padding: 8px 6px 6px;
  border-radius: 18px;
  background: var(--page);
}
.top {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px 8px;
}
.spacer {
  flex: 1;
}
.gbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 34px;
  border-radius: 999px;
  background: rgb(var(--v-theme-primary));
  color: #fff;
  box-shadow: 0 4px 0 #3f8a1f; /* the pressed-in edge of the real buttons */
}
/* The Auto play button under the last line of the card. */
.abtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  min-width: 32px;
  padding: 0 8px;
  margin-top: 12px;
  border-radius: 999px;
  background: rgb(var(--v-theme-primary));
  color: #fff;
  box-shadow: 0 3px 0 #3f8a1f;
}
/* The eye button: its four marks are the Hiragana / Vietnamese / English / Hán Việt switches (lit = shown on the card, faded = hidden). */
.marks {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  justify-items: center;
  width: 24px;
  height: 20px;
  line-height: 1;
}
.mk {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 11px;
  height: 10px;
  padding: 0 1px;
  border-radius: 5px;
  font-family: var(--font-jp);
  font-size: 0.5rem;
  font-weight: 700;
  letter-spacing: -0.04em;
  color: #fff;
  background: var(--oc, #3f8a1f);
  opacity: 0.45;
}
.mk.on {
  opacity: 1;
  font-weight: 900;
}
.mk.k-meaning {
  --oc: #ef8a17;
}
.mk.k-english {
  --oc: #2f80d1;
}
.mk.k-hanviet {
  --oc: #8e4ec6;
}
.gbtn.small {
  width: 30px;
  height: 26px;
  flex: none;
}
.pcard {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 460px;
  border: 1px solid var(--paper-edge);
  border-radius: 24px;
  background: var(--paper);
}
.word-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 8px 14px 60px;
}
.detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px 20px;
  text-align: left;
}
.back-head {
  padding-bottom: 10px;
  border-bottom: 1px solid var(--paper-edge);
}
.bwcol {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.bside {
  flex: 1 1 120px;
  min-width: 0;
}
.bline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
}
.item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 0.92rem;
  min-width: 0;
}
.grow {
  flex: 1;
  min-width: 0;
}
.tools {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ctr {
  font-weight: 700;
}
.bold {
  font-weight: 700;
}
.semi {
  font-weight: 600;
}
.med {
  font-weight: 500;
  line-height: 1.4;
}
.it {
  opacity: 0.85; /* italic or not is the user's setting (EdText sets it) */
}
.sp {
  letter-spacing: 0.1em;
}
.ul {
  text-decoration: underline;
}
.lh {
  line-height: 1.2;
}
.mt2 {
  margin-top: 2px;
}
.mt4 {
  margin-top: 4px;
}
.mb4 {
  margin-bottom: 4px;
}
.lbl {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.sep {
  width: 34px;
  height: 1px;
  background: var(--gold);
  margin: 16px 0;
}
/* one kanji per row, in three aligned columns: kanji | Sino-Viet sound | meaning */
.hvpairs {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  column-gap: 10px;
  row-gap: 6px;
  align-items: baseline;
}
.hvp {
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
  align-items: center;
}
.hm {
  opacity: 0.85;
}
.ml {
  margin-left: 8px;
}
.kbox {
  min-width: 42px;
  text-align: center;
  padding: 2px 8px;
  border: 1px solid var(--paper-edge);
  border-radius: 6px;
  background: rgb(var(--v-theme-surface));
}
.rb {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
}
.cellr {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
}
</style>
