// The Window Rules sub-page (docs/spec-redo-3-kinds-rules.md, E; its redesign is redo stage 10's):
// i3's for_window and assign rules as text, one rule per line, with i3's syntax explained under
// each; Pick a Window (KWin's queryWindowInfo, as Window Rules' Detect Window Properties) adds a
// floating rule for the clicked window's class. settings.js splits and adds rules.
import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM
import "settings.js" as Logic

KCM.SimpleKCM {
    id: page
    title: i18nc("@title", "Window Rules")

    readonly property var settings: kcm.settings
    property bool picking: false

    function report(type, text) {
        message.type = type;
        message.text = text;
        message.visible = true;
    }

    Connections {
        target: kcm
        function onWindowPicked(info) {
            const value = info.resourceClass || info.resourceName || "";
            if (page.picking && value) {
                page.settings.forWindow = Logic.addRule(page.settings.forWindow, Logic.pickRule(value));
                page.report(Kirigami.MessageType.Positive, i18n("Added a rule: windows of %1 float.", value));
            } else if (page.picking) {
                page.report(Kirigami.MessageType.Warning, i18n("That window has no application class."));
            }
            page.picking = false;
        }
        function onWindowPickFailed(error) {
            if (page.picking)
                page.report(Kirigami.MessageType.Information, error === "org.kde.KWin.Error.InvalidWindow"
                    ? i18n("That window isn't one KWin manages: no rule can reach it.")
                    : i18n("No window picked."));
            page.picking = false;
        }
    }

    header: ColumnLayout {
        spacing: 0
        Kirigami.InlineMessage {
            id: message
            Layout.fillWidth: true
            position: Kirigami.InlineMessage.Position.Header
            showCloseButton: true
            visible: false
        }
        Kirigami.InlineMessage {
            Layout.fillWidth: true
            position: Kirigami.InlineMessage.Position.Header
            type: Kirigami.MessageType.Information
            visible: page.picking
            text: i18n("Click the window to add a rule for. Escape cancels.")
        }
    }

    // One setting: its heading, its explanation, and its text, one rule per line.
    component RuleText: ColumnLayout {
        id: ruleText
        property string heading
        property string explanation
        property string settingName
        property string accessibleName
        spacing: Kirigami.Units.smallSpacing
        Layout.fillWidth: true

        Kirigami.Heading {
            level: 2
            text: ruleText.heading
        }
        QQC2.Label {
            Layout.fillWidth: true
            wrapMode: Text.Wrap
            text: ruleText.explanation
        }
        QQC2.TextArea {
            id: area
            Layout.fillWidth: true
            Layout.minimumHeight: Kirigami.Units.gridUnit * 6
            font.family: "monospace"
            wrapMode: TextEdit.NoWrap
            text: page.settings[ruleText.settingName]
            onTextChanged: if (page.settings[ruleText.settingName] !== text) page.settings[ruleText.settingName] = text
            Accessible.name: ruleText.accessibleName
            KCM.SettingStateBinding { configObject: page.settings; settingName: ruleText.settingName }
        }
    }

    // A centred column of a readable width, as the form pages are.
    Item {
        implicitHeight: column.implicitHeight + Kirigami.Units.largeSpacing * 2
    ColumnLayout {
        id: column
        anchors.horizontalCenter: parent.horizontalCenter
        y: Kirigami.Units.largeSpacing
        width: Math.min(parent.width - Kirigami.Units.largeSpacing * 2, Kirigami.Units.gridUnit * 40)
        spacing: Kirigami.Units.largeSpacing * 2
        RuleText {
            heading: i18nc("@title:group", "Floating and tiling (for_window)")
            explanation: i18n("i3's for_window rules, one per line (or separated by a semicolon): [criteria] floating enable, or floating disable. The criteria are class, instance, title, window_role, window_type (normal, dialog, utility, toolbar, splash, notification), workspace (its number), floating, tiling and all; each value is a regular expression in quotes, and every criterion in a rule must match. A rule runs at most once per window, when the window opens or changes its title or class. Dialogs, utility windows, splash screens and fixed-size windows float anyway; a rule can tile them. Example: [class=\"^org\\.kde\\.kate$\" title=\"Find\"] floating enable")
            settingName: "forWindow"
            accessibleName: i18nc("@label:textbox", "Floating and tiling rules")
        }
        QQC2.Button {
            text: i18nc("@action:button", "Pick a Window…")
            icon.name: "edit-select"
            Accessible.name: i18nc("@action:button", "Pick a window: add a floating rule for its application")
            enabled: !page.picking
            onClicked: { page.picking = true; message.visible = false; kcm.pickWindow(); }
        }
        RuleText {
            heading: i18nc("@title:group", "Workspaces (assign)")
            explanation: i18n("i3's assign rules, one per line: [criteria] → 5 opens matching windows on workspace 5, shown or not, without switching a monitor; [criteria] output DP-6 opens them on that monitor's visible workspace. The same criteria as above.")
            settingName: "assign"
            accessibleName: i18nc("@label:textbox", "Workspace assignments")
        }
    }
    }
}
