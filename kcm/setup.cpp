#include "setup.h"

#include <KConfig>
#include <KConfigGroup>
#include <KLocalizedString>
#include <KSharedConfig>

#include <QDBusConnection>
#include <QDBusMessage>
#include <QDir>
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QKeySequence>
#include <QRegularExpression>
#include <QSaveFile>
#include <QStandardPaths>

// The save: what each change replaced ("old", null where the key wasn't set) and what it wrote
// ("set"), by "file|group|key". tools/plasma-settings.py restore (make uninstall) reads it too.
static QString savePath()
{
    const QString state = qEnvironmentVariable("XDG_STATE_HOME", QDir::homePath() + QStringLiteral("/.local/state"));
    return state + QStringLiteral("/kwin-i3/plasma-settings.json");
}

static QJsonObject readSave()
{
    QFile f(savePath());
    return f.open(QIODevice::ReadOnly) ? QJsonDocument::fromJson(f.readAll()).object() : QJsonObject();
}

static bool writeSave(const QJsonObject &save)
{
    if (save.isEmpty())
        return !QFile::exists(savePath()) || QFile::remove(savePath());
    QDir().mkpath(QFileInfo(savePath()).path());
    QSaveFile out(savePath());
    return out.open(QIODevice::WriteOnly) && out.write(QJsonDocument(save).toJson()) >= 0 && out.commit();
}

static QString idOf(const SetupModel::Change &c)
{
    return c.file + QLatin1Char('|') + c.group + QLatin1Char('|') + c.key;
}

static KConfigGroup groupOf(const SetupModel::Change &c)
{
    auto config = KSharedConfig::openConfig(c.file);
    config->reparseConfiguration();
    return KConfigGroup(config, c.group);
}

// A key's stock value, as the installed KWin declares it (kwin.kcfg), so a KWin whose stock
// changed (6.8's window actions) is read right; kdeglobals' one key here is Plasma's 1.
static QString stock(const SetupModel::Change &c)
{
    if (c.file == QLatin1String("kdeglobals"))
        return QStringLiteral("1");
    static QString kcfg;
    if (kcfg.isNull()) {
        QFile f(QStandardPaths::locate(QStandardPaths::GenericDataLocation, QStringLiteral("config.kcfg/kwin.kcfg")));
        kcfg = f.open(QIODevice::ReadOnly) ? QString::fromUtf8(f.readAll()) : QStringLiteral("");
    }
    const auto m = QRegularExpression(QStringLiteral("<entry name=\"%1\"[^>]*>(.*?)</entry>").arg(c.key),
                                      QRegularExpression::DotMatchesEverythingOption)
                       .match(kcfg);
    const auto d = QRegularExpression(QStringLiteral("<default>([^<]*)</default>")).match(m.captured(1));
    // An enum's default is its C++ name (Options::ClickToFocus); kwinrc holds the choice alone.
    return d.captured(1).section(QStringLiteral("::"), -1);
}

static QJsonValue raw(const SetupModel::Change &c)
{
    const KConfigGroup g = groupOf(c);
    return g.hasKey(c.key) ? QJsonValue(g.readEntry(c.key, QString())) : QJsonValue(QJsonValue::Null);
}

static void write(const SetupModel::Change &c, const QJsonValue &v)
{
    KConfigGroup g = groupOf(c);
    if (v.isNull())
        g.deleteEntry(c.key, KConfig::Notify);
    else
        g.writeEntry(c.key, v.toString(), KConfig::Notify);
    g.sync();
}

static const int MetaT = int(Qt::META) | Qt::Key_T;
static const QString TileEditor = QStringLiteral("kwin|Edit Tiles");

