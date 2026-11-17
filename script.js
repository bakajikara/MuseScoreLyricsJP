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

// 入力された歌詞文字列を音符 1 つ分に割り当てる単位の配列に分割
function splitLyrics(inputText) {
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

  let lyricUnits = [];
  let currentUnit = "";

  // 結合ルールに一致する文字を同一グループにまとめる
  for (let i = 0; i < inputText.length; i++) {
    const currentChar = inputText[i];
    const previousChar = currentUnit.length > 0 ? currentUnit[currentUnit.length - 1] : "";

    let shouldCombine = false;

    // 前の文字と結合するかどうかを判定
    for (const rule of combineRules) {
      if (rule.current.test(currentChar) && rule.previous.test(previousChar)) {
        shouldCombine = true;
        break;
      }
    }

    if (shouldCombine) {
      currentUnit += currentChar;
    } else {
      if (currentUnit != "") {
        // currentUnit からプラス記号を除去して追加
        lyricUnits.push(currentUnit.replace(/[+＋]/g, ""));
      }
      // 空白文字の場合は追加しない
      currentUnit = currentChar.replace(/\s/g, "");
    }
  }

  // 末尾に残ったグループから結合用のプラス記号を除去して結果に追加
  if (currentUnit != "") {
    lyricUnits.push(currentUnit.replace(/[+＋]/g, ""));
  }

  return lyricUnits;
}

// 取消や番数変更時の復元および確定後のカーソル移動に使用する状態管理変数
let originalLyricsByTrack = {};
let maxScannedTickByTarget = {};
let lastAppliedVerse = 0;
let nextStartTickByTarget = {};

// スコア全体のスラーを走査して開始位置ごとの最短 tick 長のマップを作成
function buildShortestSlurTicksMap() {
  let shortestSlurTicksMap = {};
  let spanners = curScore.spanners;

  for (let i = 0; i < spanners.length; i++) {
    let spanner = spanners[i];
    if (spanner.type != Element.SLUR) {
      continue;
    }

    let slurTicks = spanner.spannerTicks.ticks;
    if (slurTicks <= 0) {
      continue;
    }

    let key = spanner.track + ":" + spanner.spannerTick.ticks;
    if (shortestSlurTicksMap[key] === undefined || slurTicks < shortestSlurTicksMap[key]) {
      shortestSlurTicksMap[key] = slurTicks;
    }
  }

  return shortestSlurTicksMap;
}

// 現在のスコア選択状態から処理対象のトラック番号と開始 tick を重複なく取得
function collectInputTargets() {
  let targets = [];
  let registeredTargets = {};

  function addTarget(track, startTick) {
    let targetKey = track + ":" + startTick;
    if (!registeredTargets[targetKey]) {
      targets.push({ key: targetKey, track: track, startTick: startTick });
      registeredTargets[targetKey] = true;
    }
  }

  if (curScore.selection.isRange) {
    // 範囲選択の場合は選択された各譜表の最初の chord の位置を取得
    let selection = curScore.selection;
    let cursor = curScore.newCursor();
    for (let staff = selection.startStaff; staff < selection.endStaff; staff++) {
      cursor.rewind(Cursor.SELECTION_START);
      cursor.staffIdx = staff;
      cursor.voice = 0;
      while (cursor.segment && cursor.fraction.ticks < selection.endSegment.fraction.ticks + 1) {
        if (cursor.element && cursor.element.type == Element.CHORD) {
          addTarget(cursor.track, cursor.fraction.ticks);
          break;
        }
        cursor.next();
      }
    }
  } else {
    // 要素選択の場合は選択されている各要素のトラックと tick を取得
    for (let i in curScore.selection.elements) {
      let element = curScore.selection.elements[i];
      addTarget(element.track, element.fraction.ticks);
    }
  }

  return targets;
}

