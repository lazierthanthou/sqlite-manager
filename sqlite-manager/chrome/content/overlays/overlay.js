//the advice given at http://blogger.ziesemer.com/2007/10/respecting-javascript-global-namespace.html has been followed
if(!com) var com={};
if(!com.googlecode) com.googlecode={};

// The only global object here.
com.googlecode.sqlitemanager = function() {
  //the following are private variables.

  //public object returned by this function
  var pub = {};

  pub.smChrome = "chrome://sqlitemanager/content/";

  // Clean up
  pub.shutdown = function() {
    window.removeEventListener("load", com.googlecode.sqlitemanager.start, false);
    window.removeEventListener("unload", com.googlecode.sqlitemanager.shutdown, false);
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

