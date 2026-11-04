// kwin-i3's page: the script's settings as Plasma's own pages lay theirs out, in tabs (as Window
// Behavior's): Plasma, Tiling, Gaps, Workspaces, Window Rules, Frame and Keys, each a page
// of its own file, loaded by name ("Keys" is also QtQuick's attached Keys). The banners say the
// state above every tab. Defaults resets the tab shown (kcm.currentTab, kcm.cpp). Every control
// says what it is to a screen reader (tools/a11y.py audit; docs/style-settings-page.md,
// "Accessibility").
import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Templates as T
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM
import "settings.js" as Logic

KCM.AbstractKCM {
    id: root
    framedView: false
    headerPaddingEnabled: false          // the banners and tabs edge to edge, as Window Behavior's
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
        // kwin-i3 needs differs, the page says so and opens the Plasma tab.
        Kirigami.InlineMessage {
            Layout.fillWidth: true
            position: Kirigami.InlineMessage.Position.Header
            type: Kirigami.MessageType.Information
            visible: kcm.scriptLoaded && kcm.setup.needed
            text: i18n("Some Plasma settings work against kwin-i3.")
            actions: Kirigami.Action {
                text: i18nc("@action:button", "Review Plasma Settings…")
                icon.name: "go-next"
                onTriggered: tabs.currentIndex = 0   // the Plasma tab, the first
            }
        }
        // Plasma's Window Behavior tabs: a QTabWidget in document mode, expanding (KWin
        // kcms/options/main.cpp:34-36), which Breeze draws flat only for a real QTabBar
        // (breezestyle.cpp:7222, isStatic), never for a QtQuick tab: so drawn here to Breeze's
        // own recipe (breezehelper.cpp renderStaticTabBarTab, 6.7.5): equal widths across the bar,
        // 34 px (TabBar_StaticTabMinHeight); a tab on the view's background a shade darker, a
        // separator between two unselected tabs inset 8 px; the selected one tinted with the
        // highlight at the frame contrast, outlined, a 3 px highlight line on top.
        // A plain item, not T.TabBar: its content sat half a tab above the bar (17 px, a ListView
        // or a Row alike). The buttons stay TabButtons, page tabs to a screen reader.
        Item {
            id: tabs
            property int currentIndex: 0
            readonly property int count: tabNames.length
            readonly property var tabNames: [i18nc("@title:tab", "Plasma"), i18nc("@title:tab", "Tiling"), i18nc("@title:tab", "Gaps"),
                i18nc("@title:tab", "Workspaces"), i18nc("@title:tab", "Window Rules"),
                i18nc("@title:tab", "Frame"), i18nc("@title:tab", "Keys")]
            Layout.fillWidth: true
            Layout.preferredHeight: 34
            implicitHeight: 34
            onCurrentIndexChanged: kcm.currentTab = currentIndex
            Kirigami.Theme.colorSet: Kirigami.Theme.View
            Kirigami.Theme.inherit: false
            readonly property color base: Qt.darker(Kirigami.Theme.backgroundColor, 1.02)
            readonly property color line: Kirigami.ColorUtils.linearInterpolation(base, Kirigami.Theme.textColor, Kirigami.Theme.frameContrast)
            Rectangle {
                anchors.fill: parent
                color: tabs.base
                // The window's background, under a selected tab's tint (Breeze paints it first).
                Item { id: windowSet; Kirigami.Theme.colorSet: Kirigami.Theme.Window; Kirigami.Theme.inherit: false }
            }
            Row {
            Repeater {
                model: tabs.tabNames
                T.TabButton {
                    id: tab
                    required property string modelData
                    required property int index
                    readonly property bool selected: tabs.currentIndex === index
                    checked: selected
                    onClicked: tabs.currentIndex = index
                    text: modelData
                    width: tabs.width / tabs.count
                    height: tabs.height
                    hoverEnabled: true
                    Accessible.name: modelData
                    contentItem: QQC2.Label {
                        text: tab.text
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                        elide: Text.ElideRight
                    }
                    background: Item {
                        Rectangle {
                            visible: tab.selected
                            anchors.fill: parent
                            color: windowSet.Kirigami.Theme.backgroundColor
                        }
                        Rectangle {               // a tab's own fill: selected, hovered, plain
                            anchors.fill: parent
                            color: tab.selected ? Qt.alpha(Kirigami.Theme.highlightColor, Kirigami.Theme.frameContrast)
                                 : tab.hovered ? Qt.alpha(Kirigami.Theme.hoverColor, Kirigami.Theme.frameContrast)
                                 : tabs.base
                            border.width: tab.selected ? 1 : 0
                            border.color: tabs.line
                        }
                        Rectangle {               // the selected tab's highlight line
                            visible: tab.selected
                            anchors { left: parent.left; right: parent.right; top: parent.top }
                            height: 3
                            color: Kirigami.Theme.highlightColor
                        }
                        Rectangle {               // the separator before an unselected tab, but the first's and the one after the selected
                            visible: !tab.selected && tab.index > 0 && tabs.currentIndex !== tab.index - 1
                            x: 0; width: 1
                            anchors { top: parent.top; bottom: parent.bottom; topMargin: 8; bottomMargin: 8 }
                            color: tabs.line
                        }
                    }
                }
            }
            }
        }
        Kirigami.Separator { Layout.fillWidth: true }
    }


    StackLayout {
        anchors.fill: parent
        currentIndex: tabs.currentIndex
        Repeater {
            model: ["PlasmaSettings.qml", "Tiling.qml", "Gaps.qml", "Workspaces.qml", "WindowRules.qml", "Frame.qml", "Keys.qml"]
            Loader { required property string modelData; source: modelData }
        }
    }
}
