#include "resizemode.h"

#include <input_event.h>

#include <KConfigGroup>
#include <KSharedConfig>

#include <QDBusConnection>
#include <QDBusMessage>
#include <QDBusPendingCall>

#include <linux/input-event-codes.h>

using namespace KWin;

// Ahead of KWin's global shortcuts (TabBox's place, input.h InputFilterOrder), installed only
// while the mode is on: a bound key (Meta+R itself) never reaches a filter at Effects.
ResizeMode::ResizeMode()
    : InputEventFilter(InputFilterOrder::TabBox)
{
    QDBusConnection::sessionBus().registerObject(QStringLiteral("/kwini3mode"), QStringLiteral("net.local.kwini3mode"),
                                                 this, QDBusConnection::ExportAllSlots);
}

ResizeMode::~ResizeMode()
{
    if (m_installed && input()) {
        input()->uninstallInputEventFilter(this);
    }
    QDBusConnection::sessionBus().unregisterObject(QStringLiteral("/kwini3mode"));
}

void ResizeMode::SetMode(const QString &mode)
{
    if (mode == QStringLiteral("resize")) {
        enter();
    } else {
        leave();
    }
}

void ResizeMode::enter()
{
    if (m_mode == QStringLiteral("resize")) {
        return;
    }
    m_mode = QStringLiteral("resize");
    if (!m_installed && input()) {
        input()->installInputEventFilter(this);
        m_installed = true;
    }
    tell();
}

void ResizeMode::leave()
{
    if (m_mode.isEmpty()) {
        return;
    }
    m_mode.clear();
    if (m_installed && input()) {
        input()->uninstallInputEventFilter(this);
        m_installed = false;
    }
    tell();
}

// kwin-i3 through its hidden action (KWin calling itself: never wait for it), the effect directly.
void ResizeMode::tell()
{
    invoke(QStringLiteral("kwin-i3 Mode Changed"));
    auto msg = QDBusMessage::createMethodCall(QStringLiteral("org.kde.KWin"), QStringLiteral("/kwini3hold"),
                                              QStringLiteral("net.local.kwini3hold"), QStringLiteral("SetMode"));
    msg << m_mode;
    QDBusConnection::sessionBus().asyncCall(msg);
}

void ResizeMode::invoke(const QString &action)
{
    auto msg = QDBusMessage::createMethodCall(QStringLiteral("org.kde.kglobalaccel"), QStringLiteral("/component/kwin"),
                                              QStringLiteral("org.kde.kglobalaccel.Component"), QStringLiteral("invokeShortcut"));
    msg << action;
    QDBusConnection::sessionBus().asyncCall(msg);
}

// i3's mode "resize" (etc/config.keycodes): bindcode, so the evdev code decides, whatever the
// layout; the mode's keys take no modifier, Meta+R leaves. A key's release is taken with its press,
// so the focused window sees neither half.
bool ResizeMode::keyboardKey(KeyboardKeyEvent *event)
{
    if (m_mode.isEmpty()) {
        return false;
    }
    const bool press = event->state == KeyboardKeyState::Pressed;
    const bool held = press || event->state == KeyboardKeyState::Repeated;
    const quint32 code = event->nativeScanCode;
    const Qt::KeyboardModifiers mods = event->modifiers & (Qt::ShiftModifier | Qt::ControlModifier | Qt::AltModifier | Qt::MetaModifier);
    if (code == KEY_R && (mods & Qt::MetaModifier)) {
        if (press) {
            leave();
        }
        return true;
    }
    if (mods != Qt::NoModifier) {
        return false;
    }
    QString action;
    switch (code) {
    case KEY_ESC:
    case KEY_ENTER:
        if (press) {
            leave();
        }
        return true;
    case KEY_J:
    case KEY_LEFT:
        action = QStringLiteral("kwin-i3 Shrink Width");
        break;
    case KEY_K:
    case KEY_DOWN:
        action = QStringLiteral("kwin-i3 Grow Height");
        break;
    case KEY_L:
    case KEY_UP:
        action = QStringLiteral("kwin-i3 Shrink Height");
        break;
    case KEY_SEMICOLON:
    case KEY_RIGHT:
        action = QStringLiteral("kwin-i3 Grow Width");
        break;
    default:
        return false;
    }
    if (held) {
        invoke(action);
    }
    return true;
}

QString ResizeMode::TerminalService() const
{
    KConfigGroup general(KSharedConfig::openConfig(QStringLiteral("kdeglobals")), QStringLiteral("General"));
    const QString service = general.readEntry("TerminalService", QString());
    return service.isEmpty() ? QStringLiteral("org.kde.konsole.desktop") : service;
}

// As kglobalacceld launches an application's shortcut (kserviceactioncomponent.cpp): the
// service's component is made if it isn't there (doRegister), then its _launch action invoked.
// Probe 92: Alacritty.desktop and org.kde.konsole.desktop both opened this way.
void ResizeMode::LaunchTerminal()
{
    const QString service = TerminalService();
    auto reg = QDBusMessage::createMethodCall(QStringLiteral("org.kde.kglobalaccel"), QStringLiteral("/kglobalaccel"),
                                              QStringLiteral("org.kde.KGlobalAccel"), QStringLiteral("doRegister"));
    reg << QStringList{service, QStringLiteral("_launch"), service, QStringLiteral("Launch")};
    QDBusConnection::sessionBus().call(reg, QDBus::Block, 1000);
    QString path = QStringLiteral("/component/") + service;
    path.replace(QLatin1Char('.'), QLatin1Char('_')).replace(QLatin1Char('-'), QLatin1Char('_'));
    auto msg = QDBusMessage::createMethodCall(QStringLiteral("org.kde.kglobalaccel"), path,
                                              QStringLiteral("org.kde.kglobalaccel.Component"), QStringLiteral("invokeShortcut"));
    msg << QStringLiteral("_launch");
    QDBusConnection::sessionBus().asyncCall(msg);
}
