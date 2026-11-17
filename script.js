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

// 現在のスコア選択状態から処理対象のトラック番号と開始 tick を重複なく取得
function collectInputTargets() {
  let targets = [];
  let registeredTargets = {};

  if (curScore.selection.isRange) {
    // 範囲選択の場合は選択された各譜表の最初の chord の位置を取得
    let selection = curScore.selection;
    let cursor = curScore.newCursor();
    for (let staff = selection.startStaff; staff < selection.endStaff; staff++) {
      cursor.rewind(Cursor.SELECTION_START);
      cursor.track = staff * 4;
      while (cursor.segment && cursor.tick < selection.endSegment.tick + 1) {
        if (cursor.element && cursor.element.type == Element.CHORD) {
          let targetKey = cursor.track + ":" + cursor.tick;
          if (!registeredTargets[targetKey]) {
            targets.push({ track: cursor.track, startTick: cursor.tick });
            registeredTargets[targetKey] = true;
          }
          break;
        }
        cursor.next();
      }
    }
  } else {
    // 要素選択の場合は選択されている各要素のトラックと tick を取得
    for (let i in curScore.selection.elements) {
      let element = curScore.selection.elements[i];
      let startTick = getSegmentTick(element);
      let targetKey = element.track + ":" + startTick;
      if (startTick !== null && !registeredTargets[targetKey]) {
        targets.push({ track: element.track, startTick: startTick });
        registeredTargets[targetKey] = true;
      }
    }
  }

  return targets;
}

// 指定された要素の親をたどり所属するセグメントの tick を取得
function getSegmentTick(element) {
  let currentElement = element;
  while (currentElement.parent && currentElement.type != Element.SEGMENT) {
    currentElement = currentElement.parent;
  }
  if (currentElement.type != Element.SEGMENT) {
    return null;
  }
  return currentElement.tick;
}

// 指定されたトラックと tick 位置から始まるスラーまたはタイの tick 長を取得
function getSlurOrTieTicks(track, startTick) {
  // 選択範囲を保存
  let wasRangeSelection = curScore.selection.isRange;
  let savedSelection = {};
  if (wasRangeSelection) {
    savedSelection.startTick = curScore.selection.startSegment.tick;
    savedSelection.endTick = curScore.selection.endSegment.tick;
    savedSelection.startStaff = curScore.selection.startStaff;
    savedSelection.endStaff = curScore.selection.endStaff;
  } else {
    savedSelection.elements = [];
    for (let i in curScore.selection.elements) {
      savedSelection.elements.push(curScore.selection.elements[i]);
    }
  }

  // 対象位置から次のセグメントまでの範囲を一時選択してスラーとタイを検出
  let nextSegmentCursor = curScore.newCursor();
  nextSegmentCursor.track = track;
  nextSegmentCursor.rewindToTick(startTick);
  nextSegmentCursor.next();

  curScore.selection.clear();
  curScore.selection.selectRange(startTick, nextSegmentCursor.tick, Math.floor(track / 4), Math.floor(track / 4) + 1);

  // 選択範囲内の要素からスラーとタイの tick 数をそれぞれ計測
  let shortestSlurTicks = 0;
  let longestTieTicks = 0;
  for (let i in curScore.selection.elements) {
    let element = curScore.selection.elements[i];
    if (element.track != track) {
      continue;
    }
    if (element.type == Element.SLUR || element.type == Element.SLUR_SEGMENT) {
      let spanner = element.spanner ? element.spanner : element;
      if (spanner && spanner.spannerTicks && spanner.spannerTick) {
        if ((shortestSlurTicks == 0 || shortestSlurTicks > spanner.spannerTicks.ticks) && spanner.spannerTick.ticks == startTick) {
          shortestSlurTicks = spanner.spannerTicks.ticks;
        }
      }
    } else if (element.type == Element.NOTE) {
      let lastTiedTick = getSegmentTick(element.lastTiedNote);
      if (lastTiedTick !== null) {
        let tieTicks = lastTiedTick - startTick;
        if (longestTieTicks == 0 || longestTieTicks < tieTicks) {
          longestTieTicks = tieTicks;
        }
      }
    }
  }

  // 選択範囲を元に戻す
  curScore.selection.clear();
  if (wasRangeSelection) {
    curScore.selection.selectRange(savedSelection.startTick, savedSelection.endTick, savedSelection.startStaff, savedSelection.endStaff);
  } else {
    for (const element of savedSelection.elements) {
      curScore.selection.select(element, true);
    }
  }

  // shortestSlurTicks または longestTieTicks の大きい方を返す
  return shortestSlurTicks > longestTieTicks ? shortestSlurTicks : longestTieTicks;
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
function backupOriginalLyric(targetIndex, track, tick, lyricElement) {
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
          while (melismaCursor.tick < tick + lyricElement.lyricTicks.ticks) {
            melismaCursor.next();
            if (melismaCursor.element && melismaCursor.element.type == Element.CHORD) {
              originalLyricsByTrack[track][melismaCursor.tick] = "_";
            }
          }
          scannedEndTick = melismaCursor.tick;
        }
      }
    } else {
      originalLyricsByTrack[track][tick] = null;
    }
  }
  if (maxScannedTickByTarget[targetIndex] === undefined || maxScannedTickByTarget[targetIndex] < scannedEndTick) {
    maxScannedTickByTarget[targetIndex] = scannedEndTick;
  }
}

