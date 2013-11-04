/*
 *  This Source Code Form is subject to the terms of the Mozilla Public
 *  License, v. 2.0. If a copy of the MPL was not distributed with this
 *  file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 *  Contributor(s):
 *  - LouCypher (original code)
 */

const {classes: Cc, interfaces: Ci, utils: Cu, Constructor: CC} = Components;

Cu.import("resource://gre/modules/Services.jsm");
const {prefs: prefs, io: io, wm: wm} = Services;

function log(aString) {
  Services.console.logStringMessage("Bootstrap:\n" + aString);
}

function setResourceName(aData) aData.id.toLowerCase().match(/[^\@]+/).toString()
                                                      .replace(/[^\w]/g, "");

function resProtocolHandler(aResourceName, aURI) {
  io.getProtocolHandler("resource")
    .QueryInterface(Ci.nsIResProtocolHandler)
    .setSubstitution(aResourceName, aURI, null);
}

function openPreferencesInTab(aWindow, aPaneId) {
  function aboutPreferences(aBrowser, aPaneId) {
    let win = aBrowser.contentWindow;
    let gotoPref = win.wrappedJSObject.gotoPref;
    gotoPref(aPaneId)
    win.focus();
  }

  // This will switch to the tab in aWindow having aURI, if present.
  function switchIfURIInWindow(aWindow, aURI) {
    let browsers = aWindow.gBrowser.browsers;
    for (let i = 0; i < browsers.length; i++) {
      let browser = browsers[i];
      if (browser.currentURI.equals(aURI)) {
        // Focus the matching window & tab
        aWindow.focus();
        aWindow.gBrowser.tabContainer.selectedIndex = i;
        return true;
      }
    }
    return false;
  }

  let URI = "about:preferences";

  // Bug 767313
  if (aPaneId == "paneTabs" && Services.appinfo.version > "25")
    aPaneId = "paneGeneral";

  // This can be passed either nsIURI or a string.
  if (!(URI instanceof Ci.nsIURI))
    URI = io.newURI(URI, null, null);

  let isBrowserWindow = !!aWindow.gBrowser;

  // Prioritise this window.
  if (isBrowserWindow && switchIfURIInWindow(aWindow, URI)) {
    aboutPreferences(aWindow.getBrowser().selectedBrowser, aPaneId);
    return;
  }

  let winEnum = wm.getEnumerator("navigator:browser");
  while (winEnum.hasMoreElements()) {
    let browserWin = winEnum.getNext();
    // Skip closed (but not yet destroyed) windows,
    // and the current window (which was checked earlier).
    if (browserWin.closed || browserWin == aWindow) {
      aWindow.openLinkIn(URI.spec, "tab", {fromChrome:true});
      browserWin.addEventListener("pageshow", function browserWinPageShow(event) {
        if (event.target.location.href != URI.spec)
          return;
        browserWin.removeEventListener("pageshow", browserWinPageShow, true);
        aboutPreferences(browserWin.getBrowser().selectedBrowser, aPaneId);
      }, true)
    }
    if (switchIfURIInWindow(browserWin, URI))
      return;
  }
}

function openPreferences(aWindow, aPaneId, aExtraArgs) {
  let prefBranch = prefs.getBranch("browser.preferences.");

  if (prefBranch.getBoolPref("inContent") && aPaneId != "paneDownloads")
    openPreferencesInTab(aWindow, aPaneId);

  else {
    if (aPaneId == "paneGeneral")
      aPaneId = "paneMain";

    let instantApply = prefBranch.getBoolPref("instantApply", false);
    let features = "chrome, titlebar, toolbar, centerscreen" +
                   (instantApply ? ", dialog=no" : ", modal");

    let win = wm.getMostRecentWindow("Browser:Preferences");
    if (win) {
      win.focus();
      if (aPaneId) {
        let pane = win.document.getElementById(aPaneId);
        win.document.documentElement.showPane(pane);
      }

      if (aExtraArgs && aExtraArgs["advancedTab"]) {
        let advancedPaneTabs = win.document.getElementById("advancedPrefs");
        advancedPaneTabs.selectedTab = win.document.getElementById(aExtraArgs["advancedTab"]);
      }

     return;
    }

    aWindow.openDialog("chrome://browser/content/preferences/preferences.xul",
                       "Preferences", features, aPaneId, aExtraArgs);
  }
}

