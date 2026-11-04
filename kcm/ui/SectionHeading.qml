import QtQuick
import QtQuick.Layouts
import org.kde.kirigami as Kirigami

// A section's heading with its help beside it, drawn as a FormLayout draws its own section
// headings (Kirigami FormLayout.qml: level 3, Primary, centred, two large spacings above), which
// have no room for a button. It sits in the tab's column, outside its forms.
RowLayout {
    id: root
    property alias text: heading.text
    property string help
    Layout.alignment: Qt.AlignHCenter
    Layout.topMargin: Kirigami.Units.largeSpacing * 2
    spacing: Kirigami.Units.smallSpacing
    Kirigami.Heading {
        id: heading
        level: 3
        type: Kirigami.Heading.Type.Primary
    }
    Help {
        visible: root.help !== ""
        topic: root.text
        toolTipText: root.help
    }
}
