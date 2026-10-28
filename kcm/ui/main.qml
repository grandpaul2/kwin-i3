// kwin-i3's page (docs/spec-settings-page.md, laid out by docs/spec-settings-cleanup.md): the
// script's settings as Plasma's own pages lay theirs out, with three sub-pages: Workspaces,
// Window Rules and Keys. Every control says what it is to a screen reader
// (tests/live/75-settings-a11y.sh).
import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM
import org.kde.kquickcontrols as KQC
import "settings.js" as Logic

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
                text: i18nc("@action:button", "Turn On")
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
        // One message for both plugin features, in place of a note in each section.
        Kirigami.InlineMessage {
            Layout.fillWidth: true
            position: Kirigami.InlineMessage.Position.Header
            type: Kirigami.MessageType.Information
            visible: kcm.scriptLoaded && !kcm.holdLoaded
            text: i18n("The frame and waiting for windows to resize need kwin-i3's plugins. Without them, tiled windows keep their title bars.")
        }
    }

    // A spin box that shows its unit: "8 px".
    component UnitSpinBox: QQC2.SpinBox {
        property string unit
        textFromValue: (value) => unit === "ms" ? i18ncp("@item:valuesuffix milliseconds", "%1 ms", "%1 ms", value)
                                : unit === "%" ? i18nc("@item:valuesuffix percent", "%1%", value)
                                : i18ncp("@item:valuesuffix pixels", "%1 px", "%1 px", value)
        valueFromText: (text) => parseInt(text)
    }

    // A choice stored as i3's word ("auto", "force"), shown as words a person would say.
    component ChoiceBox: QQC2.ComboBox {
        property string settingName
        property bool applies: true
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
            extraEnabledConditions: parent.applies
        }
    }

    component FrameColour: KQC.ColorButton {
        property string settingName
        property bool applies: true
        showAlphaChannel: false
        color: root.settings[settingName]
        onAccepted: (c) => root.settings[settingName] = c.toString()
        KCM.SettingStateBinding {
            configObject: root.settings
            settingName: parent.settingName
            extraEnabledConditions: kcm.frameAvailable && parent.applies
        }
    }

    // A button to a sub-page with a line saying what is set there; the line is the button's
    // description to a screen reader.
    component SubPageButton: RowLayout {
        property alias text: button.text
        property alias summary: summaryLabel.text
        signal clicked()
        spacing: Kirigami.Units.smallSpacing
        QQC2.Button {
            id: button
            icon.name: "go-next"
            onClicked: parent.clicked()
            Accessible.description: summaryLabel.text
        }
        QQC2.Label {
            id: summaryLabel
            color: Kirigami.Theme.disabledTextColor
            Accessible.ignored: true             // read as the button's description
        }
    }

    Kirigami.FormLayout {
        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18nc("@title:group", "Tiling")
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label", "Gaps:")
            spacing: Kirigami.Units.smallSpacing
            UnitSpinBox {
                unit: "px"
                // Even only (docs/spec-settings.md): split across two windows, an odd gap would
                // put them on half pixels. An odd value from kwinrc shows as the even below, as
                // kwin-i3 uses it.
                from: 0; to: 100; stepSize: 2
                value: root.settings.gapsInner - root.settings.gapsInner % 2
                valueFromText: (text) => { const v = parseInt(text); return v - v % 2; }
                onValueModified: root.settings.gapsInner = value
                Accessible.name: i18nc("@label:spinbox", "Gap between windows")
                KCM.SettingStateBinding { configObject: root.settings; settingName: "gapsInner" }
            }
            QQC2.Label { text: i18nc("@label after a gap's size", "between windows"); Accessible.ignored: true }
            Item { implicitWidth: Kirigami.Units.largeSpacing }
            UnitSpinBox {
                unit: "px"
                from: 0; to: 200
                value: root.settings.gapsOuter
                onValueModified: root.settings.gapsOuter = value
                Accessible.name: i18nc("@label:spinbox", "Extra gap at screen edges")
                KCM.SettingStateBinding { configObject: root.settings; settingName: "gapsOuter" }
            }
            QQC2.Label { text: i18nc("@label after a gap's size", "more at screen edges"); Accessible.ignored: true }
        }
        ChoiceBox {
            Kirigami.FormData.label: i18nc("@label:listbox", "New workspaces split:")
            settingName: "defaultOrientation"
            model: [
                { text: i18nc("@item:inlistbox", "Side by side, or stacked on a tall monitor"), value: "auto" },
                { text: i18nc("@item:inlistbox", "Side by side"), value: "horizontal" },
                { text: i18nc("@item:inlistbox", "Stacked"), value: "vertical" },
            ]
        }
        UnitSpinBox {
            Kirigami.FormData.label: i18nc("@label:spinbox", "Resize step:")
            unit: "%"
            from: 1; to: 50
            value: root.settings.resizeStep
            onValueModified: root.settings.resizeStep = value
            KCM.SettingStateBinding { configObject: root.settings; settingName: "resizeStep" }
        }
        // Floating windows move and resize by pixels, as in i3 (docs/spec-float-keys.md).
        UnitSpinBox {
            Kirigami.FormData.label: i18nc("@label:spinbox", "Floating step:")
            unit: "px"
            from: 1; to: 200
            value: root.settings.floatingStep
            onValueModified: root.settings.floatingStep = value
            Accessible.name: i18nc("@label:spinbox", "How far a key moves or resizes a floating window")
            KCM.SettingStateBinding { configObject: root.settings; settingName: "floatingStep" }
        }
        ChoiceBox {
            Kirigami.FormData.label: i18nc("@label:listbox", "Focus at an edge:")
            settingName: "focusWrapping"
            model: [
                { text: i18nc("@item:inlistbox", "Next monitor, else wrap around"), value: "yes" },
                { text: i18nc("@item:inlistbox", "Next monitor, never wrap"), value: "no" },
                { text: i18nc("@item:inlistbox", "Always wrap inside the container"), value: "force" },
                { text: i18nc("@item:inlistbox", "Wrap, never leave the workspace"), value: "workspace" },
            ]
        }
        // holdEnabled and holdTimeoutMs, as Virtual Desktops lays out its on-screen display.
        RowLayout {
            Kirigami.FormData.label: i18nc("@label", "Layout changes:")
            spacing: Kirigami.Units.smallSpacing
            QQC2.CheckBox {
                id: holdBox
                text: i18nc("@option:check followed by a time", "Wait for every window to resize, at most")
                checked: root.settings.holdEnabled
                onToggled: root.settings.holdEnabled = checked
                KCM.SettingStateBinding { configObject: root.settings; settingName: "holdEnabled"; extraEnabledConditions: kcm.holdLoaded }
            }
            UnitSpinBox {
                unit: "ms"
                from: 10; to: 2000
                stepSize: 10
                value: root.settings.holdTimeoutMs
                onValueModified: root.settings.holdTimeoutMs = value
                Accessible.name: i18nc("@label:spinbox", "Longest wait for windows to resize")
                KCM.SettingStateBinding { configObject: root.settings; settingName: "holdTimeoutMs"; extraEnabledConditions: kcm.holdLoaded && root.settings.holdEnabled }
            }
            Kirigami.ContextualHelpButton {
                toolTipText: i18n("Shows a new layout all at once, instead of window by window as each app redraws. Needs kwin-i3's plugins.")
            }
        }

        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18nc("@title:group", "Workspaces")
        }
        QQC2.CheckBox {
            Kirigami.FormData.label: i18nc("@label", "Options:")
            text: i18nc("@option:check", "Pressing the current workspace's key returns to the previous one")
            checked: root.settings.workspaceAutoBackAndForth
            onToggled: root.settings.workspaceAutoBackAndForth = checked
            KCM.SettingStateBinding { configObject: root.settings; settingName: "workspaceAutoBackAndForth" }
        }
        SubPageButton {
            Kirigami.FormData.label: i18nc("@label", "Each workspace:")
            text: i18nc("@action:button", "Configure Workspaces…")
            readonly property var counts: Logic.workspaceCounts(root.settings.workspaceOutputs, root.settings.floatingWorkspaces)
            summary: counts.pinned === 0 && counts.plasma === 0 ? i18n("All tiled, on any monitor")
                : [counts.pinned ? i18np("1 on a set monitor", "%1 on a set monitor", counts.pinned) : "",
                   counts.plasma ? i18np("1 floating", "%1 floating", counts.plasma) : ""].filter(s => s).join(", ")
            onClicked: kcm.push("Workspaces.qml")
        }

        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18nc("@title:group", "Frame")
        }
        // docs/spec-tiled-look.md: without the plugins tiled windows keep their title bars, so
        // the choice needs them as the frame does.
        ChoiceBox {
            id: tiledLook
            Kirigami.FormData.label: i18nc("@label:listbox", "Tiled windows:")
            settingName: "tiledLook"
            applies: kcm.frameAvailable
            model: [
                { text: i18nc("@item:inlistbox", "i3's frame"), value: "frame" },
                { text: i18nc("@item:inlistbox", "Their own title bars"), value: "titlebars" },
                { text: i18nc("@item:inlistbox", "No frame or title bar"), value: "bare" },
            ]
        }
        // Nothing marks the focused window then; KWin's own effect can (spec, item 6).
        QQC2.Label {
            visible: root.settings.tiledLook === "bare"
            Layout.maximumWidth: Kirigami.Units.gridUnit * 24
            wrapMode: Text.Wrap
            font: Kirigami.Theme.smallFont
            text: i18nc("@info", "Nothing marks the focused window. The Dim Inactive desktop effect can.")
        }
        UnitSpinBox {
            Kirigami.FormData.label: i18nc("@label:spinbox", "Width:")
            unit: "px"
            from: 1; to: 10
            value: root.settings.frameWidth
            onValueModified: root.settings.frameWidth = value
            Accessible.name: i18nc("@label:spinbox", "Frame width")
            KCM.SettingStateBinding { configObject: root.settings; settingName: "frameWidth"; extraEnabledConditions: kcm.frameAvailable && (root.settings.tiledLook === "frame" || root.settings.frameOnFloating) }
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label", "Tiled frame:")
            spacing: Kirigami.Units.smallSpacing
            readonly property bool applies: root.settings.tiledLook === "frame"
            QQC2.Label { text: i18nc("@label before a colour", "focused"); Accessible.ignored: true; enabled: parent.applies && kcm.frameAvailable }
            FrameColour {
                settingName: "frameActive"
                applies: parent.applies
                Accessible.name: i18nc("@action:button", "Frame colour of the focused tiled window")
            }
            Item { implicitWidth: Kirigami.Units.largeSpacing }
            QQC2.Label { text: i18nc("@label before a colour", "others"); Accessible.ignored: true; enabled: parent.applies && kcm.frameAvailable }
            FrameColour {
                settingName: "frameInactive"
                applies: parent.applies
                Accessible.name: i18nc("@action:button", "Frame colour of other tiled windows")
            }
        }
        // Drawn by kwini3hold (docs/spec-rounded-corners.md), so it needs the plugins too; a
        // title bar brings its theme's corners. Under the tiled colours, unlabelled.
        QQC2.CheckBox {
            text: i18nc("@option:check under Tiled frame", "Round the corners of tiled windows")
            checked: root.settings.roundedCorners
            onToggled: root.settings.roundedCorners = checked
            KCM.SettingStateBinding { configObject: root.settings; settingName: "roundedCorners"; extraEnabledConditions: kcm.frameAvailable && root.settings.tiledLook !== "titlebars" }
        }
        // The floating colours only mean something with the frame on floating windows
        // (docs/spec-window-modes.md, decision 3): the checkbox, then the colours under it, as
        // the tiled row (docs/spec-settings-cleanup.md).
        QQC2.CheckBox {
            Kirigami.FormData.label: i18nc("@label", "Floating windows:")
            text: i18nc("@option:check", "Draw the frame on floating windows too")
            checked: root.settings.frameOnFloating
            onToggled: root.settings.frameOnFloating = checked
            KCM.SettingStateBinding { configObject: root.settings; settingName: "frameOnFloating"; extraEnabledConditions: kcm.frameAvailable }
        }
        RowLayout {
            spacing: Kirigami.Units.smallSpacing
            QQC2.Label { text: i18nc("@label before a colour", "focused"); Accessible.ignored: true; enabled: root.settings.frameOnFloating && kcm.frameAvailable }
            FrameColour {
                settingName: "frameFloatingActive"
                applies: root.settings.frameOnFloating
                Accessible.name: i18nc("@action:button", "Frame colour of the focused floating window")
            }
            Item { implicitWidth: Kirigami.Units.largeSpacing }
            QQC2.Label { text: i18nc("@label before a colour", "others"); Accessible.ignored: true; enabled: root.settings.frameOnFloating && kcm.frameAvailable }
            FrameColour {
                settingName: "frameFloatingInactive"
                applies: root.settings.frameOnFloating
                Accessible.name: i18nc("@action:button", "Frame colour of other floating windows")
            }
        }

        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18nc("@title:group", "Window rules")
        }
        SubPageButton {
            Kirigami.FormData.label: i18nc("@label", "Rules:")
            text: i18nc("@action:button", "Configure Window Rules…")
            readonly property var counts: Logic.ruleCounts(root.settings)
            summary: i18np("1 floating rule", "%1 floating rules", counts.rules) + ", "
                   + (counts.assigns ? i18np("1 workspace assignment", "%1 workspace assignments", counts.assigns) : i18n("no workspace assignments"))
            onClicked: kcm.push("WindowRules.qml")
        }

        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18nc("@title:group", "Keys")
        }
        QQC2.Button {
            Kirigami.FormData.label: i18nc("@label", "Shortcuts:")
            text: i18nc("@action:button", "Configure Keys…")
            icon.name: "configure-shortcuts"
            onClicked: kcm.push("Keys.qml")
        }
        QQC2.CheckBox {
            Kirigami.FormData.label: i18nc("@label", "Options:")
            text: i18nc("@option:check", "Warn when kwin-i3 starts about keys other shortcuts already use")
            checked: root.settings.warnTakenKeys
            onToggled: root.settings.warnTakenKeys = checked
            KCM.SettingStateBinding { configObject: root.settings; settingName: "warnTakenKeys" }
        }
        // debugLog has no control here: it only feeds the test KWin's log (docs/debugging.md).
    }
}
