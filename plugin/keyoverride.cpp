#include "keyoverride.h"

#include <input_event.h>
#include <keyboard_input.h>

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
            if (qgetenv("KI3_PROBE_RELEASE") == "mutate") {
                event->key = Qt::Key_unknown;   // on to kglobalacceld, matching nothing
                m_marked = code;
                return false;
            }
            // KI3_PROBE_RELEASE=pass: the release goes on to kglobalacceld, which resets its
            // modifier-only state on any non-modifier key; the key is filtered, so no window sees it.
            return qgetenv("KI3_PROBE_RELEASE") != "pass";
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
        if (qgetenv("KI3_PROBE_RELEASE") == "pass") {
            KWin::input()->keyboard()->addFilteredKey(code);
        }
    }
    m_swallowed = code;
    if (qgetenv("KI3_PROBE_RELEASE") == "mutate" && event->state == KWin::KeyboardKeyState::Pressed) {
        // On to kglobalacceld with a key no shortcut has: its modifier-only state resets, nothing
        // runs; KeyOverrideAfter takes the press before any window sees it.
        event->key = Qt::Key_unknown;
        m_marked = code;
        return false;
    }
    return true;
}

KeyOverrideAfter::KeyOverrideAfter(KeyOverride *a)
    : InputEventFilter(KWin::InputFilterOrder::Effects)
    , m_a(a)
{
}

bool KeyOverrideAfter::keyboardKey(KWin::KeyboardKeyEvent *event)
{
    if (m_a->m_marked && event->nativeScanCode == m_a->m_marked) {
        if (event->state != KWin::KeyboardKeyState::Released) {
            KWin::input()->keyboard()->addFilteredKey(event->nativeScanCode);
        } else {
            m_a->m_marked = 0;
        }
        return true;
    }
    return false;
}
