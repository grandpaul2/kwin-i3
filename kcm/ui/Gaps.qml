// The Gaps sub-page: i3's outer gap per side of the screen
// (gapsTop, gapsRight, gapsBottom, gapsLeft; -1 means the outer gap of the main page), smart gaps
// (smartGaps), and each workspace's own gaps (workspaceGaps: "3 gaps inner 10, 3 gaps outer 0",
// in place of the main page's, as i3's), one row per workspace. settings.js reads and writes the strings.
import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM
import "settings.js" as Logic

KCM.SimpleKCM {
    id: page
    title: i18nc("@title", "Gaps")

    readonly property var settings: kcm.settings
    readonly property var perWorkspace: Logic.parseWorkspaceGaps(settings.workspaceGaps)

    // A side's outer gap: -1 shows as the main page's outer gap, in words.
    component SideSpinBox: QQC2.SpinBox {
        property string settingName
        property string side
        from: -1; to: 200
        value: page.settings[settingName]
        onValueModified: page.settings[settingName] = value
        textFromValue: (v) => v < 0 ? i18nc("@item:valuesuffix a side's gap is the outer gap", "%1: same", side)
                                    : i18nc("@item:valuesuffix a side's gap in pixels", "%1: %2 px", side, v)
        valueFromText: (text) => { const m = /-?\d+/.exec(text); return m ? parseInt(m[0]) : -1; }
        Layout.preferredWidth: Kirigami.Units.gridUnit * 8
        Accessible.name: i18nc("@label:spinbox", "Extra gap at the %1 edge of the screen", side)
        KCM.SettingStateBinding { configObject: page.settings; settingName: parent.settingName }
    }
    // A workspace's own gap, in place of the main page's (as i3's): the step below the range,
    // "same", is none set. Inner 0-100 and outer -100-200, as the main page.
    component WorkspaceSpinBox: QQC2.SpinBox {
        property int num
        property string which          // "inner" or "outer"
        property var stored            // undefined: not set
        readonly property int same: from
        from: which === "inner" ? -1 : -101; to: which === "inner" ? 100 : 200
        value: stored === undefined || stored === null ? same : stored
        onValueModified: page.settings.workspaceGaps = Logic.setWorkspaceGap(page.settings.workspaceGaps, num, which, value === same ? undefined : value)
        textFromValue: (v) => v === same ? i18nc("@item:valuesuffix a workspace's gap is the main page's", "same")
                                         : i18nc("@item:valuesuffix a gap in pixels", "%1 px", v)
        valueFromText: (text) => { const m = /-?\d+/.exec(text); return m ? parseInt(m[0]) : same; }
        Layout.preferredWidth: Kirigami.Units.gridUnit * 6
        KCM.SettingStateBinding { configObject: page.settings; settingName: "workspaceGaps" }
    }

    header: RowLayout {
        spacing: Kirigami.Units.smallSpacing
        QQC2.Label {
            Layout.fillWidth: true
            Layout.margins: Kirigami.Units.largeSpacing
            wrapMode: Text.Wrap
            text: i18n("Here a screen edge or a workspace can differ from the main page.")
        }
        Kirigami.ContextualHelpButton {
            Layout.rightMargin: Kirigami.Units.largeSpacing
            toolTipText: i18n("A workspace's gaps replace the main page's. An outer gap below 0 makes the edge thinner, down to half the gap between windows. i3: gaps top|right|bottom|left, smart_gaps, workspace N gaps")
        }
    }

    Kirigami.FormLayout {
        RowLayout {
            Kirigami.FormData.label: i18nc("@label", "Edges:")
            spacing: Kirigami.Units.smallSpacing
            SideSpinBox { settingName: "gapsTop"; side: i18nc("@item side of the output", "top") }
            SideSpinBox { settingName: "gapsRight"; side: i18nc("@item side of the output", "right") }
            SideSpinBox { settingName: "gapsBottom"; side: i18nc("@item side of the output", "bottom") }
            SideSpinBox { settingName: "gapsLeft"; side: i18nc("@item side of the output", "left") }
        }
        QQC2.ComboBox {
            Kirigami.FormData.label: i18nc("@label:listbox", "Lone window:")
            textRole: "text"
            valueRole: "value"
            model: [
                { text: i18nc("@item:inlistbox", "Usual gaps"), value: "off" },
                { text: i18nc("@item:inlistbox", "No gaps"), value: "on" },
                { text: i18nc("@item:inlistbox", "Edge gaps only"), value: "inverse_outer" },
            ]
            readonly property string stored: page.settings.smartGaps
            function sync() { currentIndex = indexOfValue(stored) }
            onStoredChanged: sync()
            onCountChanged: sync()
            Component.onCompleted: sync()
            onActivated: page.settings.smartGaps = currentValue
            Accessible.name: i18nc("@label:listbox", "Gaps on a workspace with a lone window")
            KCM.SettingStateBinding { configObject: page.settings; settingName: "smartGaps" }
        }
        Item {
            Kirigami.FormData.isSection: true
            Kirigami.FormData.label: i18nc("@title:group", "Each workspace")
        }
        Repeater {
            model: 10
            RowLayout {
                id: row
                required property int index
                readonly property int num: index + 1
                readonly property var own: page.perWorkspace[num] || {}
                Kirigami.FormData.label: i18nc("@label", "Workspace %1:", num)
                spacing: Kirigami.Units.smallSpacing
                WorkspaceSpinBox {
                    num: row.num; which: "inner"
                    stored: row.own.inner
                    Accessible.name: i18nc("@label:spinbox", "Workspace %1 gap between windows", row.num)
                }
                QQC2.Label { text: i18nc("@label after a gap's size", "between windows"); Accessible.ignored: true }
                Item { implicitWidth: Kirigami.Units.largeSpacing }
                WorkspaceSpinBox {
                    num: row.num; which: "outer"
                    stored: Logic.outerOf(row.own)
                    Accessible.name: i18nc("@label:spinbox", "Workspace %1 extra gap at screen edges", row.num)
                }
                QQC2.Label { text: Logic.outerOf(row.own) === null ? i18nc("@label after a gap's size, set per side in kwinrc", "at edges, set per side") : i18nc("@label after a gap's size", "at edges"); Accessible.ignored: true }
            }
        }
    }
}
