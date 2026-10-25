#include "layoutkeys.h"

#include <input.h>
#include <keyboard_input.h>
#include <keyboard_layout.h>
#include <xkb.h>

#include <KConfigGroup>
#include <KSharedConfig>

#include <QChar>
#include <QDBusArgument>
#include <QDBusConnection>
#include <QDBusMessage>
#include <QDBusPendingCallWatcher>
#include <QDBusMetaType>
#include <QDBusPendingReply>
#include <QKeySequence>
#include <QLoggingCategory>

#include <memory>

#include <linux/input-event-codes.h>
#include <xkbcommon/xkbcommon.h>

// kglobalaccel's key sequence on the bus: a struct of four combined keys, (ai) (as kcm/keys.cpp).
struct KeySeq {
    QList<int> keys;
};
Q_DECLARE_METATYPE(KeySeq)

static QDBusArgument &operator<<(QDBusArgument &arg, const KeySeq &s)
{
    arg.beginStructure();
    arg << s.keys;
    arg.endStructure();
    return arg;
}

static const QDBusArgument &operator>>(const QDBusArgument &arg, KeySeq &s)
{
    arg.beginStructure();
    arg >> s.keys;
    arg.endStructure();
    return arg;
}

// The positions and the actions on them, as kwin-i3 registers them (src/kwin.js: KEYS, NAMES,
// SHIFTED; tests/unit/kcm.test.js checks the names and the US keys against it). level 0
// is the key alone, 1 with Shift; mods are added to the symbol.
namespace
{
struct Slot {
    const char *action;
    int evdev;
    int level;
    int mods;
    const char *us;      // kwin-i3's registered default
};
const Slot s_slots[] = {
    {"kwin-i3 Workspace 1", KEY_1, 0, Qt::META, "Meta+1"},
    {"kwin-i3 Workspace 2", KEY_2, 0, Qt::META, "Meta+2"},
    {"kwin-i3 Workspace 3", KEY_3, 0, Qt::META, "Meta+3"},
    {"kwin-i3 Workspace 4", KEY_4, 0, Qt::META, "Meta+4"},
    {"kwin-i3 Workspace 5", KEY_5, 0, Qt::META, "Meta+5"},
    {"kwin-i3 Workspace 6", KEY_6, 0, Qt::META, "Meta+6"},
    {"kwin-i3 Workspace 7", KEY_7, 0, Qt::META, "Meta+7"},
    {"kwin-i3 Workspace 8", KEY_8, 0, Qt::META, "Meta+8"},
    {"kwin-i3 Workspace 9", KEY_9, 0, Qt::META, "Meta+9"},
    {"kwin-i3 Workspace 10", KEY_0, 0, Qt::META, "Meta+0"},
    {"kwin-i3 Focus Right (;)", KEY_SEMICOLON, 0, Qt::META, "Meta+;"},
    {"kwin-i3 Grow Width (;)", KEY_SEMICOLON, 0, Qt::META | Qt::CTRL, "Meta+Ctrl+;"},
    // The Shift ones after the plain ones: on AZERTY, Move to Workspace 1 takes Meta+1, which
    // Workspace 1 must have let go first (kglobalaccel gives a key to one action).
    {"kwin-i3 Move to Workspace 1 (symbol)", KEY_1, 1, Qt::META, "Meta+!"},
    {"kwin-i3 Move to Workspace 2 (symbol)", KEY_2, 1, Qt::META, "Meta+@"},
    {"kwin-i3 Move to Workspace 3 (symbol)", KEY_3, 1, Qt::META, "Meta+#"},
    {"kwin-i3 Move to Workspace 4 (symbol)", KEY_4, 1, Qt::META, "Meta+$"},
    {"kwin-i3 Move to Workspace 5 (symbol)", KEY_5, 1, Qt::META, "Meta+%"},
    {"kwin-i3 Move to Workspace 6 (symbol)", KEY_6, 1, Qt::META, "Meta+^"},
    {"kwin-i3 Move to Workspace 7 (symbol)", KEY_7, 1, Qt::META, "Meta+&"},
    {"kwin-i3 Move to Workspace 8 (symbol)", KEY_8, 1, Qt::META, "Meta+*"},
    {"kwin-i3 Move to Workspace 9 (symbol)", KEY_9, 1, Qt::META, "Meta+("},
    {"kwin-i3 Move to Workspace 10 (symbol)", KEY_0, 1, Qt::META, "Meta+)"},
    {"kwin-i3 Move Right (:)", KEY_SEMICOLON, 1, Qt::META, "Meta+:"},
};

const QString s_service = QStringLiteral("org.kde.kglobalaccel");

QStringList actionId(const QString &action)
{
    return {QStringLiteral("kwin"), action, QStringLiteral("KWin"), action};
}

// A reply's key list, a(ai), as single keys (kwin-i3's are never sequences).
QList<int> fromArgument(const QDBusArgument &arg)
{
    QList<KeySeq> seqs;
    arg >> seqs;
    QList<int> out;
    for (const KeySeq &s : std::as_const(seqs)) {
        if (!s.keys.isEmpty() && s.keys.first()) {
            out << s.keys.first();
        }
    }
    return out;
}

QString text(const QList<int> &keys)
{
    QStringList s;
    for (int k : keys) {
        s << QKeySequence(k).toString(QKeySequence::PortableText);
    }
    return s.join(QStringLiteral(", "));
}

KConfigGroup stored()
{
    return KSharedConfig::openConfig(QStringLiteral("kwini3helperrc"))->group(QStringLiteral("LayoutKeys"));
}
}

