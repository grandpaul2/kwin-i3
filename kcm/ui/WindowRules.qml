// The Window Rules sub-page (docs/spec-settings-cleanup.md, docs/spec-window-words.md): the windows that place themselves
// (ignoreClass, ignoreRole) and the ones it always floats (floatingClass, floatingTitle), as two
// lists. An entry is added by picking a window (KWin's queryWindowInfo, as Window Rules' Detect
// Window Properties) or typed with its kind; settings.js turns the lists back into the strings.
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
    readonly property var defaults: ({
        ignoreClass: kcm.defaultValue("ignoreClass"), ignoreRole: kcm.defaultValue("ignoreRole"),
        floatingClass: kcm.defaultValue("floatingClass"), floatingTitle: kcm.defaultValue("floatingTitle") })
    readonly property var entries: Logic.ruleEntries(settings, defaults)
    property string pickingFor: ""          // the list a picked window goes to

    function kindText(kind) {
        return kind === "class" ? i18nc("@item:inlistbox what a rule matches", "Application")
             : kind === "role" ? i18nc("@item:inlistbox what a rule matches", "Role")
             : i18nc("@item:inlistbox what a rule matches", "Title contains")
    }
    function listText(list) {
        return list === "ignore" ? i18nc("@title:group", "Places itself") : i18nc("@title:group", "Always float")
    }
    function write(list) {
        const s = Logic.ruleSettings(list);
        for (const k in s) settings[k] = s[k];
    }
    function add(list, kind, value) {
        const problem = Logic.entryProblem(entries, list, kind, value);
        if (problem === "duplicate") {
            report(Kirigami.MessageType.Information, i18n("%1 is already in “%2”.", value.trim(), listText(list)));
            return false;
        }
        if (problem === "comma") {
            report(Kirigami.MessageType.Warning, i18n("%1 contains a comma, which a rule can't hold.", value.trim()));
            return false;
        }
        if (problem) return false;
        write(entries.concat([{ list: list, kind: kind, value: value.trim() }]));
        report(Kirigami.MessageType.Positive, i18n("Added %1: %2 to “%3”.", kindText(kind), value.trim(), listText(list)));
        return true;
    }
    function remove(entry) {
        write(entries.filter((e) => !(e.list === entry.list && e.kind === entry.kind && e.value === entry.value)));
    }
    function report(type, text) {
        message.type = type;
        message.text = text;
        message.visible = true;
    }

    Connections {
        target: kcm
        function onWindowPicked(info) {
            const value = info.resourceClass || info.resourceName || "";
            if (page.pickingFor && value) page.add(page.pickingFor, "class", value);
            else if (page.pickingFor) page.report(Kirigami.MessageType.Warning, i18n("That window has no application class."));
            page.pickingFor = "";
        }
        function onWindowPickFailed(error) {
            if (page.pickingFor)
                page.report(Kirigami.MessageType.Information, error === "org.kde.KWin.Error.InvalidWindow"
                    ? i18n("That window isn't one KWin manages: it places itself already.")
                    : i18n("No window picked."));
            page.pickingFor = "";
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
            visible: page.pickingFor !== ""
            text: i18n("Click the window to add. Escape cancels.")
        }
    }

    // One list: its heading and explanation, its entries, and the ways to add one.
    component RuleList: ColumnLayout {
        id: ruleList
        property string list
        property string explanation
        spacing: Kirigami.Units.smallSpacing
        Layout.fillWidth: true

        Kirigami.Heading {
            level: 2
            text: page.listText(ruleList.list)
        }
        QQC2.Label {
            Layout.fillWidth: true
            wrapMode: Text.Wrap
            text: ruleList.explanation
        }
        Repeater {
            model: page.entries.filter((e) => e.list === ruleList.list)
            RowLayout {
                id: entryRow
                required property var modelData
                spacing: Kirigami.Units.smallSpacing
                Layout.fillWidth: true
                QQC2.Label {
                    Layout.fillWidth: true
                    elide: Text.ElideRight
                    text: i18nc("@item what a rule matches: the value", "%1: %2", page.kindText(entryRow.modelData.kind), entryRow.modelData.value)
                    Accessible.name: entryRow.modelData.isDefault ? text + " " + defaultMark.text : text
                }
                QQC2.Label {
                    id: defaultMark
                    visible: entryRow.modelData.isDefault
                    color: Kirigami.Theme.disabledTextColor
                    text: i18nc("@item a default rule", "(default)")
                    Accessible.ignored: true
                }
                QQC2.ToolButton {
                    icon.name: "list-remove"
                    display: QQC2.AbstractButton.IconOnly
                    text: i18nc("@action:button", "Remove")
                    Accessible.name: i18nc("@action:button rule kind: value, from list", "Remove %1: %2 from “%3”",
                                           page.kindText(entryRow.modelData.kind), entryRow.modelData.value, page.listText(ruleList.list))
                    QQC2.ToolTip.text: text
                    QQC2.ToolTip.visible: hovered
                    onClicked: page.remove(entryRow.modelData)
                }
            }
        }
        RowLayout {
            spacing: Kirigami.Units.smallSpacing
            QQC2.Button {
                text: i18nc("@action:button", "Pick a Window…")
                icon.name: "edit-select"
                Accessible.name: i18nc("@action:button", "Pick a window for “%1”", page.listText(ruleList.list))
                enabled: page.pickingFor === ""
                onClicked: { page.pickingFor = ruleList.list; message.visible = false; kcm.pickWindow(); }
            }
        }
        RowLayout {
            spacing: Kirigami.Units.smallSpacing
            QQC2.ComboBox {
                id: kind
                model: Logic.kindsFor(ruleList.list).map((k) => ({ value: k, text: page.kindText(k) }))
                textRole: "text"
                valueRole: "value"
                Accessible.name: i18nc("@label:listbox", "Kind of entry to add to “%1”", page.listText(ruleList.list))
            }
            QQC2.TextField {
                id: value
                Layout.fillWidth: true
                placeholderText: kind.currentValue === "title" ? i18nc("@info:placeholder", "e.g. Picture-in-Picture")
                               : kind.currentValue === "role" ? i18nc("@info:placeholder", "e.g. quake")
                               : i18nc("@info:placeholder", "e.g. org.kde.kate")
                Accessible.name: i18nc("@label:textbox", "Entry to add to “%1”", page.listText(ruleList.list))
                onAccepted: addButton.clicked()
            }
            QQC2.Button {
                id: addButton
                text: i18nc("@action:button", "Add")
                icon.name: "list-add"
                Accessible.name: i18nc("@action:button", "Add the entry to “%1”", page.listText(ruleList.list))
                readonly property string problem: Logic.entryProblem(page.entries, ruleList.list, kind.currentValue, value.text)
                enabled: problem === "" || problem === "duplicate"
                onClicked: if (page.add(ruleList.list, kind.currentValue, value.text)) value.text = ""
            }
        }
        QQC2.Label {
            visible: addButton.problem === "comma"
            color: Kirigami.Theme.negativeTextColor
            text: i18n("An entry can't contain a comma.")
        }
    }

    // A centred column of a readable width, as the form pages are.
    Item {
        implicitHeight: lists.implicitHeight + Kirigami.Units.largeSpacing * 2
    ColumnLayout {
        id: lists
        anchors.horizontalCenter: parent.horizontalCenter
        y: Kirigami.Units.largeSpacing
        width: Math.min(parent.width - Kirigami.Units.largeSpacing * 2, Kirigami.Units.gridUnit * 34)
        spacing: Kirigami.Units.largeSpacing * 2
        RuleList {
            list: "ignore"
            explanation: i18n("The app or Plasma places these windows: kwin-i3 never tiles, floats, moves or resizes them. They still live on a workspace, and a focus key takes the keyboard from them. Plasma's own windows are here by default.")
        }
        RuleList {
            list: "float"
            explanation: i18n("These windows open floating, with their own title bar: you place them, and kwin-i3 keeps them on their workspace and above the tiled windows. Meta+Shift+Space tiles one.")
        }
    }
    }
}
