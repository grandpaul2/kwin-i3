import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM
import org.kde.kquickcontrols as KQC

// A spin box that shows its unit: "8 px".
QQC2.SpinBox {
    Layout.preferredWidth: Kirigami.Units.gridUnit * 6
    property string unit
    textFromValue: (value) => unit === "ms" ? i18ncp("@item:valuesuffix milliseconds", "%1 ms", "%1 ms", value)
                            : unit === "%" ? i18nc("@item:valuesuffix percent", "%1%", value)
                            : i18ncp("@item:valuesuffix pixels", "%1 px", "%1 px", value)
    valueFromText: (text) => parseInt(text)
}