LayoutKeys::LayoutKeys()
{
    qDBusRegisterMetaType<KeySeq>();
    qDBusRegisterMetaType<QList<KeySeq>>();
    QDBusConnection::sessionBus().registerObject(QStringLiteral("/kwini3helper"), QStringLiteral("net.local.kwini3helper"),
                                                 this, QDBusConnection::ExportAllSlots);
    // KWin matches the current layout's symbol only, so the keys follow it: refitted when the
    // layout is switched, and when layouts are added, removed or reordered (kxkbrc).
    if (auto layout = KWin::input()->keyboard()->keyboardLayout()) {
        connect(layout, &KWin::KeyboardLayout::layoutChanged, this, &LayoutKeys::FitKeys);
        connect(layout, &KWin::KeyboardLayout::layoutsReconfigured, this, &LayoutKeys::FitKeys);
    }
    // Loaded while kwin-i3 runs (make plugin-install): its actions are there already.
    QMetaObject::invokeMethod(this, &LayoutKeys::FitKeys, Qt::QueuedConnection);
}

LayoutKeys::~LayoutKeys()
{
    QDBusConnection::sessionBus().unregisterObject(QStringLiteral("/kwini3helper"));
}

// Each slot's key in the current layout, as KWin turns a press into a shortcut: the symbol at
// that level as a Qt key, looked up with Ctrl when Meta is held (keyboard_input.cpp), and Shift
// kept only on a letter (Xkb::modifiersRelevantForGlobalShortcuts).
QList<LayoutKeys::Want> LayoutKeys::plan() const
{
    QList<Want> wants;
    KWin::Xkb *xkb = KWin::input()->keyboard()->xkb();
    xkb_keymap *keymap = xkb ? xkb->keymap() : nullptr;
    if (!keymap) {
        return wants;
    }
    const xkb_layout_index_t layout = xkb->currentLayout();
    for (const Slot &s : s_slots) {
        Want w{QString::fromLatin1(s.action), {}};
        const xkb_keysym_t *syms = nullptr;
        if (xkb_keymap_key_get_syms_by_level(keymap, s.evdev + 8, layout, s.level, &syms) > 0) {
            const Qt::Key key = xkb->toQtKey(syms[0], s.evdev, Qt::ControlModifier);
            if (key != 0 && key != Qt::Key_unknown) {
                w.keys << (s.mods | key | (s.level == 1 && QChar::isLetter(key) ? int(Qt::SHIFT) : 0));
            }
        }
        wants.append(w);
    }
    return wants;
}

// One fit at a time: a second asked for while one is in flight (a quick us → de → us flip) runs
// when it ends, from the keymap as it is then; two at once could both read the old keys and the
// slower one leave the wrong layout's (review of the change, finding 1).
void LayoutKeys::FitKeys()
{
    if (m_busy) {
        m_again = true;
        return;
    }
    m_busy = true;
    m_again = false;
    const QList<Want> wants = plan();
    QStringList lines;
    if (KWin::Xkb *xkb = KWin::input()->keyboard()->xkb(); xkb && xkb->keymap()) {
        QStringList names;
        for (xkb_layout_index_t l = 0; l < xkb_keymap_num_layouts(xkb->keymap()); l++) {
            names << xkb->layoutShortName(l);
        }
        lines << QStringLiteral("layouts %1, current %2").arg(names.join(QLatin1Char(',')), xkb->layoutShortName(xkb->currentLayout()));
    }
    for (const Want &w : wants) {
        lines << w.action + QStringLiteral(" = ") + text(w.keys);
    }
    apply(wants, lines.join(QLatin1Char('\n')));
}

