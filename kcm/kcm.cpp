// kcm_kwin_i3: kwin-i3's page in System Settings > Window Management.
// The settings are the script's own (main.xml, kwinrc [Script-kwin-i3]); Apply writes them and
// asks KWin to reconfigure, which reaches the script and the plugins, so it takes effect with or
// without the plugins. The keys are on the Keys tab (keys.cpp).

#include "keys.h"
#include "setup.h"
#include "kwini3settings.h"

#include <KApplicationTrader>
#include <KConfigGroup>
#include <KPluginFactory>
#include <KQuickManagedConfigModule>
#include <KService>
#include <KSharedConfig>

#include <QDBusConnection>
#include <QDBusMessage>
#include <QDBusPendingCall>
#include <QDBusPendingCallWatcher>
#include <QDBusPendingReply>
#include <QDBusVariant>
#include <QMetaProperty>
#include <QQmlEngine>
#include <QRegularExpression>
#include <QTimer>

#include <memory>

// The tabs, in main.qml's order. Defaults resets the tab shown: what is Plasma's back to Plasma,
// what is kwin-i3's to its default (docs/philosophy.md, "How it presents itself").
enum Tab { TilingTab, MouseTab, WorkspacesTab, RulesTab, FrameTab, KeysTab, PlasmaTab };

// Each tab's settings (main.xml). forWindow is two tabs': its workspace rules are Workspaces',
// the rest Window Rules'. debugLog, holdTimeoutMs (internal) and floatingWorkspaces (read into
// rules) are on no tab, so Defaults never touches them.
static QStringList tabKeys(int tab)
{
    switch (tab) {
    case TilingTab:
        return {QStringLiteral("gapsInner"), QStringLiteral("gapsOuter"), QStringLiteral("gapsTop"), QStringLiteral("gapsRight"),
                QStringLiteral("gapsBottom"), QStringLiteral("gapsLeft"), QStringLiteral("smartGaps"), QStringLiteral("workspaceGaps"),
                QStringLiteral("resizeStep"), QStringLiteral("floatingStep"), QStringLiteral("focusWrapping"), QStringLiteral("holdEnabled")};
    case MouseTab:
        return {QStringLiteral("mouseWarping"), QStringLiteral("tilingDrag"), QStringLiteral("popupDuringFullscreen")};
    case WorkspacesTab:
        return {QStringLiteral("workspaceLayout"), QStringLiteral("defaultOrientation"), QStringLiteral("workspaceAutoBackAndForth"),
                QStringLiteral("workspaceOutputs")};
    case RulesTab:
        return {QStringLiteral("assign"), QStringLiteral("floatingMinimumSize"), QStringLiteral("floatingMaximumSize")};
    case FrameTab:
        return {QStringLiteral("tiledLook"), QStringLiteral("frameWidth"), QStringLiteral("frameActive"), QStringLiteral("frameInactive"),
                QStringLiteral("frameIndicatorActive"), QStringLiteral("frameIndicatorInactive"), QStringLiteral("hideEdgeBorders"),
                QStringLiteral("roundedCorners"), QStringLiteral("frameOnFloating")};
    case KeysTab:
        return {QStringLiteral("endSession")};
    case PlasmaTab:
        return {QStringLiteral("keysOverride")};      // off: Plasma's shortcuts keep shared keys
    }
    return {};
}

// The rules of a forWindow text, as ui/settings.js splitRules (and the script's src/rules.js): a
// line or a ';' outside quotes ends a rule; trimmed, empty ones dropped.
static QStringList splitRules(const QString &text)
{
    QStringList out;
    QString cur;
    bool quoted = false;
    for (int i = 0; i < text.size(); ++i) {
        const QChar c = text.at(i);
        if (c == QLatin1Char('\\') && quoted && i + 1 < text.size()) {
            cur += c;
            cur += text.at(++i);
            continue;
        }
        if (c == QLatin1Char('"'))
            quoted = !quoted;
        if (c == QLatin1Char('\n') || c == QLatin1Char('\r')) {
            out << cur;
            cur.clear();
            quoted = false;
            continue;
        }
        if (c == QLatin1Char(';') && !quoted) {
            out << cur;
            cur.clear();
            continue;
        }
        cur += c;
    }
    out << cur;
    QStringList kept;
    for (const QString &r : std::as_const(out))
        if (!r.trimmed().isEmpty())
            kept << r.trimmed();
    return kept;
}

// A workspace's floating rule, the Workspaces tab's (settings.js floatingWorkspaceList).
static bool workspaceRule(const QString &rule)
{
    static const QRegularExpression re(QStringLiteral(R"(^\[workspace="\^[0-9]+\$"\]\s*floating\s+enable$)"));
    return re.match(rule).hasMatch();
}

