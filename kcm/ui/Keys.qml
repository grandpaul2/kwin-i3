// The Keys sub-page (docs/spec-settings-page.md, "The Keys sub-page"): kwin-i3's commands, grouped,
// each with its keys. Changes wait for Apply; a key another shortcut holds says so in its row.
import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM
import org.kde.kquickcontrols as KQC
import "shifted.js" as Shifted

KCM.ScrollViewKCM {
    id: page
    title: i18n("Keys")

    header: ColumnLayout {
        spacing: 0
        Kirigami.InlineMessage {
            Layout.fillWidth: true
            position: Kirigami.InlineMessage.Position.Header
            type: Kirigami.MessageType.Warning
            visible: !kcm.keys.available
            text: i18n("kwin-i3 isn't running, so its keys can't be shown.")
            actions: Kirigami.Action {
                text: i18n("Turn On")
                icon.name: "system-run"
                visible: !kcm.scriptEnabled
                onTriggered: kcm.enableScript()
            }
        }
        Kirigami.InlineMessage {
            Layout.fillWidth: true
            position: Kirigami.InlineMessage.Position.Header
            type: Kirigami.MessageType.Error
            visible: kcm.keys.error !== ""
            text: kcm.keys.error
        }
    }

    view: ListView {
        model: kcm.keys
        section.property: "group"
        section.delegate: Kirigami.ListSectionHeader {
            width: ListView.view.width
            text: section
        }
        delegate: QQC2.ItemDelegate {
            id: row
            required property int index
            required property string label
            required property var keySlots
            width: ListView.view.width
            down: false
            hoverEnabled: false
            contentItem: ColumnLayout {
                RowLayout {
                    // A fixed label column and fixed-width keys, so each command's first key sits
                    // under the one above it.
                    QQC2.Label {
                        Layout.preferredWidth: Kirigami.Units.gridUnit * 15
                        text: row.label
                        elide: Text.ElideRight
                    }
                    Repeater {
                        model: row.keySlots
                        // A fixed-width slot, the item at its natural size inside it.
                        Item {
                            id: slot
                            required property int index
                            required property var modelData
                            // The keys that type a shifted symbol: KDE's key button shows the
                            // symbol (Meta+!), which it can't be told otherwise; this names the
                            // keys beside it (docs/spec-keys-shifted-labels.md).
                            readonly property string keysText: Shifted.shifted(modelData.keyCode, kcm.keys.layoutTable)
                            readonly property string defaultKeysText: Shifted.shifted(modelData.defaultCode, kcm.keys.layoutTable)
                            Layout.preferredWidth: Kirigami.Units.gridUnit * 16
                            implicitHeight: item.implicitHeight
                            QQC2.Label {
                                anchors.left: item.right
                                anchors.leftMargin: Kirigami.Units.smallSpacing
                                anchors.verticalCenter: item.verticalCenter
                                text: slot.keysText
                                visible: text !== ""
                                color: Kirigami.Theme.disabledTextColor
                                font: Kirigami.Theme.smallFont
                                Accessible.name: i18nc("the keys that type this shortcut's symbol", "typed with %1", text)
                            }
                            KQC.KeySequenceItem {
                                id: item
                                keySequence: slot.modelData.key
                                // The page checks clashes itself and takes the key on Apply; this
                                // item's own check would take it at once, beyond Reset.
                                checkForConflictsAgainst: KQC.ShortcutType.None
                                modifierlessAllowed: false
                                multiKeyShortcutsAllowed: false
                                // KDE's control names its own buttons by the key ("Meta+J", " None ")
                                // and "Clear Key Sequence", alike in every row, so a screen reader
                                // never heard the command (tests/live/75-settings-a11y.sh). Its
                                // buttons are its children: record, clear, cancel (kdeclarative
                                // 6.31 KeySequenceItem.qml); naming them belongs upstream.
                                Component.onCompleted: {
                                    const b = children;
                                    if (b.length !== 3 || !b.every((c) => "checkable" in c)) {
                                        console.warn("kwin-i3 keys: KeySequenceItem's buttons have changed; they keep KDE's names");
                                        return;
                                    }
                                    const n = slot.index + 1;
                                    b[0].Accessible.name = Qt.binding(() => i18nc("command, key slot, its key", "%1, key %2: %3",
                                        row.label, n, slot.modelData.keyText || i18nc("no key set", "none")));
                                    b[1].Accessible.name = i18nc("@action:button command, key slot", "Clear %1, key %2", row.label, n);
                                    b[2].Accessible.name = i18nc("@action:button command, key slot", "Cancel recording %1, key %2", row.label, n);
                                }
                                QQC2.ToolTip.text: !slot.modelData.defaultText ? i18n("No default key")
                                    : slot.defaultKeysText ? i18n("Default: %1 (%2)", slot.defaultKeysText, slot.modelData.defaultText)
                                    : i18n("Default: %1", slot.modelData.defaultText)
                                QQC2.ToolTip.visible: hovered
                                onKeySequenceModified: kcm.keys.setKey(row.index, slot.index, keySequence)
                            }
                        }
                    }
                    Item {
                        Layout.fillWidth: true
                    }
                }
                Repeater {
                    model: row.keySlots
                    QQC2.Label {
                        required property var modelData
                        visible: modelData.holder !== ""
                        Layout.fillWidth: true
                        wrapMode: Text.Wrap
                        color: Kirigami.Theme.neutralTextColor
                        text: i18n("%1 is used by %2; it will be taken from it on Apply.",
                                   modelData.keyText, modelData.holder)
                    }
                }
            }
        }
    }
}