// The fit is over: its plan is published (the live tests wait for it, so it must not show before
// the keys are kglobalaccel's), and a fit asked for meanwhile runs.
void LayoutKeys::done(const QString &plan)
{
    m_plan = plan;
    m_busy = false;
    if (m_again) {
        QMetaObject::invokeMethod(this, &LayoutKeys::FitKeys, Qt::QueuedConnection);
    }
}

// The actions' current keys are asked for first (asynchronously: kglobalaccel is in this process,
// a blocking call would wait on itself); an action is changed only if its keys are kwin-i3's US
// default or what this gave it last time, else the user has bound it. A key moving between two
// actions (Meta+1 from Move to Workspace 1 on AZERTY to Workspace 1 on US) is held by both until
// the second is set; kglobalaccel allows that (GlobalShortcut::setKeys), and the burst ends with
// each key on one action.
void LayoutKeys::apply(const QList<Want> &wants, const QString &plan)
{
    if (wants.isEmpty()) {
        done(plan);
        return;
    }
    auto pending = std::make_shared<int>(wants.size());
    auto change = std::make_shared<QList<Want>>();
    for (const Want &w : wants) {
        QDBusMessage ask = QDBusMessage::createMethodCall(s_service, QStringLiteral("/kglobalaccel"), QStringLiteral("org.kde.KGlobalAccel"),
                                                          QStringLiteral("shortcutKeys"));
        ask << actionId(w.action);
        auto *watcher = new QDBusPendingCallWatcher(QDBusConnection::sessionBus().asyncCall(ask), this);
        connect(watcher, &QDBusPendingCallWatcher::finished, this, [this, w, pending, change, plan](QDBusPendingCallWatcher *self) {
            self->deleteLater();
            const QDBusMessage reply = self->reply();
            const QList<int> current = reply.type() == QDBusMessage::ReplyMessage && !reply.arguments().isEmpty()
                ? fromArgument(reply.arguments().first().value<QDBusArgument>())
                : QList<int>();
            int us = 0;
            for (const Slot &s : s_slots) {
                if (w.action == QLatin1String(s.action)) {
                    us = QKeySequence::fromString(QString::fromLatin1(s.us), QKeySequence::PortableText)[0].toCombined();
                }
            }
            // An action this emptied (a layout with no symbol there) is recorded as "none": no keys
            // is otherwise an action not registered (kwin-i3 not loaded), nothing to fit.
            const QString last = stored().readEntry(w.action, QString());
            const bool ours = current.isEmpty() ? last == QLatin1String("none") : (current == QList<int>{us} || text(current) == last);
            if (ours && current != w.keys) {
                change->append(w);
            }
            if (--*pending == 0) {
                set(*change, plan);
            }
        });
    }
}

// The changes, each waited for, then the plan published.
void LayoutKeys::set(const QList<Want> &change, const QString &plan)
{
    if (change.isEmpty()) {
        done(plan);
        return;
    }
    auto pending = std::make_shared<int>(change.size());
    KConfigGroup g = stored();
    for (const Want &c : change) {
        auto *watcher = new QDBusPendingCallWatcher(setKeys(c.action, c.keys), this);
        connect(watcher, &QDBusPendingCallWatcher::finished, this, [this, pending, plan](QDBusPendingCallWatcher *self) {
            self->deleteLater();
            if (--*pending == 0) {
                done(plan);
            }
        });
        g.writeEntry(c.action, c.keys.isEmpty() ? QStringLiteral("none") : text(c.keys));
    }
    g.sync();
}

QDBusPendingCall LayoutKeys::setKeys(const QString &action, const QList<int> &keys)
{
    QDBusMessage msg = QDBusMessage::createMethodCall(s_service, QStringLiteral("/kglobalaccel"), QStringLiteral("org.kde.KGlobalAccel"),
                                                      QStringLiteral("setForeignShortcutKeys"));
    QList<KeySeq> seqs;
    for (int k : keys) {
        seqs << KeySeq{{k, 0, 0, 0}};
    }
    msg << actionId(action) << QVariant::fromValue(seqs);
    return QDBusConnection::sessionBus().asyncCall(msg);
}

QString LayoutKeys::Plan() const
{
    return m_plan;
}
