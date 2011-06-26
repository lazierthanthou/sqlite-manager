//we call setVersion here to give it time to set version because the async function used there takes a lot of time
Components.utils.import("resource://sqlitemanager/appInfo.js");
SmAppInfo.setVersion();

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

var SmGlobals = {
  chromes: {
    preferences: "chrome://sqlitemanager/content/preferences.xul",
    console: "chrome://global/content/console.xul",
    aboutconfig: "chrome://global/content/config.xul",
    confirm: "chrome://sqlitemanager/content/confirm.xul",
    aboutSM: "chrome://sqlitemanager/content/about.xul"
  },

  //these are the preferences which are being observed and which need to be initially read.
  observedPrefs: ["jsonDataTreeStyle", "hideMainToolbar", "showMainToolbarDatabase", "showMainToolbarTable", "showMainToolbarIndex", "showMainToolbarDebug", "sqliteFileExtensions", "displayNumRecords", "textForBlob", "identifierQuoteChar", "jsonMruData", "notificationDuration",
        "posInTargetApp" /* this one for firefox only*/,
        "handleADS" /* this one for Windows only*/ ],

  tempNamePrefix: "__temp__",
  sbPanelDisplay: null,

  dialogFeatures: "chrome,resizable,centerscreen,modal,dialog",

  // remove address bar when opening in firefox or seamonkey
  disableChrome: function() {
    if (/*SmAppInfo.appInfo.name == 'Firefox'*/true) {
      //neither is a global called XULBrowserWindow available nor is there window.XULBrowserWindow
      //but found navWindow.XULBrowserWindow
      //the following both also fail:
      //  navWindow.disablechrome = true;
      //  window.disablechrome = true;
      try {
        var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
        var navWindow = wm.getMostRecentWindow("navigator:browser");

        //alert(navWindow.XULBrowserWindow.inContentWhitelist);
        if (navWindow.XULBrowserWindow) {
          navWindow.XULBrowserWindow.inContentWhitelist.push("chrome://sqlitemanager/content/sqlitemanager.xul");
        }
      } catch (e) {
        Components.utils.reportError("Exception thrown during attempt to include extension's URL in inContentWhitelist for hiding chrome. The exception message is as follows:\n" + e.message);
      }
    }
  },

  //notification duration
  getNotificationDuration: function() {
    return sm_prefsBranch.getIntPref("notificationDuration") * 1000;
  },

  // Remove all child elements 
  $empty: function(el) {
    while (el.firstChild) 
      el.removeChild(el.firstChild);
  },

  //cTimePrecision: Y, M, D, h, m, s
  getISODateTimeFormat: function(dt, cSeparator, cPrecision) {
    var aPrecision = ["Y", "M", "D", "h", "m", "s"];
    var aSeparators = ["", "-", "-", "T", ":", ":"];
    if (dt == null)
      dt = new Date();

    var tt;
    var iPrecision = aPrecision.indexOf(cPrecision);
    var sDate = dt.getFullYear();
    for (var i = 1; i <= iPrecision; i++) {
      switch (i) {
        case 1:
          tt = new Number(dt.getMonth() + 1);
          break;
        case 2:
          tt = new Number(dt.getDate());
          break;
        case 3:
          tt = new Number(dt.getHours());
          break;
        case 4:
          tt = new Number(dt.getMinutes());
          break;
        case 5:
          tt = new Number(dt.getSeconds());
          break;
      }
      var cSep = (cSeparator == null)?aSeparators[i]:cSeparator;
      sDate += cSep + ((tt < 10)? "0" + tt.toString() : tt);
    }
    return sDate;
  }

};

//constant for branch of nsIPrefService                 
const sm_prefsBranch = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).getBranch("extensions.sqlitemanager.");

var gMktPreferences = {};

/* set unicode string value */
function sm_setUnicodePref(prefName, prefValue) {
    var sString = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
    sString.data = prefValue;
    sm_prefsBranch.setComplexValue(prefName, Ci.nsISupportsString, sString);
}

var smStrings = Cc["@mozilla.org/intl/stringbundle;1"].getService(Ci.nsIStringBundleService).createBundle("chrome://sqlitemanager/locale/strings.properties");
//gets localized string
function sm_getLStr(sName) {
  return smStrings.GetStringFromName(sName);
}
//gets localized and formatted string
function sm_getLFStr(sName, params, len) {
  return smStrings.formatStringFromName(sName, params, params.length);
}

var smPrompt =   Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);

SmGlobals.allPrefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);

function $$(sId) {
  return document.getElementById(sId);
}

function smShow(aId) {
  for (var i in aId) {
    $$(aId[i]).hidden = false;
  }
}

function smHide(aId) {
  for (var i in aId) {
    $$(aId[i]).hidden = true;
  }
}

