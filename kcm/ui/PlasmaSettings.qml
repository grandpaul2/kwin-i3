// The Plasma Settings sub-page (docs/plan.md, "Install and first run"): the Plasma settings that
// work against kwin-i3, a checkbox each named by the behaviour kwin-i3 needs (its on state), ticked
// where Plasma has it; under it one muted line: what Plasma does, or what it had before kwin-i3
// changed it; the why and Plasma's own place for the setting in the help button
// (.claude/skills/settings-pages). A tick is an edit
// like any on the page: Apply makes it, Reset drops it, Defaults ticks every row kwin-i3 needs.
// Unticked where kwin-i3 changed it, Apply gives back what Plasma had, where Plasma still has
// what kwin-i3 wrote (kcm/setup.cpp). kwin-i3's keys are on the main page, under Keys.
import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM

KCM.SimpleKCM {
    id: page
    title: i18nc("@title", "Plasma Settings")

    readonly property var rows: kcm.setup.rows.filter((r) => r.id !== "keys")
    // Plasma's values and kwin-i3's keys read again, unless the page holds edits Apply hasn't made.
    Component.onCompleted: if (!kcm.needsSave) kcm.refresh()

    header: ColumnLayout {
        spacing: 0
        Kirigami.InlineMessage {
            Layout.fillWidth: true
            position: Kirigami.InlineMessage.Position.Header
            type: Kirigami.MessageType.Information
            visible: true
            text: i18n("Plasma settings that work against kwin-i3. A ticked one changes on Apply, as it would in System Settings; unticking one restores Plasma's previous setting. Defaults ticks all but the optional.")
        }
        Kirigami.InlineMessage {
            Layout.fillWidth: true
            position: Kirigami.InlineMessage.Position.Header
            type: Kirigami.MessageType.Error
            visible: kcm.setup.error !== ""
            text: kcm.setup.error
        }
    }

    // One setting: its checkbox (the behaviour kwin-i3 needs) and help, and one muted line: what
    // Plasma does, tagged when that is Plasma's default; or, once kwin-i3 changed it, what Plasma
    // had and that unticking restores it.
    component SettingRow: ColumnLayout {
        required property var modelData
        Layout.fillWidth: true
        Layout.topMargin: modelData.optional ? Kirigami.Units.largeSpacing : 0
        spacing: 0
        RowLayout {
            spacing: Kirigami.Units.smallSpacing
            QQC2.CheckBox {
                text: modelData.title
                checked: !!kcm.setup.wanted[modelData.id]
                onToggled: kcm.setup.setWanted(modelData.id, checked)
                Accessible.description: line.text
            }
            Kirigami.ContextualHelpButton {
                toolTipText: modelData.why
                Accessible.name: i18nc("@action:button", "More about %1", modelData.title)
            }
        }
        QQC2.Label {
            id: line
            Layout.fillWidth: true
            Layout.leftMargin: Kirigami.Units.gridUnit * 1.5      // under the checkbox's text
            wrapMode: Text.Wrap
            color: Kirigami.Theme.disabledTextColor
            font: Kirigami.Theme.smallFont
            Accessible.ignored: true
            text: [modelData.optional ? i18nc("@info", "Optional.") : "",
                   modelData.changed && !modelData.differs
                       ? i18nc("@info what Plasma had", "Changed by kwin-i3; Plasma had: %1 Unticking this restores it.", modelData.before)
                       : modelData.status === "default" ? i18nc("@info what Plasma does", "%1 This is Plasma's default.", modelData.plasma)
                       : modelData.plasma,
                   modelData.changed ? modelData.note : ""].filter((t) => t).join(" ")
        }
    }

    // A centred column, as Window Rules; not a FormLayout, which re-sorts the rows a Repeater
    // makes again.
    Item {
        implicitHeight: column.implicitHeight + Kirigami.Units.largeSpacing * 2
        ColumnLayout {
            id: column
            anchors.horizontalCenter: parent.horizontalCenter
            y: Kirigami.Units.largeSpacing
            width: Math.min(parent.width - Kirigami.Units.largeSpacing * 2, Kirigami.Units.gridUnit * 34)
            spacing: Kirigami.Units.largeSpacing
            Kirigami.PlaceholderMessage {
                Layout.fillWidth: true
                visible: page.rows.length === 0
                text: i18n("Plasma's settings are as kwin-i3 needs them.")
            }
            Repeater {
                model: page.rows
                delegate: SettingRow {}
            }
        }
    }
}
