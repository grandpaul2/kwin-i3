import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami

// One of Plasma's own settings kwin-i3 is designed around (kcm/setup.cpp), shown on the tab it
// belongs with: ticked is kwin-i3's way. A tick is an edit like any on the page: Apply changes
// Plasma's setting, saving what it was; unticked and applied, kwin-i3 gives back what Plasma had
// (docs/plan.md, "Install and first run"). Its help says it is Plasma's setting and where Plasma
// keeps it. `row` is the setting's id in kcm.setup.rows.
RowLayout {
    id: root
    property string row
    property bool recommended
    property bool showName                  // a row with no FormLayout label names itself
    readonly property var model: kcm.setup.rows.find((r) => r.id === row) || ({})
    spacing: Kirigami.Units.smallSpacing
    Tick {
        id: box
        name: root.model.title || ""
        recommended: root.recommended
        text: (root.showName ? root.model.title + " " : "") + (root.recommended ? i18nc("@option:check", "(recommended)") : i18nc("@option:check", "(optional)"))
        checked: !!kcm.setup.wanted[root.row]
        onToggled: {
            kcm.setup.setWanted(root.row, checked);
            checked = Qt.binding(() => !!kcm.setup.wanted[root.row]);
        }
    }
    Help {
        topic: root.model.title || ""
        toolTipText: [root.model.why, root.model.note, i18n("This is Plasma's own setting: changing it here is the same as in System Settings, and kwin-i3 gives back what it was when you untick it and apply.")].filter((s) => s).join(" ")
    }
}
