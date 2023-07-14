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

    onRun: {}
}
