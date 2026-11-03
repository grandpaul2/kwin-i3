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
    if (!c.stock.isEmpty())
        return c.stock;
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
    // The Plasma column's line: "Plasma: " and the value in the words of Plasma's own settings, so
    // it can be found there; what the setting does is in the row's help
    // (docs/style-settings-page.md, "Saying what to pick").
    const auto said = [](const QString &v) { return i18nc("@info Plasma's value for a setting, in Plasma's own words", "Plasma: %1", v); };
    Row focus{QStringLiteral("focus"), i18nc("@option:check", "Focus follows the mouse"),
              {},
              i18n("The window under the pointer takes the focus at once, and when a window closes, the one under the pointer takes it, as in i3. Plasma's setting: Window Management > Window Behavior > Focus, \"Focus follows mouse (mouse precedence)\" with no delay."),
              {}, false,
              {w(QStringLiteral("FocusPolicy"), QStringLiteral("FocusFollowsMouse")), w(QStringLiteral("DelayFocusInterval"), QStringLiteral("0")),
               w(QStringLiteral("NextFocusPrefersMouse"), QStringLiteral("true"))},
              nullptr};
    // Plasma's six focus policies: FocusPolicy, with NextFocusPrefersMouse as "(mouse precedence)"
    // on the first two; a delay for all but click to focus.
    focus.plasma = [ch = focus.changes, on, said](const Getter &g) {
        const QString p = g(ch[0]);
        const bool prec = on(g(ch[2]));
        if (p == QLatin1String("ClickToFocus"))
            return said(prec ? i18nc("@item Plasma's focus policy", "Click to focus (mouse precedence)") : i18nc("@item Plasma's focus policy", "Click to focus"));
        const QString name = p == QLatin1String("FocusUnderMouse")           ? i18nc("@item Plasma's focus policy", "Focus under mouse")
                           : p == QLatin1String("FocusStrictlyUnderMouse")   ? i18nc("@item Plasma's focus policy", "Focus strictly under mouse")
                           : prec ? i18nc("@item Plasma's focus policy", "Focus follows mouse (mouse precedence)")
                                  : i18nc("@item Plasma's focus policy", "Focus follows mouse");
        const int delay = g(ch[1]).toInt();
        return said(delay ? i18nc("a focus policy, then its delay", "%1, %2 ms delay", name, delay) : name);
    };
    m_defs << focus;

    Row perOutput{QStringLiteral("perOutput"), i18nc("@option:check", "Switch workspaces independently for each screen"),
                  {},
                  i18n("In i3 a workspace lives on one screen; switching every screen together puts windows on the wrong one. Turned off, every screen is put on the same workspace. Plasma's setting: Virtual Desktops, \"Switch desktops independently for each screen\"."),
                  {}, false,
                  {w(QStringLiteral("PerOutputVirtualDesktops"), QStringLiteral("true"))}, nullptr};
    perOutput.plasma = [ch = perOutput.changes, on, said](const Getter &g) {
        return said(on(g(ch[0])) ? i18nc("@item a setting's state", "On") : i18nc("@item a setting's state", "Off"));
    };
    m_defs << perOutput;

    Row stealing{QStringLiteral("focusStealing"), i18nc("@option:check", "Let new windows take the focus"),
                 {},
                 i18n("A new window takes the focus, as in i3. Plasma's setting: Window Management > Window Behavior > Focus, \"Focus stealing prevention\" at Low."),
                 {}, false, {Change{QStringLiteral("kwinrc"), QStringLiteral("Windows"), QStringLiteral("FocusStealingPreventionLevel"), QStringLiteral("1"), {}, QStringLiteral("2")}}, nullptr};
    stealing.plasma = [ch = stealing.changes, said](const Getter &g) {
        const QStringList names{i18n("None"), i18n("Low"), i18n("Medium"), i18n("High"), i18n("Extreme")};
        return said(i18nc("@item a level", "Focus stealing prevention %1", names.value(g(ch[0]).toInt())));
    };
    m_defs << stealing;

    Row edges{QStringLiteral("edges"), i18nc("@option:check", "Drop windows at screen edges without tiling them"),
              {},
              i18n("Plasma's edge tiling places a window outside kwin-i3's layout. Holding Shift as a drag ends does the same, and no setting turns that off. Plasma's setting: Window Management > Screen Edges."),
              {}, false,
              {w(QStringLiteral("ElectricBorderTiling"), QStringLiteral("false")), w(QStringLiteral("ElectricBorderMaximize"), QStringLiteral("false"))},
              nullptr};
    edges.plasma = [ch = edges.changes, on, said](const Getter &g) {
        const bool t = on(g(ch[0])), m = on(g(ch[1]));
        return said(t && m ? i18nc("@item screen edges", "Tile and maximize")
                  : t      ? i18nc("@item screen edges", "Tile")
                  : m      ? i18nc("@item screen edges", "Maximize")
                           : i18nc("@item screen edges", "Neither"));
    };
    m_defs << edges;

    Row tiles{QStringLiteral("tileEditor"), i18nc("@option:check", "Free Meta+T from Plasma's tile editor"),
              {},
              i18n("Plasma's tile editor changes the tiles kwin-i3 lays out. Plasma's shortcut: Keyboard > Shortcuts, Window Management, \"Toggle Tiles Editor\"."),
              {}, false, {}, nullptr};
    tiles.plasma = [said](const Getter &) { return said(i18nc("@item a shortcut", "Meta+T opens Edit Tiles")); };
    m_defs << tiles;

    Row actions{QStringLiteral("windowActions"), i18nc("@option:check", "Meta and a drag focus the window they move"),
                {},
                i18n("Meta and a drag move a floating window and focus it, as in i3. Plasma's setting: Window Management > Window Behavior > Window Actions."),
                {}, false,
                {mb(QStringLiteral("CommandAllKey"), QStringLiteral("Meta")), Change{QStringLiteral("kwinrc"), QStringLiteral("MouseBindings"), QStringLiteral("CommandAll1"), QStringLiteral("Activate, raise and move"), {}, QStringLiteral("Move")}},
                nullptr};
    // The modifier and the left button's action, as Plasma's Window Actions names them.
    actions.plasma = [ch = actions.changes, said](const Getter &g) {
        return said(i18nc("a modifier key, then Plasma's action for it and a left drag", "%1 + drag: %2", g(ch[0]), g(ch[1])));
    };
    m_defs << actions;

    // The key override (keysOverride, a setting of kwin-i3's own, written by the page's settings,
    // not by this model): described here as one of Plasma's rows, since what it decides is
    // whether Plasma's shortcuts keep the keys they share with kwin-i3. Plasma's shortcuts are
    // never changed (plugin/keyoverride.h).
    Row keysRow{QStringLiteral("keys"), i18nc("@option:check", "On a key conflict, kwin-i3's key wins"),
                {},
                i18n("A key that a kwin-i3 command and a Plasma shortcut share runs only one of them. Ticked, kwin-i3's command runs; unticked, Plasma's. Plasma's shortcuts are not changed either way, and the override needs kwin-i3's plugins."),
                i18n("A key Plasma also uses runs Plasma's shortcut unless this is ticked."), false, {}, nullptr};
    keysRow.plasma = [this](const Getter &) {
        const auto c = clashes();
        QStringList out;
        for (const auto &[code, h] : c)
            out << i18nc("key: the Plasma shortcut it runs", "%1: %2", QKeySequence(code).toString(QKeySequence::NativeText), h.friendly);
        const QString list = out.size() > 4 ? i18nc("first four, then a count", "%1; and %2 more", out.mid(0, 4).join(QStringLiteral("; ")), out.size() - 4)
                                            : out.join(QStringLiteral("; "));
        return c.isEmpty() ? i18n("No Plasma shortcut shares a key with kwin-i3.")
                           : i18np("1 shared key runs Plasma's shortcut: %2.", "%1 shared keys run Plasma's shortcuts: %2.", c.size(), list);
    };
    m_defs << keysRow;

    // The window animations of Plasma's Animations page (KWin 6.7.5 src/kcms/animations: Window
    // open/close, maximize, minimize, full screen, virtual desktop switching), each set to None:
    // every effect of its group off (the effects' X-KWin-Exclusive-Category), the stock ones first.
    // Other animations, and the global speed, stay as they are.
    const auto fx = [](const QString &effect, bool onByDefault) {
        return Change{QStringLiteral("kwinrc"), QStringLiteral("Plugins"), effect + QStringLiteral("Enabled"), QStringLiteral("false"),
                      onByDefault ? QStringLiteral("true") : QStringLiteral("false")};
    };
    Row anim{QStringLiteral("animations"), i18nc("@option:check", "Set window animations to none"),
             {},
             i18n("Opening and closing, maximizing, minimizing, full screen and virtual desktop switching, each set to None, as i3 has none. Other animations and the animation speed stay as they are. Plasma's setting: Animations, Desktop animations."),
             {}, true,
             {fx(QStringLiteral("scale"), true), fx(QStringLiteral("glide"), false), fx(QStringLiteral("fade"), false),
              fx(QStringLiteral("maximize"), true), fx(QStringLiteral("squash"), true), fx(QStringLiteral("magiclamp"), false),
              fx(QStringLiteral("fullscreen"), true), fx(QStringLiteral("slide"), true), fx(QStringLiteral("fadedesktop"), false)},
             nullptr};
    anim.plasma = [ch = anim.changes, said](const Getter &g) {
        const auto on = [&](int i) { return g(ch[i]) == QLatin1String("true"); };
        QStringList what;
        if (on(0) || on(1) || on(2))
            what << i18nc("@item an animation, in a list", "Open/close");
        if (on(3))
            what << i18nc("@item an animation, in a list", "Maximize");
        if (on(4) || on(5))
            what << i18nc("@item an animation, in a list", "Minimize");
        if (on(6))
            what << i18nc("@item an animation, in a list", "Full screen");
        if (on(7) || on(8))
            what << i18nc("@item an animation, in a list", "Desktop switching");
        return said(what.isEmpty() ? i18nc("@item no animations", "None") : what.join(QStringLiteral(", ")));
    };
    m_defs << anim;

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