class KWinI3Kcm : public KQuickManagedConfigModule
{
    Q_OBJECT
    Q_PROPERTY(KWinI3Settings *settings READ settings CONSTANT)
    Q_PROPERTY(KeysModel *keys READ keys CONSTANT)
    Q_PROPERTY(SetupModel *setup READ setup CONSTANT)
    Q_PROPERTY(bool scriptEnabled MEMBER m_scriptEnabled NOTIFY stateChanged)
    Q_PROPERTY(bool scriptLoaded MEMBER m_scriptLoaded NOTIFY stateChanged)
    Q_PROPERTY(bool holdLoaded MEMBER m_holdLoaded NOTIFY stateChanged)
    Q_PROPERTY(bool helperLoaded MEMBER m_helperLoaded NOTIFY stateChanged)
    Q_PROPERTY(bool frameAvailable MEMBER m_frameAvailable NOTIFY stateChanged)
    Q_PROPERTY(bool canSuspend MEMBER m_canSuspend NOTIFY stateChanged)
    Q_PROPERTY(int currentTab READ currentTab WRITE setCurrentTab NOTIFY currentTabChanged)

public:
    KWinI3Kcm(QObject *parent, const KPluginMetaData &data)
        : KQuickManagedConfigModule(parent, data)
        // Not a child of the module: a managed module folds every child skeleton's isDefaults()
        // into the Defaults button, which here answers for the tab shown (kcmutils 6.31
        // kquickmanagedconfigmodule.cpp:17-23, :74-91). Its load, save and signals by hand.
        , m_settings(new KWinI3Settings(nullptr))
        , m_keys(new KeysModel(this))
        , m_setup(new SetupModel(m_keys, this))
    {
        qmlRegisterAnonymousType<KWinI3Settings>("org.kde.kwini3", 1);
        qmlRegisterAnonymousType<KeysModel>("org.kde.kwini3", 1);
        qmlRegisterAnonymousType<SetupModel>("org.kde.kwini3", 1);
        setButtons(Apply | Default);
        // Every setting's change re-asks Apply's and Defaults' state, as registerSettings does.
        const QMetaObject *mo = m_settings->metaObject();
        const QMetaMethod changed = metaObject()->method(metaObject()->indexOfMethod("settingsChanged()"));
        for (int i = mo->propertyOffset(); i < mo->propertyCount(); ++i)
            if (mo->property(i).hasNotifySignal())
                connect(m_settings.get(), mo->property(i).notifySignal(), this, changed);
        connect(m_keys, &KeysModel::changed, this, &KWinI3Kcm::settingsChanged);
        connect(m_setup, &SetupModel::edited, this, &KWinI3Kcm::settingsChanged);
    }

    KWinI3Settings *settings() const { return m_settings.get(); }
    int currentTab() const { return m_tab; }
    void setCurrentTab(int tab)
    {
        if (tab == m_tab)
            return;
        m_tab = tab;
        Q_EMIT currentTabChanged();
        settingsChanged();      // Defaults greys or not for the tab now shown
    }
    KeysModel *keys() const { return m_keys; }
    SetupModel *setup() const { return m_setup; }

    void load() override
    {
        m_settings->load();
        refresh();
    }

    void save() override
    {
        // Keys take effect in kglobalaccel; only a setting needs KWin to re-read kwinrc.
        const bool settings = m_settings->isSaveNeeded();
        m_settings->save();
        m_keys->save();
        m_setup->save();
        m_setup->load();
        // The helper's key override reads kwin-i3's keys again (a key bound here); without the
        // plugins nothing answers.
        QDBusConnection::sessionBus().asyncCall(QDBusMessage::createMethodCall(
            QStringLiteral("org.kde.KWin"), QStringLiteral("/kwini3helper"), QStringLiteral("net.local.kwini3helper"), QStringLiteral("RefreshKeys")));
        if (settings)
            reconfigure();
        settingsChanged();
    }

    // The tab shown, and only it: Plasma's back to Plasma, kwin-i3's to its defaults.
    void defaults() override
    {
        for (const QString &key : tabKeys(m_tab))
            setDefault(key);
        const QStringList rules = splitRules(m_settings->forWindow());
        if (m_tab == WorkspacesTab) {           // no workspace floats
            QStringList kept;
            for (const QString &r : rules)
                if (!workspaceRule(r))
                    kept << r;
            setForWindow(kept);
        } else if (m_tab == RulesTab) {         // the shipped rules, the workspaces' kept
            QStringList out = splitRules(m_settings->defaultForWindowValue());
            for (const QString &r : rules)
                if (workspaceRule(r))
                    out << r;
            setForWindow(out);
        } else if (m_tab == KeysTab) {
            m_keys->defaults();
        } else if (m_tab == PlasmaTab) {
            m_setup->givePlasmaBack();
        }
        settingsChanged();
    }

