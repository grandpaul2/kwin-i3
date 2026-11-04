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
// changed is read right.
static QString stock(const SetupModel::Change &c)
{
    if (!c.stock.isEmpty())
        return c.stock;
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

SetupModel::SetupModel(QObject *parent)
    : QObject(parent)
{
    const auto w = [](const QString &key, const QString &value) { return Change{QStringLiteral("kwinrc"), QStringLiteral("Windows"), key, value}; };
    const auto on = [](const QString &v) { return v == QLatin1String("true"); };
    // The Plasma column's line: "Plasma: " and the value in the words of Plasma's own settings, so
    // it can be found there; what the setting does is in the row's help
    // (docs/style-settings-page.md, "Saying what to pick").
    const auto said = [](const QString &v) { return i18nc("@info Plasma's value for a setting, in Plasma's own words", "Plasma: %1", v); };
    Row perOutput{QStringLiteral("perOutput"), i18nc("@option:check", "Switch workspaces independently for each screen"),
                  i18n("In i3 a workspace lives on one screen; switching every screen together puts windows on the wrong one. Turned off, every screen is put on the same workspace. Plasma's setting: Virtual Desktops, \"Switch desktops independently for each screen\"."),
                  {}, false,
                  {w(QStringLiteral("PerOutputVirtualDesktops"), QStringLiteral("true"))}, nullptr};
    perOutput.plasma = [ch = perOutput.changes, on, said](const Getter &g) {
        return said(on(g(ch[0])) ? i18nc("@item a setting's state", "On") : i18nc("@item a setting's state", "Off"));
    };
    m_defs << perOutput;

    // The window animations of Plasma's Animations page (KWin 6.7.5 src/kcms/animations: Window
    // open/close, maximize, minimize, full screen, virtual desktop switching), each set to None:
    // every effect of its group off (the effects' X-KWin-Exclusive-Category), the stock ones first.
    // Other animations, and the global speed, stay as they are.
    const auto fx = [](const QString &effect, bool onByDefault) {
        return Change{QStringLiteral("kwinrc"), QStringLiteral("Plugins"), effect + QStringLiteral("Enabled"), QStringLiteral("false"),
                      onByDefault ? QStringLiteral("true") : QStringLiteral("false")};
    };
    Row anim{QStringLiteral("animations"), i18nc("@option:check", "Set window animations to none"),
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
    for (const Change &c : r.changes) {
        const QString p = plasmaSide(c);
        if (p.isEmpty() || effective(c) == p)
            continue;
        write(c, p == stock(c) ? QJsonValue(QJsonValue::Null) : QJsonValue(p));
    }
}

QString SetupModel::effective(const Change &c) const
{
    const KConfigGroup g = groupOf(c);
    return g.hasKey(c.key) ? g.readEntry(c.key, QString()) : stock(c);
}

bool SetupModel::differs(const Row &r) const
{
    return std::any_of(r.changes.begin(), r.changes.end(), [this](const Change &c) { return effective(c) != c.value; });
}

bool SetupModel::changedByUs(const Row &r) const
{
    const QJsonObject save = readSave();
    return std::any_of(r.changes.begin(), r.changes.end(), [&save](const Change &c) { return save.contains(idOf(c)); });
}

void SetupModel::load()
{
    m_rows.clear();
    m_needed = false;
    m_initial.clear();
    for (const Row &r : m_defs) {
        // Every row is shown, as KDE's rule is disabled, not hidden.
        const bool d = differs(r), c = changedByUs(r);
        m_needed = m_needed || (d && !r.optional);
        m_initial[r.id] = !d;
        const Getter now = [this](const Change &ch) { return effective(ch); };
        const Getter was = [this](const Change &ch) { return before(ch); };
        const Getter plasmaG = [this](const Change &ch) { const QString p = plasmaSide(ch); return p.isEmpty() ? effective(ch) : p; };
        const QString earlier = r.plasma(was);
        m_rows << QVariantMap{{QStringLiteral("id"), r.id},         {QStringLiteral("title"), r.title},
                              {QStringLiteral("why"), r.why},       {QStringLiteral("note"), r.note},
                              {QStringLiteral("optional"), r.optional}, {QStringLiteral("changed"), c},
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

// A row kwin-i3 changed goes back to Plasma; one it didn't change is Plasma's already, whichever
// column it shows (a setting that happens to be kwin-i3's value is the reader's own).
void SetupModel::givePlasmaBack(const QString &only)
{
    for (const QVariant &v : std::as_const(m_rows)) {
        const QVariantMap row = v.toMap();
        const QString id = row.value(QStringLiteral("id")).toString();
        if (id != only)
            continue;
        m_wanted[id] = row.value(QStringLiteral("changed")).toBool() ? false : m_initial.value(id);
    }
    Q_EMIT changed();
    Q_EMIT edited();
}

bool SetupModel::isPlasmaBack(const QString &only) const
{
    for (const QVariant &v : m_rows) {
        const QVariantMap row = v.toMap();
        const QString id = row.value(QStringLiteral("id")).toString();
        if (id != only)
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
    for (const Row &r : m_defs) {
        if (!m_wanted.contains(r.id) || m_wanted.value(r.id) == m_initial.value(r.id))
            continue;
        if (m_wanted.value(r.id).toBool())
            failed << applyRow(r);
        else if (changedByUs(r))
            giveBackRow(r);       // what the reader had before kwin-i3 changed it
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
    m_error = failed.isEmpty() ? QString() : i18n("These could not be changed: %1.", failed.join(QStringLiteral(", ")));
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
    for (const Change &c : r.changes) {
        if (effective(c) == c.value)
            continue;
        // Saved before the change, so a failure loses nothing; an earlier save of the same key
        // keeps its old value (the user's).
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
// is the user's, and stays).
void SetupModel::giveBackRow(const Row &r)
{
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
}
