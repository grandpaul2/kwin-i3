// The Plasma Settings sub-page (docs/plan.md, "Install and first run"): the Plasma settings
// kwin-i3 is designed around that differ now, ticked where kwin-i3 needs them, each with Plasma's
// value; one button changes the ticked ones, at once and apart from the page's Apply (they are
// Plasma's, not kwin-i3's: Reset and Defaults never touch them). Each change kwin-i3 made can be
// given back, where Plasma still has what kwin-i3 wrote (kcm/setup.cpp).
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
            text: i18n("These are Plasma's own settings: changed here, they change in System Settings, and each can be given back here.")
        }
        Kirigami.InlineMessage {
            Layout.fillWidth: true
            position: Kirigami.InlineMessage.Position.Header
            type: Kirigami.MessageType.Error
            visible: kcm.setup.error !== ""
            text: kcm.setup.error
        }
    }

    // One row of the list: its checkbox, its help, Plasma's value now (or that kwin-i3 changed
    // it) and its Give Back.
    component SettingRow: RowLayout {
        required property var modelData
        spacing: Kirigami.Units.smallSpacing
        QQC2.CheckBox {
            text: modelData.label
            enabled: modelData.differs
            checked: modelData.differs ? !!page.ticked[modelData.id] : true
            onToggled: { const t = Object.assign({}, page.ticked); t[modelData.id] = checked; page.ticked = t; }
            Accessible.description: i18nc("@info:whatsthis", "Plasma now: %1", modelData.now)
        }
        Kirigami.ContextualHelpButton {
            toolTipText: modelData.changed && modelData.note ? modelData.help + " " + modelData.note : modelData.help
            Accessible.name: i18nc("@action:button", "More about %1", modelData.label)
        }
        QQC2.Label {
            text: modelData.differs ? i18nc("@label Plasma's value now", "now: %1", modelData.now) : i18nc("@label", "changed by kwin-i3")
            color: Kirigami.Theme.disabledTextColor
            elide: Text.ElideRight
            Layout.maximumWidth: Kirigami.Units.gridUnit * 18
            Accessible.ignored: true
        }
        QQC2.Button {
            visible: modelData.changed
            text: i18nc("@action:button", "Give Back")
            icon.name: "edit-undo"
            Accessible.name: i18nc("@action:button", "Give back %1", modelData.label)
            Accessible.description: modelData.note
            onClicked: kcm.setup.giveBack(modelData.id)
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
                model: page.rows.filter((r) => !r.optional)
                delegate: SettingRow {}
            }
            Kirigami.Heading {
                level: 4
                text: i18nc("@title:group", "Optional")
                visible: page.rows.some((r) => r.optional)
                Layout.topMargin: Kirigami.Units.largeSpacing
            }
            Repeater {
                model: page.rows.filter((r) => r.optional)
                delegate: SettingRow {}
            }
            RowLayout {
                Layout.topMargin: Kirigami.Units.largeSpacing
                spacing: Kirigami.Units.smallSpacing
                QQC2.Button {
                    text: i18nc("@action:button", "Change in Plasma")
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