    // The script is off: turn it on (as KWin Scripts' checkbox does) and have KWin load it.
    Q_INVOKABLE void enableScript()
    {
        KConfigGroup plugins(KSharedConfig::openConfig(QStringLiteral("kwinrc")), QStringLiteral("Plugins"));
        plugins.writeEntry("kwin-i3Enabled", true);
        plugins.sync();
        reconfigure();
        // KWin answers reconfigure at once but starts scripts on its next event loop turn and
        // says nothing when it has; the page shows the state again a moment later.
        QTimer::singleShot(1000, this, &KWinI3Kcm::refresh);
    }

    // A setting's default as main.xml has it: the Window Rules tab marks default entries.
    Q_INVOKABLE QVariant defaultValue(const QString &key) const
    {
        const KConfigSkeletonItem *item = m_settings->findItem(key);
        return item ? item->getDefault() : QVariant();
    }

    // The installed applications, by name, each with the window class its windows have (the
    // Window Rules tab's application chooser): a Wayland app id is its desktop file's name;
    // an X11 window's class is the StartupWMClass, which KWin reads lowercased. One entry per
    // class, sorted by name.
    Q_INVOKABLE QVariantList applications() const
    {
        QMap<QString, QPair<QString, QString>> byClass;         // class -> (sort key, name)
        const auto apps = KApplicationTrader::query([](const KService::Ptr &p) {
            return !p->noDisplay() && !p->exec().isEmpty();
        });
        for (const KService::Ptr &p : apps) {
            const QString wm = p->property<QString>(QStringLiteral("StartupWMClass"));
            // The file name as it is (desktopEntryName may lowercase it: "Alacritty").
            QString file = p->storageId();
            if (file.endsWith(QLatin1String(".desktop")))
                file.chop(8);
            const QString cls = wm.isEmpty() ? file : wm.toLower();
            if (!cls.isEmpty() && !byClass.contains(cls))
                byClass.insert(cls, {p->name().toLower(), p->name()});
        }
        QList<QPair<QString, QVariantMap>> sorted;
        for (auto it = byClass.cbegin(); it != byClass.cend(); ++it)
            sorted.append({it.value().first, QVariantMap{{QStringLiteral("name"), it.value().second}, {QStringLiteral("id"), it.key()}}});
        std::sort(sorted.begin(), sorted.end(), [](const auto &x, const auto &y) { return x.first < y.first; });
        QVariantList out;
        for (const auto &e : sorted)
            out << e.second;
        return out;
    }

    // Pick a Window (the Window Rules tab): KWin's interactive selection, as Window Rules'
    // Detect Window Properties uses it (dbusinterface.cpp queryWindowInfo). The user clicks a
    // window; its class, name, role and title come back, or nothing (Escape, or a window KWin
    // doesn't manage).
    Q_INVOKABLE void pickWindow()
    {
        auto msg = QDBusMessage::createMethodCall(QStringLiteral("org.kde.KWin"), QStringLiteral("/KWin"),
                                                  QStringLiteral("org.kde.KWin"), QStringLiteral("queryWindowInfo"));
        auto *watcher = new QDBusPendingCallWatcher(QDBusConnection::sessionBus().asyncCall(msg, -1), this);
        connect(watcher, &QDBusPendingCallWatcher::finished, this, [this](QDBusPendingCallWatcher *w) {
            QDBusPendingReply<QVariantMap> reply = *w;
            w->deleteLater();
            if (reply.isError())
                Q_EMIT windowPickFailed(reply.error().name());
            else
                Q_EMIT windowPicked(reply.value());
        });
    }

