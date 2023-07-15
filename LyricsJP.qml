import MuseScore 3.0
import QtQuick 2.15
import QtQuick.Controls 2.15

MuseScore {
    version: "0.0.0"
    description: "日本語の歌詞入力を簡単に行うためのプラグインです。"
    title: "日本語歌詞入力"
    categoryCode: "lyrics"
    thumbnailName: "LyricsJP.png"
    pluginType: "dialog"

    requiresScore: true

    width: 512
    height: 32

    onRun: {}

    Item {
        anchors.fill: parent

        TextField {
            id: lyricsInput

            anchors.top: parent.top
            anchors.left: parent.left

            width: parent.width - 100
            height: 32

            placeholderText: "ここに歌詞を入力"

            onTextEdited: {
                curScore.startCmd();
                curScore.endCmd();
            }
        }

        Button {
            text: "確定"

            anchors.top: parent.top
            anchors.right: parent.right

            width: 100
            height: 32

            onClicked: {
                lyricsInput.text = "";
            }
        }
    }
}
