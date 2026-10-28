// The Window Rules sub-page (docs/spec-redo-10-settings-page.md; Paul's call 39: rows with
// fields): one row per rule of i3's for_window and assign, in the order the script runs them,
// each saying what it matches (application, title, role, type: a pattern each) and what it does
// (floats, tiles, opens on a workspace, opens on a monitor). The defaults are rows like any
// other, marked; a rule the row can't show (other criteria) is edited as text. Pick a Window
// (KWin's queryWindowInfo) fills a new row's application in. Below, the floating sizes.
// settings.js reads and writes the two strings (parseRules, formatRules).
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
    readonly property var defaults: Logic.splitRules(kcm.defaultValue("forWindow"))
    // The rows, read from the settings whenever they change from outside (Reset, Defaults), and
    // written back as one string each on every edit. `editing` stops the read-back mid-edit.
    property var rows: []
    property bool editing: false
    property bool picking: false

    function read() {
        if (editing) return;
        rows = Logic.parseRules(settings.forWindow, settings.assign);
    }
    function write() {
        editing = true;
        const out = Logic.formatRules(rows);
        if (settings.forWindow !== out.forWindow) settings.forWindow = out.forWindow;
        if (settings.assign !== out.assign) settings.assign = out.assign;
        editing = false;
    }
    function set(i, key, value) {
        const copy = rows.slice();
        copy[i] = Object.assign({}, copy[i]);
        copy[i][key] = value;
        rows = copy;
        write();
    }
    function remove(i) {
        rows = rows.filter((r, j) => j !== i);
        write();
    }
    function add(row) {
        rows = rows.concat([Object.assign({ kind: "float", cls: "", title: "", role: "", type: "" }, row)]);
        write();
    }
    Component.onCompleted: read()
    Connections {
        target: page.settings
        function onForWindowChanged() { page.read() }
        function onAssignChanged() { page.read() }
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
            if (page.picking && value) {
                page.add({ cls: Logic.wholeClass(value) });
                page.report(Kirigami.MessageType.Positive, i18n("Added a rule: windows of %1 float. Change what it does in its row.", value));
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
        RowLayout {
            spacing: Kirigami.Units.smallSpacing
            QQC2.Label {
                Layout.fillWidth: true
                Layout.margins: Kirigami.Units.largeSpacing
                wrapMode: Text.Wrap
                text: i18n("Each rule matches windows by their application, title, role or type, and says whether they float or tile, or where they open. Patterns are regular expressions; ^…$ matches a whole name. A rule runs once per window, when it opens or changes its title or application.")
            }
            Kirigami.ContextualHelpButton {
                Layout.rightMargin: Kirigami.Units.largeSpacing
                toolTipText: i18n("i3's for_window and assign rules. Dialogs, utility windows, splash screens and fixed-size windows float anyway; a rule can tile them. A rule with other criteria (instance, workspace, floating, tiling, all) is shown as text and edited there. Rules run in this order; a window takes the first that matches it, each rule at most once.")
            }
        }
    }

    // A pattern field: empty means "any".
    component PatternField: QQC2.TextField {
        property int row
        property string key
        property string what
        Layout.preferredWidth: Kirigami.Units.gridUnit * 9
        text: page.rows[row][key]
        placeholderText: i18nc("@info:placeholder a pattern field left empty", "any")
        onEditingFinished: if (page.rows[row] && page.rows[row][key] !== text) page.set(row, key, text)
        Accessible.name: i18nc("@label:textbox", "Rule %1: %2 pattern", row + 1, what)
        KCM.SettingStateBinding { configObject: page.settings; settingName: "forWindow" }
    }

    // i3's floating_minimum_size and floating_maximum_size (docs/behaviour.md §3 R20):
    // "WxH"; 0x0 means i3's default (75x50; all monitors together), -1x-1 no limit.
    component SizeRow: RowLayout {
        property string settingName
        property string what
        property bool maximum: false
        readonly property var size: /^(-?\d+)x(-?\d+)$/.exec(page.settings[settingName] || "")
        readonly property int w: size ? parseInt(size[1]) : 0
        readonly property int h: size ? parseInt(size[2]) : 0
        readonly property string mode: w < 0 || h < 0 ? "none" : w === 0 && h === 0 ? "default" : "size"
        function write(nw, nh) { page.settings[settingName] = nw + "x" + nh }
        spacing: Kirigami.Units.smallSpacing
        QQC2.Label { text: what; Accessible.ignored: true }
        QQC2.ComboBox {
            textRole: "text"
            valueRole: "value"
            Layout.preferredWidth: Kirigami.Units.gridUnit * 12
            model: maximum ? [
                { text: i18nc("@item:inlistbox a floating window's largest size", "all monitors together"), value: "default" },
                { text: i18nc("@item:inlistbox", "no limit"), value: "none" },
                { text: i18nc("@item:inlistbox", "a size"), value: "size" },
            ] : [
                { text: i18nc("@item:inlistbox a floating window's smallest size", "75 × 50 px (i3's)"), value: "default" },
                { text: i18nc("@item:inlistbox", "no limit"), value: "none" },
                { text: i18nc("@item:inlistbox", "a size"), value: "size" },
            ]
            readonly property string stored: parent.mode
            function sync() { currentIndex = Math.max(0, indexOfValue(stored)) }
            onStoredChanged: sync()
            Component.onCompleted: sync()
            onActivated: currentValue === "none" ? parent.write(-1, -1) : currentValue === "default" ? parent.write(0, 0) : parent.write(parent.w > 0 ? parent.w : Screen.width, parent.h > 0 ? parent.h : Screen.height)
            // A size starts from the screen's, never 1x1 (the largest size: every floating window
            // shrunk to a pixel, review 2026-10-28).
            Accessible.name: i18nc("@label:listbox", "%1 floating window size", what)
            KCM.SettingStateBinding { configObject: page.settings; settingName: parent.settingName }
        }
        QQC2.SpinBox {
            visible: parent.mode === "size"
            from: 1; to: 20000
            value: Math.max(1, parent.w)
            onValueModified: parent.write(value, Math.max(1, parent.h))
            textFromValue: (v) => i18ncp("@item:valuesuffix pixels", "%1 px", "%1 px", v)
            valueFromText: (t) => parseInt(t)
            Accessible.name: i18nc("@label:spinbox", "%1 floating window width", what)
            KCM.SettingStateBinding { configObject: page.settings; settingName: parent.settingName }
        }
        QQC2.Label { visible: parent.mode === "size"; text: "×"; Accessible.ignored: true }
        QQC2.SpinBox {
            visible: parent.mode === "size"
            from: 1; to: 20000
            value: Math.max(1, parent.h)
            onValueModified: parent.write(Math.max(1, parent.w), value)
            textFromValue: (v) => i18ncp("@item:valuesuffix pixels", "%1 px", "%1 px", v)
            valueFromText: (t) => parseInt(t)
            Accessible.name: i18nc("@label:spinbox", "%1 floating window height", what)
            KCM.SettingStateBinding { configObject: page.settings; settingName: parent.settingName }
        }
    }

    Item {
        implicitHeight: column.implicitHeight + Kirigami.Units.largeSpacing * 2
        ColumnLayout {
            id: column
            anchors.horizontalCenter: parent.horizontalCenter
            y: Kirigami.Units.largeSpacing
            width: Math.min(parent.width - Kirigami.Units.largeSpacing * 2, Kirigami.Units.gridUnit * 48)
            spacing: Kirigami.Units.largeSpacing

            Kirigami.Heading {
                level: 2
                text: i18nc("@title:group", "Rules")
            }
            Repeater {
                model: page.rows.length
                delegate: RowLayout {
                    id: ruleRow
                    required property int index
                    readonly property var rule: page.rows[index]
                    readonly property bool isDefault: page.defaults.indexOf(Logic.formatRule(rule)) >= 0
                    Layout.fillWidth: true
                    spacing: Kirigami.Units.smallSpacing

                    // A rule the fields can't show: its text.
                    QQC2.TextField {
                        visible: ruleRow.rule.kind === "raw"
                        Layout.fillWidth: true
                        font.family: "monospace"
                        text: ruleRow.rule.text || ""
                        onEditingFinished: if (ruleRow.rule.kind === "raw" && ruleRow.rule.text !== text) page.set(ruleRow.index, "text", text)
                        Accessible.name: i18nc("@label:textbox", "Rule %1, as text", ruleRow.index + 1)
                        KCM.SettingStateBinding { configObject: page.settings; settingName: "forWindow" }
                    }
                    // Else its fields: the match, then what it does.
                    QQC2.Label { visible: ruleRow.rule.kind !== "raw"; text: i18nc("@label before a pattern", "app"); Accessible.ignored: true }
                    PatternField { visible: ruleRow.rule.kind !== "raw"; row: ruleRow.index; key: "cls"; what: i18nc("@item a rule's criterion", "application") }
                    QQC2.Label { visible: ruleRow.rule.kind !== "raw"; text: i18nc("@label before a pattern", "title"); Accessible.ignored: true }
                    PatternField { visible: ruleRow.rule.kind !== "raw"; row: ruleRow.index; key: "title"; what: i18nc("@item a rule's criterion", "title") }
                    QQC2.Label { visible: ruleRow.rule.kind !== "raw"; text: i18nc("@label before a pattern", "role"); Accessible.ignored: true }
                    PatternField { visible: ruleRow.rule.kind !== "raw"; row: ruleRow.index; key: "role"; what: i18nc("@item a rule's criterion", "role"); Layout.preferredWidth: Kirigami.Units.gridUnit * 6 }
                    QQC2.ComboBox {
                        visible: ruleRow.rule.kind !== "raw"
                        textRole: "text"
                        valueRole: "value"
                        Layout.preferredWidth: Kirigami.Units.gridUnit * 8
                        model: [
                            { text: i18nc("@item:inlistbox window type", "any type"), value: "" },
                            { text: i18nc("@item:inlistbox window type", "normal"), value: "normal" },
                            { text: i18nc("@item:inlistbox window type", "dialog"), value: "dialog" },
                            { text: i18nc("@item:inlistbox window type", "utility"), value: "utility" },
                            { text: i18nc("@item:inlistbox window type", "toolbar"), value: "toolbar" },
                            { text: i18nc("@item:inlistbox window type", "splash"), value: "splash" },
                        ]
                        readonly property string stored: ruleRow.rule.type || ""
                        function sync() { currentIndex = Math.max(0, indexOfValue(stored)) }
                        onStoredChanged: sync()
                        Component.onCompleted: sync()
                        onActivated: page.set(ruleRow.index, "type", currentValue)
                        Accessible.name: i18nc("@label:listbox", "Rule %1: window type", ruleRow.index + 1)
                        KCM.SettingStateBinding { configObject: page.settings; settingName: "forWindow" }
                    }
                    QQC2.ComboBox {
                        visible: ruleRow.rule.kind !== "raw"
                        textRole: "text"
                        valueRole: "value"
                        Layout.preferredWidth: Kirigami.Units.gridUnit * 10
                        model: [
                            { text: i18nc("@item:inlistbox what a rule does", "floats (a floating window)"), value: "float" },
                            { text: i18nc("@item:inlistbox what a rule does", "tiles (a tiling window)"), value: "tile" },
                            { text: i18nc("@item:inlistbox what a rule does", "opens on workspace…"), value: "workspace" },
                            { text: i18nc("@item:inlistbox what a rule does", "opens on monitor…"), value: "output" },
                        ]
                        readonly property string stored: ruleRow.rule.kind
                        function sync() { currentIndex = Math.max(0, indexOfValue(stored)) }
                        onStoredChanged: sync()
                        Component.onCompleted: sync()
                        onActivated: page.set(ruleRow.index, "kind", currentValue)
                        Accessible.name: i18nc("@label:listbox", "Rule %1: what it does", ruleRow.index + 1)
                        KCM.SettingStateBinding { configObject: page.settings; settingName: "forWindow" }
                    }
                    QQC2.SpinBox {
                        visible: ruleRow.rule.kind === "workspace"
                        from: 1; to: 10
                        value: ruleRow.rule.workspace || 1
                        onValueModified: page.set(ruleRow.index, "workspace", value)
                        Accessible.name: i18nc("@label:spinbox", "Rule %1: the workspace it opens on", ruleRow.index + 1)
                        KCM.SettingStateBinding { configObject: page.settings; settingName: "assign" }
                    }
                    QQC2.ComboBox {
                        visible: ruleRow.rule.kind === "output"
                        textRole: "text"
                        valueRole: "name"
                        Layout.preferredWidth: Kirigami.Units.gridUnit * 10
                        // The connected monitors, and the one set if it isn't connected now.
                        model: Qt.application.screens.map((s) => ({ name: s.name, text: s.model ? i18nc("monitor name — model", "%1 — %2", s.name, s.model) : s.name }))
                            .concat(ruleRow.rule.output && !Qt.application.screens.some((s) => s.name === ruleRow.rule.output)
                                ? [{ name: ruleRow.rule.output, text: i18nc("@item:inlistbox monitor name", "%1 (not connected)", ruleRow.rule.output) }] : [])
                        readonly property string stored: ruleRow.rule.output || ""
                        // A row just switched to "opens on monitor" takes the first monitor; reading never writes.
                        function sync() { currentIndex = Math.max(0, indexOfValue(stored)); if (ruleRow.rule.kind === "output" && stored === "" && count) page.set(ruleRow.index, "output", currentValue) }
                        onStoredChanged: sync()
                        onModelChanged: sync()
                        Component.onCompleted: sync()
                        onActivated: page.set(ruleRow.index, "output", currentValue)
                        Accessible.name: i18nc("@label:listbox", "Rule %1: the monitor it opens on", ruleRow.index + 1)
                        KCM.SettingStateBinding { configObject: page.settings; settingName: "assign" }
                    }
                    QQC2.Label {
                        visible: ruleRow.isDefault
                        text: i18nc("@label a rule kwin-i3 ships", "default")
                        color: Kirigami.Theme.disabledTextColor
                        Accessible.ignored: true
                    }
                    QQC2.ToolButton {
                        icon.name: "edit-delete-remove"
                        onClicked: page.remove(ruleRow.index)
                        Accessible.name: i18nc("@action:button", "Remove rule %1", ruleRow.index + 1)
                        QQC2.ToolTip.text: i18nc("@info:tooltip", "Remove this rule")
                        QQC2.ToolTip.visible: hovered
                    }
                }
            }
            QQC2.Label {
                visible: page.rows.length === 0
                text: i18n("No rules: every window tiles unless it is a dialog, a utility window, a splash screen or of a fixed size.")
                color: Kirigami.Theme.disabledTextColor
            }
            RowLayout {
                spacing: Kirigami.Units.smallSpacing
                QQC2.Button {
                    text: i18nc("@action:button", "Add Rule")
                    icon.name: "list-add"
                    onClicked: page.add({})
                    Accessible.name: i18nc("@action:button", "Add a rule")
                }
                QQC2.Button {
                    text: i18nc("@action:button", "Pick a Window…")
                    icon.name: "edit-select"
                    Accessible.name: i18nc("@action:button", "Pick a window: add a rule for its application")
                    enabled: !page.picking
                    onClicked: { page.picking = true; message.visible = false; kcm.pickWindow(); }
                }
            }

            Kirigami.Heading {
                level: 2
                Layout.topMargin: Kirigami.Units.largeSpacing
                text: i18nc("@title:group", "Floating window sizes")
            }
            SizeRow { settingName: "floatingMinimumSize"; what: i18nc("@label", "Smallest:") }
            SizeRow { settingName: "floatingMaximumSize"; what: i18nc("@label", "Largest:"); maximum: true }
        }
    }
}
