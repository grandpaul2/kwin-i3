#include "mousechords.h"

#include <input_event.h>
#include <pointer_input.h>
#include <window.h>
#include <workspace.h>

#include <KConfigGroup>
#include <KSharedConfig>

#include <QDBusConnection>
#include <QDBusMessage>

using namespace KWin;

static const QString s_group = QStringLiteral("kwin-i3-mouse");

// "Meta+Shift+Left" -> (modifiers, button); button 0 if it doesn't parse.
static QPair<int, int> parseChord(const QString &chord)
{
    Qt::KeyboardModifiers mods;
    int button = 0;
    const QStringList parts = chord.split(QLatin1Char('+'), Qt::SkipEmptyParts);
    for (int i = 0; i < parts.size(); ++i) {
        const QString p = parts[i].trimmed().toLower();
        const bool last = i == parts.size() - 1;
        if (!last) {
            if (p == QLatin1String("meta")) {
                mods |= Qt::MetaModifier;
            } else if (p == QLatin1String("shift")) {
                mods |= Qt::ShiftModifier;
            } else if (p == QLatin1String("ctrl") || p == QLatin1String("control")) {
                mods |= Qt::ControlModifier;
            } else if (p == QLatin1String("alt")) {
                mods |= Qt::AltModifier;
            } else {
                return {0, 0};
            }
        } else if (p == QLatin1String("left")) {
            button = Qt::LeftButton;
        } else if (p == QLatin1String("middle")) {
            button = Qt::MiddleButton;
        } else if (p == QLatin1String("right")) {
            button = Qt::RightButton;
        }
    }
    return {int(mods), button};
}

ChordMoveFilter::ChordMoveFilter()
    : InputEventFilter(InputFilterOrder::InteractiveMoveResize)
{
}

void ChordMoveFilter::start(Window *window)
{
    m_window = window;
}

KWin::Window *ChordMoveFilter::active() const
{
    Window *window = workspace()->moveResizeWindow();
    return window && window == m_window ? window : nullptr;
}

bool ChordMoveFilter::pointerMotion(PointerMotionEvent *event)
{
    Window *window = active();
    if (!window) {
        return false;
    }
    window->updateInteractiveMoveResize(event->position, event->modifiers & ~Qt::ShiftModifier);
    return true;
}

bool ChordMoveFilter::pointerButton(PointerButtonEvent *event)
{
    Window *window = active();
    if (!window) {
        return false;
    }
    if (event->state == PointerButtonState::Released && event->buttons == Qt::NoButton) {
        m_window = nullptr;
        window->endInteractiveMoveResize();
    }
    return true;
}

bool ChordMoveFilter::keyboardKey(KeyboardKeyEvent *event)
{
    Window *window = active();
    if (!window) {
        return false;
    }
    if (event->state == KeyboardKeyState::Repeated || event->state == KeyboardKeyState::Pressed) {
        window->keyPressEvent(QKeyCombination{event->modifiers & ~Qt::ShiftModifier, event->key});
        if (window->isInteractiveMove() || window->isInteractiveResize()) {
            window->updateInteractiveMoveResize(input()->globalPointer(), input()->keyboardModifiers() & ~Qt::ShiftModifier);
        }
    }
    return true;
}

MouseChords::MouseChords()
    : InputEventFilter(InputFilterOrder::Decoration)
    , m_watcher(KConfigWatcher::create(KSharedConfig::openConfig(QStringLiteral("kwinrc"))))
{
    connect(m_watcher.get(), &KConfigWatcher::configChanged, this, [this](const KConfigGroup &group) {
        if (group.name() == s_group) {
            loadConfig();
        }
    });
    // kwriteconfig6 without --notify, then KWin's reconfigure
    connect(options, &Options::configChanged, this, &MouseChords::loadConfig);
    loadConfig();
    input()->installInputEventFilter(&m_moveFilter);
    input()->installInputEventFilter(this);
}

MouseChords::~MouseChords()
{
    if (input()) {
        input()->uninstallInputEventFilter(this);
        input()->uninstallInputEventFilter(&m_moveFilter);
    }
}

void MouseChords::loadConfig()
{
    m_chords.clear();
    auto config = m_watcher->config();
    config->reparseConfiguration();
    const KConfigGroup group = config->group(s_group);
    const QMap<QString, QString> entries = group.entryMap();
    for (auto it = entries.cbegin(); it != entries.cend(); ++it) {
        const auto chord = parseChord(it.key());
        if (chord.second == 0) {
            qWarning("kwini3mouse: ignoring chord %s", qPrintable(it.key()));
            continue;
        }
        Action action;
        if (it.value().startsWith(QLatin1String("shortcut:"))) {
            action.shortcut = it.value().mid(9);
        } else {
            action.command = Options::mouseCommand(it.value(), false);
            if (action.command == Options::MouseNothing) {
                // "Nothing" is no chord: the click goes on as usual
                if (it.value().toLower() != QLatin1String("nothing")) {
                    qWarning("kwini3mouse: ignoring unknown action %s", qPrintable(it.value()));
                }
                continue;
            }
        }
        m_chords.insert(chord, action);
    }
}

bool MouseChords::pointerButton(PointerButtonEvent *event)
{
    const int button = int(event->button);
    if (event->state == PointerButtonState::Released) {
        // the release of a press we took: the client never saw that press
        return m_swallowRelease.remove(button);
    }
    // An earlier filter (an effect, a popup, the lock screen) can eat a release we were waiting
    // for: forget every button that is no longer held.
    for (auto it = m_swallowRelease.begin(); it != m_swallowRelease.end();) {
        it = (event->buttons & Qt::MouseButton(*it)) ? std::next(it) : m_swallowRelease.erase(it);
    }
    // KWin's own window actions skip these too (input.cpp globalWindowAction, windowActionFor...):
    // a game holding the pointer, or a window inhibiting shortcuts (a VM, a remote desktop).
    if (input()->pointer()->isConstrained() || workspace()->globalShortcutsDisabled()) {
        return false;
    }
    const int mods = int(event->modifiersRelevantForShortcuts & ~Qt::KeypadModifier);
    const auto it = m_chords.constFind({mods, button});
    if (it == m_chords.cend()) {
        return false;
    }
    // hover, not focus: on a title bar or border focus() is null (the decoration has the pointer)
    Window *window = input()->pointer()->hover();
    if (!window || !window->isClient()) {
        return false;
    }
    if (!it->shortcut.isEmpty()) {
        // Synchronously, so the shortcut (which runs a turn later) acts on this window.
        workspace()->activateWindow(window);
        // kglobalaccel runs inside KWin: a blocking call would wait on ourselves
        QDBusMessage call = QDBusMessage::createMethodCall(QStringLiteral("org.kde.kglobalaccel"),
                                                           QStringLiteral("/component/kwin"),
                                                           QStringLiteral("org.kde.kglobalaccel.Component"),
                                                           QStringLiteral("invokeShortcut"));
        call << it->shortcut;
        QDBusConnection::sessionBus().send(call);
    } else {
        window->performMousePressCommand(it->command, event->position);
        if (workspace()->moveResizeWindow() == window) {
            // A move/resize started: the move filter (before this one) takes the release.
            m_moveFilter.start(window);
            return true;
        }
    }
    m_swallowRelease.insert(button);
    return true;
}
