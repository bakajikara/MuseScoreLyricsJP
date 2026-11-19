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
import "updater.js" as Updater

MuseScore {
    id: root

    version: "1.2.1"
    description: "日本語の歌詞入力を簡単に行うためのプラグインです。"
    title: "日本語歌詞入力"
    categoryCode: "lyrics"
    thumbnailName: "thumbnail.png"
    pluginType: "dialog"

    requiresScore: true

    readonly property int baseHeight: 64
    readonly property int bannerHeight: 32
    readonly property string pluginDir: Updater.urlToLocalPath(Qt.resolvedUrl("."))
    property var pendingXhr: null

    implicitWidth: 512
    implicitHeight: baseHeight + (updateBanner.visible ? bannerHeight : 0)
    width: implicitWidth
    height: implicitHeight

    onRun: {
        syncScoreState();
        Script.showSelectionTargetsInScore();
        initializeUpdateCheck();
    }

    Component.onDestruction: {
        if (pendingXhr) {
            pendingXhr.abort();
            pendingXhr = null;
        }
    }

    Settings {
        id: updateSettings
        fileName: Updater.settingsFilePath(root.pluginDir)
        category: "Update"

        property bool checkForUpdates: true
        property string skippedVersion: ""
        property string pendingVersion: ""
        property string updateBranch: "main"
        property string lastCheckDate: ""
        property string availableVersion: ""
        property string availableBranch: ""
    }

    QProcess {
        id: updater

        property bool isCanceling: false

        onReadyReadStandardOutput: {
            let output = String(updater.readAllStandardOutput() || "");
            if (output.indexOf("APPLYING") !== -1 && updateBanner.bannerState == "updating") {
                updateBanner.bannerState = "applying";
            }
        }

        onFinished: function (exitCode, exitStatus) {
            if (isCanceling) {
                isCanceling = false;
                return;
            }
            if (exitCode == 0) {
                updateSettings.pendingVersion = updateBanner.targetVersion;
                updateSettings.availableVersion = "";
                updateSettings.availableBranch = "";
                updateBanner.bannerState = "restart";
            } else {
                updateBanner.errorText = Updater.describeUpdateExitCode(exitCode);
                updateBanner.bannerState = "error";
            }
        }

        onErrorOccurred: function (error) {
            if (isCanceling) {
                Qt.callLater(function () {
                    updater.isCanceling = false;
                });
                return;
            }
            updateBanner.errorText = "更新プログラムを起動できませんでした";
            updateBanner.bannerState = "error";
        }
    }

    // 起動時の更新状態復元と更新確認を実行
    function initializeUpdateCheck() {
        if (updateSettings.pendingVersion != "") {
            if (Updater.compareVersion(root.version, updateSettings.pendingVersion) >= 0) {
                updateSettings.pendingVersion = "";
            } else {
                updateBanner.targetVersion = updateSettings.pendingVersion;
                updateBanner.bannerState = "restart";
                return;
            }
        }
        if (!updateSettings.checkForUpdates) {
            return;
        }
        restoreAvailableUpdate();
        if (shouldCheckUpdatesToday()) {
            requestUpdateInfo(updateSettings.updateBranch);
        }
    }

    // 保存済みの未適用バージョン情報を検証してバナーへ復元
    function restoreAvailableUpdate() {
        let configuredBranch = Updater.normalizeBranch(updateSettings.updateBranch);
        let savedBranch = updateSettings.availableBranch;
        if (savedBranch != "" && savedBranch != configuredBranch && savedBranch != "main") {
            updateSettings.availableVersion = "";
            updateSettings.availableBranch = "";
            updateSettings.lastCheckDate = "";
            return;
        }
        if (updateSettings.availableVersion == "") {
            return;
        }
        if (Updater.compareVersion(updateSettings.availableVersion, root.version) <= 0) {
            updateSettings.availableVersion = "";
            updateSettings.availableBranch = "";
            return;
        }
        if (updateSettings.availableVersion != updateSettings.skippedVersion) {
            updateBanner.targetVersion = updateSettings.availableVersion;
            updateBanner.targetBranch = savedBranch != "" ? savedBranch : configuredBranch;
            updateBanner.bannerState = "available";
        }
    }

    // 本日の日付文字列を yyyy-MM-dd 形式で取得
    function todayDateString() {
        let now = new Date();
        let y = now.getFullYear();
        let m = ("0" + (now.getMonth() + 1)).slice(-2);
        let d = ("0" + now.getDate()).slice(-2);
        return y + "-" + m + "-" + d;
    }

    // 更新確認を実行すべきタイミングか判定
    function shouldCheckUpdatesToday() {
        if (Updater.normalizeBranch(updateSettings.updateBranch) != "main") {
            return true;
        }
        return updateSettings.lastCheckDate != todayDateString();
    }

    // MuseScore 本体のバージョン番号を取得
    function currentMscoreVersion() {
        if (typeof root.mscoreVersion == "number" && root.mscoreVersion > 0) {
            return root.mscoreVersion;
        }
        return (root.mscoreMajorVersion || 0) * 10000
             + (root.mscoreMinorVersion || 0) * 100
             + (root.mscoreUpdateVersion || 0);
    }

    // リモートから更新情報を取得し、対象ブランチが存在しない場合は main へフォールバック
    function requestUpdateInfo(branch) {
        let xhr = new XMLHttpRequest();
        let targetBranch = Updater.normalizeBranch(branch);
        let url = Updater.getUpdateInfoUrl(targetBranch) + "?t=" + new Date().getTime();

        root.pendingXhr = xhr;

        xhr.onreadystatechange = function () {
            if (xhr.readyState != XMLHttpRequest.DONE) {
                return;
            }
            if (root.pendingXhr === xhr) {
                root.pendingXhr = null;
            }
            if (xhr.status == 404 && targetBranch != "main") {
                requestUpdateInfo("main");
                return;
            }
            if (xhr.status != 200) {
                return;
            }

            let info;
            try {
                info = JSON.parse(xhr.responseText);
            } catch (e) {
                return;
            }

            updateSettings.lastCheckDate = todayDateString();

            if (!Updater.isUpdateAvailable(info, root.version, currentMscoreVersion())) {
                updateSettings.availableVersion = "";
                updateSettings.availableBranch = "";
                return;
            }

            let latestVersion = String(info.version);
            updateSettings.availableVersion = latestVersion;
            updateSettings.availableBranch = targetBranch;

            if (latestVersion == updateSettings.skippedVersion) {
                return;
            }

            updateBanner.targetVersion = latestVersion;
            updateBanner.targetBranch = targetBranch;
            updateBanner.bannerState = "available";
        };

        xhr.open("GET", url, true);
        xhr.send();
    }

    // 外部プロセスでプラグインの更新を実行
    function startUpdateProcess() {
        if (!Updater.isDedicatedPluginDir(root.pluginDir)) {
            updateBanner.errorText = Updater.describeUpdateExitCode(14);
            updateBanner.bannerState = "error";
            return;
        }

        updater.isCanceling = false;
        updateBanner.bannerState = "updating";
        let branchToUse = updateBanner.targetBranch != ""
            ? updateBanner.targetBranch
            : Updater.normalizeBranch(updateSettings.updateBranch);
        let cmd = Updater.makeCommand(
            Updater.currentPlatform(),
            root.pluginDir,
            branchToUse,
            updateBanner.targetVersion
        );
        updater.startWithArgs(cmd.program, cmd.args);
    }

    // ファイル適用フェーズに入る前であれば更新プロセスを中断して通知状態へ戻す
    function cancelUpdateProcess() {
        if (updateBanner.bannerState != "updating") {
            return;
        }
        updater.isCanceling = true;
        updater.kill();
        updateBanner.bannerState = "available";
    }

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

    // フォーカス復帰や実行時にスコア側の変更と状態を同期
    function syncScoreState() {
        Script.invalidateSlurCache();
        let change = Script.evaluateSelectionChange();
        if (change.status == "reset") {
            Script.resetInputState();
            clearLyricsInput();
        } else if (change.status == "partial") {
            curScore.startCmd();
            Script.updateTargetsPartially(change.newTargets, change.removedTargets, placementSelector.currentValue);
            Script.applyLyricsToScore(Script.splitLyrics(getCurrentInputText()), verseSelector.currentValue - 1, placementSelector.currentValue);
            curScore.endCmd();
            Script.showCurrentInputInScore();
        }
    }

    FocusScope {
        id: rootFocusScope

        anchors.top: parent.top
        anchors.left: parent.left
        anchors.right: parent.right
        height: root.baseHeight

        onActiveFocusChanged: {
            if (activeFocus) {
                syncScoreState();
            }
        }

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
                Script.showCurrentInputInScore();
            }

            onAccepted: {
                curScore.startCmd();
                Script.confirmInput();
                curScore.endCmd();
                Script.showSelectionTargetsInScore();
                clearLyricsInput();
                Qt.callLater(ensureActiveFocus);
            }
        }

        // IME の未確定文字列を含む表示テキストの変化とフォーカス復帰を監視
        Connections {
            id: textInputConnection
            target: null

            function onActiveFocusChanged() {
                if (target.activeFocus) {
                    syncScoreState();
                }
            }

            function onDisplayTextChanged() {
                if (lyricsInput.isClearing) {
                    return;
                }
                let text = target.displayText;
                curScore.startCmd();
                Script.applyLyricsToScore(Script.splitLyrics(text), verseSelector.currentValue - 1, placementSelector.currentValue);
                curScore.endCmd();
                Script.showCurrentInputInScore();
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
                Script.showCurrentInputInScore();
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
                Script.showCurrentInputInScore();
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
                let restoredTargets = Script.restorePreviousLyrics(verseSelector.currentValue - 1, placementSelector.currentValue);
                curScore.endCmd();
                Script.showTargetsStartInScore(restoredTargets);
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
                Script.showSelectionTargetsInScore();
                clearLyricsInput();
                lyricsInput.ensureActiveFocus();
            }
        }
    }

    // 更新通知および進行状況バナー
    Rectangle {
        id: updateBanner

        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: root.bannerHeight

        // 状態: "hidden" | "available" | "updating" | "applying" | "restart" | "error"
        property string bannerState: "hidden"
        property string targetVersion: ""
        property string targetBranch: ""
        property string errorText: ""

        visible: bannerState != "hidden"
        color: Qt.tint(
            ui.theme.backgroundPrimaryColor,
            Qt.rgba(ui.theme.accentColor.r, ui.theme.accentColor.g, ui.theme.accentColor.b, 0.18)
        )

        Rectangle {
            anchors.top: parent.top
            anchors.left: parent.left
            anchors.right: parent.right
            height: 1
            color: ui.theme.accentColor
            opacity: 0.5
        }

        StyledTextLabel {
            anchors.left: parent.left
            anchors.leftMargin: 8
            anchors.right: bannerButtonRow.visible ? bannerButtonRow.left : parent.right
            anchors.rightMargin: 8
            anchors.verticalCenter: parent.verticalCenter
            horizontalAlignment: Text.AlignLeft
            text: {
                if (updateBanner.bannerState == "available") {
                    return "新しいバージョン " + updateBanner.targetVersion + " が利用可能です（現在: " + root.version + "）";
                }
                if (updateBanner.bannerState == "updating" || updateBanner.bannerState == "applying") {
                    return "更新しています...";
                }
                if (updateBanner.bannerState == "restart") {
                    return "更新が完了しました。MuseScore Studio の再起動後に反映されます";
                }
                if (updateBanner.bannerState == "error") {
                    return updateBanner.errorText;
                }
                return "";
            }
        }

        Row {
            id: bannerButtonRow

            anchors.right: parent.right
            anchors.rightMargin: 8
            anchors.verticalCenter: parent.verticalCenter
            spacing: 4
            visible: updateBanner.bannerState != "hidden" && updateBanner.bannerState != "applying"

            // 現在の通知バージョンをスキップ対象に保存
            FlatButton {
                visible: updateBanner.bannerState == "available"
                width: 64
                height: 24
                text: "スキップ"
                onClicked: {
                    updateSettings.skippedVersion = updateBanner.targetVersion;
                    updateBanner.bannerState = "hidden";
                    lyricsInput.ensureActiveFocus();
                }
            }

            // バナーを一時的に非表示にする
            FlatButton {
                visible: updateBanner.bannerState == "available"
                width: 52
                height: 24
                text: "あとで"
                onClicked: {
                    updateBanner.bannerState = "hidden";
                    lyricsInput.ensureActiveFocus();
                }
            }

            // ファイル適用前のみ更新を中止
            FlatButton {
                visible: updateBanner.bannerState == "updating"
                width: 56
                height: 24
                text: "中止"
                onClicked: {
                    root.cancelUpdateProcess();
                    lyricsInput.ensureActiveFocus();
                }
            }

            // 完了またはエラーのバナーを閉じる
            FlatButton {
                visible: updateBanner.bannerState == "restart" || updateBanner.bannerState == "error"
                width: 56
                height: 24
                text: "閉じる"
                onClicked: {
                    updateBanner.bannerState = "hidden";
                    lyricsInput.ensureActiveFocus();
                }
            }

            // 更新処理を開始
            FlatButton {
                visible: updateBanner.bannerState == "available"
                width: 56
                height: 24
                text: "更新"
                accentButton: true
                onClicked: {
                    root.startUpdateProcess();
                    lyricsInput.ensureActiveFocus();
                }
            }
        }
    }
}
