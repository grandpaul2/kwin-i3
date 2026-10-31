// The Keys sub-page (docs/records/spec-settings-page.md, "The Keys sub-page"): kwin-i3's commands, grouped,
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
            text: i18n("kwin-i3 isn't running.")
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
            required property string note
            required property var keySlots
            required property string setting
            width: ListView.view.width
            down: false
            hoverEnabled: false
            contentItem: ColumnLayout {
                RowLayout {
                    // A fixed label column and fixed-width keys, so each command's first key sits
                    // under the one above it. A setting that shapes the command sits in the label
                    // column, after the label.
                    RowLayout {
                        Layout.preferredWidth: Kirigami.Units.gridUnit * 15
                        Layout.maximumWidth: Kirigami.Units.gridUnit * 15
                        spacing: Kirigami.Units.smallSpacing
                        QQC2.Label {
                            Layout.fillWidth: row.setting === ""
                            text: row.setting === "" ? row.label : i18nc("@label:listbox command", "%1:", row.label)
                            elide: Text.ElideRight
                        }
                        // docs/style-settings-page.md §7; only End session's so far.
                        Loader {
                            active: row.setting !== ""
                            visible: active
                            sourceComponent: QQC2.ComboBox {
                                implicitContentWidthPolicy: QQC2.ComboBox.WidestTextWhenCompleted
                                textRole: "text"
                                valueRole: "value"
                                // Sleep only where the machine can sleep, as Plasma's logout screen (or
                                // where it is already the setting, so the box never shows another).
                                model: [
                                    ...(kcm.canSuspend || stored === "sleep" ? [{ text: i18nc("@item:inlistbox", "Sleep"), value: "sleep" }] : []),
                                    { text: i18nc("@item:inlistbox", "Shut down"), value: "shutdown" },
                                    { text: i18nc("@item:inlistbox", "Log out"), value: "logout" },
                                    { text: i18nc("@item:inlistbox", "Show logout screen"), value: "ask" },
                                ]
                                // As main.qml's ChoiceBox: not a binding on indexOfValue, which runs before the model is set.
                                readonly property string stored: kcm.settings[row.setting]
                                function sync() { currentIndex = indexOfValue(stored) }
                                onStoredChanged: sync()
                                onCountChanged: sync()
                                Component.onCompleted: sync()
                                onActivated: kcm.settings[row.setting] = currentValue
                                Accessible.name: i18nc("command", "%1: what its key does", row.label)
                                Accessible.description: i18n("Log out and Shut down ask first, and go ahead after 30 seconds.")
                                KCM.SettingStateBinding {
                                    configObject: kcm.settings
                                    settingName: row.setting
                                }
                            }
                        }
                        Item {
                            Layout.fillWidth: row.setting !== ""
                        }
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
                            // keys beside it (docs/records/spec-keys-shifted-labels.md).
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
                    // What the command's keys are inside a mode (docs/records/spec-settings-words.md row 32).
                    QQC2.Label {
                        visible: row.note !== ""
                        text: row.note
                        color: Kirigami.Theme.disabledTextColor
                        font: Kirigami.Theme.smallFont
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
                        text: i18n("%1 belongs to %2; Apply moves it here.",
                                   modelData.keyText, modelData.holder)
                    }
                }
            }
        }
    }
}
