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
            text: i18n("The frame and waiting for windows to resize need kwin-i3's plugins. Without them, tiling windows keep their title bars.")
        }
        // The helper plugin (redo stage 10, Paul's call 40): what goes without it.
        Kirigami.InlineMessage {
            Layout.fillWidth: true
            position: Kirigami.InlineMessage.Position.Header
            type: Kirigami.MessageType.Information
            visible: kcm.scriptLoaded && !kcm.helperLoaded
            text: i18n("kwin-i3's helper plugin isn't loaded: no dragging or resizing tiling windows with the mouse, no focus from the frame, no resize mode, no layout-dependent keys, and the Configure form's Apply doesn't reach kwin-i3 (make plugin-install).")
        }
    }

    // The old list settings (ignoreClass, ignoreRole, floatingClass, floatingTitle,
    // floatingWorkspaces) become rules the moment the page reads them (redo stage 10): the
    // rows show them, and Apply writes the rules and takes the old keys out of kwinrc (a
    // setting at its default is removed). As src/rules.js reads them at load.
    function migrateOld() {
        const s = root.settings;
        const rules = Logic.oldRules(s);
        if (!rules.length && !s.floatingClass && !s.floatingTitle && !s.floatingWorkspaces && !s.ignoreClass && !s.ignoreRole) return;
        let text = s.forWindow;
        rules.forEach((r) => { text = Logic.addRule(text, r); });
        s.forWindow = text;
        s.floatingClass = ""; s.floatingTitle = ""; s.floatingWorkspaces = ""; s.ignoreClass = ""; s.ignoreRole = "";
    }
    Component.onCompleted: migrateOld()
    Connections {
        target: root.settings
        function onFloatingClassChanged() { root.migrateOld() }
        function onFloatingTitleChanged() { root.migrateOld() }
        function onFloatingWorkspacesChanged() { root.migrateOld() }
        function onIgnoreClassChanged() { root.migrateOld() }
        function onIgnoreRoleChanged() { root.migrateOld() }
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

    // i3's colour classes, two (focused_inactive left out; docs/behaviour.md §7 L3, L4): a row each, the
    // frame's colour and the split indicator's (the side where the next window opens on a
    // window alone in its split; empty in kwinrc means the frame's colour, shown as such).
    component ClassRow: RowLayout {
        property string frameKey
        property string indicatorKey
        property string who
        spacing: Kirigami.Units.smallSpacing
        readonly property bool applies: root.settings.tiledLook === "frame" || root.settings.frameOnFloating
        QQC2.Label { text: i18nc("@label before a colour", "frame"); Accessible.ignored: true; enabled: parent.applies && kcm.frameAvailable }
        FrameColour {
            settingName: parent.frameKey
            applies: parent.applies
            Accessible.name: i18nc("@action:button", "Frame colour of %1", parent.who)
        }
        Item { implicitWidth: Kirigami.Units.largeSpacing }
        QQC2.Label { text: i18nc("@label before a colour", "next-window side"); Accessible.ignored: true; enabled: parent.applies && kcm.frameAvailable }
        KQC.ColorButton {
            readonly property string key: parent.indicatorKey
            showAlphaChannel: false
            color: root.settings[key] || root.settings[parent.frameKey]
            onAccepted: (c) => root.settings[key] = c.toString()
            Accessible.name: i18nc("@action:button", "Colour of the side where the next window opens, on %1 alone in its split", parent.who)
            KCM.SettingStateBinding { configObject: root.settings; settingName: parent.indicatorKey; extraEnabledConditions: kcm.frameAvailable && parent.applies }
        }
        QQC2.ToolButton {
            visible: root.settings[parent.indicatorKey] !== ""
            icon.name: "edit-clear"
            onClicked: root.settings[parent.indicatorKey] = ""
            Accessible.name: i18nc("@action:button", "Use the frame colour for the next-window side of %1", parent.who)
            QQC2.ToolTip.text: i18nc("@info:tooltip", "Same as the frame")
            QQC2.ToolTip.visible: hovered
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
                Accessible.name: i18nc("@label:spinbox", "Extra gap at output edges")
                KCM.SettingStateBinding { configObject: root.settings; settingName: "gapsOuter" }
            }
            QQC2.Label { text: i18nc("@label after a gap's size", "more at output edges"); Accessible.ignored: true }
        }
        SubPageButton {
            text: i18nc("@action:button", "Configure Gaps…")
            readonly property var g: Logic.gapsSummary(root.settings)
            summary: [g.sides ? i18np("1 output edge set", "%1 output edges set", g.sides) : "",
                      g.workspaces ? i18np("1 workspace differs", "%1 workspaces differ", g.workspaces) : "",
                      g.smart === "on" ? i18n("none with one window") : g.smart === "inverse_outer" ? i18n("edges only with one window") : ""]
                     .filter(s => s).join(", ") || i18n("Same on every side and workspace")
            onClicked: kcm.push("Gaps.qml")
        }
        ChoiceBox {
            Kirigami.FormData.label: i18nc("@label:listbox", "New workspaces split:")
            settingName: "defaultOrientation"
            model: [
                { text: i18nc("@item:inlistbox", "Side by side, or stacked on a tall output"), value: "auto" },
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
                { text: i18nc("@item:inlistbox", "Next output, else wrap around"), value: "yes" },
                { text: i18nc("@item:inlistbox", "Next output, never wrap"), value: "no" },
                { text: i18nc("@item:inlistbox", "Always wrap inside the container"), value: "force" },
                { text: i18nc("@item:inlistbox", "Wrap, never leave the workspace"), value: "workspace" },
            ]
        }
        // holdEnabled; holdTimeoutMs is an internal value, kwinrc only (plan.md, "Settings").
        RowLayout {
            Kirigami.FormData.label: i18nc("@label", "Layout changes:")
            spacing: Kirigami.Units.smallSpacing
            QQC2.CheckBox {
                id: holdBox
                text: i18nc("@option:check", "Wait for every window to resize")
                checked: root.settings.holdEnabled
                onToggled: root.settings.holdEnabled = checked
                KCM.SettingStateBinding { configObject: root.settings; settingName: "holdEnabled"; extraEnabledConditions: kcm.holdLoaded }
            }
            Kirigami.ContextualHelpButton {
                toolTipText: i18n("Shows a new layout all at once, instead of window by window as each app redraws. Needs kwin-i3's plugins.")
            }
        }

        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18nc("@title:group", "Mouse and focus")
        }
        QQC2.CheckBox {
            Kirigami.FormData.label: i18nc("@label", "Pointer:")
            text: i18nc("@option:check", "Move the pointer to an output that gets the focus")
            checked: root.settings.mouseWarping === "output"
            onToggled: root.settings.mouseWarping = checked ? "output" : "none"
            KCM.SettingStateBinding { configObject: root.settings; settingName: "mouseWarping" }
        }
        ChoiceBox {
            Kirigami.FormData.label: i18nc("@label:listbox", "Drag a tiling window:")
            settingName: "tilingDrag"
            model: [
                { text: i18nc("@item:inlistbox", "By its title bar, or anywhere with Meta"), value: "modifier titlebar" },
                { text: i18nc("@item:inlistbox", "Anywhere with Meta"), value: "modifier" },
                { text: i18nc("@item:inlistbox", "By its title bar"), value: "titlebar" },
                { text: i18nc("@item:inlistbox", "Not at all"), value: "off" },
            ]
        }
        ChoiceBox {
            Kirigami.FormData.label: i18nc("@label:listbox", "New windows over a fullscreen window:")
            settingName: "popupDuringFullscreen"
            model: [
                { text: i18nc("@item:inlistbox", "Stay behind it, except its own dialogs"), value: "smart" },
                { text: i18nc("@item:inlistbox", "Always stay behind it"), value: "ignore" },
                { text: i18nc("@item:inlistbox", "End the fullscreen, if a dialog"), value: "leave_fullscreen" },
                { text: i18nc("@item:inlistbox", "Come in front, if floating"), value: "all" },
            ]
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
            readonly property var counts: { "pinned": Object.keys(Logic.parseOutputs(root.settings.workspaceOutputs)).length, "plasma": Logic.floatingWorkspaceList(root.settings.forWindow).length }
            summary: counts.pinned === 0 && counts.plasma === 0 ? i18n("All tiling, on any output")
                : [counts.pinned ? i18np("1 on a set output", "%1 on a set output", counts.pinned) : "",
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
            Kirigami.FormData.label: i18nc("@label:listbox", "Tiling windows:")
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
        ClassRow {
            Kirigami.FormData.label: i18nc("@label", "Focused window:")
            frameKey: "frameActive"; indicatorKey: "frameIndicatorActive"
            who: i18nc("@item which window", "the focused window")
        }
        ClassRow {
            Kirigami.FormData.label: i18nc("@label", "Other windows:")
            frameKey: "frameInactive"; indicatorKey: "frameIndicatorInactive"
            who: i18nc("@item which window", "other windows")
        }
        ChoiceBox {
            Kirigami.FormData.label: i18nc("@label:listbox", "Hide frame sides:")
            settingName: "hideEdgeBorders"
            applies: kcm.frameAvailable && root.settings.tiledLook === "frame"
            model: [
                { text: i18nc("@item:inlistbox", "Never"), value: "none" },
                { text: i18nc("@item:inlistbox", "At the output's left and right edges"), value: "vertical" },
                { text: i18nc("@item:inlistbox", "At the output's top and bottom edges"), value: "horizontal" },
                { text: i18nc("@item:inlistbox", "At every output edge"), value: "both" },
                { text: i18nc("@item:inlistbox", "All of it, when a workspace has one window"), value: "smart" },
                { text: i18nc("@item:inlistbox", "The same, only with no gap at the edges"), value: "smart_no_gaps" },
            ]
        }
        // Drawn by kwini3hold (docs/spec-rounded-corners.md), so it needs the plugins too; a
        // title bar brings its theme's corners. Under the tiled colours, unlabelled.
        QQC2.CheckBox {
            text: i18nc("@option:check under Tiling frame", "Round the corners of tiling windows")
            checked: root.settings.roundedCorners
            onToggled: root.settings.roundedCorners = checked
            KCM.SettingStateBinding { configObject: root.settings; settingName: "roundedCorners"; extraEnabledConditions: kcm.frameAvailable && root.settings.tiledLook !== "titlebars" }
        }
        // A floating window's frame uses the same colour classes (redo stage 7, §7 L11).
        QQC2.CheckBox {
            Kirigami.FormData.label: i18nc("@label", "Floating windows:")
            text: i18nc("@option:check", "Draw the frame on floating windows too")
            checked: root.settings.frameOnFloating
            onToggled: root.settings.frameOnFloating = checked
            KCM.SettingStateBinding { configObject: root.settings; settingName: "frameOnFloating"; extraEnabledConditions: kcm.frameAvailable }
        }

        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18nc("@title:group", "Window rules")
        }
        SubPageButton {
            Kirigami.FormData.label: i18nc("@label", "Rules:")
            text: i18nc("@action:button", "Configure Window Rules…")
            readonly property var counts: Logic.ruleCounts(root.settings)
            summary: i18np("1 rule", "%1 rules", counts.rules + counts.assigns)
                   + (counts.assigns ? ", " + i18np("1 sending to a workspace or output", "%1 sending to a workspace or output", counts.assigns) : "")
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