// 指定された chord から始まるタイの最長 tick 長を取得
function getLongestTieTicks(chord, startTick) {
  let longestTieTicks = 0;

  if (!chord || chord.type != Element.CHORD) {
    return 0;
  }

  let notes = chord.notes;
  for (let i = 0; i < notes.length; i++) {
    let note = notes[i];
    let lastTiedNote = note.lastTiedNote;
    if (!lastTiedNote || lastTiedNote.is(note)) {
      continue;
    }

    let tieTicks = lastTiedNote.fraction.ticks - startTick;
    if (tieTicks > longestTieTicks) {
      longestTieTicks = tieTicks;
    }
  }

  return longestTieTicks;
}

// 指定された chord と開始 tick から始まるスラーまたはタイの tick 長を取得
function getSlurOrTieTicks(shortestSlurTicksMap, chord, track, startTick) {
  let key = track + ":" + startTick;
  let shortestSlurTicks = shortestSlurTicksMap[key] || 0;
  let longestTieTicks = getLongestTieTicks(chord, startTick);

  return Math.max(shortestSlurTicks, longestTieTicks);
}

// 指定した番数の歌詞要素を取得し同じ番数の歌詞が重複していれば削除
function findAndDeduplicateLyric(cursor, verse) {
  let chordLyrics = cursor.element.lyrics;
  let hasPrimaryLyric = false;
  let primaryLyric = null;

  for (let i = 0; i < chordLyrics.length; i++) {
    if (chordLyrics[i].verse == verse) {
      if (hasPrimaryLyric) {
        cursor.element.remove(chordLyrics[i]);
        i--;
      } else {
        primaryLyric = chordLyrics[i];
        hasPrimaryLyric = true;
      }
    }
  }

  return primaryLyric;
}

// 上書き前の歌詞データを復元用に保存し走査した最大 tick 位置を更新
function backupOriginalLyric(targetKey, track, tick, lyricElement) {
  let scannedEndTick = tick;

  if (originalLyricsByTrack[track] === undefined) {
    originalLyricsByTrack[track] = {};
  }
  if (originalLyricsByTrack[track][tick] === undefined) {
    if (lyricElement) {
      if (lyricElement.syllabic == Lyrics.BEGIN || lyricElement.syllabic == Lyrics.MIDDLE) {
        originalLyricsByTrack[track][tick] = lyricElement.text + "-";
      } else {
        originalLyricsByTrack[track][tick] = lyricElement.text;
        if (lyricElement.lyricTicks.ticks) {
          // メリスマの場合はメリスマの最後まで保存
          let melismaCursor = curScore.newCursor();
          melismaCursor.track = track;
          melismaCursor.rewindToTick(tick);
          while (melismaCursor.fraction.ticks < tick + lyricElement.lyricTicks.ticks) {
            melismaCursor.next();
            if (melismaCursor.element && melismaCursor.element.type == Element.CHORD) {
              originalLyricsByTrack[track][melismaCursor.fraction.ticks] = "_";
            }
          }
          scannedEndTick = melismaCursor.fraction.ticks;
        }
      }
    } else {
      originalLyricsByTrack[track][tick] = null;
    }
  }
  if (maxScannedTickByTarget[targetKey] === undefined || maxScannedTickByTarget[targetKey] < scannedEndTick) {
    maxScannedTickByTarget[targetKey] = scannedEndTick;
  }
}

