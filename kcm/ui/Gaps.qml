// The Gaps sub-page (docs/spec-redo-10-settings-page.md): i3's outer gap per side of the screen
// (gapsTop, gapsRight, gapsBottom, gapsLeft; -1 means the outer gap of the main page), smart gaps
// (smartGaps), and each workspace's own gaps (workspaceGaps: "3 gaps inner 10, 3 gaps outer 0",
// added to the main page's), one row per workspace. settings.js reads and writes the strings.
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
        textFromValue: (v) => v < 0 ? i18nc("@item:valuesuffix a side's gap is the outer gap", "%1: as outer", side)
                                    : i18nc("@item:valuesuffix a side's gap in pixels", "%1: %2 px", side, v)
        valueFromText: (text) => { const m = /-?\d+/.exec(text); return m ? parseInt(m[0]) : -1; }
        Layout.preferredWidth: Kirigami.Units.gridUnit * 8
        Accessible.name: i18nc("@label:spinbox", "Extra gap at the %1 edge of the screen", side)
        KCM.SettingStateBinding { configObject: page.settings; settingName: parent.settingName }
    }
    // A workspace's own gap, added to the main page's: 0 shows as "same".
    component WorkspaceSpinBox: QQC2.SpinBox {
        property int num
        property string which          // "inner" or "outer"
        property int stored: 0
        from: -200; to: 200
        value: stored
        onValueModified: page.settings.workspaceGaps = Logic.setWorkspaceGap(page.settings.workspaceGaps, num, which, value)
        textFromValue: (v) => v === 0 ? i18nc("@item:valuesuffix a workspace's gap is the usual one", "same")
                                      : v > 0 ? i18nc("@item:valuesuffix pixels added", "+%1 px", v) : i18nc("@item:valuesuffix pixels taken", "%1 px", v)
        valueFromText: (text) => { const m = /-?\d+/.exec(text); return m ? parseInt(m[0]) : 0; }
        Layout.preferredWidth: Kirigami.Units.gridUnit * 6
        KCM.SettingStateBinding { configObject: page.settings; settingName: "workspaceGaps" }
    }

    header: RowLayout {
        spacing: Kirigami.Units.smallSpacing
        QQC2.Label {
            Layout.fillWidth: true
            Layout.margins: Kirigami.Units.largeSpacing
            wrapMode: Text.Wrap
            text: i18n("The main page's gaps apply everywhere. Here a screen edge can have its own extra gap, and a workspace can add to (or take from) the gaps on it alone.")
        }
        Kirigami.ContextualHelpButton {
            Layout.rightMargin: Kirigami.Units.largeSpacing
            toolTipText: i18n("As i3's gaps top|right|bottom|left, smart_gaps and workspace N gaps … lines. A workspace's gaps are added to the main page's; the sum never goes below 0.")
        }
    }

    Kirigami.FormLayout {
        RowLayout {
            Kirigami.FormData.label: i18nc("@label", "Screen edges:")
            spacing: Kirigami.Units.smallSpacing
            SideSpinBox { settingName: "gapsTop"; side: i18nc("@item side of the screen", "top") }
            SideSpinBox { settingName: "gapsRight"; side: i18nc("@item side of the screen", "right") }
            SideSpinBox { settingName: "gapsBottom"; side: i18nc("@item side of the screen", "bottom") }
            SideSpinBox { settingName: "gapsLeft"; side: i18nc("@item side of the screen", "left") }
        }
        QQC2.ComboBox {
            Kirigami.FormData.label: i18nc("@label:listbox", "One window on a workspace:")
            textRole: "text"
            valueRole: "value"
            model: [
                { text: i18nc("@item:inlistbox", "Gaps as usual"), value: "off" },
                { text: i18nc("@item:inlistbox", "No gaps at all"), value: "on" },
                { text: i18nc("@item:inlistbox", "Edge gaps only there, none elsewhere"), value: "inverse_outer" },
            ]
            readonly property string stored: page.settings.smartGaps
            function sync() { currentIndex = indexOfValue(stored) }
            onStoredChanged: sync()
            onCountChanged: sync()
            Component.onCompleted: sync()
            onActivated: page.settings.smartGaps = currentValue
            Accessible.name: i18nc("@label:listbox", "Gaps on a workspace with one window (smart gaps)")
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
                    stored: row.own.inner || 0
                    Accessible.name: i18nc("@label:spinbox", "Workspace %1 gap between windows", row.num)
                }
                QQC2.Label { text: i18nc("@label after a gap's size", "between windows"); Accessible.ignored: true }
                Item { implicitWidth: Kirigami.Units.largeSpacing }
                WorkspaceSpinBox {
                    num: row.num; which: "outer"
                    stored: Logic.outerOf(row.own) === null ? 0 : Logic.outerOf(row.own)
                    Accessible.name: i18nc("@label:spinbox", "Workspace %1 extra gap at screen edges", row.num)
                }
                QQC2.Label { text: Logic.outerOf(row.own) === null ? i18nc("@label after a gap's size, set per side in kwinrc", "at screen edges (set per side)") : i18nc("@label after a gap's size", "at screen edges"); Accessible.ignored: true }
            }
        }
    }
}
