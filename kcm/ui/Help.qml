import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM
import org.kde.kquickcontrols as KQC

// A setting's help, ending in its i3 directive. It sits in
// a RowLayout with its control; FormLayout then labels the row, not the control
// (Kirigami 6.31 FormLayout.qml:471), so the control carries its own Accessible.name and the
// row a buddyFor. Named for its topic, as Kirigami's own name is the same for every one.
Kirigami.ContextualHelpButton {
    property string topic
    Accessible.name: i18nc("@action:button", "More about %1", topic)
}
