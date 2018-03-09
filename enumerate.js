const FDODBusIface = '\
<node> \
  <interface name='org.freedesktop.DBus'> \
    <method name='ListNames'> \
      <arg type='as' direction='out' /> \
    </method> \
  </interface> \
</node>';

const FDODBusIntrospectableIface = '\
<node> \
  <interface name='org.freedesktop.DBus.Introspectable'> \
    <method name='Introspect'> \
      <arg type='s' direction='out' /> \
    </method> \
  </interface> \
</node>';

function childPath(parentPath, childNodePath) {
    if (parentPath === '/') {
        return parentPath + childNodePath;
    }

    return [parentPath, childNodePath].join('/');
}

function findDBusObjectsWithInterfaceAtPath(connection, name, objectPath, interfaceName, done) {
    let fdoIntrospectableObjectReady = function(initable, error) {
        if (error) {
            logError(error, 'Could not create Introspectable DBus wrapper');
            return;
        }

        // Now that the object is ready, call the introspect method and
        // get the results
        fdoIntrospectableObject.IntrospectRemote(introspectionResultsHandler);
    };
    let introspectionResultsHandler = function(results, error) {
        if (error) {
            logError(error, 'Failed to call Introspect on ' + objectPath + ' at ' + name);
            return;
        }

        let nodeInfo = Gio.DBusNodeInfo.new_for_xml(results[0]);
        let discoveredObjects = [];
        let nodeCount = 0;

        let appendDiscoveredObject = function(discoveredObjectsOnThisPath) {
            Array.prototype.push.apply(discoveredObjects, discoveredObjectsOnThisPath);
            nodeCount--;

            if (nodeCount < 1) {
                done(discoveredObjects);
            }
        };

        // If we found an object at a path satisfying the interface we need
        // add it to the list now
        if (nodeInfo.lookup_interface(interfaceName) !== null) {
            discoveredObjects.push({
                path: objectPath,
                name: name
            });
        }

        nodeCount = nodeInfo.nodes.length;

        // Found some nodes, continue recursing
        if (nodeCount) {
            nodeInfo.nodes.forEach(function(node) {
                findDBusObjectsWithInterfaceAtPath(connection,
                                                   name,
                                                   childPath(objectPath, node.path),
                                                   interfaceName,
                                                   appendDiscoveredObject);
            });
        } else {
            // This was a leaf node. Return whatever we have here.
            done(discoveredObjects);
        }
    };

    let fdoIntrospectableObject = Gio.DBusProxy.makeProxyWrapper(FDODBusIntrospectableIface)(connection,
                                                                                             name,
                                                                                             objectPath,
                                                                                             fdoIntrospectableObjectReady,
                                                                                             null);
}

function findDBusObjectsWithInterface(connection, interfaceName, done) {
    let discoveredObjects = [];
    let remaining = 0;

    let appendDiscoveredObject = function(discoveredObjectsOnThisName) {
        Array.prototype.push.apply(discoveredObjects,
                                   discoveredObjectsOnThisName);

        remaining--;
        if (remaining < 1) {
            done(discoveredObjects);
        }
    };

    let fdoDBusReady = function(initable, error) {
        if (error) {
            logError(error, 'Could not create DBus wrapper');
            return;
        }

        fdoDBus.ListNamesRemote(function(names) {
            // Fire off asynchronous concurrent requests to get all objects
            // which match our criteria and then call done when we have
            // examined all objects on the bus.
            //
            // For now, filter to endlessm objects to save time traversing
            // the entire object tree, though this may change in future.
            names = names[0].filter(n => n.indexOf('endlessm') !== -1);
            remaining = names.length;
            names.forEach(function(name) {
                findDBusObjectsWithInterfaceAtPath(connection,
                                                   name,
                                                   '/',
                                                   interfaceName,
                                                   appendDiscoveredObject);
            });
        });
    };

    let fdoDBus = Gio.DBusProxy.makeProxyWrapper(FDODBusIface)(connection,
                                                               'org.freedesktop.DBus',
                                                               '/',
                                                               fdoDBusReady,
                                                               null);
}

function makeInterfaceProxiesForObjects(connection,
                                        interfaceWrapper,
                                        objects,
                                        done) {
    let proxies = [];
    let remaining = objects.length;

    let onProxyReady = function(initable, error) {
        if (error) {
            logError(error, 'Could not create proxy for ' + interfaceName);
            return;
        }

        remaining--;
        if (remaining < 1) {
            done(proxies);
        }
    };

    objects.forEach(function(object) {
        proxies.push(interfaceWrapper(connection,
                                      object.name,
                                      object.path,
                                      onProxyReady,
                                      null));
    });
}


findDBusObjectsWithInterface(connection, 'com.endlessm.GrandCentralContent', Lang.bind(this, function(discoveredObjects) {
    makeInterfaceProxiesForObjects(connection,
                                   Gio.DBusProxy.makeProxyWrapper(GrandCentralContentIface),
                                   discoveredObjects,
                                   Lang.bind(this, function(proxies) {
        Array.prototype.push.apply(this._grandCentralProxies, proxies);
    }));
}));