    Q_INVOKABLE void refresh()
    {
        auto config = KSharedConfig::openConfig(QStringLiteral("kwinrc"));
        config->reparseConfiguration();
        m_scriptEnabled = KConfigGroup(config, QStringLiteral("Plugins")).readEntry("kwin-i3Enabled", false);
        m_scriptLoaded = kwinI3Loaded();
        // The installed effect's id carries a hash (tools/plugin-install.sh): kwini3hold-<hash>.
        auto prop = QDBusMessage::createMethodCall(QStringLiteral("org.kde.KWin"), QStringLiteral("/Effects"),
                                                   QStringLiteral("org.freedesktop.DBus.Properties"), QStringLiteral("Get"));
        prop << QStringLiteral("org.kde.kwin.Effects") << QStringLiteral("loadedEffects");
        const QStringList effects = QDBusConnection::sessionBus().call(prop).arguments().value(0).value<QDBusVariant>().variant().toStringList();
        m_holdLoaded = std::any_of(effects.begin(), effects.end(), [](const QString &e) {
            return e.startsWith(QLatin1String("kwini3hold"));
        });
        m_frameAvailable = m_holdLoaded;    // the effect draws the frame
        // The helper (kwini3helper, a KWin plugin): the tiling drag and resize, frame focus, the
        // resize mode, the layout keys, the Configure form's Apply.
        auto plugins = QDBusMessage::createMethodCall(QStringLiteral("org.kde.KWin"), QStringLiteral("/Plugins"),
                                                      QStringLiteral("org.freedesktop.DBus.Properties"), QStringLiteral("Get"));
        plugins << QStringLiteral("org.kde.KWin.Plugins") << QStringLiteral("LoadedPlugins");
        const QStringList loaded = QDBusConnection::sessionBus().call(plugins).arguments().value(0).value<QDBusVariant>().variant().toStringList();
        // Installed, its id carries a hash too (kwini3helper-<hash>); the test KWin's has none.
        m_helperLoaded = std::any_of(loaded.begin(), loaded.end(), [](const QString &p) {
            return p.startsWith(QLatin1String("kwini3helper"));
        });
        // End session's Sleep shows only where the machine can sleep, as Plasma's logout screen.
        auto canSuspend = QDBusMessage::createMethodCall(QStringLiteral("org.freedesktop.login1"), QStringLiteral("/org/freedesktop/login1"),
                                                         QStringLiteral("org.freedesktop.login1.Manager"), QStringLiteral("CanSuspend"));
        m_canSuspend = QDBusConnection::systemBus().call(canSuspend).arguments().value(0).toString() == QLatin1String("yes");
        m_keys->load();
        m_setup->load();
        Q_EMIT stateChanged();
        settingsChanged();
    }

Q_SIGNALS:
    void stateChanged();
    void currentTabChanged();
    void windowPicked(const QVariantMap &info);
    void windowPickFailed(const QString &error);

private:
    bool isSaveNeeded() const override { return m_settings->isSaveNeeded() || m_keys->isSaveNeeded() || m_setup->isSaveNeeded(); }
    // The tab shown at its defaults (as defaults() makes it).
    bool isDefaults() const override
    {
        for (const QString &key : tabKeys(m_tab)) {
            const KConfigSkeletonItem *item = m_settings->findItem(key);
            if (item && !item->isDefault())
                return false;
        }
        const QStringList rules = splitRules(m_settings->forWindow());
        if (m_tab == WorkspacesTab)
            return std::none_of(rules.begin(), rules.end(), workspaceRule);
        if (m_tab == RulesTab) {
            QStringList others;
            for (const QString &r : rules)
                if (!workspaceRule(r))
                    others << r;
            return others == splitRules(m_settings->defaultForWindowValue());
        }
        if (m_tab == KeysTab)
            return m_keys->isDefaults();
        if (m_tab == PlasmaTab)
            return m_setup->isPlasmaBack();
        return true;
    }

    // A setting to its default through its property, so the page's bindings and the change
    // signal see it.
    void setDefault(const QString &key)
    {
        KConfigSkeletonItem *item = m_settings->findItem(key);
        if (!item)
            return;
        QString name = item->name();
        name[0] = name[0].toLower();
        const QMetaObject *mo = m_settings->metaObject();
        const int i = mo->indexOfProperty(name.toUtf8().constData());
        if (i >= 0)
            mo->property(i).write(m_settings.get(), item->getDefault());
    }
    // The shipped rules as the default's own text, so the key leaves kwinrc as any default does.
    void setForWindow(const QStringList &rules)
    {
        if (splitRules(m_settings->forWindow()) == rules)
            return;
        const QString def = m_settings->defaultForWindowValue();
        m_settings->setForWindow(rules == splitRules(def) ? def : rules.join(QLatin1Char('\n')));
    }

    static void reconfigure()
    {
        QDBusConnection::sessionBus().asyncCall(QDBusMessage::createMethodCall(
            QStringLiteral("org.kde.KWin"), QStringLiteral("/KWin"), QStringLiteral("org.kde.KWin"), QStringLiteral("reconfigure")));
    }

    std::unique_ptr<KWinI3Settings> m_settings;
    int m_tab = TilingTab;
    KeysModel *m_keys;
    SetupModel *m_setup;
    bool m_scriptEnabled = false;
    bool m_scriptLoaded = false;
    bool m_holdLoaded = false;
    bool m_helperLoaded = false;
    bool m_frameAvailable = false;
    bool m_canSuspend = false;
};

K_PLUGIN_CLASS_WITH_JSON(KWinI3Kcm, "kcm_kwin_i3.json")

#include "kcm.moc"
