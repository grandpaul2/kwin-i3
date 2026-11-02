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
    return d.captured(1);
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
    const auto on = [](const QString &v) { return v == QLatin1String("true"); };

    m_defs << Row{QStringLiteral("focus"),
                  i18nc("@option:check", "Focus follows the mouse at once"),
                  i18nc("@info", "The window under the pointer takes the focus, with no delay, and a closed window's focus goes to the one under the pointer. Plasma's Window Behavior > Focus. i3: <code>focus_follows_mouse yes</code>"),
                  {}, false,
                  {w(QStringLiteral("FocusPolicy"), QStringLiteral("FocusFollowsMouse")),
                   w(QStringLiteral("DelayFocusInterval"), QStringLiteral("0")),
                   w(QStringLiteral("NextFocusPrefersMouse"), QStringLiteral("true"))},
                  nullptr, nullptr};
    m_defs << Row{QStringLiteral("perOutput"),
                  i18nc("@option:check", "Switch workspaces on each screen alone"),
                  i18nc("@info", "Each screen shows its own workspace, as in i3, where a workspace lives on one screen. Plasma's Virtual Desktops page."),
                  i18nc("@info", "Giving this back puts every screen on the same workspace."), false,
                  {w(QStringLiteral("PerOutputVirtualDesktops"), QStringLiteral("true"))}, nullptr, nullptr};
    m_defs << Row{QStringLiteral("focusStealing"),
                  i18nc("@option:check", "Let new windows take the focus"),
                  i18nc("@info", "Focus stealing prevention above Low keeps a new window from taking the focus. Plasma's Window Behavior > Focus. i3: <code>focus_on_window_activation</code>"),
                  {}, false,
                  {w(QStringLiteral("FocusStealingPreventionLevel"), QStringLiteral("1"))}, nullptr, nullptr};
    m_defs << Row{QStringLiteral("edges"),
                  i18nc("@option:check", "Keep windows untiled at screen edges"),
                  i18nc("@info", "Plasma tiles or maximizes a window dragged to a screen edge, outside kwin-i3's layout. Plasma's Window Management > Screen Edges. Shift held as a drag ends does the same, and has no setting."),
                  {}, false,
                  {w(QStringLiteral("ElectricBorderTiling"), QStringLiteral("false")),
                   w(QStringLiteral("ElectricBorderMaximize"), QStringLiteral("false"))},
                  nullptr, nullptr};
    m_defs << Row{QStringLiteral("tileEditor"),
                  i18nc("@option:check", "Free Meta+T from the tile editor"),
                  i18nc("@info", "Plasma's tile editor changes the tiles kwin-i3 lays out. Plasma's Shortcuts, KWin, Toggle Tiles Editor."),
                  {}, false, {}, nullptr, nullptr};
    m_defs << Row{QStringLiteral("windowActions"),
                  i18nc("@option:check", "Focus a window moved with Meta"),
                  i18nc("@info", "Meta and a drag move a floating window and focus it, as i3 does. Plasma's Window Behavior > Window Actions."),
                  {}, false,
                  {Change{QStringLiteral("kwinrc"), QStringLiteral("MouseBindings"), QStringLiteral("CommandAllKey"), QStringLiteral("Meta")},
                   Change{QStringLiteral("kwinrc"), QStringLiteral("MouseBindings"), QStringLiteral("CommandAll1"), QStringLiteral("Activate, raise and move")}},
                  nullptr, nullptr};
    m_defs << Row{QStringLiteral("keys"),
                  i18nc("@option:check", "Take kwin-i3's keys from other shortcuts"),
                  i18nc("@info", "A key two shortcuts share runs the other one. Each is taken from that shortcut alone; Configure Keys… takes them one by one instead."),
                  {}, false, {}, nullptr, nullptr};
    m_defs << Row{QStringLiteral("animations"),
                  i18nc("@option:check", "Turn off animations"),
                  i18nc("@info", "i3 has none. Plasma's Quick Settings > Animation speed, for every app."),
                  {}, true,
                  {Change{QStringLiteral("kdeglobals"), QStringLiteral("KDE"), QStringLiteral("AnimationDurationFactor"), QStringLiteral("0")}},
                  nullptr, nullptr};

    for (Row &r : m_defs) {
        if (r.id == QLatin1String("focus"))
            r.now = [this, ch = r.changes]() {
                const QString p = effective(ch[0]);
                const QString name = p == QLatin1String("FocusFollowsMouse") ? i18n("Focus follows mouse")
                    : p == QLatin1String("FocusUnderMouse")                   ? i18n("Focus under mouse")
                    : p == QLatin1String("FocusStrictlyUnderMouse")           ? i18n("Focus strictly under mouse")
                                                                              : i18n("Click to focus");
                return p == QLatin1String("ClickToFocus") ? name : i18nc("policy, delay", "%1, after %2 ms", name, effective(ch[1]));
            };
        else if (r.id == QLatin1String("perOutput"))
            r.now = [this, ch = r.changes, on]() { return on(effective(ch[0])) ? i18n("each screen alone") : i18n("every screen together"); };
        else if (r.id == QLatin1String("focusStealing")) {
            r.now = [this, ch = r.changes]() {
                const QStringList names{i18n("None"), i18n("Low"), i18n("Medium"), i18n("High"), i18n("Extreme")};
                return names.value(effective(ch[0]).toInt(), effective(ch[0]));
            };
            r.shown = [this, ch = r.changes]() { return effective(ch[0]).toInt() > 1; };
        } else if (r.id == QLatin1String("edges"))
            r.now = [this, ch = r.changes, on]() {
                const bool t = on(effective(ch[0])), m = on(effective(ch[1]));
                return t && m ? i18n("tiles and maximizes") : t ? i18n("tiles") : m ? i18n("maximizes") : i18n("neither");
            };
        else if (r.id == QLatin1String("tileEditor"))
            r.now = []() { return i18n("Meta+T opens the tile editor"); };
        else if (r.id == QLatin1String("windowActions"))
            r.now = [this, ch = r.changes]() { return i18nc("modifier, action", "%1 and drag: %2", effective(ch[0]), effective(ch[1])); };
        else if (r.id == QLatin1String("keys"))
            r.now = [this]() {
                QStringList out;
                for (const auto &[code, h] : clashes())
                    out << i18nc("key: shortcut", "%1: %2", QKeySequence(code).toString(QKeySequence::NativeText), h.friendly);
                return out.size() > 3 ? i18nc("first three, then a count", "%1 and %2 more", out.mid(0, 3).join(QStringLiteral(", ")), out.size() - 3)
                                      : out.join(QStringLiteral(", "));
            };
        else if (r.id == QLatin1String("animations"))
            r.now = [this, ch = r.changes]() { return i18nc("animation speed factor", "speed ×%1", effective(ch[0])); };
    }
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
    m_anyChanged = false;
    for (const Row &r : m_defs) {
        const bool d = differs(r), c = changedByUs(r);
        if (!c && (!d || (r.shown && !r.shown())))
            continue;
        m_needed = m_needed || (d && !r.optional);
        m_anyChanged = m_anyChanged || c;
        m_rows << QVariantMap{{QStringLiteral("id"), r.id},       {QStringLiteral("label"), r.label}, {QStringLiteral("help"), r.help},
                              {QStringLiteral("note"), r.note},   {QStringLiteral("now"), r.now()},   {QStringLiteral("optional"), r.optional},
                              {QStringLiteral("differs"), d},     {QStringLiteral("changed"), c}};
    }
    Q_EMIT changed();
}