//adjust the rows of a multiline textbox according to content so that there is no scrollbar subject to the min/max constraints
//tb = textbox element
function adjustTextboxRows(tb, iMinRows, iMaxRows) {
  tb.setAttribute('rows', iMinRows);
  //subtract 10 so that there are no scrollbars even if all content is visible
  while (tb.inputField.scrollHeight > tb.boxObject.height - 10) {
    iMinRows++;
    tb.setAttribute("rows", iMinRows);
    if (iMinRows >= iMaxRows)
      break;
  }
}

// PopulateDropDownItems: Populate a dropdown listbox with menuitems
function PopulateDropDownItems(aItems, dropdown, sSelectedItemLabel) {   
  dropdown.removeAllItems();
  dropdown.selectedIndex = -1;

  for (var i = 0; i < aItems.length; i++) {
     var bSelect = false;
    if(i == 0)
      bSelect = true;
    
    if (typeof aItems[i] == "string") {
      if(aItems[i] == sSelectedItemLabel)
        bSelect = true;
    }
    else {
      if(aItems[i][0] == sSelectedItemLabel)
        bSelect = true;
    }
    var menuitem = AddDropdownItem(aItems[i], dropdown, bSelect);
  }
}

// AddDropdownItem: Add a menuitem to the dropdown
function AddDropdownItem(sLabel, dropdown, bSelect) {
  var menuitem;
  if (typeof sLabel == "string") {
    menuitem = dropdown.appendItem(sLabel, sLabel);
  }
  else {
    menuitem = dropdown.appendItem(sLabel[0], sLabel[1]);
  }

  //make this item selected
  if (bSelect)
    dropdown.selectedItem = menuitem;

  return menuitem;
}

function sm_notify(sBoxId, sMessage, sType, oExtra) {
  var iTime = SmGlobals.getNotificationDuration();

  var notifyBox = $$(sBoxId);
  var notification = notifyBox.appendNotification(sMessage);
  notification.type = sType;
  //notification.priority = notifyBox.PRIORITY_INFO_HIGH;
  setTimeout(function() { $$(sBoxId).removeAllNotifications(false); }, iTime);
}

//not yet called anywhere
SmGlobals.launchHelp = function() {
  var urlHelp = sm_getLStr("sm.url.help");
  SmGlobals.openURL(urlHelp);
};

SmGlobals.openURL = function(UrlToGoTo) {
  var ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
  var uri = ios.newURI(UrlToGoTo, null, null);
  var protocolSvc = Cc["@mozilla.org/uriloader/external-protocol-service;1"].getService(Ci.nsIExternalProtocolService);

  if (!protocolSvc.isExposedProtocol(uri.scheme)) {
    // If we're not a browser, use the external protocol service to load the URI.
    protocolSvc.loadUrl(uri);
    return;
  }

  var navWindow;

  // Try to get the most recently used browser window
  try {
    var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
    navWindow = wm.getMostRecentWindow("navigator:browser");
  } catch(ex) {}

  if (navWindow) {  // Open the URL in most recently used browser window
    if ("delayedOpenTab" in navWindow) {
      navWindow.delayedOpenTab(UrlToGoTo);
    } 
    else if ("openNewTabWith" in navWindow) {
      navWindow.openNewTabWith(UrlToGoTo);
    } 
    else if ("loadURI" in navWindow) {
      navWindow.loadURI(UrlToGoTo);
    }
    else {
      navWindow._content.location.href = UrlToGoTo;
    }
  }
  else {
    // If there is no recently used browser window then open new browser window with the URL
    var ass = Cc["@mozilla.org/appshell/appShellService;1"].getService(Ci.nsIAppShellService);
    var win = ass.hiddenDOMWindow;
    win.openDialog(SmGlobals.getBrowserURL(), "", "chrome,all,dialog=no", UrlToGoTo );
  }
};

SmGlobals.getBrowserURL = function() {
   // For SeaMonkey etc where the browser window is different.
   try {
      var url = SmGlobals.allPrefs.getCharPref("browser.chromeURL");
      if (url)
         return url;
   } catch(e) {}
   return "chrome://browser/content/browser.xul";
};

SmGlobals.chooseDirectory = function(sTitle) {
  const nsIFilePicker = Ci.nsIFilePicker;
  var fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  fp.init(window, sTitle, nsIFilePicker.modeGetFolder);

  var rv = fp.show();

  //if chosen then
  if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace)
    return fp.file;

  return null; 
};

function sm_message(str, where) {
  if(where & 0x1)
    alert(str);
  if(where & 0x2 && SmGlobals.sbPanelDisplay != null)
    SmGlobals.sbPanelDisplay.label= str;;
  if(where & 0x4)
    sm_log(str);
}

