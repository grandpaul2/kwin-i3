// The Window Rules tab (rows with
// fields): one rule of i3's for_window and
// assign per line, in the order the script runs them: its application (a whole name shown plain)
// and what it does (floats, tiles, opens on a workspace, opens on a monitor), its title, role and
// type always on a second line. The defaults are a group of their own when they
// run first; a rule the row can't show (other criteria) is edited as text. Pick a Window
// (KWin's queryWindowInfo) fills a new row's application in. Each rule is a box of its own in a
// framed list (the defaults one, the reader's another); adding sits in the footer. Below, the
// floating sizes.
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
    // Normalised as the page writes rules (formatRule), so the "default" mark doesn't depend on
    // the order of the criteria in the shipped text.
    readonly property var defaults: Logic.splitRules(kcm.defaultValue("forWindow")).map((t) => Logic.formatRule(Logic.parseRule(t, false)))
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
        focusIndex = rows.length;
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
            if (page.picking && value && page.rows.some((r) => r.cls === Logic.wholeClass(value))) {
                // A second pick of the same application: no second row.
                page.report(Kirigami.MessageType.Information, i18n("%1 already has a rule.", value));
            } else if (page.picking && value) {
                page.add({ cls: Logic.wholeClass(value) });
                page.report(Kirigami.MessageType.Positive, i18n("Added a rule: %1 floats.", value));
            } else if (page.picking) {
                page.report(Kirigami.MessageType.Warning, i18n("That window has no application name."));
            }
            page.picking = false;
        }
        function onWindowPickFailed(error) {
            if (page.picking)
                page.report(Kirigami.MessageType.Information, error === "org.kde.KWin.Error.InvalidWindow"
                    ? i18n("No rule can reach that window.")
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
            text: i18n("Click a window. Escape cancels.")
        }
        RowLayout {
            spacing: Kirigami.Units.smallSpacing
            QQC2.Label {
                Layout.fillWidth: true
                Layout.margins: Kirigami.Units.largeSpacing
                wrapMode: Text.Wrap
                text: i18n("Rules decide which windows float or tile, and where they open.")
            }
            Kirigami.ContextualHelpButton {
                Layout.rightMargin: Kirigami.Units.largeSpacing
                toolTipText: i18n("A rule matches a window's application, title, role or type, each a regular expression (^…$ for a whole name), and runs when the window opens or changes its title. Dialogs, transient and modal windows, utility windows, toolbars, splash screens, fixed-size windows and windows on all desktops float anyway; a rule can tile them. For float or tile the last matching rule decides; for workspace or screen, the first. A rule with other criteria shows as text. i3: for_window, assign")
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
        readonly property var size: /^\s*(-?\d+)\s*x\s*(-?\d+)\s*$/.exec(page.settings[settingName] || "")
        readonly property int w: size ? parseInt(size[1]) : 0
        readonly property int h: size ? parseInt(size[2]) : 0
        // The smallest size's default is i3's 75x50, stored as such (0x0 means the same to the
        // script); the largest's is 0x0, all screens together.
        readonly property int defW: maximum ? 0 : 75
        readonly property int defH: maximum ? 0 : 50
        property bool custom: false     // Custom chosen: its spin boxes stay, even at the default's size
        readonly property string mode: w < 0 || h < 0 ? "none" : custom ? "size" : (w === 0 && h === 0) || (w === defW && h === defH) ? "default" : "size"
        function write(nw, nh) { page.settings[settingName] = nw + "x" + nh }
        spacing: Kirigami.Units.smallSpacing
        QQC2.Label { text: what; Accessible.ignored: true }
        QQC2.ComboBox {
            textRole: "text"
            valueRole: "value"
            Layout.preferredWidth: Kirigami.Units.gridUnit * 12
            model: maximum ? [
                { text: i18nc("@item:inlistbox a floating window's largest size", "All screens together"), value: "default" },
                { text: i18nc("@item:inlistbox", "No limit"), value: "none" },
                { text: i18nc("@item:inlistbox", "Custom"), value: "size" },
            ] : [
                { text: i18nc("@item:inlistbox a floating window's smallest size", "75 × 50 px"), value: "default" },
                { text: i18nc("@item:inlistbox", "No limit"), value: "none" },
                { text: i18nc("@item:inlistbox", "Custom"), value: "size" },
            ]
            readonly property string stored: parent.mode
            function sync() { currentIndex = Math.max(0, indexOfValue(stored)) }
            onStoredChanged: sync()
            Component.onCompleted: sync()
            // A custom size starts from the default's own: the largest from the screen's (never
            // 1x1, every floating window shrunk to a pixel), the smallest from 75x50 (never the
            // screen's, every floating window grown to fill it).
            onActivated: {
                const row = parent;
                row.custom = currentValue === "size";
                if (currentValue === "none")
                    row.write(-1, -1);
                else if (currentValue === "default")
                    row.write(row.defW, row.defH);
                else
                    row.write(row.w > 0 ? row.w : row.maximum ? Screen.width : 75,
                              row.h > 0 ? row.h : row.maximum ? Screen.height : 50);
            }
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

    // The defaults, when they run first (as kwin-i3 ships them): their own group above yours, as
    // they run; else no groups, each default only marked.
    // The installed applications, [{ name, id }] by name (kcm.applications); id is the class.
    readonly property var apps: kcm.applications()
    function appOf(id) { return apps.find((a) => a.id === id) || null; }

    readonly property int defaultCount: {
        let n = 0;
        while (n < rows.length && defaults.indexOf(Logic.formatRule(rows[n])) >= 0) n++;
        for (let i = n; i < rows.length; i++)
            if (defaults.indexOf(Logic.formatRule(rows[i])) >= 0) return 0;
        return n;
    }

    // One rule, the same box for every one: its application and what it does on the first line,
    // with its marks and the remove button; its title, role and type always on the second. A rule
    // the fields can't show (other criteria) is its text on the first line, and the second says so.
    property int focusIndex: -1         // a rule just added: its application box takes the focus
    component RuleItem: ColumnLayout {
        id: ruleRow
        property int index
        readonly property var rule: page.rows[index] || ({})
        readonly property bool isRaw: rule.kind === "raw"
        readonly property bool isDefault: page.defaults.indexOf(Logic.formatRule(rule)) >= 0
        readonly property var plain: Logic.plainName(rule.cls)
        readonly property var app: plain !== null ? page.appOf(plain) : null
        spacing: Kirigami.Units.smallSpacing
        Component.onCompleted: if (index === page.focusIndex) Qt.callLater(() => {
            page.focusIndex = -1;
            page.reveal(ruleRow);
            appBox.contentItem.forceActiveFocus();      // the text field: the box alone takes no typing
        })
        RowLayout {
            Layout.fillWidth: true
            spacing: Kirigami.Units.smallSpacing

            // A rule the fields can't show: its text.
            QQC2.TextField {
                visible: ruleRow.isRaw
                Layout.fillWidth: true
                font.family: "monospace"
                text: ruleRow.rule.text || ""
                onEditingFinished: if (ruleRow.isRaw && ruleRow.rule.text !== text) page.set(ruleRow.index, "text", text)
                Accessible.name: i18nc("@label:textbox", "Rule %1, as text", ruleRow.index + 1)
                KCM.SettingStateBinding { configObject: page.settings; settingName: "forWindow" }
            }
            // The application: chosen by name from the installed ones, or typed. A
            // whole name shows as the application's name if installed, else plain; any
            // other pattern as typed, in monospace.
            QQC2.ComboBox {
                id: appBox
                visible: !ruleRow.isRaw
                editable: true
                Layout.fillWidth: true
                Layout.minimumWidth: Kirigami.Units.gridUnit * 7
                // The list only while the box is in use: the desktop style measures every entry's
                // text on each count change to size the popup (org/kde/desktop/ComboBox.qml
                // onCountChanged), which for every rule's box at once held up the page's opening.
                // sync() puts the rule's own text back after each model change. Leaving the box
                // commits the typed text before the model empties and sync() runs, an order Qt
                // doesn't document: a typed pattern clicked away from must survive.
                model: activeFocus || popup.visible ? page.apps : []
                onModelChanged: sync()
                textRole: "name"
                valueRole: "id"
                readonly property string shown: ruleRow.app ? ruleRow.app.name
                    : ruleRow.plain !== null ? ruleRow.plain : (ruleRow.rule.cls || "")
                font.family: ruleRow.plain === null && ruleRow.rule.cls ? "monospace" : Kirigami.Theme.defaultFont.family
                function sync() {
                    currentIndex = ruleRow.app ? page.apps.indexOf(ruleRow.app) : -1;
                    editText = shown;
                }
                onShownChanged: sync()
                Component.onCompleted: sync()
                // An empty box: what it's for, or that the rule matches by title, role or
                // type alone (an editable ComboBox has no placeholder of its own).
                QQC2.Label {
                    x: appBox.leftPadding
                    anchors.verticalCenter: parent.verticalCenter
                    visible: appBox.editText === "" && !appBox.activeFocus
                    text: ruleRow.rule.title || ruleRow.rule.role || ruleRow.rule.type
                        ? i18nc("@info:placeholder an application field left empty", "any application")
                        : i18nc("@info:placeholder", "Choose an application")
                    color: Kirigami.Theme.disabledTextColor
                    Accessible.ignored: true
                }
                // A name from the list stores that application's class whole; anything
                // else as Logic.classFromField reads it.
                function commit(text) {
                    const t = String(text).trim();
                    const hit = page.apps.find((a) => a.name === t);
                    const cls = hit ? Logic.wholeClass(hit.id) : Logic.classFromField(t);
                    if (cls !== (ruleRow.rule.cls || "")) page.set(ruleRow.index, "cls", cls);
                    else sync();
                }
                onActivated: (i) => commit(page.apps[i].name)
                onAccepted: commit(editText)
                onActiveFocusChanged: if (!activeFocus && !ruleRow.isRaw) commit(editText)
                Accessible.name: i18nc("@label:textbox", "Rule %1: application", ruleRow.index + 1)
                // The class the rule matches, when the box shows a name.
                Accessible.description: ruleRow.app ? ruleRow.app.id : ""
                QQC2.ToolTip.text: ruleRow.app ? ruleRow.app.id : ""
                QQC2.ToolTip.visible: hovered && !!ruleRow.app
                KCM.SettingStateBinding { configObject: page.settings; settingName: "forWindow" }
            }
            QQC2.Label { visible: !ruleRow.isRaw; text: "→"; Accessible.ignored: true }
            QQC2.ComboBox {
                visible: !ruleRow.isRaw
                textRole: "text"
                valueRole: "value"
                Layout.preferredWidth: Kirigami.Units.gridUnit * 7
                model: [
                    { text: i18nc("@item:inlistbox what a rule does", "Float"), value: "float" },
                    { text: i18nc("@item:inlistbox what a rule does", "Tile"), value: "tile" },
                    { text: i18nc("@item:inlistbox what a rule does", "Workspace…"), value: "workspace" },
                    { text: i18nc("@item:inlistbox what a rule does", "Screen…"), value: "output" },
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
                Layout.preferredWidth: Kirigami.Units.gridUnit * 4
                value: ruleRow.rule.workspace || 1
                onValueModified: page.set(ruleRow.index, "workspace", value)
                Accessible.name: i18nc("@label:spinbox", "Rule %1: the workspace it opens on", ruleRow.index + 1)
                KCM.SettingStateBinding { configObject: page.settings; settingName: "assign" }
            }
            QQC2.ComboBox {
                visible: ruleRow.rule.kind === "output"
                textRole: "text"
                valueRole: "name"
                Layout.preferredWidth: Kirigami.Units.gridUnit * 7
                // The connected monitors, and the one set if it isn't connected now.
                model: Qt.application.screens.map((s) => ({ name: s.name, text: s.model ? i18nc("output name — model", "%1 — %2", s.name, s.model) : s.name }))
                    .concat(ruleRow.rule.output && !Qt.application.screens.some((s) => s.name === ruleRow.rule.output)
                        ? [{ name: ruleRow.rule.output, text: i18nc("@item:inlistbox output name", "%1 (not connected)", ruleRow.rule.output) }] : [])
                readonly property string stored: ruleRow.rule.output || ""
                // A row just switched to "opens on monitor" takes the first monitor; reading never writes.
                function sync() { currentIndex = Math.max(0, indexOfValue(stored)); if (ruleRow.rule.kind === "output" && stored === "" && count) page.set(ruleRow.index, "output", currentValue) }
                onStoredChanged: sync()
                onModelChanged: sync()
                Component.onCompleted: sync()
                onActivated: page.set(ruleRow.index, "output", currentValue)
                Accessible.name: i18nc("@label:listbox", "Rule %1: the screen it opens on", ruleRow.index + 1)
                KCM.SettingStateBinding { configObject: page.settings; settingName: "assign" }
            }
            Item { visible: !ruleRow.isRaw; Layout.fillWidth: true }
            // A row with no pattern is not written (it would match every window): said, not
            // lost silently at the next reopening.
            QQC2.Label {
                visible: !ruleRow.isRaw && Logic.formatRule(ruleRow.rule) === ""
                text: i18nc("@info:status a rule with no pattern", "not saved: needs a pattern")
                color: Kirigami.Theme.neutralTextColor
            }
            // Marked only when the defaults aren't a group of their own.
            QQC2.Label {
                visible: ruleRow.isDefault && page.defaultCount === 0
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
        RowLayout {
            visible: !ruleRow.isRaw
            Layout.leftMargin: Kirigami.Units.gridUnit
            spacing: Kirigami.Units.smallSpacing
            QQC2.Label { text: i18nc("@label before a pattern", "title"); font: Kirigami.Theme.smallFont; color: Kirigami.Theme.disabledTextColor; Accessible.ignored: true }
            PatternField { row: ruleRow.index; key: "title"; what: i18nc("@item a rule's criterion", "title") }
            QQC2.Label { text: i18nc("@label before a pattern", "role"); font: Kirigami.Theme.smallFont; color: Kirigami.Theme.disabledTextColor; Accessible.ignored: true }
            PatternField { row: ruleRow.index; key: "role"; what: i18nc("@item a rule's criterion", "role"); Layout.preferredWidth: Kirigami.Units.gridUnit * 6 }
            QQC2.Label { text: i18nc("@label before a window type", "type"); font: Kirigami.Theme.smallFont; color: Kirigami.Theme.disabledTextColor; Accessible.ignored: true }
            QQC2.ComboBox {
                textRole: "text"
                valueRole: "value"
                Layout.preferredWidth: Kirigami.Units.gridUnit * 7
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
        }
        QQC2.Label {
            visible: ruleRow.isRaw
            Layout.fillWidth: true
            wrapMode: Text.Wrap
            font: Kirigami.Theme.smallFont
            color: Kirigami.Theme.disabledTextColor
            text: i18nc("@info a rule shown as its text", "Shown as text: it matches on more than the application, title, role and type.")
        }
    }

    // Scrolls the page so an item shows.
    function reveal(item) {
        const f = page.flickable;
        const y = item.mapToItem(f.contentItem, 0, 0).y;
        if (y < f.contentY || y + item.height > f.contentY + f.height)
            f.contentY = Math.max(0, Math.min(y - Kirigami.Units.gridUnit, f.contentHeight - f.height));
    }

    // A group of rules (rows from..to) in a framed list, a line between each, as Plasma's own
    // rule list; empty, it says so and offers Add Rule.
    component RuleList: Rectangle {
        id: group
        property int from
        property int to
        property string emptyText
        property string emptyExplanation
        Layout.fillWidth: true
        implicitHeight: list.implicitHeight + Kirigami.Units.largeSpacing * 2
        Kirigami.Theme.colorSet: Kirigami.Theme.View
        Kirigami.Theme.inherit: false
        color: Kirigami.Theme.backgroundColor
        radius: Kirigami.Units.cornerRadius
        border.color: Kirigami.ColorUtils.linearInterpolation(Kirigami.Theme.backgroundColor, Kirigami.Theme.textColor, Kirigami.Theme.frameContrast)
        ColumnLayout {
            id: list
            x: Kirigami.Units.largeSpacing
            y: Kirigami.Units.largeSpacing
            width: parent.width - Kirigami.Units.largeSpacing * 2
            spacing: Kirigami.Units.largeSpacing
            Repeater {
                model: Math.max(0, group.to - group.from)
                delegate: ColumnLayout {
                    id: cell
                    required property int index
                    Layout.fillWidth: true
                    spacing: Kirigami.Units.largeSpacing
                    Kirigami.Separator { visible: cell.index > 0; Layout.fillWidth: true }
                    RuleItem { index: group.from + cell.index; Layout.fillWidth: true }
                }
            }
            Kirigami.PlaceholderMessage {
                visible: group.to <= group.from
                Layout.fillWidth: true
                Layout.margins: Kirigami.Units.largeSpacing
                text: group.emptyText
                explanation: group.emptyExplanation
                helpfulAction: Kirigami.Action {
                    text: i18nc("@action:button", "Add Rule")
                    icon.name: "list-add"
                    onTriggered: page.add({})
                }
            }
        }
    }

    // Adding stays in view however far the page scrolls, where Plasma's rule page keeps it.
    footer: QQC2.ToolBar {
        position: QQC2.ToolBar.Footer
        RowLayout {
            anchors.fill: parent
            spacing: Kirigami.Units.smallSpacing
            Item { Layout.fillWidth: true }
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
    }

    Item {
        implicitHeight: column.implicitHeight + Kirigami.Units.largeSpacing * 2
        ColumnLayout {
            id: column
            anchors.horizontalCenter: parent.horizontalCenter
            y: Kirigami.Units.largeSpacing
            width: Math.min(parent.width - Kirigami.Units.largeSpacing * 2, Kirigami.Units.gridUnit * 34)
            spacing: Kirigami.Units.smallSpacing

            // The defaults, when they run first: a group of their own above the reader's.
            Kirigami.Heading {
                visible: page.defaultCount > 0
                level: 2
                text: i18nc("@title:group the rules kwin-i3 ships", "Defaults")
            }
            RuleList {
                visible: page.defaultCount > 0
                from: 0
                to: page.defaultCount
            }
            Kirigami.Heading {
                Layout.topMargin: page.defaultCount > 0 ? Kirigami.Units.largeSpacing : 0
                level: 2
                text: page.defaultCount > 0 ? i18nc("@title:group", "Your rules") : i18nc("@title:group", "Rules")
            }
            RuleList {
                from: page.defaultCount
                to: page.rows.length
                emptyText: page.defaultCount > 0 ? i18n("No rules of your own") : i18n("No rules")
                emptyExplanation: page.rows.length === 0 ? i18n("Dialogs and the other windows that float by themselves float; the rest tile.") : ""
            }

            Kirigami.Heading {
                level: 2
                Layout.topMargin: Kirigami.Units.largeSpacing * 2
                text: i18nc("@title:group", "Floating window sizes")
            }
            SizeRow { settingName: "floatingMinimumSize"; what: i18nc("@label", "Smallest:") }
            SizeRow { settingName: "floatingMaximumSize"; what: i18nc("@label", "Largest:"); maximum: true }
        }
    }
}
