var debug = require('debug')('navigateAction');
var queryString = require('query-string');
var searchPattern = /\?([^\#]*)/;

function parseQueryString(url) {
    var search;
    var matches = url.match(searchPattern);
    if (matches) {
        search = matches[1];
    }
    return (search && queryString.parse(search)) || {};
}

module.exports = function (context, payload, done) {
    if (!context.router || !context.router.getRoute) {
        debug('no router available for navigate handling');
        done(new Error('missing router'));
        return;
    }
    debug('executing', payload);
    
    var options = {
        navigate: payload,
        method: payload.method
    };

    var url = payload.url;
    var originalUrl = url;
    // Don't use query string for slug mapping
    var chunks = url.split("?");
    var pathname = chunks[0];
    var queryString = chunks[1] || '';
    // If slugManager present, check for alternate url to check against router
    if(context.slugManager && context.slugManager.getNonSluggedFromSlugged) {
        var nonSluggedUrl = context.slugManager.getNonSluggedFromSlugged(pathname);
        if(nonSluggedUrl) {
            url = nonSluggedUrl + (queryString ? '?' + queryString : '');
        }
    }

    var route = context.router.getRoute(url, options);

    if (!route) {
        var err = new Error('Url does not exist');
        debug('Url not found: ', url);
        err.status = 404;
        done(err);
        return;
    }

    // Store original/non-slugged url on route object to ensure correct route is displayed in URL bar
    // IF we're showing the slugged-url (i.e., not in dev-mode)
    if(typeof window !== 'undefined' && !originalUrl.match(/^\/delectaroute_/)) {
        route.url = originalUrl;
    }

    // add parsed query parameter object to route object,
    // and make it part of CHANGE_ROUTE_XXX action payload.
    route.query = parseQueryString(route.url);

    debug('dispatching CHANGE_ROUTE', route);
    context.dispatch('CHANGE_ROUTE_START', route);
    var action = route.config && route.config.action;

    if ('string' === typeof action && context.getAction) {
        action = context.getAction(action);
    }

    if (!action || 'function' !== typeof action) {
        debug('route has no action, dispatching without calling action');
        context.dispatch('CHANGE_ROUTE_SUCCESS', route);
        done();
        return;
    }

    debug('executing route action');
    context.executeAction(action, route, function (err) {
        if (err) {
            context.dispatch('CHANGE_ROUTE_FAILURE', route);
        } else {
            context.dispatch('CHANGE_ROUTE_SUCCESS', route);
        }
        done(err);
    });
};