function addMenuitem(aWindow, aLabel, aPaneId) {
  let menuitem = aWindow.document.createElement("menuitem");
  menuitem.className = "quick-options";
  menuitem.setAttribute("label", aLabel);
  menuitem.setAttribute("value", aPaneId);
  //menuitem.setAttribute("oncommand", "openPreferences(this.value);"); // AMO doesn't like this
  menuitem.addEventListener("command", function(aEvent) { // AMO prefer this
    let paneId = aEvent.target.value;
    openPreferences(aWindow, paneId);
  })
  return menuitem;
}

function getPaneName(aPaneId, aString) {
  try {
    return aString.match("ENTITY.*" + aPaneId + "[^\>]+").toString()
                  .match(/\".*/).toString()
                  .replace(/\"/g, "");
  } catch(ex) {
    return undefined;
  }
}

function getStringsFromDTD(aChromeURL) {
  const XMLHttpRequest = CC("@mozilla.org/xmlextras/xmlhttprequest;1", "nsIXMLHttpRequest");
  let xhr = new XMLHttpRequest();
  xhr.open("GET", aChromeURL, false);
  xhr.send(null);
  return xhr.responseText;
}

function quickOptions(aWindow) {
  const {document} = aWindow;

  let prefDTD = getStringsFromDTD("chrome://browser/locale/preferences/preferences.dtd");

  let prefMenu = document.getElementById("appmenu_preferences");
  if (prefMenu) {
    let popup = prefMenu.parentNode;
    ["paneGeneral", "paneTabs", "paneContent", "paneApplications",
     "panePrivacy", "paneSecurity", "paneSync", "paneAdvanced"].forEach(function(paneId) {
      popup.insertBefore(addMenuitem(aWindow, getPaneName(paneId, prefDTD), paneId), prefMenu);
    })

    if (typeof aWindow.gSyncUI == "undefined")
      popup.querySelector("menuitem[value='paneSync']").hidden = true;

    if ("dmtDownloadManager" in aWindow) {  // If Download Manager Tweak is active
      let label = document.getElementById("menu_openDownloads").label;
      popup.insertBefore(addMenuitem(aWindow, label, "paneDownloads"), prefMenu);
    }

    if (prefMenu.nextSibling.localName != "menuseparator") {
      let separator = popup.insertBefore(document.createElement("menuseparator"), prefMenu);
      separator.className = "quick-options";
    }
    prefMenu.hidden = true;
  }

  unload(function() {
    prefMenu.hidden = false;
    let items = document.querySelectorAll(".quick-options");
    for (let i = 0; i < items.length; i++)
      items[i].parentNode.removeChild(items[i]);
  }, aWindow)
}

/**
 * Handle the add-on being activated on install/enable
 */
function startup(data, reason) {

  // Add `resource:` alias
  let resourceName = setResourceName(data);
  //log(resourceName);
  resProtocolHandler(resourceName, data.resourceURI);

  Cu.import("resource://" + resourceName + "/watchwindows.jsm");
  watchWindows(quickOptions);
}

/**
 * Handle the add-on being deactivated on uninstall/disable
 */
function shutdown(data, reason) {
  // Clean up with unloaders when we're deactivating
  if (reason == APP_SHUTDOWN)
    return;

  unload();
  let resourceName = setResourceName(data);
  Cu.unload("resource://" + resourceName + "/watchwindows.jsm");
  resProtocolHandler(resourceName, null); // Remove `resource:` alias
}

/**
 * Handle the add-on being installed
 */
function install(data, reason) {}

/**
 * Handle the add-on being uninstalled
 */
function uninstall(data, reason) {}
