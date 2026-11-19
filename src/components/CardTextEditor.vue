<script setup lang="ts">
/* A copy of the running study screen inside Settings (top buttons, the card, counter, tools), with sample data.
   Tap any text on it: its size / colour bar appears right under it and the screen changes at once. The flip button
   turns the card over to the back; the two chips switch furigana and the Vietnamese -> Japanese mode. */
import { computed, ref } from 'vue';
import { defaultCardStyles } from '../cardText';
import { settings } from '../settings';
import EdText from './EdText.vue';

const sel = ref<string | null>(null);
const back = ref(false);
const ruby = ref(false);
const reverse = ref(false);
const pick = (k: string): void => {
  sel.value = sel.value === k ? null : k;
};
const vi = (a: string, b: string): string => (settings.language === 'vi' ? a : b);
const word = computed(() => vi('Kanji chính (mặt trước và sau dùng chung)', 'Main kanji (front and back share it)'));
function resetAll(): void {
  settings.cardText = defaultCardStyles();
}
</script>

<template>
  <div class="ced" @click="sel = null">
    <p class="hint">{{ vi('Đây là bản sao màn hình học. Bấm vào một chữ để đổi cỡ và màu ngay tại chỗ.', 'This is a copy of the study screen. Tap any text to change its size and colour right there.') }}</p>

    <div class="chips" @click.stop>
      <button type="button" class="chip" :class="{ on: back }" @click="back = !back; sel = null"><v-icon icon="mdi-rotate-3d-variant" size="16" /> {{ back ? vi('Mặt sau', 'Back') : vi('Mặt trước', 'Front') }}</button>
      <button type="button" class="chip" :class="{ on: ruby }" :disabled="back || reverse" @click="ruby = !ruby; sel = null">{{ vi('Furigana', 'Furigana') }}</button>
      <button type="button" class="chip" :class="{ on: reverse }" :disabled="back" @click="reverse = !reverse; sel = null">{{ vi('Việt → Nhật', 'Vietnamese → Japanese') }}</button>
    </div>

    <!-- the screen: top buttons, then the card that fills it -->
    <div class="screen">
      <div class="top">
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
          <template v-else>
            <EdText k="hanviet" block :sel="sel" :name="vi('Hán Việt', 'Sino-Vietnamese')" class="bold sp mb4" @pick="pick">HƯƠNG</EdText>
            <EdText k="question" block :sel="sel" :name="vi('Nghĩa là câu hỏi (Việt → Nhật)', 'Question meaning (Vietnamese → Japanese)')" class="jp" @pick="pick">mùi thơm</EdText>
            <EdText k="english" block :sel="sel" :name="vi('Nghĩa tiếng Anh', 'English meaning')" class="it mt4" @pick="pick">scent; aroma</EdText>
            <div class="sep" />
            <EdText k="answerWord" block :sel="sel" :name="vi('Kanji đáp án (Việt → Nhật)', 'Answer kanji (Vietnamese → Japanese)')" class="jp bold lh" @pick="pick">香り</EdText>
            <EdText k="reading" block :sel="sel" :name="vi('Hiragana', 'Hiragana')" class="mt2" @pick="pick">かおり</EdText>
          </template>
        </div>

        <!-- BACK (details) -->
        <div v-else class="detail">
          <div class="back-head">
            <div class="bline">
              <span class="gbtn small"><v-icon icon="mdi-volume-high" size="16" /></span>
              <div class="bwcol">
                <EdText k="word" block :sel="sel" :name="word" align="left" class="jp bold lh" @pick="pick">香り</EdText>
                <EdText k="backReading" block :sel="sel" :name="vi('Mặt sau: hiragana', 'Back: hiragana')" align="left" @pick="pick">かおり</EdText>
              </div>
              <div class="bside">
                <EdText k="backHanviet" block :sel="sel" :name="vi('Mặt sau: Hán Việt', 'Back: Sino-Vietnamese')" align="left" class="bold sp" @pick="pick">HƯƠNG</EdText>
                <EdText k="backMeaning" block :sel="sel" :name="vi('Mặt sau: nghĩa tiếng Việt', 'Back: Vietnamese meaning')" align="left" class="semi" @pick="pick">mùi thơm</EdText>
              </div>
            </div>
          </div>

          <div class="item">
            <v-icon icon="mdi-ideogram-cjk" color="teal" />
            <div class="grow">
              <div><EdText k="label" :sel="sel" :name="vi('Nhãn mục (KANJI, VÍ DỤ…)', 'Section labels (KANJI, EXAMPLE…)')" align="left" class="lbl" @pick="pick">{{ vi('Hán Việt', 'Sino-Vietnamese') }}</EdText></div>
              <div class="krow">
                <EdText k="kanjiChar" :sel="sel" :name="vi('Từng chữ kanji', 'Each kanji')" align="left" class="jp kbox" @pick="pick">香</EdText>
                <EdText k="kanjiSound" :sel="sel" :name="vi('Từng kanji: Hán Việt', 'Each kanji: Sino-Vietnamese')" align="left" class="sp" @pick="pick">HƯƠNG</EdText>
                <EdText k="kanjiMeaning" :sel="sel" :name="vi('Từng kanji: nghĩa', 'Each kanji: meaning')" align="left" @pick="pick">hương, mùi thơm</EdText>
              </div>
            </div>
          </div>
          <div class="item">
            <v-icon icon="mdi-tag-outline" color="warning" />
            <div><EdText k="pos" :sel="sel" :name="vi('Loại từ', 'Part of speech')" align="left" @pick="pick">{{ vi('danh từ', 'noun') }}</EdText></div>
          </div>
          <div class="item">
            <v-icon icon="mdi-alphabetical-variant" color="info" />
            <div><EdText k="detailEnglish" :sel="sel" :name="vi('Mặt sau: nghĩa tiếng Anh', 'Back: English meaning')" align="left" class="it" @pick="pick">scent; aroma</EdText></div>
          </div>
          <div class="item">
            <v-icon icon="mdi-format-quote-open-outline" color="secondary" />
            <div>
              <div><EdText k="example" :sel="sel" :name="vi('Ví dụ tiếng Nhật', 'Japanese example')" align="left" class="jp" @pick="pick">いい香りがします。</EdText></div>
              <div><EdText k="exampleVi" :sel="sel" :name="vi('Ví dụ tiếng Việt', 'Vietnamese example')" align="left" class="it" @pick="pick">Có mùi thơm dễ chịu.</EdText></div>
            </div>
          </div>
          <div class="item">
            <v-icon icon="mdi-chart-line-variant" color="pink" />
            <div><EdText k="pitchLabel" :sel="sel" :name="vi('Chữ ghi giọng (pitch)', 'Pitch accent text')" align="left" @pick="pick">[0] heiban</EdText></div>
          </div>
          <div class="item">
            <v-icon icon="mdi-note-text-outline" color="secondary" />
            <div><EdText k="notes" :sel="sel" :name="vi('Ghi chú', 'Notes')" align="left" @pick="pick">{{ vi('Ghi chú mẫu cho từ này', 'Sample note for this word') }}</EdText></div>
          </div>
          <div class="item">
            <v-icon icon="mdi-link-variant" color="primary" />
            <div><EdText k="related" :sel="sel" :name="vi('Từ liên quan (liên kết)', 'Related words (link)')" align="left" class="bold ul" @pick="pick">匂い(におい)</EdText></div>
          </div>
        </div>

        <!-- bottom strip: eye (left), counter (centre), speaker (right) -->
        <div v-if="!back" class="tools">
          <span class="gbtn"><v-icon icon="mdi-eye-outline" size="18" /></span>
          <EdText k="counter" :sel="sel" :name="vi('Bộ đếm', 'Counter')" class="ctr" @pick="pick">1 / 706</EdText>
          <span class="gbtn"><v-icon icon="mdi-volume-high" size="18" /></span>
        </div>
      </div>
    </div>

    <div class="d-flex justify-center mt-3">
      <v-btn variant="tonal" color="primary" size="small" prepend-icon="mdi-restore" @click.stop="resetAll">{{ vi('Đặt lại tất cả về mặc định', 'Reset all texts to default') }}</v-btn>
    </div>
  </div>
</template>

<style scoped>
.ced {
  padding-bottom: 20px;
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
  justify-content: flex-end;
  gap: 8px;
  padding: 0 4px 8px;
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
  box-shadow: 0 3px 0 rgba(31, 77, 36, 0.35);
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
  font-style: italic;
  opacity: 0.85;
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
.krow {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}
.kbox {
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
