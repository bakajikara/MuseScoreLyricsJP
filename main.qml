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

import QtQuick
import MuseScore
import Muse.UiComponents
import "script.js" as Script

MuseScore {
    version: "1.1.4"
    description: "日本語の歌詞入力を簡単に行うためのプラグインです。"
    title: "日本語歌詞入力"
    categoryCode: "lyrics"
    thumbnailName: "thumbnail.png"
    pluginType: "dialog"

    requiresScore: true

    width: 512
    height: 64

    onRun: {}

    // 指定要素の子孫から displayText を持つ内部 TextInput を探索
    function findTextInput(item) {
        if (!item) {
            return null;
        }
        if (item.displayText !== undefined) {
            return item;
        }
        if (item.children) {
            for (let i = 0; i < item.children.length; i++) {
                let found = findTextInput(item.children[i]);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    }

    // 入力欄のテキストを未確定文字列も含めて取得
    function getCurrentInputText() {
        if (textInputConnection.target) {
            return textInputConnection.target.displayText;
        }
        return lyricsInput.currentText;
    }

    // プログラムからのクリア時に反映イベントが走らないよう入力欄を初期化
    function clearLyricsInput() {
        lyricsInput.isClearing = true;
        lyricsInput.clear();
        lyricsInput.currentText = "";
        lyricsInput.isClearing = false;
    }

    Item {
        anchors.fill: parent

        TextInputField {
            id: lyricsInput

            property bool isClearing: false

            anchors.top: parent.top
            anchors.left: parent.left

            width: parent.width
            height: 32

            hint: "ここに歌詞を入力"

            Component.onCompleted: {
                textInputConnection.target = findTextInput(lyricsInput);
                ensureActiveFocus();
            }

            // 内部 TextInput を取得できない環境向けのフォールバック
            onTextEdited: {
                if (textInputConnection.target || isClearing) {
                    return;
                }
                currentText = newTextValue;
                curScore.startCmd();
                Script.applyLyricsToScore(Script.splitLyrics(newTextValue), verseSelector.currentValue - 1, placementSelector.currentValue);
                curScore.endCmd();
            }

            onAccepted: {
                curScore.startCmd();
                Script.confirmInput();
                curScore.endCmd();
                clearLyricsInput();
                Qt.callLater(ensureActiveFocus);
            }
        }

        // IME の未確定文字列を含む表示テキストの変化を監視
        Connections {
            id: textInputConnection
            target: null

            function onDisplayTextChanged() {
                if (lyricsInput.isClearing) {
                    return;
                }
                let text = target.displayText;
                curScore.startCmd();
                Script.applyLyricsToScore(Script.splitLyrics(text), verseSelector.currentValue - 1, placementSelector.currentValue);
                curScore.endCmd();
            }
        }

        IncrementalPropertyControl {
            id: verseSelector

            anchors.bottom: parent.bottom
            anchors.left: parent.left

            width: 64
            height: 32

            currentValue: 1

            step: 1
            decimals: 0
            minValue: 1
            maxValue: 999

            measureUnitsSymbol: "番"

            onValueEdited: {
                currentValue = newValue;
                curScore.startCmd();
                Script.restorePreviousLyrics(newValue - 1, placementSelector.currentValue);
                Script.applyLyricsToScore(Script.splitLyrics(getCurrentInputText()), newValue - 1, placementSelector.currentValue);
                curScore.endCmd();
            }
        }

        StyledDropdown {
            id: placementSelector

            anchors.bottom: parent.bottom
            anchors.left: verseSelector.right

            width: 128
            height: 32

            currentIndex: 0

            model: [
                { text: "デフォルト", value: null },
                { text: "上", value: Placement.ABOVE },
                { text: "下", value: Placement.BELOW }
            ]

            onActivated: {
                currentIndex = index;
                curScore.startCmd();
                Script.applyLyricsToScore(Script.splitLyrics(getCurrentInputText()), verseSelector.currentValue - 1, currentValue);
                curScore.endCmd();
            }
        }

        FlatButton {
            id: cancelButton

            anchors.bottom: parent.bottom
            anchors.right: confirmButton.left

            width: 64
            height: 32

            text: "取消"

            onClicked: {
                curScore.startCmd();
                Script.restorePreviousLyrics(verseSelector.currentValue - 1, placementSelector.currentValue);
                curScore.endCmd();
                clearLyricsInput();
            }
        }

        FlatButton {
            id: confirmButton

            anchors.bottom: parent.bottom
            anchors.right: parent.right

            width: 64
            height: 32

            text: "確定"
            accentButton: true

            onClicked: {
                curScore.startCmd();
                Script.confirmInput();
                curScore.endCmd();
                clearLyricsInput();
                lyricsInput.ensureActiveFocus();
            }
        }
    }
}
