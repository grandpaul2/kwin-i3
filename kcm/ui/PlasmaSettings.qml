// The Plasma Settings sub-page (docs/plan.md, "Install and first run"): the Plasma settings that
// work against kwin-i3, each read as a short review: what Plasma does, what kwin-i3 needs instead
// and why, and a tick to change it (ticked where kwin-i3 needs it, unticked where optional). One
// button changes the ticked ones, apart from the page's Apply (they are Plasma's, not kwin-i3's:
// Reset and Defaults never touch them). Each change kwin-i3 made can be given back, where Plasma
// still has what kwin-i3 wrote (kcm/setup.cpp).
import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM

KCM.SimpleKCM {
    id: page
    title: i18nc("@title", "Plasma Settings")

    readonly property var rows: kcm.setup.rows
    // The ticks, by row id: a row kwin-i3 needs starts ticked, an optional one not.
    property var ticked: ({})
    function resetTicks() {
        const t = {};
        rows.forEach((r) => { t[r.id] = r.differs && !r.optional; });
        ticked = t;
    }
    onRowsChanged: resetTicks()
    // kwin-i3's keys and Plasma's values read again: either may have changed since the page opened.
    Component.onCompleted: { kcm.refresh(); resetTicks(); }
    readonly property var chosen: rows.filter((r) => r.differs && ticked[r.id]).map((r) => r.id)

    header: ColumnLayout {
        spacing: 0
        Kirigami.InlineMessage {
            Layout.fillWidth: true
            position: Kirigami.InlineMessage.Position.Header
            type: Kirigami.MessageType.Information
            visible: true
            text: i18n("Plasma's own settings that work against kwin-i3. Change Ticked Settings changes the ticked ones, the same as System Settings would, and each can be given back here.")
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
                text: modelData.changed && modelData.note ? modelData.why + " " + modelData.note : modelData.why
            }
        }
        QQC2.CheckBox {
            visible: modelData.differs
            text: i18nc("@option:check", "Change to kwin-i3's")
            checked: !!page.ticked[modelData.id]
            onToggled: { const t = Object.assign({}, page.ticked); t[modelData.id] = checked; page.ticked = t; }
            Accessible.name: i18nc("@option:check", "Change %1 to kwin-i3's", modelData.title)
        }
        RowLayout {
            visible: modelData.changed
            spacing: Kirigami.Units.smallSpacing
            QQC2.Label {
                Layout.fillWidth: true
                wrapMode: Text.Wrap
                text: i18nc("what Plasma did before", "Changed to kwin-i3's. Plasma had: %1", modelData.before)
            }
            QQC2.Button {
                text: i18nc("@action:button", "Give Back")
                icon.name: "edit-undo"
                Accessible.name: i18nc("@action:button", "Give back %1", modelData.title)
                Accessible.description: modelData.note
                onClicked: kcm.setup.giveBack(modelData.id)
            }
        }
        Kirigami.Separator {
            Layout.fillWidth: true
            Layout.topMargin: Kirigami.Units.smallSpacing
        }
    }

    // A centred column, as Window Rules; not a FormLayout, which re-sorts the rows a Repeater
    // makes again, so the buttons would land among them.
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
            RowLayout {
                Layout.topMargin: Kirigami.Units.largeSpacing
                spacing: Kirigami.Units.smallSpacing
                QQC2.Button {
                    text: i18nc("@action:button", "Change Ticked Settings")
                    icon.name: "dialog-ok-apply"
                    enabled: page.chosen.length > 0
                    onClicked: kcm.setup.apply(page.chosen)
                }
                QQC2.Button {
                    text: i18nc("@action:button", "Give All Back")
                    icon.name: "edit-undo"
                    enabled: kcm.setup.anyChanged
                    onClicked: kcm.setup.giveBackAll()
                }
            }
        }
    }
}
