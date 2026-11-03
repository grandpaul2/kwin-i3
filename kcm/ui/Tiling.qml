// The Tiling tab: the gaps (gapsInner, gapsOuter), the key steps, focus wrapping and the hold; then
// i3's outer gap per side of the screen (gapsTop, gapsRight, gapsBottom, gapsLeft; -1 means the
// gap at edges above), smart gaps (smartGaps), and each workspace's own gaps (workspaceGaps: "3
// gaps inner 10, 3 gaps outer 0", in place of the ones above, as i3's), one row per workspace.
// settings.js reads and writes the strings.
import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM
import "settings.js" as Logic

KCM.SimpleKCM {
    id: page
    title: i18nc("@title", "Tiling")

    readonly property var settings: kcm.settings
    readonly property var perWorkspace: Logic.parseWorkspaceGaps(settings.workspaceGaps)

    // A side's outer gap: -1 shows as the gap at edges above, in words.
    component SideSpinBox: QQC2.SpinBox {
        property string settingName
        property string side
        from: -1; to: 200
        value: page.settings[settingName]
        onValueModified: page.settings[settingName] = value
        textFromValue: (v) => v < 0 ? i18nc("@item:valuesuffix a side's gap is the outer gap", "same")
                                    : i18nc("@item:valuesuffix a gap in pixels", "%1 px", v)
        valueFromText: (text) => { const m = /-?\d+/.exec(text); return m ? parseInt(m[0]) : -1; }
        Layout.preferredWidth: page.boxWidth
        Accessible.name: i18nc("@label:spinbox", "Extra gap at the %1 edge of the screen", side)
        KCM.SettingStateBinding { configObject: page.settings; settingName: parent.settingName }
    }
    // A workspace's own gap, in place of the ones above (as i3's): the step below the range,
    // "same", is none set. Inner 0-100 and outer -100-200, as above.
    component WorkspaceSpinBox: QQC2.SpinBox {
        property int num
        property string which          // "inner" or "outer"
        property var stored            // undefined: not set
        property bool perSide: false   // the outer gap set per side in kwinrc: "same" isn't true
        readonly property int same: from
        from: which === "inner" ? -1 : -101; to: which === "inner" ? 100 : 200
        value: stored === undefined || stored === null ? same : stored
        onValueModified: page.settings.workspaceGaps = Logic.setWorkspaceGap(page.settings.workspaceGaps, num, which, value === same ? undefined : value)
        textFromValue: (v) => v === same ? (perSide ? i18nc("@item:valuesuffix a workspace's outer gap, set per side in kwinrc", "per side")
                                                    : i18nc("@item:valuesuffix a workspace's gap is the one above", "same"))
                                         : i18nc("@item:valuesuffix a gap in pixels", "%1 px", v)
        valueFromText: (text) => { const m = /-?\d+/.exec(text); return m ? parseInt(m[0]) : same; }
        Layout.preferredWidth: page.boxWidth
        KCM.SettingStateBinding { configObject: page.settings; settingName: "workspaceGaps" }
    }

    header: RowLayout {
        spacing: Kirigami.Units.smallSpacing
        QQC2.Label {
            Layout.fillWidth: true
            Layout.margins: Kirigami.Units.largeSpacing
            wrapMode: Text.Wrap
            text: i18n("A gap set for a screen edge or a workspace replaces the one above; “same” keeps it.")
        }
        Kirigami.ContextualHelpButton {
            Layout.rightMargin: Kirigami.Units.largeSpacing
            toolTipText: i18n("A workspace's gaps replace the ones above. An outer gap below 0 makes the edge thinner, down to half the gap between windows. i3: gaps top|right|bottom|left, smart_gaps, workspace N gaps")
        }
    }

    readonly property real boxWidth: Kirigami.Units.gridUnit * 6
    // The workspace columns' headings are longer: wider columns, further apart.
    readonly property real workspaceWidth: Kirigami.Units.gridUnit * 8
    readonly property real workspaceSpacing: Kirigami.Units.gridUnit
    // A row of column headings, each as wide as the box under it (as the Workspaces page).
    component Headings: RowLayout {
        id: headings
        property var titles
        property real columnWidth: page.boxWidth
        spacing: Kirigami.Units.smallSpacing
        Repeater {
            model: headings.titles
            Kirigami.Heading { required property string modelData; level: 5; text: modelData; Layout.preferredWidth: headings.columnWidth }
        }
    }

    Kirigami.FormLayout {
        // The gaps: a row for each size, then the edges and workspaces below. Every row has a label (an
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
                value: page.settings.gapsInner - page.settings.gapsInner % 2
                valueFromText: (text) => { const v = parseInt(text); return v - v % 2; }
                onValueModified: page.settings.gapsInner = value
                Accessible.name: i18nc("@label:spinbox", "Gap between windows")
                KCM.SettingStateBinding { configObject: page.settings; settingName: "gapsInner" }
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
            value: page.settings.gapsOuter
            onValueModified: page.settings.gapsOuter = value
            Accessible.name: i18nc("@label:spinbox", "Extra gap at screen edges")
            KCM.SettingStateBinding { configObject: page.settings; settingName: "gapsOuter" }
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
                value: page.settings.resizeStep
                onValueModified: page.settings.resizeStep = value
                Accessible.name: i18nc("@label:spinbox", "Resize step")
                KCM.SettingStateBinding { configObject: page.settings; settingName: "resizeStep" }
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
            value: page.settings.floatingStep
            onValueModified: page.settings.floatingStep = value
            Accessible.name: i18nc("@label:spinbox", "How far a key moves or resizes a floating window")
            KCM.SettingStateBinding { configObject: page.settings; settingName: "floatingStep" }
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
            Kirigami.FormData.label: i18nc("@label", "Layout changes all at once:")
            Kirigami.FormData.buddyFor: holdBox
            spacing: Kirigami.Units.smallSpacing
            Tick {
                id: holdBox
                name: i18nc("@option:check", "Show layout changes all at once")
                recommended: true
                checked: page.settings.holdEnabled
                onToggled: page.settings.holdEnabled = checked
                KCM.SettingStateBinding { configObject: page.settings; settingName: "holdEnabled"; extraEnabledConditions: kcm.holdLoaded }
            }
            Help {
                topic: i18nc("@item help topic", "layout changes")
                toolTipText: i18n("A new layout appears in one go, instead of window by window as each app redraws. Needs kwin-i3's plugins.")
            }
        }

        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18nc("@title:group", "Gaps")
        }
        Headings {
            titles: [i18nc("@title:column side of the screen", "Top"), i18nc("@title:column side of the screen", "Right"),
                     i18nc("@title:column side of the screen", "Bottom"), i18nc("@title:column side of the screen", "Left")]
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label", "Extra at screen edges:")
            spacing: Kirigami.Units.smallSpacing
            SideSpinBox { settingName: "gapsTop"; side: i18nc("@item side of the output", "top") }
            SideSpinBox { settingName: "gapsRight"; side: i18nc("@item side of the output", "right") }
            SideSpinBox { settingName: "gapsBottom"; side: i18nc("@item side of the output", "bottom") }
            SideSpinBox { settingName: "gapsLeft"; side: i18nc("@item side of the output", "left") }
        }
        QQC2.ComboBox {
            Kirigami.FormData.label: i18nc("@label:listbox", "With one window:")
            textRole: "text"
            valueRole: "value"
            model: [
                { text: i18nc("@item:inlistbox", "Usual gaps"), value: "off" },
                { text: i18nc("@item:inlistbox", "No gaps"), value: "on" },
                { text: i18nc("@item:inlistbox", "Gaps at screen edges only"), value: "inverse_outer" },
            ]
            readonly property string stored: page.settings.smartGaps
            function sync() { currentIndex = indexOfValue(stored) }
            onStoredChanged: sync()
            onCountChanged: sync()
            Component.onCompleted: sync()
            onActivated: page.settings.smartGaps = currentValue
            Accessible.name: i18nc("@label:listbox", "Gaps on a workspace with one window")
            KCM.SettingStateBinding { configObject: page.settings; settingName: "smartGaps" }
        }
        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18nc("@title:group", "Each workspace")
        }
        Headings {
            titles: [i18nc("@title:column a workspace's gap", "Between windows"), i18nc("@title:column a workspace's gap", "Extra at edges")]
            columnWidth: page.workspaceWidth
            spacing: page.workspaceSpacing
        }
        Repeater {
            model: 10
            RowLayout {
                id: row
                required property int index
                readonly property int num: index + 1
                readonly property var own: page.perWorkspace[num] || {}
                Kirigami.FormData.label: i18nc("@label", "Workspace %1:", num)
                spacing: page.workspaceSpacing
                WorkspaceSpinBox {
                    num: row.num; which: "inner"
                    stored: row.own.inner
                    Layout.preferredWidth: page.workspaceWidth
                    Accessible.name: i18nc("@label:spinbox", "Workspace %1 gap between windows", row.num)
                }
                WorkspaceSpinBox {
                    num: row.num; which: "outer"
                    stored: Logic.outerOf(row.own)
                    perSide: Logic.outerOf(row.own) === null
                    Layout.preferredWidth: page.workspaceWidth
                    Accessible.name: i18nc("@label:spinbox", "Workspace %1 extra gap at screen edges", row.num)
                }
            }
        }
    }
}
