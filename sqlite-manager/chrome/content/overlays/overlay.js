//the advice given at http://blogger.ziesemer.com/2007/10/respecting-javascript-global-namespace.html has been followed
if(!lazierthanthou) var lazierthanthou={};

// The only global object here.
lazierthanthou.sqlitemanager = function() {
  //the following are private variables.

  //public object returned by this function
  var pub = {};

  pub.smChrome = "chrome://sqlitemanager/content/";

  // Clean up
  pub.shutdown = function() {
    window.removeEventListener("load", lazierthanthou.sqlitemanager.start, false);
    window.removeEventListener("unload", lazierthanthou.sqlitemanager.shutdown, false);
  };

  //only for firefox
  pub.start = function() {
    var cc = Components.classes;
    var ci = Components.interfaces;
    var md = window.QueryInterface(ci.nsIInterfaceRequestor)
      .getInterface(ci.nsIWebNavigation)
      .QueryInterface(ci.nsIDocShellTreeItem).rootTreeItem
      .QueryInterface(ci.nsIInterfaceRequestor)
      .getInterface(ci.nsIDOMWindow).document;

    var prefService = cc["@mozilla.org/preferences-service;1"].getService(ci.nsIPrefService).getBranch("extensions.sqlitemanager.");
    var iVal = prefService.getIntPref("posInTargetApp");
    if (iVal == 0)
      md.getElementById("menuitem-sqlitemanager").setAttribute("hidden", true);
    if (iVal == 1)
      md.getElementById("menuitem-sqlitemanager").setAttribute("hidden", false);
  };

  pub.open = function() {
    var iOpenMode = 1;
    try {
      var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.sqlitemanager.");
      iOpenMode = prefService.getIntPref("openMode");
    }
    catch(e) {
    }

    //for disabling chrome in firefox
    try {
      var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
      var navWindow = wm.getMostRecentWindow("navigator:browser");
      if (navWindow.XULBrowserWindow) {
        navWindow.XULBrowserWindow.inContentWhitelist.push("chrome://sqlitemanager/content/sqlitemanager.xul");
      }
    } catch (e) {
      Components.utils.reportError("Exception thrown during attempt to include extension's URL in inContentWhitelist for hiding chrome. The exception message is as follows:\n" + e.message);
    }

    switch (iOpenMode) {
      case 1:      //open a chrome window
        this.openInOwnWindow();
        break;
      case 2:      //open in a new tab
        openUILinkIn(this.smChrome,"tab");
        break;
    }
  };

  //Sb & Tb
  pub.openInOwnWindow = function() {
    window.open(this.smChrome, "", "chrome,resizable,centerscreen");
    return;
  };

  //Ko
  pub.openKo = function() {
    var iOpenMode = 1;
    try {
      var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.sqlitemanager.");
      iOpenMode = prefService.getIntPref("openMode");
    }
    catch(e) {
    }

    switch (iOpenMode) {
      case 1:      //open a chrome window
        this.openInOwnWindow();
        break;
      case 2:      //open in a new tab
        ko.views.manager.doFileOpenAsync(this.smChrome, 'browser');
        break;
    }
  };

  return pub;
}();

// Register handlers to maintain extension life cycle.
//window.addEventListener("load", sqlitemanager.start, false);
//window.addEventListener("unload", sqlitemanager.shutdown, false);