// 等号を含む歌詞ユニットをスラーまたはタイの終了位置まで長音記号に展開
function expandEqualSignForSlurOrTie(cursor, track, lyricText, unitIndex, lyricUnitsLength, slurOrTieEndTick, targetIndex) {
  // 等号の位置を基準に前後の文字列を分離
  let equalSignIndex = lyricText.search(/[=＝]/);
  let textBeforeEqual = lyricText.substring(0, equalSignIndex);
  let textAfterEqual = lyricText.substring(equalSignIndex + 1);
  let resolvedText = lyricText;
  let nextUnitIndex = unitIndex;
  let nextSlurOrTieEndTick = slurOrTieEndTick;

  if (nextSlurOrTieEndTick == -1) {
    // スラーまたはタイの展開開始位置を判定し終了 tick を取得
    let slurOrTieTicks = 0;

    if (textBeforeEqual) {
      // 等号の前に文字がある場合は現在位置から始まるスラーまたはタイを参照
      slurOrTieTicks = getSlurOrTieTicks(track, cursor.tick);
      nextSlurOrTieEndTick = cursor.tick + slurOrTieTicks;
    } else {
      // 等号が先頭にある場合は直前のセグメントから始まるスラーまたはタイを参照
      cursor.prev();
      slurOrTieTicks = getSlurOrTieTicks(track, cursor.tick);
      nextSlurOrTieEndTick = cursor.tick + slurOrTieTicks;
      cursor.next();
    }

    if (slurOrTieTicks) {
      // スラーまたはタイが存在する場合は開始音符に文字を割り当て終了位置まで同じユニットを継続
      resolvedText = textBeforeEqual || "ー";
      if (nextSlurOrTieEndTick <= cursor.tick) {
        nextSlurOrTieEndTick = -1;
      } else {
        nextUnitIndex--;
      }
    } else {
      // スラーもタイも存在しない場合は等号を長音記号へ置換するか単独の等号をスキップ
      nextSlurOrTieEndTick = -1;
      if (textBeforeEqual != "" || textAfterEqual != "") {
        resolvedText = resolvedText.replace(/[=＝]/g, "ー").replace(/ーー/g, "ー");
      } else {
        nextUnitIndex++;
        if (nextUnitIndex == lyricUnitsLength) {
          nextStartTickByTarget[targetIndex] = cursor.tick;
        }
        return {
          lyricText: resolvedText,
          unitIndex: nextUnitIndex,
          slurOrTieEndTick: nextSlurOrTieEndTick,
          skipped: true,
        };
      }
    }
  } else if (cursor.tick >= nextSlurOrTieEndTick) {
    // スラーまたはタイの終了位置に到達したら展開状態を解除し後続文字列があれば結合
    nextSlurOrTieEndTick = -1;
    if (textAfterEqual) {
      resolvedText = textBeforeEqual ? textAfterEqual : "ー" + textAfterEqual;
    } else {
      resolvedText = "ー";
    }
  } else {
    // スラーまたはタイの途中では長音記号を割り当てて同じユニットを維持
    resolvedText = "ー";
    nextUnitIndex--;
  }

  return {
    lyricText: resolvedText,
    unitIndex: nextUnitIndex,
    slurOrTieEndTick: nextSlurOrTieEndTick,
    skipped: false,
  };
}

