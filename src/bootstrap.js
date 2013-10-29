/*
 *  This Source Code Form is subject to the terms of the Mozilla Public
 *  License, v. 2.0. If a copy of the MPL was not distributed with this
 *  file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 *  Contributor(s):
 *  - LouCypher (original code)
 */

const {classes: Cc, interfaces: Ci, utils: Cu, Constructor: CC } = Components;
Cu.import("resource://gre/modules/Services.jsm");

const XMLHttpRequest = CC("@mozilla.org/xmlextras/xmlhttprequest;1", "nsIXMLHttpRequest");

function log(aString) {
  Services.console.logStringMessage("Bootstrap:\n" + aString);
}

function setResourceName(aData) aData.id.toLowerCase().match(/[^\@]+/).toString()
                                                      .replace(/[^\w]/g, "");

function resProtocolHandler(aResourceName, aURI) {
  Services.io.getProtocolHandler("resource")
             .QueryInterface(Ci.nsIResProtocolHandler)
             .setSubstitution(aResourceName, aURI, null)
}

function addMenuitem(aWindow, aLabel, aPaneId) {
  let menuitem = aWindow.document.createElement("menuitem");
  menuitem.className = "quick-options";
  menuitem.setAttribute("label", aLabel);
  menuitem.setAttribute("value", aPaneId);
  //menuitem.setAttribute("oncommand", "openPreferences(this.value);"); // AMO doesn't like this
  menuitem.addEventListener("command", function(aEvent) { // AMO prefer this
    let paneId = aEvent.target.value;
    if (paneId == "paneGeneral")
      paneId = "paneMain";
    aWindow.openPreferences(paneId);
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

function quickOptions(aWindow) {
  let { document } = aWindow;

  var url = "chrome://browser/locale/preferences/preferences.dtd";
  var xhr = new XMLHttpRequest();
  xhr.open("GET", url, false);
  xhr.send(null);
  let prefDTD = xhr.responseText;

  let appmenu_pref = document.getElementById("appmenu_preferences");
  if (appmenu_pref) {
    let appmenu_prefPopup = appmenu_pref.parentNode;
    ["paneGeneral", "paneTabs", "paneContent", "paneApplications",
     "panePrivacy", "paneSecurity", "paneSync", "paneAdvanced"].forEach(function(paneId) {
      appmenu_prefPopup.insertBefore(addMenuitem(aWindow, getPaneName(paneId, prefDTD), paneId),
                                     appmenu_pref);
    })

    if ("dmtDownloadManager" in aWindow) {  // If Download Manager Tweak is active
      let label = document.getElementById("menu_openDownloads").label;
      appmenu_prefPopup.insertBefore(addMenuitem(aWindow, label, "paneDownloads"),
                                     appmenu_pref);
    }

    if (appmenu_pref.nextSibling.localName != "menuseparator") {
      let separator = appmenu_prefPopup.insertBefore(document.createElement("menuseparator"),
                                                     appmenu_pref);
      separator.className = "quick-options";
    }
    appmenu_pref.hidden = true;
  }

  unload(function() {
    appmenu_pref.hidden = false;
    let items = document.querySelectorAll(".quick-options");
    for (var i = 0; i < items.length; i++) {
      items[i].parentNode.removeChild(items[i]);
    }
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
