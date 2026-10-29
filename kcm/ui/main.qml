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
            text: i18n("kwin-i3 is turned off.")
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
            text: i18n("kwin-i3 is on but not running. Its errors are in the system log: journalctl --user -b | grep kwin-i3")
        }
        // One message for both plugins, never saying which (docs/spec-settings-words.md row 17):
        // the frame needs kwini3hold, the mouse and the resize mode the helper (redo stage 10).
        Kirigami.InlineMessage {
            Layout.fillWidth: true
            position: Kirigami.InlineMessage.Position.Header
            type: Kirigami.MessageType.Information
            visible: kcm.scriptLoaded && (!kcm.holdLoaded || !kcm.helperLoaded)
            text: i18nc("%1 is a list of what is missing", "kwin-i3's plugins aren't loaded: %1. Install them: make plugin-install",
                        [!kcm.holdLoaded ? i18n("no frame") : "",
                         !kcm.helperLoaded ? i18n("no mouse dragging") : "",
                         !kcm.helperLoaded ? i18n("no resize mode") : ""].filter(s => s).join(", "))
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

    // A setting's help, ending in its i3 directive (docs/spec-settings-words.md rule 5). It sits in
    // a RowLayout with its control; FormLayout then labels the row, not the control
    // (Kirigami 6.31 FormLayout.qml:471), so the control carries its own Accessible.name and the
    // row a buddyFor. Named for its topic, as Kirigami's own name is the same for every one.
    component Help: Kirigami.ContextualHelpButton {
        property string topic
        Accessible.name: i18nc("@action:button", "More about %1", topic)
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
        property string help
        spacing: Kirigami.Units.smallSpacing
        readonly property bool applies: root.settings.tiledLook === "frame" || root.settings.frameOnFloating
        QQC2.Label { text: i18nc("@label before a colour", "frame"); Accessible.ignored: true; enabled: parent.applies && kcm.frameAvailable }
        FrameColour {
            settingName: parent.frameKey
            applies: parent.applies
            Accessible.name: i18nc("@action:button", "Frame colour of %1", parent.who)
        }
        Item { implicitWidth: Kirigami.Units.largeSpacing }
        QQC2.Label { text: i18nc("@label before a colour", "split indicator"); Accessible.ignored: true; enabled: parent.applies && kcm.frameAvailable }
        KQC.ColorButton {
            readonly property string key: parent.indicatorKey
            showAlphaChannel: false
            color: root.settings[key] || root.settings[parent.frameKey]
            onAccepted: (c) => root.settings[key] = c.toString()
            Accessible.name: i18nc("@action:button", "Split indicator colour of %1", parent.who)
            KCM.SettingStateBinding { configObject: root.settings; settingName: parent.indicatorKey; extraEnabledConditions: kcm.frameAvailable && parent.applies }
        }
        QQC2.ToolButton {
            visible: root.settings[parent.indicatorKey] !== ""
            icon.name: "edit-clear"
            onClicked: root.settings[parent.indicatorKey] = ""
            Accessible.name: i18nc("@action:button", "Use the frame colour for the split indicator of %1", parent.who)
            QQC2.ToolTip.text: i18nc("@info:tooltip", "Same as the frame")
            QQC2.ToolTip.visible: hovered
        }
        Help {
            topic: i18nc("@item help topic", "the colours of %1", parent.who)
            toolTipText: parent.help
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
                from: -100; to: 200       // negative: a thinner edge, down to half the inner gap
                value: root.settings.gapsOuter
                onValueModified: root.settings.gapsOuter = value
                Accessible.name: i18nc("@label:spinbox", "Extra gap at screen edges")
                KCM.SettingStateBinding { configObject: root.settings; settingName: "gapsOuter" }
            }
            QQC2.Label { text: i18nc("@label after a gap's size", "extra at edges"); Accessible.ignored: true }
            Help {
                topic: i18nc("@item help topic", "gaps")
                toolTipText: i18n("The space between tiling windows, and what is added to it at the screen's edges; below 0 takes from it, down to half the space between windows. i3: gaps inner, gaps outer")
            }
        }
        SubPageButton {
            text: i18nc("@action:button", "Configure Gaps…")
            readonly property var g: Logic.gapsSummary(root.settings)
            summary: [g.sides ? i18np("1 edge set", "%1 edges set", g.sides) : "",
                      g.workspaces ? i18np("1 workspace differs", "%1 workspaces differ", g.workspaces) : "",
                      g.smart === "on" ? i18n("none with one window") : g.smart === "inverse_outer" ? i18n("edges only with one window") : ""]
                     .filter(s => s).join(", ") || i18n("Same everywhere")
            onClicked: kcm.push("Gaps.qml")
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label:listbox", "New workspaces split:")
            Kirigami.FormData.buddyFor: orientationBox
            spacing: Kirigami.Units.smallSpacing
            ChoiceBox {
                id: orientationBox
                settingName: "defaultOrientation"
                model: [
                    { text: i18nc("@item:inlistbox", "Automatic"), value: "auto" },
                    { text: i18nc("@item:inlistbox", "Side by side"), value: "horizontal" },
                    { text: i18nc("@item:inlistbox", "Top to bottom"), value: "vertical" },
                ]
            }
            Help {
                topic: i18nc("@item help topic", "how new workspaces split")
                toolTipText: i18n("Automatic: top to bottom on a screen taller than wide, else side by side. i3: default_orientation")
            }
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label:spinbox", "Resize step:")
            Kirigami.FormData.buddyFor: resizeStepBox
            spacing: Kirigami.Units.smallSpacing
            UnitSpinBox {
                id: resizeStepBox
                unit: "%"
                from: 1; to: 50
                value: root.settings.resizeStep
                onValueModified: root.settings.resizeStep = value
                Accessible.name: i18nc("@label:spinbox", "Resize step")
                KCM.SettingStateBinding { configObject: root.settings; settingName: "resizeStep" }
            }
            Help {
                topic: i18nc("@item help topic", "the resize step")
                toolTipText: i18n("How far a resize key grows or shrinks a tiling window, as a share of its split. i3: resize grow width 10 px or 10 ppt")
            }
        }
        // Floating windows move and resize by pixels, as in i3 (docs/spec-float-keys.md).
        RowLayout {
            Kirigami.FormData.label: i18nc("@label:spinbox", "Floating step:")
            Kirigami.FormData.buddyFor: floatingStepBox
            spacing: Kirigami.Units.smallSpacing
            UnitSpinBox {
                id: floatingStepBox
                unit: "px"
                from: 1; to: 200
                value: root.settings.floatingStep
                onValueModified: root.settings.floatingStep = value
                Accessible.name: i18nc("@label:spinbox", "How far a key moves or resizes a floating window")
                KCM.SettingStateBinding { configObject: root.settings; settingName: "floatingStep" }
            }
            Help {
                topic: i18nc("@item help topic", "the floating step")
                toolTipText: i18n("How far a move or resize key takes a floating window. i3: move left 10 px, resize grow width 10 px")
            }
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label:listbox", "Focus wrapping:")
            Kirigami.FormData.buddyFor: wrappingBox
            spacing: Kirigami.Units.smallSpacing
            ChoiceBox {
                id: wrappingBox
                settingName: "focusWrapping"
                model: [
                    { text: i18nc("@item:inlistbox", "Next screen, then wrap"), value: "yes" },
                    { text: i18nc("@item:inlistbox", "Next screen only"), value: "no" },
                    { text: i18nc("@item:inlistbox", "Always wrap"), value: "force" },
                    { text: i18nc("@item:inlistbox", "Stay on the workspace"), value: "workspace" },
                ]
            }
            Help {
                topic: i18nc("@item help topic", "focus wrapping")
                toolTipText: i18n("Where focus goes from the last window in a direction. Always wrap stays inside the split. i3: focus_wrapping")
            }
        }
        // holdEnabled; holdTimeoutMs is an internal value, kwinrc only (plan.md, "Settings").
        RowLayout {
            Kirigami.FormData.label: i18nc("@label", "Layout changes:")
            Kirigami.FormData.buddyFor: holdBox
            spacing: Kirigami.Units.smallSpacing
            QQC2.CheckBox {
                id: holdBox
                text: i18nc("@option:check", "Show all at once")
                Accessible.name: i18nc("@option:check", "Show layout changes all at once")
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
            Kirigami.FormData.label: i18nc("@title:group", "Mouse & focus")
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label", "Pointer:")
            Kirigami.FormData.buddyFor: warpBox
            spacing: Kirigami.Units.smallSpacing
            QQC2.CheckBox {
                id: warpBox
                text: i18nc("@option:check", "Follow focus to another screen")
                Accessible.name: i18nc("@option:check", "Pointer follows focus to another screen")
                checked: root.settings.mouseWarping === "output"
                onToggled: root.settings.mouseWarping = checked ? "output" : "none"
                KCM.SettingStateBinding { configObject: root.settings; settingName: "mouseWarping" }
            }
            Help {
                topic: i18nc("@item help topic", "the pointer")
                toolTipText: i18n("When a key moves focus to another screen, the pointer goes to the middle of the focused window. i3: mouse_warping")
            }
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label:listbox", "Drag tiling windows:")
            Kirigami.FormData.buddyFor: dragBox
            spacing: Kirigami.Units.smallSpacing
            ChoiceBox {
                id: dragBox
                settingName: "tilingDrag"
                model: [
                    { text: i18nc("@item:inlistbox", "Titlebar or Meta+drag"), value: "modifier titlebar" },
                    { text: i18nc("@item:inlistbox", "Meta+drag only"), value: "modifier" },
                    { text: i18nc("@item:inlistbox", "Titlebar only"), value: "titlebar" },
                    { text: i18nc("@item:inlistbox", "Never"), value: "off" },
                ]
            }
            Help {
                topic: i18nc("@item help topic", "dragging tiling windows")
                toolTipText: i18n("Drop a tiling window beside another, or on its middle to swap them. Meta+Shift+drag floats it instead. i3: tiling_drag")
            }
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label:listbox", "New windows in fullscreen:")
            Kirigami.FormData.buddyFor: popupBox
            spacing: Kirigami.Units.smallSpacing
            ChoiceBox {
                id: popupBox
                settingName: "popupDuringFullscreen"
                model: [
                    { text: i18nc("@item:inlistbox", "Behind, except its dialogs"), value: "smart" },
                    { text: i18nc("@item:inlistbox", "Always behind"), value: "ignore" },
                    { text: i18nc("@item:inlistbox", "Dialogs end fullscreen"), value: "leave_fullscreen" },
                    { text: i18nc("@item:inlistbox", "Floating ones in front"), value: "all" },
                ]
            }
            Help {
                topic: i18nc("@item help topic", "new windows in fullscreen")
                toolTipText: i18n("What a window that opens on a workspace with a fullscreen window does. i3: popup_during_fullscreen")
            }
        }

        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18nc("@title:group", "Workspaces")
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label", "Options:")
            Kirigami.FormData.buddyFor: backAndForthBox
            spacing: Kirigami.Units.smallSpacing
            QQC2.CheckBox {
                id: backAndForthBox
                text: i18nc("@option:check", "Repeat a key to go back and forth")
                Accessible.name: i18nc("@option:check", "Repeat a workspace key to go back and forth")
                checked: root.settings.workspaceAutoBackAndForth
                onToggled: root.settings.workspaceAutoBackAndForth = checked
                KCM.SettingStateBinding { configObject: root.settings; settingName: "workspaceAutoBackAndForth" }
            }
            Help {
                topic: i18nc("@item help topic", "back and forth")
                toolTipText: i18n("The key of the workspace you are on takes you to the one you were on before. i3: workspace_auto_back_and_forth")
            }
        }
        SubPageButton {
            Kirigami.FormData.label: i18nc("@label", "Each workspace:")
            text: i18nc("@action:button", "Configure Workspaces…")
            readonly property var counts: { "pinned": Object.keys(Logic.parseOutputs(root.settings.workspaceOutputs)).length, "plasma": Logic.floatingWorkspaceList(root.settings.forWindow).length }
            summary: counts.pinned === 0 && counts.plasma === 0 ? i18n("All tiling, any screen")
                : [counts.pinned ? i18np("1 on a set screen", "%1 on a set screen", counts.pinned) : "",
                   counts.plasma ? i18np("1 floating", "%1 floating", counts.plasma) : ""].filter(s => s).join(", ")
            onClicked: kcm.push("Workspaces.qml")
        }

        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18nc("@title:group", "Frame")
        }
        // docs/spec-tiled-look.md: without the plugins tiled windows keep their title bars, so
        // the choice needs them as the frame does.
        RowLayout {
            Kirigami.FormData.label: i18nc("@label:listbox", "Tiling windows:")
            Kirigami.FormData.buddyFor: tiledLook
            spacing: Kirigami.Units.smallSpacing
            ChoiceBox {
                id: tiledLook
                settingName: "tiledLook"
                applies: kcm.frameAvailable
                model: [
                    { text: i18nc("@item:inlistbox", "Frame"), value: "frame" },
                    { text: i18nc("@item:inlistbox", "Titlebars"), value: "titlebars" },
                    { text: i18nc("@item:inlistbox", "Neither"), value: "bare" },
                ]
            }
            Help {
                topic: i18nc("@item help topic", "how tiling windows look")
                toolTipText: i18n("Frame: a thin coloured line around each window, in place of its title bar. Titlebars: Plasma's own. i3: default_border")
            }
        }
        // Nothing marks the focused window then; KWin's own effect can (spec, item 6).
        QQC2.Label {
            visible: root.settings.tiledLook === "bare"
            Layout.maximumWidth: Kirigami.Units.gridUnit * 24
            wrapMode: Text.Wrap
            font: Kirigami.Theme.smallFont
            text: i18nc("@info", "Nothing marks the focused window; the Dim Inactive effect can.")
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label:spinbox", "Width:")
            Kirigami.FormData.buddyFor: frameWidthBox
            spacing: Kirigami.Units.smallSpacing
            UnitSpinBox {
                id: frameWidthBox
                unit: "px"
                from: 1; to: 10
                value: root.settings.frameWidth
                onValueModified: root.settings.frameWidth = value
                Accessible.name: i18nc("@label:spinbox", "Frame width")
                KCM.SettingStateBinding { configObject: root.settings; settingName: "frameWidth"; extraEnabledConditions: kcm.frameAvailable && (root.settings.tiledLook === "frame" || root.settings.frameOnFloating) }
            }
            Help {
                topic: i18nc("@item help topic", "the frame's width")
                toolTipText: i18n("i3: default_border pixel")
            }
        }
        ClassRow {
            Kirigami.FormData.label: i18nc("@label", "Focused:")
            frameKey: "frameActive"; indicatorKey: "frameIndicatorActive"
            who: i18nc("@item which window", "the focused window")
            help: i18n("The split indicator marks the side where the next window opens, on a window alone in its split. i3: client.focused")
        }
        ClassRow {
            Kirigami.FormData.label: i18nc("@label", "Unfocused:")
            frameKey: "frameInactive"; indicatorKey: "frameIndicatorInactive"
            who: i18nc("@item which window", "unfocused windows")
            help: i18n("The split indicator marks the side where the next window opens, on a window alone in its split. i3: client.unfocused")
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label:listbox", "Hide frame:")
            Kirigami.FormData.buddyFor: hideEdgesBox
            spacing: Kirigami.Units.smallSpacing
            ChoiceBox {
                id: hideEdgesBox
                settingName: "hideEdgeBorders"
                applies: kcm.frameAvailable && root.settings.tiledLook === "frame"
                model: [
                    { text: i18nc("@item:inlistbox", "Never"), value: "none" },
                    { text: i18nc("@item:inlistbox", "Left and right edges"), value: "vertical" },
                    { text: i18nc("@item:inlistbox", "Top and bottom edges"), value: "horizontal" },
                    { text: i18nc("@item:inlistbox", "All edges"), value: "both" },
                    { text: i18nc("@item:inlistbox", "On a lone window"), value: "smart" },
                    { text: i18nc("@item:inlistbox", "On a lone window without gaps"), value: "smart_no_gaps" },
                ]
            }
            Help {
                topic: i18nc("@item help topic", "hiding the frame")
                toolTipText: i18n("Hides the frame at the screen's edges, or on a window alone on its workspace. i3: hide_edge_borders")
            }
        }
        // Drawn by kwini3hold (docs/spec-rounded-corners.md), so it needs the plugins too; a
        // title bar brings its theme's corners. Under the tiled colours, unlabelled.
        QQC2.CheckBox {
            text: i18nc("@option:check under Tiling frame", "Round corners of tiling windows")
            checked: root.settings.roundedCorners
            onToggled: root.settings.roundedCorners = checked
            KCM.SettingStateBinding { configObject: root.settings; settingName: "roundedCorners"; extraEnabledConditions: kcm.frameAvailable && root.settings.tiledLook !== "titlebars" }
        }
        // A floating window's frame uses the same colour classes (redo stage 7, §7 L11).
        RowLayout {
            Kirigami.FormData.label: i18nc("@label", "Floating windows:")
            Kirigami.FormData.buddyFor: floatingFrameBox
            spacing: Kirigami.Units.smallSpacing
            QQC2.CheckBox {
                id: floatingFrameBox
                text: i18nc("@option:check", "Draw the frame too")
                Accessible.name: i18nc("@option:check", "Draw the frame on floating windows too")
                checked: root.settings.frameOnFloating
                onToggled: root.settings.frameOnFloating = checked
                KCM.SettingStateBinding { configObject: root.settings; settingName: "frameOnFloating"; extraEnabledConditions: kcm.frameAvailable }
            }
            Help {
                topic: i18nc("@item help topic", "the frame on floating windows")
                toolTipText: i18n("Floating windows get the frame in place of their own border. i3: default_floating_border")
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
            summary: i18np("1 rule", "%1 rules", counts.rules + counts.assigns)
                   + (counts.assigns ? ", " + i18np("1 to a workspace or screen", "%1 to a workspace or screen", counts.assigns) : "")
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
            text: i18nc("@option:check", "Warn about keys other shortcuts use")
            checked: root.settings.warnTakenKeys
            onToggled: root.settings.warnTakenKeys = checked
            KCM.SettingStateBinding { configObject: root.settings; settingName: "warnTakenKeys" }
        }
        // debugLog has no control here: it only feeds the test KWin's log (docs/debugging.md).
    }
}