// The value of a key on Plasma's side of a row: Plasma's stock value, or where that is kwin-i3's
// own, the row's named other (empty: the key is left as it is).
QString SetupModel::plasmaSide(const Change &c) const
{
    const QString s = stock(c);
    return s != c.value ? s : c.other;
}

// A row moved to Plasma's side with nothing kwin-i3 saved to give back: each key to its Plasma
// value (stock: the key removed). Nothing is saved: the reader chose Plasma's way, so there is
// nothing for kwin-i3 to give back, and choosing kwin-i3 again saves this value as the one to
// return to.
void SetupModel::setPlasmaSide(const Row &r)
{
    if (r.id == QLatin1String("keys"))
        return;                 // the page's settings write keysOverride
    if (r.id == QLatin1String("tileEditor")) {
        restoreKeyDefault(QStringLiteral("kwin"), QStringLiteral("Edit Tiles"), int(Qt::META) | Qt::Key_T);
        return;
    }
    for (const Change &c : r.changes) {
        const QString p = plasmaSide(c);
        if (p.isEmpty() || effective(c) == p)
            continue;
        write(c, p == stock(c) ? QJsonValue(QJsonValue::Null) : QJsonValue(p));
    }
}

// The key override as kwinrc has it now (the page's settings write it).
bool SetupModel::keysOverride() const
{
    auto config = KSharedConfig::openConfig(QStringLiteral("kwinrc"));
    config->reparseConfiguration();
    return KConfigGroup(config, QStringLiteral("Script-kwin-i3")).readEntry("keysOverride", false);
}