// 等号を含む歌詞ユニットをスラーまたはタイの終了位置まで長音記号に展開
function expandEqualSignForSlurOrTie(cursor, track, lyricText, unitIndex, slurOrTieEndTick, shortestSlurTicksMap) {
  let equalSignIndex = lyricText.search(/[=＝]/);
  let textBeforeEqual = lyricText.substring(0, equalSignIndex);
  let textAfterEqual = lyricText.substring(equalSignIndex + 1);
  let currentTick = cursor.fraction.ticks;
  let isFirstNote = slurOrTieEndTick == -1;
  let nextSlurOrTieEndTick = slurOrTieEndTick;

  if (isFirstNote) {
    // 展開開始位置からスラーまたはタイの長さを取得
    let slurOrTieTicks = 0;
    if (textBeforeEqual) {
      slurOrTieTicks = getSlurOrTieTicks(shortestSlurTicksMap, cursor.element, track, currentTick);
      nextSlurOrTieEndTick = currentTick + slurOrTieTicks;
    } else if (cursor.prev()) {
      slurOrTieTicks = getSlurOrTieTicks(shortestSlurTicksMap, cursor.element, track, cursor.fraction.ticks);
      nextSlurOrTieEndTick = cursor.fraction.ticks + slurOrTieTicks;
      cursor.next();
    }

    // スラーもタイも存在しない場合は長音記号へ置換するか単独の等号をスキップ
    if (!slurOrTieTicks) {
      if (textBeforeEqual || textAfterEqual) {
        return {
          lyricText: lyricText.replace(/[=＝]/g, "ー").replace(/ーー+/g, "ー"),
          unitIndex: unitIndex,
          slurOrTieEndTick: -1,
          skipped: false,
        };
      }

      return {
        unitIndex: unitIndex + 1,
        skipped: true,
      };
    }
  }

  // 開始音符なら前の文字を、終了音符なら後の文字を長音記号の前後に結合
  let isLastNote = currentTick >= nextSlurOrTieEndTick;
  let prefixText = isFirstNote ? textBeforeEqual : "";
  let suffixText = isLastNote ? textAfterEqual : "";

  return {
    lyricText: prefixText + "ー" + suffixText,
    unitIndex: isLastNote ? unitIndex : unitIndex - 1,
    slurOrTieEndTick: isLastNote ? -1 : nextSlurOrTieEndTick,
    skipped: false,
  };
}

// 単一の chord に対して歌詞テキストの反映・削除・音節属性とメリスマ長を設定
function applyLyricToChord(cursor, lyricElement, lyricText, verse, placement, lyricState) {
  if (lyricText && lyricText != "-" && lyricText != "_") {
    // 対象の歌詞要素が存在しなければ新規作成して chord に追加
    if (lyricElement === null) {
      lyricElement = newElement(Element.LYRICS);
      cursor.element.add(lyricElement);
    }

    // 制御記号を除いたテキストと番数・配置を設定
    lyricElement.text = lyricText.replace(/[-_]/g, "");
    lyricElement.verse = verse;
    lyricElement.placement = placement === null ? undefined : placement;

    // 末尾ハイフンの有無と単語内状態から音節区分を設定
    if (lyricText.endsWith("-")) {
      lyricElement.syllabic = lyricState.isInWord ? Lyrics.MIDDLE : Lyrics.BEGIN;
      lyricState.isInWord = true;
    } else {
      lyricElement.syllabic = lyricState.isInWord ? Lyrics.END : Lyrics.SINGLE;
      lyricState.isInWord = false;
    }

    // 後続のメリスマ指定に備えて開始要素と tick を記録し長さを初期化
    lyricState.melismaStartLyric = lyricElement;
    lyricState.melismaStartTick = cursor.fraction.ticks;
    lyricElement.lyricTicks = fractionFromTicks(0);
  } else {
    // 歌詞テキストが空または制御記号のみの場合は既存の歌詞要素を削除
    if (lyricElement !== null) {
      cursor.element.remove(lyricElement);
    }

    // アンダースコアの場合は直前の歌詞要素のメリスマ長を現在の tick まで延長
    if (lyricText == "_" && lyricState.melismaStartLyric !== null) {
      lyricState.melismaStartLyric.lyricTicks = fractionFromTicks(cursor.fraction.ticks - lyricState.melismaStartTick);
    }
  }
}

