import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM
import org.kde.kquickcontrols as KQC

// A choice stored as i3's word ("auto", "force"), shown as words a person would say.
QQC2.ComboBox {
    property real columnWidth: implicitWidth      // its section's widest dropdown
    Layout.preferredWidth: columnWidth
    property string settingName
    property bool applies: true
    textRole: "text"
    valueRole: "value"
    // Not a binding on indexOfValue: it runs before the model is set and isn't re-run after.
    readonly property string stored: kcm.settings[settingName]
    function sync() { currentIndex = indexOfValue(stored) }
    onStoredChanged: sync()
    onCountChanged: sync()
    Component.onCompleted: sync()
    onActivated: kcm.settings[settingName] = currentValue
    KCM.SettingStateBinding {
        configObject: kcm.settings
        settingName: parent.settingName
        extraEnabledConditions: parent.applies
    }
}
