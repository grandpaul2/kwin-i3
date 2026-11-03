#include "keyoverride.h"

#include <input_event.h>

#include <QDBusConnection>
#include <QDBusPendingCall>
#include <QDBusMessage>
#include <linux/input-event-codes.h>

KeyOverride::KeyOverride()
    : InputEventFilter(KWin::InputFilterOrder::TabBox)
{
}

bool KeyOverride::keyboardKey(KWin::KeyboardKeyEvent *event)
{
    const quint32 code = event->nativeScanCode;
    if (event->state == KWin::KeyboardKeyState::Released) {
        if (m_swallowed && code == m_swallowed) {
            m_swallowed = 0;
            return true;
        }
        return false;
    }
    const Qt::KeyboardModifiers mods = event->modifiers & (Qt::ShiftModifier | Qt::ControlModifier | Qt::AltModifier | Qt::MetaModifier);
    if (QKeyCombination(mods, event->key).toCombined() != QKeyCombination(Qt::MetaModifier, Qt::Key_Left).toCombined()) {
        return false;
    }
    if (event->state == KWin::KeyboardKeyState::Pressed) {
        auto msg = QDBusMessage::createMethodCall(QStringLiteral("org.kde.kglobalaccel"), QStringLiteral("/component/kwin"),
                                                  QStringLiteral("org.kde.kglobalaccel.Component"), QStringLiteral("invokeShortcut"));
        msg << QStringLiteral("kwin-i3 Focus Left");
        QDBusConnection::sessionBus().asyncCall(msg);
        qWarning("PROBE override: Meta+Left -> kwin-i3 Focus Left");
    }
    m_swallowed = code;
    return true;
}
