#include "keyoverride.h"
#include "layoutkeys.h"

#include <input_event.h>
#include <keyboard_input.h>
#include <wayland_server.h>
#include <workspace.h>

#include <KConfigGroup>
#include <KSharedConfig>

#include <QAction>
#include <QKeySequence>

#include <memory>

using namespace KWin;

static const QString s_prefix = QStringLiteral("kwin-i3 ");

KeyOverride::KeyOverride()
    : InputEventFilter(InputFilterOrder::GlobalShortcut)
    , m_watcher(KConfigWatcher::create(KSharedConfig::openConfig(QStringLiteral("kwinrc"))))
    , m_after(this)
{
    load();
    connect(m_watcher.get(), &KConfigWatcher::configChanged, this, &KeyOverride::load);
    connect(workspace(), &Workspace::configChanged, this, [this] {
        load();
        refresh();
    });
    refresh();
    // Installed whether on or off: off, both filters pass every event at their first test.
    input()->installInputEventFilter(this);
    input()->installInputEventFilter(&m_after);
}

KeyOverride::~KeyOverride()
{
    if (input()) {
        input()->uninstallInputEventFilter(this);
        input()->uninstallInputEventFilter(&m_after);
    }
}

void KeyOverride::load()
{
    auto config = m_watcher->config();
    config->reparseConfiguration();
    m_on = config->group(QStringLiteral("Script-kwin-i3")).readEntry("keysOverride", false);
}

// Every kwin-i3 action KWin holds now, each one's keys asked for at once; the table is swapped in
// when the last answer is in, so the override never goes without its keys meanwhile.
void KeyOverride::refresh()
{
    const int generation = ++m_generation;
    QList<QAction *> actions;
    for (QAction *a : workspace()->findChildren<QAction *>()) {
        if (a->objectName().startsWith(s_prefix)) {
            actions << a;
        }
    }
    if (actions.isEmpty()) {
        m_keys.clear();
        return;
    }
    auto table = std::make_shared<QHash<int, QPointer<QAction>>>();
    auto pending = std::make_shared<int>(actions.size());
    for (QAction *a : std::as_const(actions)) {
        QPointer<QAction> action(a);
        LayoutKeys::askKeys(this, a->objectName(), [this, generation, table, pending, action](const QList<int> &keys) {
            if (generation != m_generation) {
                return;     // another refresh started: its table wins
            }
            for (int key : keys) {
                table->insert(key, action);
            }
            if (--*pending == 0) {
                m_keys = *table;
            }
        });
    }
}

QString KeyOverride::plan() const
{
    QStringList lines;
    for (auto it = m_keys.cbegin(); it != m_keys.cend(); ++it) {
        if (it.value()) {
            lines << QKeySequence(it.key()).toString() + QStringLiteral(" = ") + it.value()->objectName();
        }
    }
    lines.sort();
    lines.prepend(m_on ? QStringLiteral("on") : QStringLiteral("off"));
    return lines.join(QLatin1Char('\n'));
}

// The key as KWin's global shortcut filter hands it to kglobalacceld (input.cpp:1080): the
// layout's symbol with the modifiers that matter for shortcuts (Shift dropped on a symbol it made).
bool KeyOverride::keyboardKey(KeyboardKeyEvent *event)
{
    if (!m_on || event->state == KeyboardKeyState::Released || waylandServer()->isKeyboardShortcutsInhibited()) {
        return false;
    }
    const int key = int(event->modifiersRelevantForGlobalShortcuts) | int(event->key);
    const auto it = m_keys.constFind(key);
    if (it == m_keys.cend() || !it.value()) {
        return false;
    }
    if (event->state == KeyboardKeyState::Pressed) {
        // Queued, as kglobalaccel's own trigger comes from its signal: not run inside the input
        // event KWin is still delivering.
        QMetaObject::invokeMethod(it.value().data(), &QAction::trigger, Qt::QueuedConnection);
    }
    event->key = Qt::Key_unknown;
    m_marked.insert(event->nativeScanCode);
    return false;
}

KeyOverride::After::After(KeyOverride *override)
    : InputEventFilter(InputFilterOrder::Effects)
    , m_override(override)
{
}

bool KeyOverride::After::keyboardKey(KeyboardKeyEvent *event)
{
    if (!m_override->m_marked.contains(event->nativeScanCode)) {
        return false;
    }
    if (event->state == KeyboardKeyState::Released) {
        m_override->m_marked.remove(event->nativeScanCode);
    } else {
        input()->keyboard()->addFilteredKey(event->nativeScanCode);
    }
    return true;
}