function sm_confirm(sTitle, sMessage) {
  var aRetVals = {};
  var oWin = window.openDialog(SmGlobals.chromes.confirm, "confirmDialog", SmGlobals.dialogFeatures, sTitle, sMessage, aRetVals, "confirm");
  return aRetVals.bConfirm;
}

function sm_alert(sTitle, sMessage) {
  var aRetVals = {};
  var oWin = window.openDialog(SmGlobals.chromes.confirm, "alertDialog", SmGlobals.dialogFeatures, sTitle, sMessage, aRetVals, "alert");
}

function sm_log(sMsg) {
  var aConsoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);

  aConsoleService.logStringMessage("SQLiteManager: " + sMsg);
}

SmGlobals.confirmBeforeExecuting = function(aQ, sMessage, confirmPrefName) {
  if (confirmPrefName == undefined)
    confirmPrefName = "confirm.otherSql";
  var bConfirm = sm_prefsBranch.getBoolPref(confirmPrefName);

  var answer = true;
  var ask = sm_getLStr("globals.confirm.msg");
  //in case confirmation is needed, reassign value to answer
  if (bConfirm) {
    var txt = ask + "\n" + sMessage + "\nSQL:\n" + aQ.join("\n");
    if (typeof sMessage == "object" && !sMessage[1]) {
      txt = ask + "\n" + sMessage[0];
    }
    answer = sm_confirm(sm_getLStr("globals.confirm.title"), txt);
  }

  return answer;
};

SmGlobals.getJsonPref = function(sName) {
  var sValue = sm_prefsBranch.getCharPref(sName);
  return JSON.parse(sValue);
};

////////////////////////////////////////////////
//called on load of preferences.xul
function sm_setCurrentSettings() {
  sm_setDataTreeStyleControls();
}

///////////////////////////////////////////////
function sm_setDataTreeStyle(sType) {
  if (sType == "none") {
    var obj = SmGlobals.getJsonPref("jsonDataTreeStyle");
    obj.setting = 'none';
    sPref = JSON.stringify(obj);
    sm_prefsBranch.setCharPref("jsonDataTreeStyle", sPref);
    return;
  }
  if (sType == "default") {
    sm_prefsBranch.clearUserPref("jsonDataTreeStyle");
    sm_setDataTreeStyleControls();
    return;
  }
  if (sType == "user") {
    var sPref = setMktPreferences('datatree-options');
    sm_prefsBranch.setCharPref("jsonDataTreeStyle", sPref);
    return;
  }
}

function sm_setDataTreeStyleControls() {
  var obj = SmGlobals.getJsonPref("jsonDataTreeStyle");
  if (obj.setting == 'none') {
    $$('btnTreeStyleApply').setAttribute('disabled', true);
  }
  else {
    $$('btnTreeStyleApply').removeAttribute('disabled');
  }

  gMktPreferences.dataTreeStyle = obj;
  applyMktPreferences('datatree-options');
}

//this function applies mktpreferences to descendants of element whose id=sId and which have the attribute 'mktpref'
function applyMktPreferences(sId) {
  var pElt = $$(sId);
  var aElt = pElt.querySelectorAll("[mktpref]");
  for (var i = 0; i < aElt.length; i++) {
    var mktpref = aElt[i].getAttribute('mktpref');
    var val = getMktPref(mktpref);
//    if (val == null)
//      continue;
    switch (aElt[i].localName.toLowerCase()) {
      case 'colorpicker':
        if (val == null)
          aElt[i].color = '';
        else
          aElt[i].color = val;
        break;
      default:
        aElt[i].value = val;
        break;
    }
  }
}

function setMktPreferences(sId) {
  var pElt = $$(sId);
  var aElt = pElt.querySelectorAll("[mktpref]");
  for (var i = 0; i < aElt.length; i++) {
    var mktpref = aElt[i].getAttribute('mktpref');
    var val = "";
    switch (aElt[i].localName.toLowerCase()) {
      case 'colorpicker':
        val = aElt[i].color;
        break;
      default:
        val = aElt[i].value;
        break;
    }
    setMktPref(mktpref, val);
  }
  return JSON.stringify(gMktPreferences.dataTreeStyle);
}

function setMktPref(str, val) {
  var o = gMktPreferences;
  var parts = str.split('.');
  var len = parts.length;
  for (var i = 0; i < len - 1; i++) {
    o = o[parts[i]] = o[parts[i]] || {};
  }
  o[parts[i]] = val;
  return o;
}

function getMktPref(str) {
  var o = gMktPreferences;
  var parts = str.split('.');
  var len = parts.length;
  for (var i = 0; i < len; i++) {
    if (o[parts[i]])
      o = o[parts[i]];
    else
      return null;
  }
  return o;
}
