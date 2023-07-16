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
    // TODO: ティックを取得
    // for (var i in curScore.selection.elements) {
    // }
  }
  
  return result;
}

let previousLyrics = [];
let previousVerse = 0;

function applyLyricsToScore(lyricsList, verse, placement) {
  previousVerse = verse;
  let processDataList = getTrackAndTick();

  for (const processData of processDataList) {
    let cursor = curScore.newCursor();
    cursor.rewindToTick(processData.startTick);
    cursor.track = processData.track;
    
    let lyricIndex = 0;
    let defaultPlacement = newElement(Element.LYRICS).placement;

    if (previousLyrics[cursor.track] === undefined) {
      previousLyrics[cursor.track] = [];
    }

    while (cursor.segment && lyricIndex < Math.max(lyricsList.length, previousLyrics[cursor.track].length)) {
      if (cursor.element.type == Element.CHORD) {
        let lyrics = cursor.element.lyrics;
        let isExist = false;
        let newLyric = lyricsList[lyricIndex] || previousLyrics[cursor.track][lyricIndex];

        for (var i = 0; i < lyrics.length; i++) {
          if (lyrics[i].verse == verse) {
            if (previousLyrics[cursor.track][lyricIndex] === undefined) {
              previousLyrics[cursor.track][lyricIndex] = lyrics[i].text || null;
            }
            if (isExist || !newLyric) {
              cursor.element.remove(lyrics[i]);
              i--;
            } else {
              lyrics[i].text = newLyric;
              lyrics[i].placement = placement === null ? defaultPlacement : placement;
              isExist = true;
            }
          }
        }

        if (previousLyrics[cursor.track][lyricIndex] === undefined) {
          previousLyrics[cursor.track][lyricIndex] = null;
        }
        
        if (!isExist && newLyric) {
          let lyric = newElement(Element.LYRICS);
          lyric.text = newLyric;
          lyric.verse = verse;
          lyric.placement = placement === null ? defaultPlacement : placement;
          cursor.element.add(lyric);
        }
        lyricIndex++;
      }
      cursor.next();
    }
  }
}

function restorePreviousLyrics() {
  applyLyricsToScore([], previousVerse, placementSelector.currentValue);
  previousLyrics = [];
  previousVerse = verseSelector.value;
}

function confirm() {
  previousLyrics = [];
  // TODO: 選択を移動させる
}