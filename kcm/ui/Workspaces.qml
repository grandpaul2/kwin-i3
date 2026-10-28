// The Workspaces sub-page (docs/spec-settings-cleanup.md): each workspace's monitor
// (workspaceOutputs, "1=DP-4") and whether its new windows open floating
// (floatingWorkspaces, "3, 7"), one row per workspace.
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
    readonly property var outputs: Logic.parseOutputs(settings.workspaceOutputs)
    readonly property var plasma: Logic.parseWorkspaces(settings.floatingWorkspaces)
    // Connected monitors, by name and model ("DP-4 — DELL U2723QE").
    readonly property var screens: Qt.application.screens.map((s) => ({
        name: s.name, text: s.model ? i18nc("monitor name — model", "%1 — %2", s.name, s.model) : s.name }))

    // The page sets one monitor per workspace; a list typed in kwinrc (i3's "output A B": the
    // first connected wins) is kept as long as its first monitor is the one shown here.
    function setOutput(n, name) {
        const map = Logic.parseOutputLists(settings.workspaceOutputs);
        if ((outputs[n] || "") === name) return;
        map[n] = name;
        settings.workspaceOutputs = Logic.formatOutputs(map);
    }
    function setPlasma(n, on) {
        const list = plasma.filter((m) => m !== n);
        if (on) list.push(n);
        settings.floatingWorkspaces = Logic.formatWorkspaces(list);
    }

    header: RowLayout {
        spacing: Kirigami.Units.smallSpacing
        QQC2.Label {
            Layout.fillWidth: true
            Layout.margins: Kirigami.Units.largeSpacing
            wrapMode: Text.Wrap
            text: i18n("A workspace with a monitor set starts there; the others start on the first free monitor. On one set to Floating, new windows float, with their own title bar, as Plasma windows do.")
        }
        Kirigami.ContextualHelpButton {
            Layout.rightMargin: Kirigami.Units.largeSpacing
            toolTipText: i18n("Meta+Shift+Space tiles a floating window or floats a tiled one. A window keeps its mode when it moves to another workspace. A monitor that is set but not connected now is kept for when it comes back.")
        }
    }

    Kirigami.FormLayout {
        Repeater {
            model: 10
            RowLayout {
                id: row
                required property int index
                readonly property int num: index + 1
                readonly property string output: page.outputs[num] || ""
                Kirigami.FormData.label: i18nc("@label", "Workspace %1:", num)
                spacing: Kirigami.Units.smallSpacing

                QQC2.ComboBox {
                    // Any monitor, the connected ones, and one set but not connected now.
                    model: [{ name: "", text: i18nc("@item:inlistbox", "Any monitor") }]
                        .concat(page.screens)
                        .concat(row.output && !page.screens.some((s) => s.name === row.output)
                            ? [{ name: row.output, text: i18nc("@item:inlistbox monitor name", "%1 (not connected)", row.output) }] : [])
                    textRole: "text"
                    valueRole: "name"
                    Layout.preferredWidth: Kirigami.Units.gridUnit * 14
                    // Re-synced rather than bound: a choice breaks a binding, and Reset and Defaults
                    // must still show (as main.qml's ChoiceBox).
                    function sync() { currentIndex = indexOfValue(row.output) }
                    readonly property string stored: row.output
                    onStoredChanged: sync()
                    onModelChanged: sync()
                    Component.onCompleted: sync()
                    onActivated: page.setOutput(row.num, currentValue)
                    Accessible.name: i18nc("@label:listbox", "Workspace %1 monitor", row.num)
                }
                QQC2.ComboBox {
                    model: [{ value: false, text: i18nc("@item:inlistbox new windows are", "Tiled") },
                            { value: true, text: i18nc("@item:inlistbox new windows are", "Floating") }]
                    textRole: "text"
                    valueRole: "value"
                    readonly property bool stored: page.plasma.indexOf(row.num) >= 0
                    function sync() { currentIndex = stored ? 1 : 0 }
                    onStoredChanged: sync()
                    Component.onCompleted: sync()
                    onActivated: page.setPlasma(row.num, currentValue)
                    Accessible.name: i18nc("@label:listbox", "Workspace %1 new windows", row.num)
                }
            }
        }
    }
}
