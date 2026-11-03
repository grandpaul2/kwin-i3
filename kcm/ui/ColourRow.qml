import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM
import org.kde.kquickcontrols as KQC

// A frame colour's row: a bar, then a Default button, together as wide as Frame's dropdowns.
// The button greys out at the default (disabled, not hidden: docs/style-settings-page.md, "Layout").
RowLayout {
    property string settingName
    property real columnWidth: Kirigami.Units.gridUnit * 14   // its section's dropdowns
    property string name                  // the bar's accessible name
    property color shown: kcm.settings[settingName]
    readonly property string defaultValue: kcm.settings["default" + settingName[0].toUpperCase() + settingName.slice(1) + "Value"]
    readonly property bool applies: kcm.frameAvailable && (kcm.settings.tiledLook === "frame" || kcm.settings.frameOnFloating)
    Kirigami.FormData.buddyFor: bar
    spacing: Kirigami.Units.smallSpacing
    KQC.ColorButton {
        id: bar
        Layout.preferredWidth: columnWidth - defaultButton.implicitWidth - parent.spacing
        showAlphaChannel: false
        color: parent.shown
        onAccepted: (c) => kcm.settings[parent.settingName] = c.toString()
        Accessible.name: parent.name
        KCM.SettingStateBinding {
            configObject: kcm.settings
            settingName: bar.parent.settingName
            extraEnabledConditions: bar.parent.applies
        }
    }
    QQC2.Button {
        id: defaultButton
        text: i18nc("@action:button a colour back to its default", "Default")
        enabled: parent.applies && kcm.settings[parent.settingName] !== parent.defaultValue
        onClicked: kcm.settings[parent.settingName] = parent.defaultValue
        Accessible.name: i18nc("@action:button", "%1: default", parent.name)
    }
}
