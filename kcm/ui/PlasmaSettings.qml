// The Plasma Settings sub-page (docs/plan.md, "Install and first run"): the Plasma settings that
// work against kwin-i3, each read as a short review: what Plasma does, what kwin-i3 needs instead
// and why, and a tick, "Use kwin-i3's", ticked where Plasma has kwin-i3's value. A tick is an edit
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
            text: i18n("Plasma's own settings that work against kwin-i3. A ticked one changes to kwin-i3's with Apply, the same as in System Settings; unticked again, it goes back to what Plasma had.")
        }
        Kirigami.InlineMessage {
            Layout.fillWidth: true
            position: Kirigami.InlineMessage.Position.Header
            type: Kirigami.MessageType.Error
            visible: kcm.setup.error !== ""
            text: kcm.setup.error
        }
    }

    // One setting: its title; what Plasma does, and whether that is Plasma's default; what kwin-i3
    // needs, and why; its tick, or what Plasma had before kwin-i3 changed it, with Give Back.
    component SettingRow: ColumnLayout {
        required property var modelData
        Layout.fillWidth: true
        spacing: Kirigami.Units.smallSpacing
        Kirigami.Heading {
            level: 3
            text: modelData.title
            Layout.topMargin: Kirigami.Units.largeSpacing
        }
        GridLayout {
            columns: 2
            columnSpacing: Kirigami.Units.largeSpacing
            rowSpacing: Kirigami.Units.smallSpacing
            Layout.fillWidth: true
            QQC2.Label {
                visible: modelData.differs
                text: i18nc("@label what Plasma does", "Plasma:")
                font.bold: true
                Layout.alignment: Qt.AlignTop
            }
            QQC2.Label {
                visible: modelData.differs
                Layout.fillWidth: true
                wrapMode: Text.Wrap
                text: modelData.status === "default" ? i18nc("what Plasma does, then a tag", "%1 <i>(Plasma's default)</i>", modelData.plasma)
                    : modelData.status === "changed" ? i18nc("what Plasma does, then a tag", "%1 <i>(changed from Plasma's default)</i>", modelData.plasma)
                    : modelData.plasma
            }
            QQC2.Label {
                text: i18nc("@label what kwin-i3 needs", "kwin-i3:")
                font.bold: true
                Layout.alignment: Qt.AlignTop
            }
            QQC2.Label {
                Layout.fillWidth: true
                wrapMode: Text.Wrap
                text: modelData.optional ? i18nc("what kwin-i3 suggests", "%1 Optional.", modelData.kwini3) : modelData.kwini3
            }
            Item { implicitWidth: 1 }
            QQC2.Label {
                Layout.fillWidth: true
                wrapMode: Text.Wrap
                color: Kirigami.Theme.disabledTextColor
                font: Kirigami.Theme.smallFont
                text: modelData.why
            }
        }
        QQC2.CheckBox {
            text: i18nc("@option:check", "Use kwin-i3's")
            checked: !!kcm.setup.wanted[modelData.id]
            onToggled: kcm.setup.setWanted(modelData.id, checked)
            Accessible.name: i18nc("@option:check", "Use kwin-i3's %1", modelData.title)
        }
        QQC2.Label {
            visible: modelData.changed
            Layout.fillWidth: true
            wrapMode: Text.Wrap
            color: Kirigami.Theme.disabledTextColor
            font: Kirigami.Theme.smallFont
            text: i18nc("what Plasma did before", "Changed by kwin-i3; Plasma had: %1 Unticking this gives that back.", modelData.before)
                  + (modelData.note ? " " + modelData.note : "")
        }
        Kirigami.Separator {
            Layout.fillWidth: true
            Layout.topMargin: Kirigami.Units.smallSpacing
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
            spacing: Kirigami.Units.smallSpacing
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