SetupModel::SetupModel(KeysModel *keys, QObject *parent)
    : QObject(parent)
    , m_keys(keys)
{
    const auto w = [](const QString &key, const QString &value) { return Change{QStringLiteral("kwinrc"), QStringLiteral("Windows"), key, value}; };
    const auto mb = [](const QString &key, const QString &value) { return Change{QStringLiteral("kwinrc"), QStringLiteral("MouseBindings"), key, value}; };
    const auto on = [](const QString &v) { return v == QLatin1String("true"); };

    // Each row says in a sentence what Plasma does with its values, and what kwin-i3 needs
    // instead; never a setting's name alone (docs/style-settings-page.md, the Plasma Settings
    // sub-page).
    Row focus{QStringLiteral("focus"), i18nc("@title", "Focus"),
              i18n("The window under the pointer has the focus, at once, and a closed window's focus goes to the one under the pointer."),
              i18n("i3's focus follows the mouse: the frame and every key act on the window under the pointer. In System Settings: Window Management > Window Behavior > Focus."),
              {}, false,
              {w(QStringLiteral("FocusPolicy"), QStringLiteral("FocusFollowsMouse")), w(QStringLiteral("DelayFocusInterval"), QStringLiteral("0")),
               w(QStringLiteral("NextFocusPrefersMouse"), QStringLiteral("true"))},
              nullptr, nullptr};
    focus.plasma = [ch = focus.changes, on](const Getter &g) {
        const QString p = g(ch[0]);
        if (p == QLatin1String("ClickToFocus"))
            return i18n("A click focuses a window.");
        const int delay = g(ch[1]).toInt();
        QString s = delay ? i18np("The window under the pointer has the focus, after %1 ms.", "The window under the pointer has the focus, after %1 ms.", delay)
                          : i18n("The window under the pointer has the focus, at once.");
        if (p != QLatin1String("FocusFollowsMouse"))
            s = i18nc("a stricter focus policy, then the sentence", "Plasma's stricter focus under mouse: %1", s);
        if (!on(g(ch[2])))
            s += QLatin1Char(' ') + i18n("A closed window's focus goes to the one used last.");
        return s;
    };
    m_defs << focus;

    Row perOutput{QStringLiteral("perOutput"), i18nc("@title", "Workspaces on more than one screen"),
                  i18n("Each screen switches its own workspace."),
                  i18n("In i3 a workspace lives on one screen; switching every screen together puts windows on the wrong one. In System Settings: Window Management > Virtual Desktops."),
                  i18n("Giving this back puts every screen on the same workspace."), false,
                  {w(QStringLiteral("PerOutputVirtualDesktops"), QStringLiteral("true"))}, nullptr, nullptr};
    perOutput.plasma = [ch = perOutput.changes, on](const Getter &g) {
        return on(g(ch[0])) ? i18n("Each screen switches its own workspace.") : i18n("Switching workspace switches every screen together.");
    };
    m_defs << perOutput;

    Row stealing{QStringLiteral("focusStealing"), i18nc("@title", "New windows"),
                 i18n("A new window takes the focus, as in i3."),
                 i18n("Focus stealing prevention above Low keeps new windows from taking the focus. In System Settings: Window Management > Window Behavior > Focus."),
                 {}, false, {w(QStringLiteral("FocusStealingPreventionLevel"), QStringLiteral("1"))}, nullptr, nullptr};
    stealing.plasma = [ch = stealing.changes](const Getter &g) {
        const QStringList names{i18n("None"), i18n("Low"), i18n("Medium"), i18n("High"), i18n("Extreme")};
        const int level = g(ch[0]).toInt();
        return level > 1 ? i18nc("level", "A new window doesn't take the focus (focus stealing prevention: %1).", names.value(level))
                         : i18n("A new window takes the focus.");
    };
    m_defs << stealing;

    Row edges{QStringLiteral("edges"), i18nc("@title", "Screen edges"),
              i18n("A window dragged to a screen edge stays as it is."),
              i18n("Plasma's edge tiling places a window outside kwin-i3's layout. Shift held as a drag ends does the same, and no setting turns that off. In System Settings: Window Management > Screen Edges."),
              {}, false,
              {w(QStringLiteral("ElectricBorderTiling"), QStringLiteral("false")), w(QStringLiteral("ElectricBorderMaximize"), QStringLiteral("false"))},
              nullptr, nullptr};
    edges.plasma = [ch = edges.changes, on](const Getter &g) {
        const bool t = on(g(ch[0])), m = on(g(ch[1]));
        return t && m ? i18n("A window dragged to a screen edge is tiled there, or maximized at the top.")
             : t      ? i18n("A window dragged to a screen edge is tiled there.")
             : m      ? i18n("A window dragged to the top edge is maximized.")
                      : i18n("A window dragged to a screen edge stays as it is.");
    };
    m_defs << edges;

    Row tiles{QStringLiteral("tileEditor"), i18nc("@title", "Meta+T"),
              i18n("Meta+T does nothing."),
              i18n("Plasma's tile editor changes the tiles kwin-i3 lays out. In System Settings: Keyboard > Shortcuts, KWin, Toggle Tiles Editor."),
              {}, false, {}, nullptr, nullptr};
    tiles.plasma = [](const Getter &) { return i18n("Meta+T opens Plasma's tile editor."); };
    m_defs << tiles;

    Row actions{QStringLiteral("windowActions"), i18nc("@title", "Moving a window with Meta"),
                i18n("Meta and a drag move a window and focus it, as in i3."),
                i18n("kwin-i3's mouse uses Meta for every drag. In System Settings: Window Management > Window Behavior > Window Actions."),
                {}, false,
                {mb(QStringLiteral("CommandAllKey"), QStringLiteral("Meta")), mb(QStringLiteral("CommandAll1"), QStringLiteral("Activate, raise and move"))},
                nullptr, nullptr};
    actions.plasma = [ch = actions.changes](const Getter &g) {
        const QString key = g(ch[0]), a = g(ch[1]);
        if (key != QLatin1String("Meta"))
            return i18nc("a modifier key", "%1 and a drag move a window; Meta does nothing.", key);
        return a == QLatin1String("Move") ? i18n("Meta and a drag move a window without focusing it.")
             : a == QLatin1String("Activate, raise and move") ? i18n("Meta and a drag move a window and focus it.")
                                                               : i18nc("an action", "Meta and a drag: %1.", a);
    };
    m_defs << actions;

    Row keysRow{QStringLiteral("keys"), i18nc("@title", "kwin-i3's keys"),
                i18n("These keys run kwin-i3's commands; each Plasma shortcut keeps its other keys."),
                i18n("A key two shortcuts share runs only one of them."),
                {}, false, {}, nullptr, nullptr};
    keysRow.plasma = [this](const Getter &) {
        const auto c = clashes();
        QStringList out;
        for (const auto &[code, h] : c)
            out << i18nc("key: the Plasma shortcut it runs", "%1: %2", QKeySequence(code).toString(QKeySequence::NativeText), h.friendly);
        const QString list = out.size() > 4 ? i18nc("first four, then a count", "%1; and %2 more", out.mid(0, 4).join(QStringLiteral("; ")), out.size() - 4)
                                            : out.join(QStringLiteral("; "));
        return i18np("1 of kwin-i3's keys runs a Plasma shortcut instead: %2.", "%1 of kwin-i3's keys run Plasma shortcuts instead: %2.", c.size(), list);
    };
    m_defs << keysRow;

    Row anim{QStringLiteral("animations"), i18nc("@title", "Animations"),
             i18n("No animations, as in i3, which has none."),
             i18n("This is for every app, not windows alone. In System Settings: Quick Settings > Animation speed."),
             {}, true, {Change{QStringLiteral("kdeglobals"), QStringLiteral("KDE"), QStringLiteral("AnimationDurationFactor"), QStringLiteral("0")}},
             nullptr, nullptr};
    anim.plasma = [ch = anim.changes](const Getter &g) {
        const double f = g(ch[0]).toDouble();
        return f == 0 ? i18n("No animations.") : i18n("Windows and controls animate as they open, close and move.");
    };
    m_defs << anim;

    for (Row &r : m_defs)
        if (r.id == QLatin1String("focusStealing"))
            r.shown = [this, ch = r.changes]() { return effective(ch[0]).toInt() > 1; };
}

