function splitLyrics(lyrics) {
  const combineRules = [
    { previous: /[a-zA-Z'ａ-ｚＡ-Ｚ＇]/ , current: /[a-zA-Z'ａ-ｚＡ-Ｚ＇]/ }, // 英単語の結合
    // { previous: /[\p{Ll}\p{Lt}\p{Lu}]/u , current: /[\p{Ll}\p{Lt}\p{Lu}]/u }, // 小文字と大文字の結合
    { previous: /[ぁ-ゟ]/ , current: /[ぁぃぅぇぉゃゅょゎゕゖ]/ }, // 小書き文字の一部と濁点半濁点は前のひらがなと結合
    { previous: /[ァ-ヿ]/ , current: /[ァィゥェォャュョヮヵヶ゙゚゛゜]/ }, // 小書き文字の一部は前のカタカナと結合
    { previous: /[ｦ-ﾝ]/, current: /[ｧ-ｮ]/}, // 小書き文字の一部は前の半角カタカナと結合
    { previous: /[ぁ-ゟァ-ヿｦ-ﾝ]/ , current: /[゙゚゛゜ﾞﾟ]/ }, // 濁点半濁点は前の仮名と結合
    { previous: /./, current: /[,.:;!?､｡、。：；！？]/ }, // 句読点や記号は前の文字と結合
    { previous: /[‘“(（｢「『]/, current: /\S/ }, // 開き記号は後の文字と結合
    { previous: /\S/, current: /[’”)）｣」』]/}, // 閉じ記号は前の文字と結合
    { previous: /\S/, current: /[+＋]/ }, // プラス記号は前の文字と結合
    { previous: /[+＋]/, current: /\S/ }, // プラス記号は後の文字と結合
    { previous: /[^-_]/, current: /-/ }, // ハイフンは前のハイフンまたはアンダーバー以外の文字と結合
  ];

  let result = [];
  let currentGroup = "";

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
        result.push(currentGroup.replace(/[+＋]/g, "")); // currentGroupからプラス記号を除去して追加
      }
      currentGroup = currentChar.replace(/\s/g, ""); // 空白文字の場合は追加しない
    }
  }

  if (currentGroup != "") {
    result.push(currentGroup.replace(/[+＋]/g, ""));
  }

  return result;
}

let previousLyrics = {};
let previousLargestTick = {};
let previousVerse = 0;

function getTrackAndTick() {
  let result = [];

  if (curScore.selection.isRange) {
    let selection = curScore.selection;
    let cursor = curScore.newCursor();
    for (let staff = selection.startStaff; staff < selection.endStaff; staff++) {
      cursor.rewind(Cursor.SELECTION_START);
      cursor.track = staff * 4;
      while (cursor.segment && cursor.tick < selection.endSegment.tick + 1) {
        if (cursor.element.type == Element.CHORD) {
          result.push( { track: cursor.track, startTick: cursor.tick } );
          break;
        }
        cursor.next();
      }
    }
  } else {
    for (var i in curScore.selection.elements) {
      let element = curScore.selection.elements[i];
      result.push( { track: element.track, startTick: getElementTick(element) } );
    }
  }
  
  return result;
}

function getElementTick(element) {
  let segment = element;
  while (segment.parent && segment.type != Element.SEGMENT) {
    segment = segment.parent;
  }
  return segment.tick;
}

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
          tempCursor.rewindToTick(tick);
          tempCursor.track = track;
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

function applyLyricsToScore(lyricsList, verse, placement) {
  previousVerse = verse;
  let processDataList = getTrackAndTick();
  let processIndex = 0;

  for (const processData of processDataList) {
    let track = processData.track;
    let cursor = curScore.newCursor();
    cursor.rewindToTick(processData.startTick);
    cursor.track = track;
    
    let ic = 0;
    let isInsideWord = false;
    let melismaStartElem = null;
    let melismaStartTick = 0;
    const defaultPlacement = newElement(Element.LYRICS).placement;

    while (cursor.segment && (ic < lyricsList.length || cursor.tick <= previousLargestTick[processIndex])) {
      if (cursor.element.type == Element.CHORD) {
        let newLyricText = lyricsList[ic] || previousLyrics[track][cursor.tick];

        let lyricElem = getAndRemoveDuplicateLyric(cursor, verse);

        savePreviousLyric(processIndex, track, cursor.tick, lyricElem);
        
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
    }
    processIndex++;
  }
}

function restorePreviousLyrics() {
  applyLyricsToScore([], previousVerse, placementSelector.currentValue);
  previousLyrics = {};
  previousLargestTick = {};
  previousVerse = verseSelector.value;
}

function confirm() {
  previousLyrics = {};
  previousLargestTick = {};
  // TODO: 選択を移動させる
}