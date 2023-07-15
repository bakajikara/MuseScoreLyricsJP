function splitLyrics(lyrics) {
  const combineRules = [
    { previous: /[a-zA-Z'ａ-ｚＡ-Ｚ＇]/ , current: /[a-zA-Z'ａ-ｚＡ-Ｚ＇]/ }, // 英単語の結合
    // { previous: /[\p{Ll}\p{Lt}\p{Lu}]/u , current: /[\p{Ll}\p{Lt}\p{Lu}]/u }, // 小文字と大文字の結合
    { previous: /[ぁ-ゟ]/ , current: /[ぁぃぅぇぉゃゅょゎゕゖ]/ }, // 小書き文字の一部と濁点半濁点は前のひらがなと結合
    { previous: /[ァ-ヿ]/ , current: /[ァィゥェォャュョヮヵヶ゙゚゛゜]/ }, // 小書き文字の一部は前のカタカナと結合
    { previous: /[ｦ-ﾝ]/, current: /[ｧ-ｮ]/}, // 小書き文字の一部は前の半角カタカナと結合
    { previous: /[ぁ-ゟァ-ヿｦ-ﾝ]/ , current: /[゙゚゛゜ﾞﾟ]/ }, // 濁点半濁点は前の仮名と結合
    { previous: /./, current: /[,.:;!?､｡、。：；！？]/ }, // 句読点や記号は前の文字と結合
    { previous: /[‘“(（｢「『]/, current: /./ }, // 開き記号は後の文字と結合
    { previous: /./, current: /[’”)）｣」』]/}, // 閉じ記号は前の文字と結合
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
        result.push(currentGroup);
      }
      currentGroup = currentChar == " " ? "" : currentChar; // スペースの場合は追加しない
    }
  }

  if (currentGroup != "") {
    result.push(currentGroup);
  }

  return result;
}

function applyLyricsToScore(lyrics, verse) {
  const lyricsList = splitLyrics(lyrics);
  let processDataList = [];

  if (curScore.selection.isRange) {
    let selection = curScore.selection;
    let cursor = curScore.newCursor();
    cursor.track = selection.startStaff * 4;
    cursor.rewind(Cursor.SELECTION_START);
    while (cursor.segment && cursor.tick < selection.endSegment.tick + 1) {
      if (cursor.element.type == Element.CHORD) {
        processDataList.push( { track: cursor.track, startTick: cursor.tick } );
        break;
      }
      cursor.next();
    }
  } else {
    // TODO: ティックを取得
    // for (var i in curScore.selection.elements) {
    // }
  }

  for (const processData of processDataList) {
    let cursor = curScore.newCursor();
    cursor.track = processData.track;
    cursor.rewindToTick(processData.startTick);
    while (cursor.segment && lyricsList.length > 0) {
      let lyrics = cursor.element.lyrics;
      for (var i = 0; i < lyrics.length; i++) {
        if (lyrics[i].verse == verse) {
          cursor.element.remove(lyrics[i]);
          i--;
        }
      }
      if (cursor.element.type == Element.CHORD) {
        let lyric = newElement(Element.LYRICS);
        lyric.text = lyricsList.shift();
        cursor.element.add(lyric);
      }
      cursor.next();
    }
  }
}
