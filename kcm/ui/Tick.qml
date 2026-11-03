import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM
import org.kde.kquickcontrols as KQC

// A checkbox whose name is the row's label, on the left as the page's other rows; the box
// itself says whether it is recommended, so a new reader keeps the ones that matter on.
// `name` is what a screen reader reads.
QQC2.CheckBox {
    property string name
    property bool recommended
    text: recommended ? i18nc("@option:check", "(recommended)") : i18nc("@option:check", "(optional)")
    Accessible.name: name
}