// 指定されたターゲット一覧に対して歌詞リストを適用
function applyLyricsToTargets(targets, lyricUnits, verse, placement) {
  let shortestSlurTicksMap = lyricUnits.length > 0 ? buildShortestSlurTicksMap() : {};

  for (const target of targets) {
    let targetKey = target.key;
    let track = target.track;
    delete nextStartTickByTarget[targetKey];

    let cursor = curScore.newCursor();
    cursor.track = track;
    cursor.rewindToTick(target.startTick);

    let unitIndex = 0;
    let slurOrTieEndTick = -1;
    let lyricState = {
      isInWord: false,
      melismaStartLyric: null,
      melismaStartTick: 0,
    };

    // 入力歌詞が残っている間または元の歌詞の復元範囲に達するまでセグメントを走査
    while (cursor.segment && (unitIndex < lyricUnits.length || cursor.fraction.ticks <= maxScannedTickByTarget[targetKey])) {
      // すべての入力歌詞を配置し終えた直後のセグメントを確定後の移動先として記録
      if (lyricUnits.length > 0 && unitIndex == lyricUnits.length && nextStartTickByTarget[targetKey] === undefined) {
        nextStartTickByTarget[targetKey] = cursor.fraction.ticks;
      }

      if (cursor.element && cursor.element.type == Element.CHORD) {
        let lyricElement = findAndDeduplicateLyric(cursor, verse);
        backupOriginalLyric(targetKey, track, cursor.fraction.ticks, lyricElement);

        // 入力歌詞があればそれを採用し入力が尽きた位置は元の歌詞を復元
        let hasInputLyric = unitIndex < lyricUnits.length;
        let lyricText = hasInputLyric ? lyricUnits[unitIndex] : originalLyricsByTrack[track][cursor.fraction.ticks];

        // 新規入力に等号が含まれる場合はスラーやタイの終了位置まで長音記号を展開
        if (hasInputLyric && /[=＝]/.test(lyricText)) {
          let expansionResult = expandEqualSignForSlurOrTie(
            cursor,
            track,
            lyricText,
            unitIndex,
            slurOrTieEndTick,
            shortestSlurTicksMap
          );
          unitIndex = expansionResult.unitIndex;
          if (expansionResult.skipped) {
            continue;
          }
          lyricText = expansionResult.lyricText;
          slurOrTieEndTick = expansionResult.slurOrTieEndTick;
        }

        applyLyricToChord(cursor, lyricElement, lyricText, verse, placement, lyricState);
        unitIndex++;
      }

      cursor.next();
    }

    // 最後のセグメントで入力歌詞を配置し終えた場合の移動先を記録
    if (lyricUnits.length > 0 && unitIndex == lyricUnits.length && nextStartTickByTarget[targetKey] === undefined) {
      nextStartTickByTarget[targetKey] = cursor.fraction.ticks;
    }
  }
}

// 分割された歌詞リストを現在の選択範囲のトラックに順次適用
function applyLyricsToScore(lyricUnits, verse, placement) {
  lastAppliedVerse = verse;
  applyLyricsToTargets(collectInputTargets(), lyricUnits, verse, placement);
}

// 編集前の歌詞をスコアに復元し一時状態をリセット
function restorePreviousLyrics(nextVerse, placement) {
  applyLyricsToTargets(collectInputTargets(), [], lastAppliedVerse, placement);
  nextStartTickByTarget = {};
  originalLyricsByTrack = {};
  maxScannedTickByTarget = {};
  lastAppliedVerse = nextVerse;
}

// 現在の歌詞入力を確定して選択を次の音符へ進め一時状態をリセット
function confirmInput() {
  moveSelectionToNextNotes();
  nextStartTickByTarget = {};
  originalLyricsByTrack = {};
  maxScannedTickByTarget = {};
}

// 次の入力開始位置にある chord の最初の音符を選択
function moveSelectionToNextNotes() {
  let targets = collectInputTargets();

  curScore.selection.clear();

  for (const target of targets) {
    let track = target.track;
    let nextTick = nextStartTickByTarget[target.key] !== undefined ? nextStartTickByTarget[target.key] : target.startTick;
    let cursor = curScore.newCursor();
    cursor.track = track;
    cursor.rewindToTick(nextTick);

    while (cursor.segment && (!cursor.element || cursor.element.type != Element.CHORD)) {
      cursor.next();
    }
    if (cursor.segment) {
      curScore.selection.select(cursor.element.notes[0], true);
    }
  }
}
