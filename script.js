/*
 * Copyright © 2023-2026 bakajikara
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

// 入力された歌詞文字列を音符1つ分に割り当てる単位の配列に分割
function splitLyrics(lyrics) {
  const combineRules = [
    { previous: /[a-zA-Z'ａ-ｚＡ-Ｚ＇]/, current: /[a-zA-Z'ａ-ｚＡ-Ｚ＇]/ }, // 英単語の結合
    // { previous: /[\p{Ll}\p{Lt}\p{Lu}]/u , current: /[\p{Ll}\p{Lt}\p{Lu}]/u }, // 小文字と大文字の結合
    { previous: /[ぁ-ゟ]/, current: /[ぁぃぅぇぉゃゅょゎゕゖ]/ }, // 小書き文字の一部と濁点半濁点は前のひらがなと結合
    { previous: /[ァ-ヿ]/, current: /[ァィゥェォャュョヮヵヶ゙゚゛゜]/ }, // 小書き文字の一部は前のカタカナと結合
    { previous: /[ｦ-ﾝ]/, current: /[ｧ-ｮ]/ }, // 小書き文字の一部は前の半角カタカナと結合
    { previous: /[ぁ-ゟァ-ヿｦ-ﾝ]/, current: /[゙゚゛゜ﾞﾟ]/ }, // 濁点半濁点は前の仮名と結合
    { previous: /./, current: /[,.:;!?､｡、。：；！？]/ }, // 句読点や記号は前の文字と結合
    { previous: /[‘“(（｢「『]/, current: /\S/ }, // 開き記号は後の文字と結合
    { previous: /\S/, current: /[’”)）｣」』]/ }, // 閉じ記号は前の文字と結合
    { previous: /\S/, current: /[+＋]/ }, // プラス記号は前の文字と結合
    { previous: /[+＋]/, current: /\S/ }, // プラス記号は後の文字と結合
    { previous: /[^-_]/, current: /-/ }, // ハイフンは前のハイフンまたはアンダーバー以外の文字と結合
  ];

  let result = [];
  let currentGroup = "";

  // 結合ルールに一致する文字を同一グループにまとめる
  for (let i = 0; i < lyrics.length; i++) {
    const currentChar = lyrics[i];
    const previousChar = currentGroup.length > 0 ? currentGroup[currentGroup.length - 1] : "";

    let shouldCombine = false;

    // 前の文字と結合するかどうかを判定
    for (const rule of combineRules) {
      if (rule.current.test(currentChar) && rule.previous.test(previousChar)) {
        shouldCombine = true;
        break;
      }
    }

    if (shouldCombine) {
      currentGroup += currentChar;
    } else {
      if (currentGroup != "") {
        // currentGroupからプラス記号を除去して追加
        result.push(currentGroup.replace(/[+＋]/g, ""));
      }
      // 空白文字の場合は追加しない
      currentGroup = currentChar.replace(/\s/g, "");
    }
  }

  // 末尾に残ったグループから結合用のプラス記号を除去して結果に追加
  if (currentGroup != "") {
    result.push(currentGroup.replace(/[+＋]/g, ""));
  }

  return result;
}

// 取消や番数変更時の復元および確定後のカーソル移動に使用する状態管理変数
let previousLyrics = {};
let previousLargestTick = {};
let previousVerse = 0;
let nextStartTick = {};

// 現在のスコア選択状態から処理対象のトラック番号と開始 tick を取得
function getTrackAndTick() {
  let result = [];

  if (curScore.selection.isRange) {
    // 範囲選択の場合は選択された各譜表の最初の chord の位置を取得
    let selection = curScore.selection;
    let cursor = curScore.newCursor();
    for (let staff = selection.startStaff; staff < selection.endStaff; staff++) {
      cursor.rewind(Cursor.SELECTION_START);
      cursor.track = staff * 4;
      while (cursor.segment && cursor.tick < selection.endSegment.tick + 1) {
        if (cursor.element.type == Element.CHORD) {
          result.push({ track: cursor.track, startTick: cursor.tick });
          break;
        }
        cursor.next();
      }
    }
  } else {
    // 要素選択の場合は選択されている各要素のトラックと tick を取得
    for (let i in curScore.selection.elements) {
      let element = curScore.selection.elements[i];
      result.push({ track: element.track, startTick: getElementTick(element) });
    }
  }

  return result;
}

// 指定された要素の親をたどり所属するセグメントの tick を取得
function getElementTick(element) {
  let segment = element;
  while (segment.parent && segment.type != Element.SEGMENT) {
    segment = segment.parent;
  }
  return segment.tick;
}

// 指定されたトラックと tick 位置から始まるスラーまたはタイの tick 長を取得
function getSlurTieTicks(track, tick) {
  // 選択範囲を保存
  let isRange = curScore.selection.isRange;
  let selection = {};
  if (isRange) {
    selection.startTick = curScore.selection.startSegment.tick;
    selection.endTick = curScore.selection.endSegment.tick;
    selection.startStaff = curScore.selection.startStaff;
    selection.endStaff = curScore.selection.endStaff;
  } else {
    selection.elements = {};
    for (let i in curScore.selection.elements) {
      selection.elements[i] = curScore.selection.elements[i];
    }
  }

  // 対象位置から次のセグメントまでの範囲を一時選択してスラーとタイを検出
  let tempCursor = curScore.newCursor();
  tempCursor.track = track;
  tempCursor.rewindToTick(tick);
  tempCursor.next();

  curScore.startCmd();
  curScore.selection.clear();
  curScore.selection.selectRange(tick, tempCursor.tick, Math.floor(track / 4), Math.floor(track / 4) + 1);
  curScore.endCmd();

  // 選択範囲内の要素からスラーとタイの tick 数をそれぞれ計測
  let minSlurTicks = 0;
  let maxTieTicks = 0;
  for (let i in curScore.selection.elements) {
    let element = curScore.selection.elements[i];
    if (element.track != track) {
      continue;
    }
    if (element.type == Element.SLUR || element.type == Element.SLUR_SEGMENT) {
      var spanner = element.spanner ? element.spanner : element;
      if (spanner && spanner.spannerTicks && spanner.spannerTick) {
          if ((minSlurTicks == 0 || minSlurTicks > spanner.spannerTicks.ticks) && spanner.spannerTick.ticks == tick) {
              minSlurTicks = spanner.spannerTicks.ticks;
          }
      }
    } else if (element.type == Element.NOTE) {
      let tieTicks = getElementTick(element.lastTiedNote) - tick;
      if (maxTieTicks == 0 || maxTieTicks < tieTicks) {
        maxTieTicks = tieTicks;
      }
    }
  }

  // 選択範囲を元に戻す
  curScore.startCmd();
  curScore.selection.clear();
  if (isRange) {
    curScore.selection.selectRange(selection.startTick, selection.endTick, selection.startStaff, selection.endStaff);
  } else {
    for (let i in selection.elements) {
      let element = selection.elements[i];
      curScore.selection.select(element, true);
    }
  }
  curScore.endCmd();

  // minSlurTicks または maxTieTicks の大きい方を返す
  return minSlurTicks > maxTieTicks ? minSlurTicks : maxTieTicks;
}

// 指定した番数の歌詞要素を取得し同じ番数の歌詞が重複していれば削除
function getAndRemoveDuplicateLyric(cursor, verse) {
  let lyrics = cursor.element.lyrics;
  let isExist = false;
  let lyricElem = null;

  for (var i = 0; i < lyrics.length; i++) {
    if (lyrics[i].verse == verse) {
      if (isExist) {
        cursor.element.remove(lyrics[i]);
        i--;
      } else {
        lyricElem = lyrics[i];
        isExist = true;
      }
    }
  }

  return lyricElem;
}

// 上書き前の歌詞データを復元用に保存し走査した最大 tick 位置を更新
function savePreviousLyric(processIndex, track, tick, lyricElem) {
  if (previousLyrics[track] === undefined) {
    previousLyrics[track] = {};
  }
  if (previousLyrics[track][tick] === undefined) {
    if (lyricElem) {
      if (lyricElem.syllabic == Lyrics.BEGIN || lyricElem.syllabic == Lyrics.MIDDLE) {
        previousLyrics[track][tick] = lyricElem.text + "-";
      } else {
        previousLyrics[track][tick] = lyricElem.text;
        if (lyricElem.lyricTicks.ticks) {
          // メリスマの場合はメリスマの最後まで保存
          let tempCursor = curScore.newCursor();
          tempCursor.track = track;
          tempCursor.rewindToTick(tick);
          while (tempCursor.tick < tick + lyricElem.lyricTicks.ticks) {
            tempCursor.next();
            if (tempCursor.element.type == Element.CHORD) {
              previousLyrics[track][tempCursor.tick] = "_";
            }
          }
          tick = tempCursor.tick;
        }
      }
    } else {
      previousLyrics[track][tick] = null;
    }
  }
  if (previousLargestTick[processIndex] === undefined || previousLargestTick[processIndex] < tick) {
    previousLargestTick[processIndex] = tick;
  }
}

// 分割された歌詞リストをスコア上の各対象トラックに順次適用
function applyLyricsToScore(lyricsList, verse, placement) {
  previousVerse = verse;
  let processDataList = getTrackAndTick();
  let processIndex = 0;

  for (const processData of processDataList) {
    let track = processData.track;
    let cursor = curScore.newCursor();
    cursor.track = track;
    cursor.rewindToTick(processData.startTick);

    let ic = 0;
    let isInsideWord = false;
    let melismaStartElem = null;
    let melismaStartTick = 0;
    let slurTieEndTick = -1;
    const defaultPlacement = newElement(Element.LYRICS).placement;

    // 入力歌詞が残っている間または元の歌詞の復元範囲に達するまでセグメントを走査
    while (cursor.segment && (ic < lyricsList.length || cursor.tick <= previousLargestTick[processIndex])) {
      if (cursor.element.type == Element.CHORD) {
        let lyricElem = getAndRemoveDuplicateLyric(cursor, verse);
        savePreviousLyric(processIndex, track, cursor.tick, lyricElem);

        // 入力歌詞があればそれを採用し入力が尽きた位置は元の歌詞を復元
        let newLyricText = lyricsList[ic] || previousLyrics[track][cursor.tick];

        // 等号が含まれる場合はスラーやタイの終了位置まで長音記号を展開
        if (/[=＝]/.test(newLyricText)) {
          let index = newLyricText.search(/[=＝]/);
          let beforeText = newLyricText.substring(0, index);
          let afterText = newLyricText.substring(index + 1);

          if (slurTieEndTick == -1) {
            let slurTieTicks = 0;

            if (beforeText) {
              slurTieTicks = getSlurTieTicks(track, cursor.tick);
              slurTieEndTick = cursor.tick + slurTieTicks;
            } else {
              cursor.prev();
              slurTieTicks = getSlurTieTicks(track, cursor.tick);
              slurTieEndTick = cursor.tick + slurTieTicks;
              cursor.next();
            }

            if (slurTieTicks) {
              newLyricText = beforeText || "ー";
              if (slurTieEndTick == cursor.tick) {
                slurTieEndTick = -1;
              } else {
                ic--;
              }
            } else {
              slurTieEndTick = -1;
              if (beforeText != "" || afterText != "") {
                newLyricText = newLyricText.replace(/[=＝]/g, "ー").replace(/ーー/g, "ー");
              } else {
                ic++;
                if (ic == lyricsList.length) {
                  nextStartTick[processIndex] = cursor.tick;
                }
                continue;
              }
            }
          } else if (cursor.tick == slurTieEndTick) {
            slurTieEndTick = -1;
            if (afterText) {
              newLyricText = beforeText ? afterText : "ー" + afterText;
            } else {
              newLyricText = "ー";
            }
          } else if (cursor.tick < slurTieEndTick) {
            newLyricText = "ー";
            ic--;
          }
        }

        // 歌詞テキストの有無に応じて歌詞要素の追加・更新・削除と音節属性の設定を行う
        if (newLyricText && newLyricText != "-" && newLyricText != "_") {
          if (lyricElem === null) {
            lyricElem = newElement(Element.LYRICS);
            cursor.element.add(lyricElem);
          }
          lyricElem.text = newLyricText.replace(/[-_]/g, "");
          lyricElem.verse = verse;
          lyricElem.placement = placement === null ? defaultPlacement : placement;
          if (newLyricText.endsWith("-")) {
            lyricElem.syllabic = isInsideWord ? Lyrics.MIDDLE : Lyrics.BEGIN;
            isInsideWord = true;
          } else {
            lyricElem.syllabic = isInsideWord ? Lyrics.END : Lyrics.SINGLE;
            isInsideWord = false;
          }
          melismaStartElem = lyricElem;
          melismaStartTick = cursor.tick;
          lyricElem.lyricTicks = fraction(0, 1);
        } else {
          if (lyricElem !== null) {
            cursor.element.remove(lyricElem);
          }
          if (newLyricText == "_") {
            melismaStartElem.lyricTicks = fraction(cursor.tick - melismaStartTick, division * 4);
          }
        }
        ic++;
      }
      cursor.next();
      // すべての入力歌詞を配置し終えた次の位置を確定後の移動先として記録
      if (ic == lyricsList.length) {
        nextStartTick[processIndex] = cursor.tick;
      }
    }
    processIndex++;
  }
}

// 編集前の歌詞をスコアに復元し一時状態をリセット
function restorePreviousLyrics() {
  applyLyricsToScore([], previousVerse, placementSelector.currentValue);
  nextStartTick = {};
  previousLyrics = {};
  previousLargestTick = {};
  previousVerse = verseSelector.value;
}

// 現在の歌詞入力を確定して選択を次の音符へ進め一時状態をリセット
function confirm() {
  moveSelectionToNextElement();
  nextStartTick = {};
  previousLyrics = {};
  previousLargestTick = {};
}

// 次の入力開始位置にある和音の最初の音符を選択状態にする
function moveSelectionToNextElement() {
  let processDataList = getTrackAndTick();

  curScore.selection.clear();

  let processIndex = 0;

  for (const processData of processDataList) {
    let track = processData.track;
    let cursor = curScore.newCursor();
    cursor.track = track;
    cursor.rewindToTick(nextStartTick[processIndex] || processData.startTick);

    while (cursor.segment && cursor.element.type != Element.CHORD) {
      cursor.next();
    }
    if (cursor.segment) {
      curScore.selection.select(cursor.element.notes[0], true);
    }

    processIndex++;
  }
}
