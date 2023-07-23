import MuseScore 3.0
import QtQuick 2.15
import QtQuick.Controls 2.15
import "script.js" as Script

MuseScore {
    version: "1.0.0"
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

        TextField {
            id: lyricsInput

            anchors.top: parent.top
            anchors.left: parent.left

            width: parent.width
            height: 32

            placeholderText: "ここに歌詞を入力"
            selectByMouse: true

            onTextEdited: {
                curScore.startCmd();
                Script.applyLyricsToScore(Script.splitLyrics(text), verseSelector.value, placementSelector.currentValue);
                curScore.endCmd();
            }
        }

        SpinBox {
            id: verseSelector

            anchors.bottom: parent.bottom
            anchors.left: parent.left

            width: 64
            height: 32

            from: 0
            to: 999

            textFromValue: function(value, locale) { return value + 1 + "番"; }
            valueFromText: function(text, locale) { return parseInt(text) - 1; }

            onValueModified: {
                curScore.startCmd();
                Script.restorePreviousLyrics();
                Script.applyLyricsToScore(Script.splitLyrics(lyricsInput.text), value, placementSelector.currentValue);
                curScore.endCmd();
            }
        }

        ComboBox {
            id: placementSelector

            anchors.bottom: parent.bottom
            anchors.left: verseSelector.right

            width: 96
            height: 32
            
            textRole: "text"
            valueRole: "value"

            model: [
                { value: null, text: "デフォルト" },
                { value: Placement.ABOVE, text: "上" },
                { value: Placement.BELOW, text: "下" }
            ]
            
            onActivated: {
                curScore.startCmd();
                Script.applyLyricsToScore(Script.splitLyrics(lyricsInput.text), verseSelector.value, currentValue);
                curScore.endCmd();
            }
        }
        
        Button {
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
                lyricsInput.text = "";
            }
        }

        Button {
            id: confirmButton

            anchors.bottom: parent.bottom
            anchors.right: parent.right

            width: 64
            height: 32

            text: "確定"

            onClicked: {
                curScore.startCmd();
                Script.confirm();
                curScore.endCmd();
                lyricsInput.text = "";
            }
        }
    }
}