QString SetupModel::before(const Change &c) const
{
    // A key kwin-i3 didn't change had its value already.
    const QJsonObject e = readSave().value(idOf(c)).toObject();
    if (e.isEmpty())
        return effective(c);
    const QJsonValue old = e.value(QStringLiteral("old"));
    return old.isString() ? old.toString() : stock(c);
}

QString SetupModel::effective(const Change &c) const
{
    const KConfigGroup g = groupOf(c);
    return g.hasKey(c.key) ? g.readEntry(c.key, QString()) : stock(c);
}

QList<std::pair<int, KeyHolder>> SetupModel::clashes() const
{
    QList<std::pair<int, KeyHolder>> out;
    for (int code : m_keys->currentKeys()) {
        const KeyHolder h = keyHolder(code);
        if (!h.component.isEmpty() && componentActive(h.component))
            out.append({code, h});
    }
    return out;
}

bool SetupModel::differs(const Row &r) const
{
    if (r.id == QLatin1String("tileEditor")) {
        const KeyHolder h = keyHolder(MetaT);
        return h.component + QLatin1Char('|') + h.action == TileEditor;
    }
    if (r.id == QLatin1String("keys"))
        return m_keys->available() && !clashes().isEmpty();
    return std::any_of(r.changes.begin(), r.changes.end(), [this](const Change &c) { return effective(c) != c.value; });
}

