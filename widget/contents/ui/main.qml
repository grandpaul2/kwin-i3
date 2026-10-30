// kwin-i3 Workspaces (docs/records/spec-workspace-widget.md): every workspace in use on one panel, each
// at its own monitor's shape with its windows, the shown ones marked; a click is kwin-i3's Meta+N.
// Everything comes from Plasma's task manager, which follows per-monitor desktops; the logic is
// in workspaces.js.
import QtQuick
import QtQuick.Layouts
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.kirigami as Kirigami
import org.kde.ksvg as KSvg
import org.kde.taskmanager as TaskManager
import org.kde.plasma.workspace.dbus as DBus
import "workspaces.js" as Logic

PlasmoidItem {
    id: root

    preferredRepresentation: fullRepresentation
    readonly property bool vertical: Plasmoid.formFactor === PlasmaCore.Types.Vertical
    readonly property bool numbersOnly: Plasmoid.configuration.numbersOnly
    property var spaces: []
    property string spacesJson: ""
    property int pending: 0                 // the workspace a scroll last asked for, until the next gather
    property real wheelRest: 0              // angleDelta not yet a whole step (a touchpad's small ones)

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
            if (!g || g.width === undefined) continue;          // a window not placed yet
            windows.push({
                desktops: (role(i, R.VirtualDesktops) || []).map(String),
                onAll: !!role(i, R.IsOnAllVirtualDesktops),
                x: g.x, y: g.y, width: g.width, height: g.height,
                active: !!role(i, R.IsActive),
            });
        }
        const ids = desktops.desktopIds.map(String);
        Object.keys(shown).forEach(k => shown[k] = String(shown[k]));
        const next = Logic.workspaces({ desktops: ids, names: desktops.desktopNames, screens: screens, shown: shown, windows: windows });
        // Only a real change rebuilds the thumbnails (a title or icon change would recreate every
        // delegate, and a click landing mid-rebuild would be lost: review of the widget, 2).
        const json = JSON.stringify(next);
        if (json === root.spacesJson) return;
        root.spacesJson = json;
        root.spaces = next;
        root.pending = 0;
        // For tests/live/67-workspace-widget.sh (QT_LOGGING_RULES="qml.debug=true"); silent otherwise.
        console.debug("kwin-i3 workspaces: " + JSON.stringify(next.map(s => [s.num, s.screen, s.width, s.height, s.windows.length, s.shown, s.focused])));
    }
    Timer { id: refresh; interval: 30; onTriggered: root.gather() }
    Connections { target: desktops; function onDesktopIdsChanged() { refresh.restart(); } function onCurrentDesktopChanged() { refresh.restart(); }
                  function onCurrentDesktopForScreenChanged() { refresh.restart(); } function onDesktopNamesChanged() { refresh.restart(); } }
    Connections { target: tasks; function onDataChanged() { refresh.restart(); } function onRowsInserted() { refresh.restart(); }
                  function onRowsRemoved() { refresh.restart(); } function onModelReset() { refresh.restart(); } }
    Connections { target: Qt.application; function onScreensChanged() { refresh.restart(); } }
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
        readonly property real lead: Logic.lead(Plasmoid.formFactor === PlasmaCore.Types.Horizontal || root.vertical, root.vertical, taskFrame.margins)

        // The task manager's own frame, read for its margins as the task manager reads it.
        KSvg.FrameSvgItem {
            id: taskFrame
            visible: false
            imagePath: "widgets/tasks"
            prefix: [({ [PlasmaCore.Types.LeftEdge]: "west", [PlasmaCore.Types.TopEdge]: "north",
                        [PlasmaCore.Types.RightEdge]: "east" }[Plasmoid.location] || "south") + "-normal", "normal"]
        }
        // For tests/live/67-workspace-widget.sh, as the workspaces line below.
        readonly property string frameReport: [taskFrame.margins.left, taskFrame.margins.right, taskFrame.margins.top, taskFrame.margins.bottom, lead].join(" ")
        onFrameReportChanged: console.debug("kwin-i3 workspaces frame: " + frameReport)
        // The gap before the first workspace (Logic.lead); the grid's spacing after it makes up the
        // rest. The panel mirrors it to the right in a right-to-left language.
        Item {
            visible: row.lead > row.columnSpacing
            Layout.preferredWidth: root.vertical ? 0 : row.lead - row.columnSpacing
            Layout.preferredHeight: root.vertical ? row.lead - row.rowSpacing : 0
        }

        // One workspace per wheel notch (120), a touchpad's small deltas added up; steps taken
        // before kwin-i3's answer reaches the widget go on from the one last asked for (review, 1).
        WheelHandler {
            onWheel: (event) => {
                const d = event.angleDelta.y !== 0 ? event.angleDelta.y : event.angleDelta.x;
                root.wheelRest += d;
                while (Math.abs(root.wheelRest) >= 120) {
                    const dir = root.wheelRest < 0 ? 1 : -1;
                    root.wheelRest += dir * 120;
                    const n = Logic.step(root.spaces, dir, root.pending);
                    if (n !== null) { root.pending = n; root.show(n); }
                }
            }
        }

        Repeater {
            model: root.spaces
            delegate: Rectangle {
                id: space
                required property var modelData
                readonly property real aspect: root.numbersOnly ? 1 : modelData.width / modelData.height
                // KWin's own default name for an unnamed desktop, in KWin's translation domain
                // (virtualdesktops.cpp: i18n("Desktop %1")), so "Desktop 2" is no name of its own.
                readonly property string defaultName: i18nd("kwin", "Desktop %1", modelData.num)
                readonly property bool isNamed: Logic.named(modelData.num, modelData.name, defaultName)
                readonly property string label: Logic.label(modelData.num, modelData.name, defaultName)
                Layout.preferredHeight: root.vertical ? row.thickness / aspect : row.thickness
                // Numbers only: a named workspace's button widens to fit "2 mail".
                Layout.preferredWidth: root.vertical ? row.thickness
                    : Math.max(row.thickness * aspect, root.numbersOnly && isNamed ? metrics.width + row.thickness * 0.4 : 0)
                TextMetrics { id: metrics; font.pixelSize: Math.max(8, row.thickness * 0.5); font.bold: space.modelData.focused; text: space.label }
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
                    anchors.fill: parent
                    anchors.margins: 2
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                    text: space.label
                    color: Kirigami.Theme.textColor
                    font.bold: space.modelData.focused
                    font.pixelSize: Math.max(8, Math.min(space.height, space.width) * 0.5)
                    fontSizeMode: Text.Fit          // a name shrinks to fit a small thumbnail
                    minimumPixelSize: 8
                    elide: Text.ElideRight
                }
                MouseArea {
                    id: area
                    anchors.fill: parent
                    hoverEnabled: true
                    onClicked: root.show(space.modelData.num)
                    Accessible.role: Accessible.Button
                    Accessible.name: space.isNamed ? i18n("Workspace %1: %2", space.modelData.num, space.modelData.name)
                                                   : i18n("Workspace %1", space.modelData.num)
                    Accessible.onPressAction: root.show(space.modelData.num)
                }
                PlasmaCore.ToolTipArea {
                    anchors.fill: parent
                    mainText: space.isNamed ? i18n("Workspace %1: %2", space.modelData.num, space.modelData.name)
                                            : i18n("Workspace %1", space.modelData.num)
                    subText: space.modelData.focused ? i18n("Shown, with the focus")
                           : space.modelData.shown ? i18n("Shown on its output") : ""
                }
            }
        }
    }
}
