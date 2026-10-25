// kwin-i3 Workspaces (docs/spec-workspace-widget.md): every workspace in use on one panel, each
// at its own monitor's shape with its windows, the shown ones marked; a click is kwin-i3's Meta+N.
// Everything comes from Plasma's task manager, which follows per-monitor desktops; the logic is
// in workspaces.js.
import QtQuick
import QtQuick.Layouts
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.kirigami as Kirigami
import org.kde.taskmanager as TaskManager
import org.kde.plasma.workspace.dbus as DBus
import "workspaces.js" as Logic

PlasmoidItem {
    id: root

    preferredRepresentation: fullRepresentation
    readonly property bool vertical: Plasmoid.formFactor === PlasmaCore.Types.Vertical
    readonly property bool numbersOnly: Plasmoid.configuration.numbersOnly
    property var spaces: []

    TaskManager.VirtualDesktopInfo { id: desktops }
    TaskManager.TasksModel {
        id: tasks
        groupMode: TaskManager.TasksModel.GroupDisabled
        filterByVirtualDesktop: false
        filterByScreen: false
        filterByActivity: false
        filterNotMinimized: false
    }

    function role(row, r) { return tasks.data(tasks.index(row, 0), r); }
    function gather() {
        const R = TaskManager.AbstractTasksModel;
        const screens = Qt.application.screens.map(s => ({ name: s.name, x: s.virtualX, y: s.virtualY, width: s.width, height: s.height }));
        const shown = {};
        screens.forEach(s => { const d = desktops.currentDesktopByScreenName(s.name); if (d !== undefined && d !== null) shown[s.name] = d; });
        const windows = [];
        for (let i = 0; i < tasks.count; i++) {
            if (!role(i, R.IsWindow)) continue;
            const g = role(i, R.Geometry);
            windows.push({
                desktops: (role(i, R.VirtualDesktops) || []).map(String),
                onAll: !!role(i, R.IsOnAllVirtualDesktops),
                x: g.x, y: g.y, width: g.width, height: g.height,
                active: !!role(i, R.IsActive),
            });
        }
        const ids = desktops.desktopIds.map(String);
        Object.keys(shown).forEach(k => shown[k] = String(shown[k]));
        root.spaces = Logic.workspaces({ desktops: ids, names: desktops.desktopNames, screens: screens, shown: shown, windows: windows });
        // For tests/live/67-workspace-widget.sh (QT_LOGGING_RULES="qml.debug=true"); silent otherwise.
        console.debug("kwin-i3 workspaces: " + JSON.stringify(root.spaces.map(s => [s.num, s.screen, s.width, s.height, s.windows.length, s.shown, s.focused])));
    }
    Timer { id: refresh; interval: 30; onTriggered: root.gather() }
    Connections { target: desktops; function onDesktopIdsChanged() { refresh.restart(); } function onCurrentDesktopChanged() { refresh.restart(); }
                  function onCurrentDesktopForScreenChanged() { refresh.restart(); } function onDesktopNamesChanged() { refresh.restart(); } }
    Connections { target: tasks; function onDataChanged() { refresh.restart(); } function onRowsInserted() { refresh.restart(); }
                  function onRowsRemoved() { refresh.restart(); } function onModelReset() { refresh.restart(); } }
    Component.onCompleted: gather()

    // kwin-i3's "Workspace N" (Meta+N), so the widget and the key do the same (decision: spec).
    function show(num) {
        console.debug("kwin-i3 workspaces: show " + num);
        const reply = DBus.SessionBus.asyncCall({
            "service": "org.kde.kglobalaccel", "path": "/component/kwin", "iface": "org.kde.kglobalaccel.Component",
            "member": "invokeShortcut", "arguments": [new DBus.string("kwin-i3 Workspace " + num)], "signature": "(s)"
        });
        reply.finished.connect(() => { if (reply.isError) console.warn("kwin-i3 workspaces: " + reply.error.message); });
    }

    fullRepresentation: GridLayout {
        id: row
        rowSpacing: Kirigami.Units.smallSpacing
        columnSpacing: Kirigami.Units.smallSpacing
        flow: root.vertical ? GridLayout.TopToBottom : GridLayout.LeftToRight
        rows: root.vertical ? -1 : 1
        columns: root.vertical ? 1 : -1
        Layout.minimumWidth: root.vertical ? -1 : implicitWidth
        Layout.minimumHeight: root.vertical ? implicitHeight : -1

        // The thumbnail's short side: the panel's thickness.
        readonly property real thickness: root.vertical ? root.width : root.height

        WheelHandler {
            onWheel: (event) => {
                const n = Logic.step(root.spaces, event.angleDelta.y < 0 || event.angleDelta.x < 0 ? 1 : -1);
                if (n !== null) root.show(n);
            }
        }

        Repeater {
            model: root.spaces
            delegate: Rectangle {
                id: space
                required property var modelData
                readonly property real aspect: root.numbersOnly ? 1 : modelData.width / modelData.height
                Layout.preferredHeight: root.vertical ? width / aspect : row.thickness
                Layout.preferredWidth: root.vertical ? row.thickness : row.thickness * aspect
                radius: 2
                color: modelData.focused ? Qt.alpha(Kirigami.Theme.highlightColor, 0.55)
                     : modelData.shown ? Qt.alpha(Kirigami.Theme.highlightColor, 0.25)
                     : Qt.alpha(Kirigami.Theme.textColor, 0.08)
                border.width: 1
                border.color: modelData.shown ? Kirigami.Theme.highlightColor : Qt.alpha(Kirigami.Theme.textColor, 0.3)

                Repeater {
                    model: root.numbersOnly ? [] : space.modelData.windows
                    delegate: Rectangle {
                        required property var modelData
                        x: modelData.x * space.width
                        y: modelData.y * space.height
                        width: Math.max(1, modelData.width * space.width)
                        height: Math.max(1, modelData.height * space.height)
                        color: Qt.alpha(Kirigami.Theme.backgroundColor, 0.6)
                        border.width: 1
                        border.color: modelData.active ? Kirigami.Theme.highlightColor : Qt.alpha(Kirigami.Theme.textColor, 0.6)
                    }
                }
                Text {
                    anchors.centerIn: parent
                    text: space.modelData.num
                    color: Kirigami.Theme.textColor
                    font.bold: space.modelData.focused
                    font.pixelSize: Math.max(8, Math.min(space.height, space.width) * 0.5)
                }
                MouseArea {
                    anchors.fill: parent
                    onClicked: root.show(space.modelData.num)
                }
            }
        }
    }
}