bool SetupModel::changedByUs(const Row &r) const
{
    const QStringList taken = takenIds();
    if (r.id == QLatin1String("tileEditor"))
        return taken.contains(TileEditor);
    if (r.id == QLatin1String("keys"))
        return std::any_of(taken.begin(), taken.end(), [](const QString &id) { return id != TileEditor; });
    const QJsonObject save = readSave();
    return std::any_of(r.changes.begin(), r.changes.end(), [&save](const Change &c) { return save.contains(idOf(c)); });
}

void SetupModel::load()
{
    m_rows.clear();
    m_needed = false;
    m_initial.clear();
    for (const Row &r : m_defs) {
        const bool d = differs(r), c = changedByUs(r);
        if (!c && (!d || (r.shown && !r.shown())))
            continue;
        m_needed = m_needed || (d && !r.optional && r.id != QLatin1String("keys"));
        m_initial[r.id] = !d;
        const Getter now = [this](const Change &ch) { return effective(ch); };
        const Getter was = [this](const Change &ch) { return before(ch); };
        // Plasma's default where every value is its stock one (a shortcut row has no such tag).
        QString status;
        if (!r.changes.isEmpty())
            status = std::all_of(r.changes.begin(), r.changes.end(), [this](const Change &ch) { return effective(ch) == stock(ch); })
                ? QStringLiteral("default") : QStringLiteral("changed");
        const QString earlier = r.id == QLatin1String("keys")         ? i18n("These keys ran Plasma's shortcuts.")
                              : r.id == QLatin1String("tileEditor")   ? i18n("Meta+T opened Plasma's tile editor.")
                                                                      : r.plasma(was);
        m_rows << QVariantMap{{QStringLiteral("id"), r.id},         {QStringLiteral("title"), r.title},
                              {QStringLiteral("plasma"), d ? r.plasma(now) : QString()},
                              {QStringLiteral("status"), status},   {QStringLiteral("kwini3"), r.kwini3},
                              {QStringLiteral("why"), r.why},       {QStringLiteral("note"), r.note},
                              {QStringLiteral("optional"), r.optional}, {QStringLiteral("differs"), d},
                              {QStringLiteral("changed"), c},       {QStringLiteral("before"), c ? earlier : QString()}};
    }
    m_wanted = m_initial;
    Q_EMIT changed();
    Q_EMIT edited();
}

void SetupModel::setWanted(const QString &id, bool on)
{
    if (m_wanted.value(id) == QVariant(on))
        return;
    m_wanted[id] = on;
    Q_EMIT changed();
    Q_EMIT edited();
}

void SetupModel::defaults()
{
    for (const QVariant &v : std::as_const(m_rows)) {
        const QVariantMap row = v.toMap();
        if (!row.value(QStringLiteral("optional")).toBool())
            m_wanted[row.value(QStringLiteral("id")).toString()] = true;
    }
    Q_EMIT changed();
    Q_EMIT edited();
}

