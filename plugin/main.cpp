// The plugin factory KWin loads (as src/plugins/buttonrebinds/main.cpp in KWin).
#include <main.h>
#include <plugin.h>

#include "helper.h"

class KWIN_EXPORT HelperFactory : public KWin::PluginFactory
{
    Q_OBJECT
    Q_PLUGIN_METADATA(IID PluginFactory_iid FILE "metadata.json")
    Q_INTERFACES(KWin::PluginFactory)

public:
    std::unique_ptr<KWin::Plugin> create() const override
    {
        return std::make_unique<Helper>();
    }
};

#include "main.moc"
