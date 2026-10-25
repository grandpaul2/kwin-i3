import QtQuick
import QtQuick.Controls as QQC2
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM

KCM.SimpleKCM {
    property alias cfg_numbersOnly: numbersOnly.checked
    Kirigami.FormLayout {
        QQC2.CheckBox {
            id: numbersOnly
            Kirigami.FormData.label: i18n("Display:")
            text: i18n("Numbers only (no thumbnails), for a small panel")
        }
    }
}
