// kwin-i3's page (docs/spec-settings-page.md): the script's settings, as Plasma's own pages lay
// theirs out, and a button to the Keys sub-page.
import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM
import org.kde.kquickcontrols as KQC

KCM.SimpleKCM {
    id: root

    readonly property var settings: kcm.settings

    header: ColumnLayout {
        spacing: 0
        Kirigami.InlineMessage {
            Layout.fillWidth: true
            position: Kirigami.InlineMessage.Position.Header
            type: Kirigami.MessageType.Warning
            visible: !kcm.scriptEnabled
            text: i18n("kwin-i3 is turned off, so these settings do nothing yet.")
            actions: Kirigami.Action {
                text: i18n("Turn On")
                icon.name: "system-run"
                onTriggered: kcm.enableScript()
            }
        }
        Kirigami.InlineMessage {
            Layout.fillWidth: true
            position: Kirigami.InlineMessage.Position.Header
            type: Kirigami.MessageType.Error
            visible: kcm.scriptEnabled && !kcm.scriptLoaded
            text: i18n("kwin-i3 is turned on but not running. The system log says why (journalctl --user -b | grep kwin-i3).")
        }
    }

    // A spin box that shows its unit: "8 px".
    component UnitSpinBox: QQC2.SpinBox {
        property string unit
        textFromValue: (value) => i18nc("number and unit", "%1 %2", value, unit)
        valueFromText: (text) => parseInt(text)
    }

    // A choice stored as i3's word ("auto", "force"), shown as words a person would say.
    component ChoiceBox: QQC2.ComboBox {
        property string settingName
        textRole: "text"
        valueRole: "value"
        // Not a binding on indexOfValue: it runs before the model is set and isn't re-run after.
        readonly property string stored: root.settings[settingName]
        function sync() { currentIndex = indexOfValue(stored) }
        onStoredChanged: sync()
        onCountChanged: sync()
        Component.onCompleted: sync()
        onActivated: root.settings[settingName] = currentValue
        KCM.SettingStateBinding {
            configObject: root.settings
            settingName: parent.settingName
        }
    }

    component ListField: QQC2.TextField {
        property string settingName
        Layout.preferredWidth: Kirigami.Units.gridUnit * 22
        text: root.settings[settingName]
        onTextEdited: root.settings[settingName] = text
        KCM.SettingStateBinding {
            configObject: root.settings
            settingName: parent.settingName
        }
    }

    component FrameColour: KQC.ColorButton {
        property string settingName
        showAlphaChannel: false
        color: root.settings[settingName]
        onAccepted: (c) => root.settings[settingName] = c.toString()
        enabled: kcm.frameAvailable
        KCM.SettingStateBinding {
            configObject: root.settings
            settingName: parent.settingName
            extraEnabledConditions: kcm.frameAvailable
        }
    }

    Kirigami.FormLayout {
        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18n("Layout")
        }
        UnitSpinBox {
            Kirigami.FormData.label: i18n("Gap between windows:")
            unit: i18n("px")
            from: 0; to: 100
            value: root.settings.gapsInner
            onValueModified: root.settings.gapsInner = value
            KCM.SettingStateBinding { configObject: root.settings; settingName: "gapsInner" }
        }
        UnitSpinBox {
            Kirigami.FormData.label: i18n("Extra gap at screen edges:")
            unit: i18n("px")
            from: 0; to: 200
            value: root.settings.gapsOuter
            onValueModified: root.settings.gapsOuter = value
            KCM.SettingStateBinding { configObject: root.settings; settingName: "gapsOuter" }
        }
        ChoiceBox {
            Kirigami.FormData.label: i18n("New workspaces split:")
            settingName: "defaultOrientation"
            model: [
                { text: i18n("Side by side, or stacked on a tall monitor"), value: "auto" },
                { text: i18n("Side by side"), value: "horizontal" },
                { text: i18n("Stacked"), value: "vertical" },
            ]
        }
        UnitSpinBox {
            Kirigami.FormData.label: i18n("Resize step:")
            unit: "%"
            from: 1; to: 50
            value: root.settings.resizeStep
            onValueModified: root.settings.resizeStep = value
            KCM.SettingStateBinding { configObject: root.settings; settingName: "resizeStep" }
        }
        ChoiceBox {
            Kirigami.FormData.label: i18n("Focus at an edge:")
            settingName: "focusWrapping"
            model: [
                { text: i18n("Next monitor, else wrap around"), value: "yes" },
                { text: i18n("Next monitor, never wrap"), value: "no" },
                { text: i18n("Always wrap inside the container"), value: "force" },
                { text: i18n("Wrap, never leave the workspace"), value: "workspace" },
            ]
        }

        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18n("Workspaces")
        }
        ListField {
            Kirigami.FormData.label: i18n("Workspace monitors:")
            settingName: "workspaceOutputs"
            placeholderText: i18n("e.g. 1=DP-4, 2=DP-6")
        }
        QQC2.Label {
            Layout.preferredWidth: Kirigami.Units.gridUnit * 22
            wrapMode: Text.Wrap
            font: Kirigami.Theme.smallFont
            text: i18n("Connected now: %1. Unlisted workspaces start on the first free monitor.",
                       Qt.application.screens.map((s) => s.name).join(", "))
        }
        QQC2.CheckBox {
            Kirigami.FormData.label: i18n("Back and forth:")
            text: i18n("The key for the workspace you are on goes back to the previous one")
            checked: root.settings.workspaceAutoBackAndForth
            onToggled: root.settings.workspaceAutoBackAndForth = checked
            KCM.SettingStateBinding { configObject: root.settings; settingName: "workspaceAutoBackAndForth" }
        }

        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18n("Window rules")
        }
        ListField {
            Kirigami.FormData.label: i18n("Never manage classes:")
            settingName: "ignoreClass"
        }
        ListField {
            Kirigami.FormData.label: i18n("Never manage roles:")
            settingName: "ignoreRole"
        }
        ListField {
            Kirigami.FormData.label: i18n("Float classes:")
            settingName: "floatingClass"
        }
        ListField {
            Kirigami.FormData.label: i18n("Float titles containing:")
            settingName: "floatingTitle"
        }
        QQC2.Label {
            Layout.preferredWidth: Kirigami.Units.gridUnit * 22
            wrapMode: Text.Wrap
            font: Kirigami.Theme.smallFont
            text: i18n("Comma-separated. KWin's Window Rules page can detect a window's class.")
        }

        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18n("Frame")
        }
        QQC2.Label {
            visible: !kcm.frameAvailable
            Layout.preferredWidth: Kirigami.Units.gridUnit * 22
            wrapMode: Text.Wrap
            text: i18n("Needs the kwin-i3 plugins. Without them, tiled windows keep their title bars.")
        }
        UnitSpinBox {
            Kirigami.FormData.label: i18n("Width:")
            unit: i18n("px")
            from: 1; to: 10
            value: root.settings.frameWidth
            onValueModified: root.settings.frameWidth = value
            KCM.SettingStateBinding { configObject: root.settings; settingName: "frameWidth"; extraEnabledConditions: kcm.frameAvailable }
        }
        FrameColour {
            Kirigami.FormData.label: i18n("Focused window:")
            settingName: "frameActive"
        }
        FrameColour {
            Kirigami.FormData.label: i18n("Other windows:")
            settingName: "frameInactive"
        }
        QQC2.CheckBox {
            Kirigami.FormData.label: i18n("Floating windows:")
            text: i18n("Frame them too (else they keep their own title bar)")
            checked: root.settings.frameOnFloating
            onToggled: root.settings.frameOnFloating = checked
            KCM.SettingStateBinding { configObject: root.settings; settingName: "frameOnFloating"; extraEnabledConditions: kcm.frameAvailable }
        }
        // The floating colours only mean something with the frame on floating windows
        // (docs/spec-window-modes.md, decision 3).
        FrameColour {
            Kirigami.FormData.label: i18n("Focused floating window:")
            settingName: "frameFloatingActive"
            enabled: kcm.frameAvailable && root.settings.frameOnFloating
        }
        FrameColour {
            Kirigami.FormData.label: i18n("Other floating windows:")
            settingName: "frameFloatingInactive"
            enabled: kcm.frameAvailable && root.settings.frameOnFloating
        }

        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18n("Plasma windows")
        }
        // floatingWorkspaces, "3, 7": a box per workspace (docs/spec-window-modes.md, decision 1).
        GridLayout {                            // two rows of five: the form keeps its width
            id: plasmaWorkspaces
            columns: 5
            uniformCellWidths: true
            Kirigami.FormData.label: i18n("Workspaces:")
            // As the script parses it (src/settings.js, "workspaces"): whole numbers 1-10 only.
            readonly property var chosen: root.settings.floatingWorkspaces.split(",").map(s => s.trim()).filter(s => /^[0-9]+$/.test(s)).map(s => parseInt(s)).filter(n => n >= 1 && n <= 10)
            function toggle(n, on) {
                const set = chosen.filter(m => m !== n);
                if (on) set.push(n);
                root.settings.floatingWorkspaces = set.sort((a, b) => a - b).join(", ");
            }
            Repeater {
                model: 10
                QQC2.CheckBox {
                    text: String(index + 1)
                    checked: plasmaWorkspaces.chosen.indexOf(index + 1) >= 0
                    onToggled: plasmaWorkspaces.toggle(index + 1, checked)
                }
            }
        }
        QQC2.Label {
            Layout.preferredWidth: Kirigami.Units.gridUnit * 22
            wrapMode: Text.Wrap
            font: Kirigami.Theme.smallFont
            // The row's own label stays short: a long one here broke the label clicks of the
            // Layout section's fields (tests/live/37-settings-page.sh, 2026-10-24; cause not found).
            text: i18n("New windows on these workspaces open as Plasma windows: floating, with their own title bar; Meta+Shift+Space tiles one. A window keeps its mode when it moves to another workspace.")
            // Out of the grid, which would give it a cell of its own (the first, pushing 1-4 right).
            KCM.SettingStateBinding { target: plasmaWorkspaces; configObject: root.settings; settingName: "floatingWorkspaces" }
        }

        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18n("Atomic layout")
        }
        QQC2.Label {
            visible: !kcm.holdLoaded
            Layout.preferredWidth: Kirigami.Units.gridUnit * 22
            wrapMode: Text.Wrap
            text: i18n("Needs the kwin-i3 plugins.")
        }
        QQC2.CheckBox {
            Kirigami.FormData.label: i18n("Atomic layout:")
            text: i18n("Show a new layout once every window has its new size")
            checked: root.settings.holdEnabled
            onToggled: root.settings.holdEnabled = checked
            KCM.SettingStateBinding { configObject: root.settings; settingName: "holdEnabled"; extraEnabledConditions: kcm.holdLoaded }
        }
        UnitSpinBox {
            Kirigami.FormData.label: i18n("Wait at most:")
            unit: i18n("ms")
            from: 10; to: 2000
            stepSize: 10
            value: root.settings.holdTimeoutMs
            onValueModified: root.settings.holdTimeoutMs = value
            KCM.SettingStateBinding { configObject: root.settings; settingName: "holdTimeoutMs"; extraEnabledConditions: kcm.holdLoaded && root.settings.holdEnabled }
        }

        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18n("Keys and more")
        }
        QQC2.Button {
            Kirigami.FormData.label: i18n("Keys:")
            text: i18n("Configure Keys…")
            icon.name: "configure-shortcuts"
            onClicked: kcm.push("Keys.qml")
        }
        QQC2.CheckBox {
            Kirigami.FormData.label: i18n("Taken keys:")
            text: i18n("Say at login which of kwin-i3's keys other shortcuts hold")
            checked: root.settings.warnTakenKeys
            onToggled: root.settings.warnTakenKeys = checked
            KCM.SettingStateBinding { configObject: root.settings; settingName: "warnTakenKeys" }
        }
        QQC2.CheckBox {
            Kirigami.FormData.label: i18n("Debug log:")
            text: i18n("Log every action, for bug reports")
            checked: root.settings.debugLog
            onToggled: root.settings.debugLog = checked
            KCM.SettingStateBinding { configObject: root.settings; settingName: "debugLog" }
        }
    }
}
