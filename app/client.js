import './util/raven';

import React from 'react';
import ReactDOM from 'react-dom';
import Relay from 'react-relay';
import { RelayRouter } from 'react-router-relay';
import FluxibleComponent from 'fluxible-addons-react/FluxibleComponent';
import tapEventPlugin from 'react-tap-event-plugin';
import config from './config';
import StoreListeningIntlProvider from './util/store-listening-intl-provider';
import app from './app';
import translations from './translations';
import { startLocationWatch } from './action/position-actions';
import { openFeedbackModal } from './action/feedback-action';
import Feedback from './util/feedback';
import history from './history';
import buildInfo from './build-info';
import getMuiTheme from 'material-ui/styles/getMuiTheme';
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';

const piwik = require('./util/piwik').getTracker(config.PIWIK_ADDRESS, config.PIWIK_ID);
const piwikPlugin = {
  name: 'PiwikPlugin',
  plugContext: () => ({
    plugComponentContext: (componentContext) => {
      componentContext.piwik = piwik; // eslint-disable-line no-param-reassign
    },
    plugActionContext: (actionContext) => {
      actionContext.piwik = piwik; // eslint-disable-line no-param-reassign
    },
    plugStoreContext: (storeContext) => {
      storeContext.piwik = piwik; // eslint-disable-line no-param-reassign
    },
  }),
};


if (process.env.NODE_ENV === 'development') {
  require(`../sass/themes/${config.CONFIG}/main.scss`); // eslint-disable-line global-require
}

import debug from 'debug';
window.debug = debug; // Allow _debug.enable('*') in browser console

Relay.injectNetworkLayer(
  new Relay.DefaultNetworkLayer(`${config.URL.OTP}index/graphql`)
);

if (typeof window.Raven !== 'undefined' && window.Raven !== null) {
  window.Raven.setUserContext({ piwik: piwik.getVisitorId() });
}

// Material-ui uses touch tap events
tapEventPlugin();

function track() {
  // track "getting back to home"
  const newHref = this.props.history.createHref(this.state.location);

  if (this.href !== undefined && newHref === '/' && this.href !== newHref) {
    if (Feedback.shouldDisplayPopup(
      context.getComponentContext().getStore('TimeStore').getCurrentTime().valueOf())
    ) {
      context.executeAction(openFeedbackModal);
    }
  }

  this.href = newHref;
  piwik.setCustomUrl(this.props.history.createHref(this.state.location));
  piwik.trackPageView();
}

function isPerfomanceSupported() {
  if (typeof window === 'undefined' ||
      typeof performance === 'undefined' ||
      performance.timing === null) {
    return false;
  }
  return true;
}

/* Tracks React render performance */
function trackReactPerformance() {
  if (!isPerfomanceSupported()) {
    return;
  }

  const appRender = Date.now() - performance.timing.fetchStart;
  piwik.trackEvent('monitoring', 'perf', '3. App Render', appRender);
}

/* Tracks DOM and JS loading and parsing performance */
function trackDomPerformance() {
  if (!isPerfomanceSupported()) {
    return;
  }

  // See https://www.w3.org/TR/navigation-timing/#sec-navigation-timing-interface
  // for explanation of timing events
  const timing = performance.timing;

  // Timing: How long did it take to load HTML and parse DOM
  const domParse = timing.domLoading - timing.fetchStart;
  piwik.trackEvent('monitoring', 'perf', '1. DOM', domParse);

  // Timing: How long did it take to load and parse JS and css
  const jsParse = timing.domContentLoadedEventStart - timing.fetchStart;
  piwik.trackEvent('monitoring', 'perf', '2. DOMContentLoaded', jsParse);

  // Running scripts between timing.domComplete and timing.loadEventStart, and
  // onLoad handlers between timing.loadEventStart and timing.loadEventEnd take 0ms,
  // because the scripts are async.
  // If this changes, more data points should be added.

  // TODO Add more data points for loading parts of the frontpage,
  // and for tracking other pages than just the front.
  // In some cases microsecond accuracy from Usr Timing API could be necessary.
  // Something like https://www.npmjs.com/package/browsertime might be useful
  // then..
  // In case we think there's a bottleneck in particular resources,
  // we need the Resource Timing API (http://caniuse.com/#feat=resource-timing)
  // to get more detailed data.
}

// Add plugins
app.plug(piwikPlugin);

// Run application
app.rehydrate(window.state, (err, context) => {
  if (err) {
    throw err;
  }

  window.context = context;

  ReactDOM.render(
    <FluxibleComponent context={context.getComponentContext()}>
      <StoreListeningIntlProvider translations={translations}>
        <MuiThemeProvider muiTheme={getMuiTheme({}, { userAgent: navigator.userAgent })}>
          <RelayRouter history={history} children={app.getComponent()} onUpdate={track} />
        </MuiThemeProvider>
      </StoreListeningIntlProvider>
    </FluxibleComponent>
    , document.getElementById('app')
    , trackReactPerformance
  );

  if (window !== null) {
    // start positioning
    piwik.enableLinkTracking();
    context.executeAction(startLocationWatch);

    // Send perf data after React has compared real and shadow DOMs
    // and started positioning
    piwik.setCustomVariable(4, 'commit_id', buildInfo.COMMIT_ID, 'visit');
    piwik.setCustomVariable(5, 'build_time', buildInfo.BUILD_TIME, 'visit');

    // Track performance after some time has passed
    setTimeout(() => trackDomPerformance(), 5000);
  }
});