void SetupModel::reconfigure() const
{
    QDBusConnection::sessionBus().call(QDBusMessage::createMethodCall(QStringLiteral("org.kde.KWin"), QStringLiteral("/KWin"),
                                                                      QStringLiteral("org.kde.KWin"), QStringLiteral("reconfigure")));
}

void SetupModel::apply(const QStringList &ids)
{
    QStringList failed;
    for (const Row &r : m_defs) {
        if (!ids.contains(r.id))
            continue;
        if (r.id == QLatin1String("tileEditor")) {
            if (differs(r) && !takeKey(keyHolder(MetaT), MetaT))
                failed << r.label;
            continue;
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
            continue;
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
                failed << r.label;
                break;
            }
            write(c, c.value);
        }
    }
    reconfigure();
    m_error = failed.isEmpty() ? QString() : i18n("These could not be changed: %1.", failed.join(QStringLiteral(", ")));
    m_keys->load();
    load();
}

void SetupModel::giveBack(const QString &id)
{
    int unreachable = 0;
    for (const Row &r : m_defs) {
        if (r.id != id)
            continue;
        if (r.id == QLatin1String("tileEditor"))
            unreachable += giveBackKeys([](const QString &k) { return k == TileEditor; });
        else if (r.id == QLatin1String("keys"))
            unreachable += giveBackKeys([](const QString &k) { return k != TileEditor; });
        else {
            QJsonObject save = readSave();
            for (const Change &c : r.changes) {
                const QJsonObject e = save.value(idOf(c)).toObject();
                if (e.isEmpty())
                    continue;
                // Only where Plasma still has what kwin-i3 wrote: a change made since is the user's.
                if (raw(c) == e[QStringLiteral("set")])
                    write(c, e[QStringLiteral("old")]);
                save.remove(idOf(c));
            }
            writeSave(save);
        }
    }
    reconfigure();
    m_error = unreachable ? i18np("1 shortcut couldn't be reached; it stays saved.", "%1 shortcuts couldn't be reached; they stay saved.", unreachable) : QString();
    m_keys->load();
    load();
}

void SetupModel::giveBackAll()
{
    for (const Row &r : m_defs)
        if (changedByUs(r))
            giveBack(r.id);
}