QString SetupModel::effective(const Change &c) const
{
    const KConfigGroup g = groupOf(c);
    return g.hasKey(c.key) ? g.readEntry(c.key, QString()) : stock(c);
}

// A holder that launches what kwin-i3's action launches: KRunner's own on the Launcher's key, the
// default terminal's on the Terminal's. Both fire the same thing, so it is no clash (as the load
// report's TAKEN-SAME, src/kwin.js sameLaunch).
static bool sameLaunch(const QString &action, const KeyHolder &h)
{
    if (h.action != QLatin1String("_launch"))
        return false;
    if (action == QLatin1String("kwin-i3 Launcher"))
        return h.component.contains(QLatin1String("krunner"));
    if (action == QLatin1String("kwin-i3 Terminal")) {
        const QString terminal = KConfigGroup(KSharedConfig::openConfig(QStringLiteral("kdeglobals")), QStringLiteral("General"))
                                     .readEntry("TerminalService", QStringLiteral("org.kde.konsole.desktop"));
        return h.component == terminal;
    }
    return false;
}

QList<std::pair<int, KeyHolder>> SetupModel::clashes() const
{
    QList<std::pair<int, KeyHolder>> out;
    for (const auto &[code, action] : m_keys->currentKeys()) {
        const KeyHolder h = keyHolder(code);
        if (!h.component.isEmpty() && !sameLaunch(action, h) && componentActive(h.component))
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
    if (r.id == QLatin1String("keys"))      // off, with a key shared: Plasma's shortcut runs it
        return !keysOverride() && m_keys->available() && !clashes().isEmpty();
    return std::any_of(r.changes.begin(), r.changes.end(), [this](const Change &c) { return effective(c) != c.value; });
}

bool SetupModel::changedByUs(const Row &r) const
{
    const QStringList taken = takenIds();
    if (r.id == QLatin1String("tileEditor"))
        return taken.contains(TileEditor);
    if (r.id == QLatin1String("keys"))
        return keysOverride();      // on: there is a Plasma side to go back to
    const QJsonObject save = readSave();
    return std::any_of(r.changes.begin(), r.changes.end(), [&save](const Change &c) { return save.contains(idOf(c)); });
}

void SetupModel::load()
{
    m_rows.clear();
    m_needed = false;
    m_initial.clear();
    for (const Row &r : m_defs) {
        // Every row is shown, as KDE's rule is disabled, not hidden: one Plasma already matches and
        // kwin-i3 didn't change ("settled") is ticked and disabled, with nothing to give back.
        const bool d = differs(r), c = changedByUs(r);
        m_needed = m_needed || (d && !r.optional);
        m_initial[r.id] = !d;
        const Getter now = [this](const Change &ch) { return effective(ch); };
        const Getter was = [this](const Change &ch) { return before(ch); };
        // Plasma's default where every value is its stock one (a shortcut row has no such tag).
        QString status;
        if (!r.changes.isEmpty())
            status = std::all_of(r.changes.begin(), r.changes.end(), [this](const Change &ch) { return effective(ch) == stock(ch); })
                ? QStringLiteral("default") : QStringLiteral("changed");
        const Getter plasmaG = [this](const Change &ch) { const QString p = plasmaSide(ch); return p.isEmpty() ? effective(ch) : p; };
        const QString earlier = r.plasma(was);
        m_rows << QVariantMap{{QStringLiteral("id"), r.id},         {QStringLiteral("title"), r.title},
                              {QStringLiteral("plasma"), d ? r.plasma(now) : QString()},
                              {QStringLiteral("status"), status},   {QStringLiteral("kwini3"), r.kwini3},
                              {QStringLiteral("why"), r.why},       {QStringLiteral("note"), r.note},
                              {QStringLiteral("optional"), r.optional}, {QStringLiteral("differs"), d},
                              {QStringLiteral("changed"), c},       {QStringLiteral("before"), c ? earlier : QString()},
                              {QStringLiteral("settled"), !d && !c},
                              // What the Plasma column means for this row: Plasma's current way where
                              // it differs, else what choosing Plasma brings back.
                              {QStringLiteral("plasmaSide"), d ? r.plasma(now) : c ? earlier : r.plasma(plasmaG)}};
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

void SetupModel::pickKwinI3()
{
    for (const QVariant &v : std::as_const(m_rows)) {
        const QVariantMap row = v.toMap();
        if (!row.value(QStringLiteral("optional")).toBool() && row.value(QStringLiteral("id")) != QLatin1String("keys"))
            m_wanted[row.value(QStringLiteral("id")).toString()] = true;
    }
    Q_EMIT changed();
    Q_EMIT edited();
}

// A row kwin-i3 changed goes back to Plasma; one it didn't change is Plasma's already, whichever
// column it shows (a setting that happens to be kwin-i3's value is the reader's own).
void SetupModel::givePlasmaBack()
{
    for (const QVariant &v : std::as_const(m_rows)) {
        const QVariantMap row = v.toMap();
        const QString id = row.value(QStringLiteral("id")).toString();
        if (id != QLatin1String("keys"))
            m_wanted[id] = row.value(QStringLiteral("changed")).toBool() ? false : m_initial.value(id);
    }
    Q_EMIT changed();
    Q_EMIT edited();
}

bool SetupModel::isPlasmaBack() const
{
    for (const QVariant &v : m_rows) {
        const QVariantMap row = v.toMap();
        const QString id = row.value(QStringLiteral("id")).toString();
        if (id == QLatin1String("keys"))
            continue;
        const QVariant want = row.value(QStringLiteral("changed")).toBool() ? QVariant(false) : m_initial.value(id);
        if (m_wanted.value(id) != want)
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
            unreachable += giveBackRow(r);       // what the reader had before kwin-i3 changed it
        else
            setPlasmaSide(r);
    }
    reconfigure();
    // KWin's reconfigure loads an effect turned on but doesn't unload one turned off: unloaded
    // here, as Plasma's Animations page does through the same interface.
    for (const Row &r : m_defs)
        for (const Change &c : r.changes)
            if (c.group == QLatin1String("Plugins") && effective(c) == QLatin1String("false")) {
                auto msg = QDBusMessage::createMethodCall(QStringLiteral("org.kde.KWin"), QStringLiteral("/Effects"),
                                                          QStringLiteral("org.kde.kwin.Effects"), QStringLiteral("unloadEffect"));
                msg << c.key.chopped(int(qstrlen("Enabled")));
                QDBusConnection::sessionBus().call(msg);
            }
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
    if (r.id == QLatin1String("keys"))
        return failed;          // the page's settings write keysOverride
    for (const Change &c : r.changes) {
        if (effective(c) == c.value)
            continue;
        // Saved before the change, so a failure loses nothing; an earlier save of the same key
        // keeps its old value (the user's), as taken-keys.json keeps its first.
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
        return 0;               // the page's settings write keysOverride
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