// 単一の chord に対して歌詞テキストの反映・削除・音節属性とメリスマ長の設定を行う
function applyLyricToChord(cursor, lyricElement, lyricText, verse, placement, defaultPlacement, lyricState) {
  if (lyricText && lyricText != "-" && lyricText != "_") {
    // 対象の歌詞要素が存在しなければ新規作成して chord に追加
    if (lyricElement === null) {
      lyricElement = newElement(Element.LYRICS);
      cursor.element.add(lyricElement);
    }

    // 制御記号を除いたテキストと番数・配置を設定
    lyricElement.text = lyricText.replace(/[-_]/g, "");
    lyricElement.verse = verse;
    lyricElement.placement = placement === null ? defaultPlacement : placement;

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
    lyricState.melismaStartTick = cursor.tick;
    lyricElement.lyricTicks = fraction(0, 1);
  } else {
    // 歌詞テキストが空または制御記号のみの場合は既存の歌詞要素を削除
    if (lyricElement !== null) {
      cursor.element.remove(lyricElement);
    }

    // アンダースコアの場合は直前の歌詞要素のメリスマ長を現在の tick まで延長
    if (lyricText == "_" && lyricState.melismaStartLyric !== null) {
      lyricState.melismaStartLyric.lyricTicks = fraction(cursor.tick - lyricState.melismaStartTick, division * 4);
    }
  }
}

// 分割された歌詞リストをスコア上の各対象トラックに順次適用
function applyLyricsToScore(lyricUnits, verse, placement) {
  lastAppliedVerse = verse;
  let targets = collectInputTargets();
  let targetIndex = 0;

  for (const target of targets) {
    let track = target.track;
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
    const defaultPlacement = newElement(Element.LYRICS).placement;

    // 入力歌詞が残っている間または元の歌詞の復元範囲に達するまでセグメントを走査
    while (cursor.segment && (unitIndex < lyricUnits.length || cursor.tick <= maxScannedTickByTarget[targetIndex])) {
      if (cursor.element && cursor.element.type == Element.CHORD) {
        let lyricElement = findAndDeduplicateLyric(cursor, verse);
        backupOriginalLyric(targetIndex, track, cursor.tick, lyricElement);

        // 入力歌詞があればそれを採用し入力が尽きた位置は元の歌詞を復元
        let hasInputLyric = unitIndex < lyricUnits.length;
        let lyricText = hasInputLyric ? lyricUnits[unitIndex] : originalLyricsByTrack[track][cursor.tick];

        // 新規入力に等号が含まれる場合はスラーやタイの終了位置まで長音記号を展開
        if (hasInputLyric && /[=＝]/.test(lyricText)) {
          let expansionResult = expandEqualSignForSlurOrTie(
            cursor,
            track,
            lyricText,
            unitIndex,
            lyricUnits.length,
            slurOrTieEndTick,
            targetIndex
          );
          lyricText = expansionResult.lyricText;
          unitIndex = expansionResult.unitIndex;
          slurOrTieEndTick = expansionResult.slurOrTieEndTick;
          if (expansionResult.skipped) {
            continue;
          }
        }

        applyLyricToChord(cursor, lyricElement, lyricText, verse, placement, defaultPlacement, lyricState);
        unitIndex++;
      }
      cursor.next();
      // すべての入力歌詞を配置し終えた次の位置を確定後の移動先として記録
      if (unitIndex == lyricUnits.length) {
        nextStartTickByTarget[targetIndex] = cursor.tick;
      }
    }
    targetIndex++;
  }
}

// 編集前の歌詞をスコアに復元し一時状態をリセット
function restorePreviousLyrics(nextVerse, placement) {
  applyLyricsToScore([], lastAppliedVerse, placement);
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

// 次の入力開始位置にある chord の最初の音符を選択状態にする
function moveSelectionToNextNotes() {
  let targets = collectInputTargets();

  curScore.selection.clear();

  let targetIndex = 0;

  for (const target of targets) {
    let track = target.track;
    let cursor = curScore.newCursor();
    cursor.track = track;
    cursor.rewindToTick(nextStartTickByTarget[targetIndex] || target.startTick);

    while (cursor.segment && (!cursor.element || cursor.element.type != Element.CHORD)) {
      cursor.next();
    }
    if (cursor.segment) {
      curScore.selection.select(cursor.element.notes[0], true);
    }

    targetIndex++;
  }
}
