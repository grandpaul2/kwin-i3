// kwin-i3's page: the script's settings as Plasma's own pages lay theirs out, in tabs (as Window
// Behavior's): Tiling, Mouse & Focus, Workspaces, Window Rules, Frame, Keys and Plasma, each a page
// of its own file, loaded by name ("Keys" is also QtQuick's attached Keys). The banners say the
// state above every tab. Defaults resets the tab shown (kcm.currentTab, kcm.cpp). Every control
// says what it is to a screen reader (tools/a11y.py audit; docs/style-settings-page.md,
// "Accessibility").
import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM
import "settings.js" as Logic

KCM.AbstractKCM {
    id: root
    framedView: false
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
                onTriggered: tabs.currentIndex = tabs.count - 1   // the Plasma tab
            }
        }
        QQC2.TabBar {
            id: tabs
            Layout.fillWidth: true
            onCurrentIndexChanged: kcm.currentTab = currentIndex
            Repeater {
                model: [i18nc("@title:tab", "Tiling"), i18nc("@title:tab", "Mouse & Focus"), i18nc("@title:tab", "Workspaces"),
                        i18nc("@title:tab", "Window Rules"), i18nc("@title:tab", "Frame"), i18nc("@title:tab", "Keys"),
                        i18nc("@title:tab", "Plasma")]
                // A tab's "&" marks its mnemonic (Plasma's style hid it: "Mouse  Focus"), so doubled to
                // show; its screen reader name as written.
                QQC2.TabButton { required property string modelData; text: modelData.replace(/&/g, "&&"); width: implicitWidth; Accessible.name: modelData }
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

    StackLayout {
        anchors.fill: parent
        currentIndex: tabs.currentIndex
        Repeater {
            model: ["Tiling.qml", "MouseFocus.qml", "Workspaces.qml", "WindowRules.qml", "Frame.qml", "Keys.qml", "PlasmaSettings.qml"]
            Loader { required property string modelData; source: modelData }
        }
    }
}
