// The Plasma Settings sub-page (docs/plan.md, "Install and first run"): Plasma's own settings
// that matter to tiling, shown here for convenience, each either Plasma's way or kwin-i3's: two
// columns of checkboxes, "Plasma" and "kwin-i3 (recommended)", ticking one unticks the other. The
// muted line under a name says what the Plasma column means for it, "Plasma: " and the value. A choice is an edit like any
// on the page: Apply makes it, Reset drops it, Defaults picks kwin-i3 for all but the optional
// and the key override (a setting of kwin-i3's own, off by default).
// Behind it (kcm/setup.cpp) each change is saved first, so choosing Plasma gives back what the
// reader had before kwin-i3 changed it, and make uninstall can put everything back.
import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM

KCM.SimpleKCM {
    id: page
    title: i18nc("@title", "Plasma Settings")

    readonly property var rows: kcm.setup.rows
    // The height of a row's title line (the name and its help button, taller than a checkbox),
    // so the boxes centre on the name rather than sit at the row's top.
    readonly property real titleHeight: titleProbe.implicitHeight
    // Plasma's values and kwin-i3's keys read again, unless the page holds edits Apply hasn't made.
    Component.onCompleted: if (!kcm.needsSave) kcm.refresh()

    header: ColumnLayout {
        spacing: 0
        Kirigami.InlineMessage {
            Layout.fillWidth: true
            position: Kirigami.InlineMessage.Position.Header
            type: Kirigami.MessageType.Information
            visible: true
            text: i18n("Plasma's own settings that matter to kwin-i3, shown here for convenience. A change applies with Apply, as in System Settings.")
        }
        Kirigami.InlineMessage {
            Layout.fillWidth: true
            position: Kirigami.InlineMessage.Position.Header
            type: Kirigami.MessageType.Error
            visible: kcm.setup.error !== ""
            text: kcm.setup.error
        }
    }

    // One side of a row: ticked where the setting is that side's; ticking it picks that side
    // (and unticks the other). Clicking a ticked box leaves it ticked: one side is always chosen.
    // kwin-i3's side is always one thing, the setting turned on, so its box says "Enable"; the
    // Plasma side is whatever the reader had, so it says nothing.
    // The key override's row is a setting of kwin-i3's own (keysOverride): its boxes write that
    // setting, as any on the main page, and need the plugins.
    component SideBox: QQC2.CheckBox {
        property var row
        property bool kwini3                 // true: the kwin-i3 column
        readonly property bool isOverride: row.id === "keys"
        readonly property bool chosen: (isOverride ? !!kcm.settings.keysOverride : !!kcm.setup.wanted[row.id]) === kwini3
        text: kwini3 ? i18nc("@option:check kwin-i3's way for a Plasma setting", "Enable") : ""
        font: Kirigami.Theme.smallFont
        checked: chosen
        enabled: !isOverride || kcm.helperLoaded
        onClicked: {
            if (isOverride)
                kcm.settings.keysOverride = kwini3;
            else
                kcm.setup.setWanted(row.id, kwini3);
            checked = Qt.binding(() => chosen);
        }
        Layout.alignment: Qt.AlignHCenter | Qt.AlignTop
        Layout.topMargin: Math.max(0, (page.titleHeight - implicitHeight) / 2)
        Accessible.name: kwini3 ? i18nc("@option:check a setting, kwin-i3's way", "%1: kwin-i3", row.title)
                                : i18nc("@option:check a setting, Plasma's way", "%1: Plasma", row.title)
    }

    // A centred column, as Window Rules; not a FormLayout, which re-sorts the rows a Repeater
    // makes again.
    Item {
        implicitHeight: column.implicitHeight + Kirigami.Units.largeSpacing * 2
        RowLayout {
            id: titleProbe
            visible: false
            spacing: Kirigami.Units.smallSpacing
            QQC2.Label { text: "M" }
            Kirigami.ContextualHelpButton {}
        }
        ColumnLayout {
            id: column
            anchors.horizontalCenter: parent.horizontalCenter
            y: Kirigami.Units.largeSpacing
            width: Math.min(parent.width - Kirigami.Units.largeSpacing * 2, Kirigami.Units.gridUnit * 34)
            spacing: Kirigami.Units.largeSpacing
            GridLayout {
                id: grid
                Layout.fillWidth: true
                columns: 3
                columnSpacing: Kirigami.Units.largeSpacing * 2
                rowSpacing: Kirigami.Units.largeSpacing
                // The column titles.
                Item { implicitWidth: 1 }
                Kirigami.Heading { level: 5; text: i18nc("@title:column the setting as Plasma has it", "Plasma"); Layout.alignment: Qt.AlignHCenter }
                Kirigami.Heading { level: 5; text: i18nc("@title:column the setting as kwin-i3 needs it", "kwin-i3 (recommended)"); Layout.alignment: Qt.AlignHCenter }
                Repeater {
                    model: page.rows
                    delegate: ColumnLayout {
                        required property var modelData
                        required property int index
                        Layout.row: 1 + index
                        Layout.column: 0
                        Layout.fillWidth: true
                        spacing: 0
                        RowLayout {
                            spacing: Kirigami.Units.smallSpacing
                            QQC2.Label {
                                text: modelData.optional ? i18nc("@option:check %1 a setting's title", "%1 (Optional)", modelData.title)
                                                         : modelData.title
                            }
                            Kirigami.ContextualHelpButton {
                                toolTipText: modelData.why
                                Accessible.name: i18nc("@action:button", "More about %1", modelData.title)
                            }
                        }
                        QQC2.Label {
                            Layout.fillWidth: true
                            wrapMode: Text.Wrap
                            color: Kirigami.Theme.disabledTextColor
                            font: Kirigami.Theme.smallFont
                            text: [modelData.plasmaSide,
                                   modelData.note].filter((t) => t).join(" ")
                        }
                    }
                }
                Repeater {
                    model: page.rows
                    delegate: SideBox { required property var modelData; required property int index; row: modelData; kwini3: false; Layout.row: 1 + index; Layout.column: 1 }
                }
                Repeater {
                    model: page.rows
                    delegate: SideBox { required property var modelData; required property int index; row: modelData; kwini3: true; Layout.row: 1 + index; Layout.column: 2 }
                }
            }
        }
    }
}
