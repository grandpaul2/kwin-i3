// kwin-i3's page: the
// script's settings as Plasma's own pages lay theirs out, with its sub-pages: Gaps, Workspaces,
// Window Rules, Keys and Plasma Settings. Every control says what it is to a screen reader
// (tools/a11y.py audit; docs/style-settings-page.md §6).
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
    // The dropdowns of a section share one width, its widest one's own, so they end on one line
    // and no choice is cut; every spin box is one compact width (docs/style-settings-page.md §1).
    readonly property real spinWidth: Kirigami.Units.gridUnit * 6
    readonly property real mouseColumn: Math.max(dragBox.implicitWidth, popupBox.implicitWidth)
    readonly property real workspacesColumn: Math.max(workspaceLayoutBox.implicitWidth, orientationBox.implicitWidth)
    readonly property real frameColumn: Math.max(tiledLook.implicitWidth, hideEdgesBox.implicitWidth)
    // The frame's width and colours apply wherever a frame is drawn.
    readonly property bool frameDrawn: settings.tiledLook === "frame" || settings.frameOnFloating

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
        // One message for both plugins, never saying which:
        // the frame needs kwini3hold, the mouse and the resize mode the helper.
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
        // The first-run step (docs/plan.md, "Install and first run"): while a Plasma setting
        // kwin-i3 needs differs, the page says so and opens the Plasma Settings sub-page.
        Kirigami.InlineMessage {
            Layout.fillWidth: true
            position: Kirigami.InlineMessage.Position.Header
            type: Kirigami.MessageType.Information
            visible: kcm.scriptLoaded && kcm.setup.needed
            text: i18n("Some Plasma settings work against kwin-i3.")
            actions: Kirigami.Action {
                text: i18nc("@action:button", "Review Plasma Settings…")
                icon.name: "go-next"
                onTriggered: kcm.push("PlasmaSettings.qml")
            }
        }
    }

    // floatingWorkspaces becomes rules the moment the page reads it: the rows
    // show them, and Apply writes the rules and takes the key out of kwinrc (a setting at its
    // default is removed). As src/rules.js reads it at load.
    function migrateOld() {
        const s = root.settings;
        const rules = Logic.oldRules(s);
        if (!rules.length && !s.floatingWorkspaces) return;
        let text = s.forWindow;
        rules.forEach((r) => { text = Logic.addRule(text, r); });
        s.forWindow = text;
        s.floatingWorkspaces = "";
    }
    Component.onCompleted: migrateOld()
    Connections {
        target: root.settings
        function onFloatingWorkspacesChanged() { root.migrateOld() }
    }

    // A setting's help, ending in its i3 directive. It sits in
    // a RowLayout with its control; FormLayout then labels the row, not the control
    // (Kirigami 6.31 FormLayout.qml:471), so the control carries its own Accessible.name and the
    // row a buddyFor. Named for its topic, as Kirigami's own name is the same for every one.
    component Help: Kirigami.ContextualHelpButton {
        property string topic
        Accessible.name: i18nc("@action:button", "More about %1", topic)
    }

    // A spin box that shows its unit: "8 px".
    component UnitSpinBox: QQC2.SpinBox {
        Layout.preferredWidth: root.spinWidth
        property string unit
        textFromValue: (value) => unit === "ms" ? i18ncp("@item:valuesuffix milliseconds", "%1 ms", "%1 ms", value)
                                : unit === "%" ? i18nc("@item:valuesuffix percent", "%1%", value)
                                : i18ncp("@item:valuesuffix pixels", "%1 px", "%1 px", value)
        valueFromText: (text) => parseInt(text)
    }

    // A choice stored as i3's word ("auto", "force"), shown as words a person would say.
    component ChoiceBox: QQC2.ComboBox {
        property real columnWidth: implicitWidth      // its section's widest dropdown
        Layout.preferredWidth: columnWidth
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
        // The gaps: a row for each size, then the sub-page for the rest. Every row has a label (an
        // unlabelled FormLayout row would be an empty heading to a screen reader).
        RowLayout {
            Kirigami.FormData.label: i18nc("@label:spinbox", "Gap between windows:")
            Kirigami.FormData.buddyFor: gapInnerBox
            spacing: Kirigami.Units.smallSpacing
            UnitSpinBox {
                id: gapInnerBox
                unit: "px"
                // Even only: split across two windows, an odd gap would
                // put them on half pixels. An odd value from kwinrc shows as the even below, as
                // kwin-i3 uses it.
                from: 0; to: 100; stepSize: 2
                value: root.settings.gapsInner - root.settings.gapsInner % 2
                valueFromText: (text) => { const v = parseInt(text); return v - v % 2; }
                onValueModified: root.settings.gapsInner = value
                Accessible.name: i18nc("@label:spinbox", "Gap between windows")
                KCM.SettingStateBinding { configObject: root.settings; settingName: "gapsInner" }
            }
            Help {
                topic: i18nc("@item help topic", "gaps")
                toolTipText: i18n("The space between tiling windows, and what is added to it at the screen's edges; below 0 takes from it, down to half the space between windows. i3: gaps inner, gaps outer")
            }
        }
        UnitSpinBox {
            Kirigami.FormData.label: i18nc("@label:spinbox", "Extra gap at edges:")
            unit: "px"
            from: -100; to: 200       // negative: a thinner edge, down to half the inner gap
            value: root.settings.gapsOuter
            onValueModified: root.settings.gapsOuter = value
            Accessible.name: i18nc("@label:spinbox", "Extra gap at screen edges")
            KCM.SettingStateBinding { configObject: root.settings; settingName: "gapsOuter" }
        }
        SubPageButton {
            Kirigami.FormData.label: i18nc("@label", "Gaps:")
            text: i18nc("@action:button", "Configure Gaps…")
            readonly property var g: Logic.gapsSummary(root.settings)
            summary: [g.sides ? i18np("1 edge set", "%1 edges set", g.sides) : "",
                      g.workspaces ? i18np("1 workspace differs", "%1 workspaces differ", g.workspaces) : "",
                      g.smart === "on" ? i18n("none with one window") : g.smart === "inverse_outer" ? i18n("edges only with one window") : ""]
                     .filter(s => s).join(", ") || i18n("Same everywhere")
            onClicked: kcm.push("Gaps.qml")
        }
        // How far one key press goes: a share of the split for tiling windows, pixels for floating
        // ones, as in i3. A row each, as the gaps.
        RowLayout {
            Kirigami.FormData.label: i18nc("@label:spinbox", "Tiling key step:")
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
                topic: i18nc("@item help topic", "the key step")
                toolTipText: i18n("How far one press of a resize key goes for a tiling window, as a share of its split, and of a move or resize key for a floating window. i3: resize grow width 10 px or 10 ppt, move left 10 px")
            }
        }
        UnitSpinBox {
            id: floatingStepBox
            Kirigami.FormData.label: i18nc("@label:spinbox", "Floating key step:")
            unit: "px"
            from: 1; to: 200
            value: root.settings.floatingStep
            onValueModified: root.settings.floatingStep = value
            Accessible.name: i18nc("@label:spinbox", "How far a key moves or resizes a floating window")
            KCM.SettingStateBinding { configObject: root.settings; settingName: "floatingStep" }
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
            Kirigami.FormData.label: i18nc("@label", "Options:")
            Kirigami.FormData.buddyFor: holdBox
            spacing: Kirigami.Units.smallSpacing
            QQC2.CheckBox {
                id: holdBox
                text: i18nc("@option:check", "Show layout changes all at once")
                checked: root.settings.holdEnabled
                onToggled: root.settings.holdEnabled = checked
                KCM.SettingStateBinding { configObject: root.settings; settingName: "holdEnabled"; extraEnabledConditions: kcm.holdLoaded }
            }
            Help {
                topic: i18nc("@item help topic", "layout changes")
                toolTipText: i18n("A new layout appears in one go, instead of window by window as each app redraws. Needs kwin-i3's plugins.")
            }
        }

        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18nc("@title:group", "Mouse & focus")
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label", "Options:")
            Kirigami.FormData.buddyFor: warpBox
            spacing: Kirigami.Units.smallSpacing
            QQC2.CheckBox {
                id: warpBox
                text: i18nc("@option:check", "Move the pointer with focus to another screen")
                checked: root.settings.mouseWarping === "output"
                onToggled: root.settings.mouseWarping = checked ? "output" : "none"
                KCM.SettingStateBinding { configObject: root.settings; settingName: "mouseWarping" }
            }
            Help {
                topic: i18nc("@item help topic", "the pointer")
                toolTipText: i18n("When a key moves the focus to another screen, the pointer goes to the middle of the focused window. i3: mouse_warping")
            }
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label:listbox", "Drag tiling windows by:")
            Kirigami.FormData.buddyFor: dragBox
            spacing: Kirigami.Units.smallSpacing
            ChoiceBox {
                id: dragBox
                columnWidth: root.mouseColumn
                settingName: "tilingDrag"
                applies: kcm.helperLoaded       // plugin/tilingdrag.cpp
                model: [
                    { text: i18nc("@item:inlistbox", "Titlebar, or Meta anywhere"), value: "modifier titlebar" },
                    { text: i18nc("@item:inlistbox", "Meta anywhere"), value: "modifier" },
                    { text: i18nc("@item:inlistbox", "Titlebar"), value: "titlebar" },
                    { text: i18nc("@item:inlistbox", "Neither: no dragging"), value: "off" },
                ]
            }
            Help {
                topic: i18nc("@item help topic", "dragging tiling windows")
                toolTipText: i18n("Dropped beside another window, a tiling window moves there; dropped on its middle, the two are grouped or swapped. Meta+Shift+Space floats a window instead. i3: tiling_drag")
            }
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label:listbox", "New windows over fullscreen:")
            Kirigami.FormData.buddyFor: popupBox
            spacing: Kirigami.Units.smallSpacing
            ChoiceBox {
                id: popupBox
                columnWidth: root.mouseColumn
                settingName: "popupDuringFullscreen"
                model: [
                    { text: i18nc("@item:inlistbox", "Behind; the fullscreen app's dialogs in front"), value: "smart" },
                    { text: i18nc("@item:inlistbox", "Always behind"), value: "ignore" },
                    { text: i18nc("@item:inlistbox", "The fullscreen app's dialogs end fullscreen"), value: "leave_fullscreen" },
                    { text: i18nc("@item:inlistbox", "Floating ones in front"), value: "all" },
                ]
            }
            Help {
                topic: i18nc("@item help topic", "new windows in fullscreen")
                toolTipText: i18n("Where a window goes when it opens on a workspace that has a fullscreen window. i3: popup_during_fullscreen")
            }
        }

        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18nc("@title:group", "Workspaces")
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label:listbox", "New workspaces:")
            Kirigami.FormData.buddyFor: workspaceLayoutBox
            spacing: Kirigami.Units.smallSpacing
            ChoiceBox {
                id: workspaceLayoutBox
                columnWidth: root.workspacesColumn
                settingName: "workspaceLayout"
                model: [
                    { text: i18nc("@item:inlistbox", "Split"), value: "default" },
                    { text: i18nc("@item:inlistbox", "Tabbed"), value: "tabbed" },
                    { text: i18nc("@item:inlistbox", "Stacked"), value: "stacking" },
                ]
            }
            Help {
                topic: i18nc("@item help topic", "new workspaces")
                toolTipText: i18n("How the windows of a workspace made from now on are arranged: split, or one group shown as tabs or as stacked rows. A layout key changes it later. i3: workspace_layout")
            }
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label:listbox", "Split direction:")
            Kirigami.FormData.buddyFor: orientationBox
            spacing: Kirigami.Units.smallSpacing
            ChoiceBox {
                id: orientationBox
                columnWidth: root.workspacesColumn
                settingName: "defaultOrientation"
                model: [
                    { text: i18nc("@item:inlistbox", "By screen shape"), value: "auto" },
                    { text: i18nc("@item:inlistbox", "Side by side"), value: "horizontal" },
                    { text: i18nc("@item:inlistbox", "Top to bottom"), value: "vertical" },
                ]
            }
            Help {
                topic: i18nc("@item help topic", "the split direction")
                toolTipText: i18n("Which way a new workspace's windows split. By screen shape: top to bottom on a screen taller than wide, side by side otherwise. i3: default_orientation")
            }
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label", "Options:")
            Kirigami.FormData.buddyFor: backAndForthBox
            spacing: Kirigami.Units.smallSpacing
            QQC2.CheckBox {
                id: backAndForthBox
                text: i18nc("@option:check", "Repeat a workspace key to go back and forth")
                checked: root.settings.workspaceAutoBackAndForth
                onToggled: root.settings.workspaceAutoBackAndForth = checked
                KCM.SettingStateBinding { configObject: root.settings; settingName: "workspaceAutoBackAndForth" }
            }
            Help {
                topic: i18nc("@item help topic", "back and forth")
                toolTipText: i18n("Pressing the key of the current workspace goes to the previous one. i3: workspace_auto_back_and_forth")
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
        // Without the plugins tiled windows keep their title bars, so
        // the choice needs them as the frame does.
        ColumnLayout {
          Kirigami.FormData.label: i18nc("@label:listbox", "Tiling windows show:")
          Kirigami.FormData.buddyFor: tiledLook
          spacing: 0
          RowLayout {
            spacing: Kirigami.Units.smallSpacing
            ChoiceBox {
                id: tiledLook
                columnWidth: root.frameColumn
                settingName: "tiledLook"
                applies: kcm.frameAvailable
                model: [
                    { text: i18nc("@item:inlistbox", "A frame"), value: "frame" },
                    { text: i18nc("@item:inlistbox", "Titlebars"), value: "titlebars" },
                    { text: i18nc("@item:inlistbox", "Neither"), value: "bare" },
                ]
            }
            Help {
                topic: i18nc("@item help topic", "how tiling windows look")
                toolTipText: i18n("A frame: a thin coloured line around each window, in place of its titlebar. Titlebars: Plasma's own. i3: default_border")
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
                KCM.SettingStateBinding { configObject: root.settings; settingName: "frameWidth"; extraEnabledConditions: kcm.frameAvailable && root.frameDrawn }
            }
            Help {
                topic: i18nc("@item help topic", "the frame's width")
                toolTipText: i18n("i3: default_border pixel")
            }
        }
        // i3's colour classes, two (focused_inactive left out; docs/behaviour.md §7 L3), one
        // colour a row. The split indicator shows only until the focus leaves its window (L4), so
        // the unfocused class's indicator is almost never seen: it keeps its default, off the page.
        FrameColour {
            Kirigami.FormData.label: i18nc("@label", "Focused frame:")
            settingName: "frameActive"
            applies: root.frameDrawn
            Accessible.name: i18nc("@action:button", "Frame colour of the focused window")
        }
        FrameColour {
            Kirigami.FormData.label: i18nc("@label", "Unfocused frame:")
            settingName: "frameInactive"
            applies: root.frameDrawn
            Accessible.name: i18nc("@action:button", "Frame colour of unfocused windows")
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label", "Split indicator:")
            Kirigami.FormData.buddyFor: indicatorBox
            spacing: Kirigami.Units.smallSpacing
            FrameColour {
                id: indicatorBox
                settingName: "frameIndicatorActive"
                applies: root.frameDrawn
                // Empty in kwinrc: the frame's colour, shown as such.
                color: root.settings.frameIndicatorActive || root.settings.frameActive
                Accessible.name: i18nc("@action:button", "Split indicator colour")
            }
            Help {
                topic: i18nc("@item help topic", "the split indicator")
                toolTipText: i18n("Marks the side where the next window opens, on a window alone in its split, after Split H, Split V or Toggle Split until the focus leaves it. i3: client.focused indicator")
            }
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label:listbox", "Hide frame:")
            Kirigami.FormData.buddyFor: hideEdgesBox
            spacing: Kirigami.Units.smallSpacing
            ChoiceBox {
                id: hideEdgesBox
                columnWidth: root.frameColumn
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
        // Drawn by kwini3hold, so they need the plugins too; a title bar brings its theme's corners.
        // A floating window's frame uses the same colour classes (§7 L11).
        ColumnLayout {
            Kirigami.FormData.label: i18nc("@label", "Options:")
            Kirigami.FormData.buddyFor: cornersBox
            spacing: 0
            QQC2.CheckBox {
                id: cornersBox
                text: i18nc("@option:check", "Round the corners of tiling windows")
                checked: root.settings.roundedCorners
                onToggled: root.settings.roundedCorners = checked
                KCM.SettingStateBinding { configObject: root.settings; settingName: "roundedCorners"; extraEnabledConditions: kcm.frameAvailable && root.settings.tiledLook !== "titlebars" }
            }
            RowLayout {
                spacing: Kirigami.Units.smallSpacing
                QQC2.CheckBox {
                    id: floatingFrameBox
                    text: i18nc("@option:check", "Draw the frame on floating windows too")
                    checked: root.settings.frameOnFloating
                    onToggled: root.settings.frameOnFloating = checked
                    KCM.SettingStateBinding { configObject: root.settings; settingName: "frameOnFloating"; extraEnabledConditions: kcm.frameAvailable }
                }
                Help {
                    topic: i18nc("@item help topic", "the frame on floating windows")
                    toolTipText: i18n("Floating windows lose their titlebar too and get the frame. i3: default_floating_border")
                }
            }
        }

        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18nc("@title:group", "Window rules")
        }
        SubPageButton {
            Kirigami.FormData.label: i18nc("@label", "Specific windows:")
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
        // kwin-i3's keys that a Plasma shortcut also holds: ticked, they run kwin-i3's commands (taken
        // from the Plasma shortcuts on Apply); unticked, the Plasma shortcuts get their original keys
        // back (the Plasma Settings model's "keys" row, kcm/setup.cpp; make take-keys' save).
        ColumnLayout {
            readonly property var row: kcm.setup.rows.find((r) => r.id === "keys")
            visible: !!row
            Kirigami.FormData.label: i18nc("@label", "Options:")
            Kirigami.FormData.buddyFor: takeKeys
            spacing: 0
            RowLayout {
                spacing: Kirigami.Units.smallSpacing
                QQC2.CheckBox {
                    id: takeKeys
                    text: i18nc("@option:check", "Use kwin-i3's keys over Plasma's")
                    // kwin-i3's keys are known only while it runs (KeysModel.available).
                    enabled: kcm.keys.available && !(parent.parent.row && parent.parent.row.settled)
                    checked: !!kcm.setup.wanted["keys"]
                    onToggled: kcm.setup.setWanted("keys", checked)
                    Accessible.description: keysNote.text
                }
                Help {
                    topic: i18nc("@item help topic", "kwin-i3's keys over Plasma's")
                    toolTipText: i18n("A key that a kwin-i3 command and a Plasma shortcut share runs only one of them: Meta+D is Plasma's Show Desktop and kwin-i3's launcher. Ticked, such keys run kwin-i3's commands; each Plasma shortcut keeps its other keys.")
                }
            }
            QQC2.Label {
                id: keysNote
                Layout.maximumWidth: Kirigami.Units.gridUnit * 24
                wrapMode: Text.Wrap
                color: Kirigami.Theme.disabledTextColor
                font: Kirigami.Theme.smallFont
                Accessible.ignored: true
                text: !kcm.keys.available ? i18n("kwin-i3 isn't running, so its keys can't be checked.")
                    : parent.row && parent.row.settled ? i18n("No Plasma shortcut shares a key with kwin-i3.")
                                                       : i18n("Unticking this and applying restores Plasma's original keys.")
            }
        }

        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18nc("@title:group", "Plasma")
        }
        SubPageButton {
            Kirigami.FormData.label: i18nc("@label", "Settings:")
            text: i18nc("@action:button", "Configure Plasma Settings…")
            readonly property var rows: kcm.setup.rows.filter((r) => r.id !== "keys")
            summary: [rows.filter((r) => r.differs).length ? i18np("1 to review", "%1 to review", rows.filter((r) => r.differs).length) : "",
                      rows.filter((r) => r.changed).length ? i18np("1 changed by kwin-i3", "%1 changed by kwin-i3", rows.filter((r) => r.changed).length) : ""]
                     .filter((s) => s).join(", ") || i18n("As kwin-i3 needs them")
            onClicked: kcm.push("PlasmaSettings.qml")
        }
        // warnTakenKeys has no control here while kwin-i3's notifications don't reach Plasma
        // (LATER.md item 56): the checkbox would change nothing a user sees.
        // debugLog has none either: it only feeds the test KWin's log (docs/debugging.md).
    }
}
