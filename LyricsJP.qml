/*
 * Copyright © 2023-2025 bakajikara
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

import MuseScore 3.0
import QtQuick 2.15
import QtQuick.Controls 2.15
import Muse.UiComponents 1.0
import "script.js" as Script

MuseScore {
    version: "1.1.1"
    description: "日本語の歌詞入力を簡単に行うためのプラグインです。"
    title: "日本語歌詞入力"
    categoryCode: "lyrics"
    thumbnailName: "LyricsJP.png"
    pluginType: "dialog"

    requiresScore: true

    width: 512
    height: 64

    onRun: {}

    Item {
        anchors.fill: parent

        TextInputField {
            id: lyricsInput

            anchors.top: parent.top
            anchors.left: parent.left

            width: parent.width
            height: 32

            hint: "ここに歌詞を入力"

            onTextEdited: {
                currentText = newTextValue;
                curScore.startCmd();
                Script.applyLyricsToScore(Script.splitLyrics(newTextValue), verseSelector.currentValue - 1, placementSelector.currentValue);
                curScore.endCmd();
            }

            onAccepted: {
                curScore.startCmd();
                Script.confirm();
                curScore.endCmd();
                clear();
                Qt.callLater(ensureActiveFocus);
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
                Script.restorePreviousLyrics();
                Script.applyLyricsToScore(Script.splitLyrics(lyricsInput.currentText), newValue - 1, placementSelector.currentValue);
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
                Script.applyLyricsToScore(Script.splitLyrics(lyricsInput.currentText), verseSelector.currentValue - 1, currentValue);
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
                Script.restorePreviousLyrics();
                curScore.endCmd();
                lyricsInput.clear();
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
                Script.confirm();
                curScore.endCmd();
                lyricsInput.clear();
                lyricsInput.ensureActiveFocus();
            }
        }
    }
}
