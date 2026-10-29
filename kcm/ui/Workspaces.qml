// The Workspaces sub-page (docs/spec-settings-cleanup.md; redo stage 10): each workspace's
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
        // fallback slot, that fallback gone (review 2026-10-28: slot 0 promoted the fallback).
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
        model: [{ name: "", text: slot ? i18nc("@item:inlistbox no second output", "No other") : i18nc("@item:inlistbox", "Any output") }]
            .concat(page.screens.filter((s) => s.name !== first))
            .concat(output && !page.screens.some((s) => s.name === output)
                ? [{ name: output, text: i18nc("@item:inlistbox output name", "%1 (not connected)", output) }] : [])
        textRole: "text"
        valueRole: "name"
        Layout.preferredWidth: Kirigami.Units.gridUnit * 13
        // Re-synced rather than bound: a choice breaks a binding, and Reset and Defaults
        // must still show (as main.qml's ChoiceBox).
        function sync() { currentIndex = Math.max(0, indexOfValue(output)) }
        readonly property string stored: output
        onStoredChanged: sync()
        onModelChanged: sync()
        Component.onCompleted: sync()
        onActivated: page.setOutput(num, slot, currentValue)
        Accessible.name: slot ? i18nc("@label:listbox", "Workspace %1 second output, used when the first is not connected", num)
                              : i18nc("@label:listbox", "Workspace %1 output", num)
        KCM.SettingStateBinding { configObject: page.settings; settingName: "workspaceOutputs"; extraEnabledConditions: parent.applies }
    }

    header: RowLayout {
        spacing: Kirigami.Units.smallSpacing
        QQC2.Label {
            Layout.fillWidth: true
            Layout.margins: Kirigami.Units.largeSpacing
            wrapMode: Text.Wrap
            text: i18n("A workspace with an output set starts there, or on its second output when the first is not connected; the others start on the first free output. On one set to Floating, new windows float, with their own title bar, as Plasma windows do (a rule in Window Rules).")
        }
        Kirigami.ContextualHelpButton {
            Layout.rightMargin: Kirigami.Units.largeSpacing
            toolTipText: i18n("Meta+Shift+Space tiles a floating window or floats a tiling one. A window keeps its mode when it moves to another workspace. An output that is set but not connected now is kept for when it comes back.")
        }
    }

    Kirigami.FormLayout {
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
                QQC2.Label { text: i18nc("@label between two output boxes", "else"); Accessible.ignored: true; enabled: page.outputAt(row.num, 0) !== "" }
                MonitorBox { num: row.num; slot: 1; first: page.outputAt(row.num, 0); applies: page.outputAt(row.num, 0) !== "" }
                QQC2.ComboBox {
                    model: [{ value: false, text: i18nc("@item:inlistbox new windows are", "Tiling") },
                            { value: true, text: i18nc("@item:inlistbox new windows are", "Floating") }]
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
