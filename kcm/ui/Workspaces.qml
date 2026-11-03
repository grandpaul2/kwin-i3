// The Workspaces sub-page: each workspace's
// monitors in order (workspaceOutputs, "1=DP-4 HDMI-A-1": the first connected one is used, as
// i3's workspace N output A B), and whether its new windows open floating (the rule
// [workspace="^N$"] floating enable in forWindow, as the old floatingWorkspaces is read), one
// row per workspace.
import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM
import "settings.js" as Logic

KCM.SimpleKCM {
    id: page
    title: i18nc("@title", "Workspaces")

    readonly property var settings: kcm.settings
    readonly property var lists: Logic.parseOutputLists(settings.workspaceOutputs)
    readonly property var plasma: Logic.floatingWorkspaceList(settings.forWindow)
    // Connected monitors, by name and model ("DP-4 — DELL U2723QE").
    readonly property var screens: Qt.application.screens.map((s) => ({
        name: s.name, text: s.model ? i18nc("output name — model", "%1 — %2", s.name, s.model) : s.name }))

    // The page sets the first two monitors of a workspace's list; a longer list from kwinrc
    // keeps its tail.
    function outputAt(n, i) { return ((lists[n] || "").split(" ").filter((s) => s))[i] || ""; }
    function setOutput(n, i, name) {
        const map = Logic.parseOutputLists(settings.workspaceOutputs);
        const list = (map[n] || "").split(" ").filter((s) => s);
        if ((list[i] || "") === name) return;
        // "Any monitor" in the first slot is no assignment at all, its fallbacks with it; in a
        // fallback slot, that fallback gone (slot 0 promoted the fallback).
        if (name) list[i] = name; else if (i === 0) list.length = 0; else list.splice(i, 1);
        map[n] = list.filter((s) => s).join(" ");
        settings.workspaceOutputs = Logic.formatOutputs(map);
    }
    function setPlasma(n, on) {
        settings.forWindow = Logic.setWorkspaceFloating(settings.forWindow, n, on);
    }
    // A monitor box: any, the connected ones, and one set but not connected now.
    component MonitorBox: QQC2.ComboBox {
        property int num
        property int slot
        property string first: ""
        property bool applies: true
        readonly property string output: page.outputAt(num, slot)
        // The column headings above say which box is which, so the items are plain names.
        model: [{ name: "", text: slot ? i18nc("@item:inlistbox no second screen", "None") : i18nc("@item:inlistbox", "Any screen") }]
            .concat(page.screens.filter((s) => s.name !== first))
            .concat(output && !page.screens.some((s) => s.name === output)
                ? [{ name: output, text: i18nc("@item:inlistbox output name", "%1 (not connected)", output) }] : [])
        textRole: "text"
        valueRole: "name"
        Layout.preferredWidth: page.screenWidth
        // Re-synced rather than bound: a choice breaks a binding, and Reset and Defaults
        // must still show (as main.qml's ChoiceBox).
        function sync() { currentIndex = Math.max(0, indexOfValue(output)) }
        readonly property string stored: output
        onStoredChanged: sync()
        onModelChanged: sync()
        Component.onCompleted: sync()
        onActivated: page.setOutput(num, slot, currentValue)
        Accessible.name: slot ? i18nc("@label:listbox", "Workspace %1 second screen, used when the first is not connected", num)
                              : i18nc("@label:listbox", "Workspace %1 screen", num)
        KCM.SettingStateBinding { configObject: page.settings; settingName: "workspaceOutputs"; extraEnabledConditions: parent.applies }
    }

    header: RowLayout {
        spacing: Kirigami.Units.smallSpacing
        QQC2.Label {
            Layout.fillWidth: true
            Layout.margins: Kirigami.Units.largeSpacing
            wrapMode: Text.Wrap
            text: i18n("A workspace given a screen opens there, or on its second screen while the first isn't connected.")
        }
        Kirigami.ContextualHelpButton {
            Layout.rightMargin: Kirigami.Units.largeSpacing
            toolTipText: i18n("Others open on the screen that has the focus when they are first shown. On a floating workspace new windows float (a rule in Window Rules). Meta+Shift+Space tiles a floating window or floats a tiling one. A screen that isn't connected is kept for when it returns. i3: workspace N output")
        }
    }

    readonly property real screenWidth: Kirigami.Units.gridUnit * 13
    readonly property real newWidth: Kirigami.Units.gridUnit * 7

    Kirigami.FormLayout {
        // The columns' headings, over the boxes as the Plasma Settings page's.
        RowLayout {
            spacing: Kirigami.Units.smallSpacing
            Kirigami.Heading { level: 5; text: i18nc("@title:column a workspace's screen", "Screen"); Layout.preferredWidth: page.screenWidth }
            Kirigami.Heading { level: 5; text: i18nc("@title:column the screen used when the first isn't connected", "Else"); Layout.preferredWidth: page.screenWidth }
            Kirigami.Heading { level: 5; text: i18nc("@title:column how a workspace's new windows open", "New windows"); Layout.preferredWidth: page.newWidth }
        }
        Repeater {
            model: 10
            RowLayout {
                id: row
                required property int index
                readonly property int num: index + 1
                readonly property string output: page.outputAt(num, 0)
                Kirigami.FormData.label: i18nc("@label", "Workspace %1:", num)
                spacing: Kirigami.Units.smallSpacing

                MonitorBox { num: row.num; slot: 0 }
                // The second box is there on every row (the rows share one shape), greyed with no first.
                MonitorBox { num: row.num; slot: 1; first: page.outputAt(row.num, 0); applies: page.outputAt(row.num, 0) !== "" }
                QQC2.ComboBox {
                    model: [{ value: false, text: i18nc("@item:inlistbox a workspace's new windows", "Tile") },
                            { value: true, text: i18nc("@item:inlistbox a workspace's new windows", "Float") }]
                    Layout.preferredWidth: page.newWidth
                    textRole: "text"
                    valueRole: "value"
                    readonly property bool stored: page.plasma.indexOf(row.num) >= 0
                    function sync() { currentIndex = stored ? 1 : 0 }
                    onStoredChanged: sync()
                    Component.onCompleted: sync()
                    onActivated: page.setPlasma(row.num, currentValue)
                    Accessible.name: i18nc("@label:listbox", "Workspace %1 new windows", row.num)
                    KCM.SettingStateBinding { configObject: page.settings; settingName: "forWindow" }
                }
            }
        }
    }
}