bool SetupModel::isDefaults() const
{
    for (const QVariant &v : m_rows) {
        const QVariantMap row = v.toMap();
        if (!row.value(QStringLiteral("optional")).toBool() && !m_wanted.value(row.value(QStringLiteral("id")).toString()).toBool())
            return false;
    }
    return true;
}

void SetupModel::save()
{
    if (!isSaveNeeded())
        return;
    QStringList failed;
    int unreachable = 0;
    for (const Row &r : m_defs) {
        if (!m_wanted.contains(r.id) || m_wanted.value(r.id) == m_initial.value(r.id))
            continue;
        if (m_wanted.value(r.id).toBool())
            failed << applyRow(r);
        else if (changedByUs(r))
            unreachable += giveBackRow(r);
    }
    reconfigure();
    QStringList errors;
    if (!failed.isEmpty())
        errors << i18n("These could not be changed: %1.", failed.join(QStringLiteral(", ")));
    if (unreachable)
        errors << i18np("1 shortcut couldn't be reached; it stays saved.", "%1 shortcuts couldn't be reached; they stay saved.", unreachable);
    m_error = errors.join(QLatin1Char(' '));
    m_keys->load();
    load();
}

void SetupModel::reconfigure() const
{
    QDBusConnection::sessionBus().call(QDBusMessage::createMethodCall(QStringLiteral("org.kde.KWin"), QStringLiteral("/KWin"),
                                                                      QStringLiteral("org.kde.KWin"), QStringLiteral("reconfigure")));
}

// kwin-i3's value for one row; returns what failed.
QStringList SetupModel::applyRow(const Row &r)
{
    QStringList failed;
    if (r.id == QLatin1String("tileEditor")) {
        if (differs(r) && !takeKey(keyHolder(MetaT), MetaT))
            failed << r.title;
        return failed;
    }
    if (r.id == QLatin1String("keys")) {
        // A key several shortcuts hold is taken from each in turn, until kwin-i3's fires.
        for (const auto &[code, first] : clashes()) {
            KeyHolder h = first;
            for (int i = 0; i < 5 && !h.component.isEmpty() && componentActive(h.component); ++i) {
                if (!takeKey(h, code)) {
                    failed << QKeySequence(code).toString(QKeySequence::NativeText);
                    break;
                }
                h = keyHolder(code);
            }
        }
        return failed;
    }
    for (const Change &c : r.changes) {
        if (effective(c) == c.value)
            continue;
        // Saved before the change, so a failure loses nothing; an earlier save of the same key
        // keeps its old value (the user's), as make take-keys keeps its first.
        QJsonObject save = readSave();
        QJsonObject e = save.value(idOf(c)).toObject();
        if (e.isEmpty())
            e = QJsonObject{{QStringLiteral("file"), c.file}, {QStringLiteral("group"), c.group}, {QStringLiteral("key"), c.key},
                            {QStringLiteral("old"), raw(c)}};
        e[QStringLiteral("set")] = c.value;
        save[idOf(c)] = e;
        if (!writeSave(save)) {
            failed << r.title;
            break;
        }
        write(c, c.value);
    }
    return failed;
}

// Plasma's value back for one row, where Plasma still has what kwin-i3 wrote (a change made since
// is the user's, and stays); returns how many shortcuts couldn't be reached.
int SetupModel::giveBackRow(const Row &r)
{
    if (r.id == QLatin1String("tileEditor"))
        return giveBackKeys([](const QString &k) { return k == TileEditor; });
    if (r.id == QLatin1String("keys"))
        return giveBackKeys([](const QString &k) { return k != TileEditor; });
    QJsonObject save = readSave();
    for (const Change &c : r.changes) {
        const QJsonObject e = save.value(idOf(c)).toObject();
        if (e.isEmpty())
            continue;
        if (raw(c) == e[QStringLiteral("set")])
            write(c, e[QStringLiteral("old")]);
        save.remove(idOf(c));
    }
    writeSave(save);
    return 0;
}
