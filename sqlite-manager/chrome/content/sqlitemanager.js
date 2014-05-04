Components.utils.import("resource://sqlitemanager/sqlite.js");
Components.utils.import("resource://sqlitemanager/tokenize.js");
Components.utils.import("resource://sqlitemanager/appInfo.js");

// SQLiteManager extension
SmGlobals.disableChrome();

var smStructTrees = [];
smStructTrees[0] = new TreeDbStructure("t-dbStructNorm", "tc-dbStructNorm", 0);

var treeBrowse = new TreeDataTable("browse-tree");
var treeExecute = new TreeDataTable("treeSqlOutput");

var smExtManager = null;

var SQLiteManager = {
  mDb: null,

  //used to identify this instance of addon
  //needed, if addon is open in more than one tab
  //as of now, used only with searchToggler preference22
  mInstanceId: Date.now(),

  msQuerySelectInstruction: null,
  prefs: null,

  miDbObjects: 0,
  //for display in the browse tree
  miLimit: -1,
  miOffset: 0,
  miCount: 0,

  maSortInfo: [],
  msBrowseObjName: null,
  msBrowseCondition: null,

  //an array containing names of current table, index, view and trigger
  aCurrObjNames: [],

  //to store the latest selection in tree showing db objects
  mostCurrObjName: null,
  mostCurrObjType: null,

  mbDbJustOpened: true,
  miDbInfoCallCount: 0,
  // an array of 4 arrays;
  // each holding names of tables, indexes, views and triggers
  aObjNames: [],
  aObjTypes: ["master", "table", "view", "index", "trigger"],

  clipService: null,   // Clipboard service: nsIClipboardHelper

  // Status bar: panels for displaying various info
  sbPanel: [],

  maFileExt: [],

  experiment: function() {
    //checking the use of localStorage in extension
    //result: failure even with firefox 5 on 2011-07-03
//    window.localStorage.setItem("status", "checking");
//    alert(window.localStorage.getItem("status"));
    //this.mDb.executeAsync(["create table abcd (aa, bb, cc, dd)"]);
    //return;
    var sImportTestFileName = sm_prefsBranch.getCharPref("6de03bb8c386207");
    SmTestExim.doOKImport(sImportTestFileName);
  },

  isSqliteHigherThan: function (sVersion) {
    return (Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator).compare(this.mDb.sqliteVersion, sVersion) >= 0);
  },

  copyText: function (sText) {
    this.clipService.copyString(sText);
  },

  // Startup: called ONCE during the browser window "load" event
  Startup: function() {
    try {
      var bExpMenu = sm_prefsBranch.getBoolPref("6de03bb8c386206");
      if(bExpMenu)
        $$("experiment").hidden = false;
    }
    catch (e) {
    }

    this.mProfileDir = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties).get('ProfD', Ci.nsIFile);

    this.mDb = new SQLiteHandler();
    this.mDb.setFuncConfirm(SmGlobals.confirmBeforeExecuting);

    this.msQuerySelectInstruction = sm_getLStr("sqlm.selectQuery");

    SmUdf.init();

    //create the menus by associating appropriate popups
    this.createMenu();

    //initialize the structure tree
    smStructTrees[0].init();

    this.refreshDbStructure();

    treeBrowse.init();
    treeExecute.init();

    var mi = $$("menu-general-sharedPagerCache");

    // Load clipboard service
    this.clipService = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);

    //get the nodes for Status bar panels
    this.sbPanel["display"] = $$("sbPanel-display");
    //global var in globals.js for sbpanel[display]
    SmGlobals.sbPanelDisplay = this.sbPanel["display"];

    //display Gecko version & extVersion in the status bar
    $$("sbExtVersion").label = SmAppInfo.getVersion();
    $$("sbGeckoVersion").label = "Gecko " + SmAppInfo.appInfo.platformVersion;

    smHide(["vb-structureTab", "vb-browseTab", "vb-executeTab", "vb-dbInfoTab"]);

    //preferences service to add oberver
    // and then observe changes via the observe function
    //see http://developer.mozilla.org/en/docs/Adding_preferences_to_an_extension
    //initialize the preference service with the correct branch
    this.prefs = sm_prefsBranch;
    //query interface to be able to use addObserver method
    this.prefs.QueryInterface(Ci.nsIPrefBranch2);
    //now, add the observer which will be implemented using observe method
    //calling removeObserver when done with observing helps the memory
    this.prefs.addObserver("", this, false);

    var iNumRecords = sm_prefsBranch.getIntPref("displayNumRecords");
    if (iNumRecords == -1)
      sm_prefsBranch.setIntPref("displayNumRecords", 100);

    //To set our variables, etc. we fool observe into believing that the following preferences have changed.
    for(var i = 0; i < SmGlobals.observedPrefs.length; i++)
      this.observe("", "nsPref:changed", SmGlobals.observedPrefs[i]);

    //1. xulrunner application.ini -f xyz:
    //    if -f argument is present, then open the corresponding param (xyz) or none if it fails
    //    else open last db
    //2. extension: open last db

    var bOpenLastDb = true;
    //proceed to check commandline arguments only if we are in an xulrunner app
    if(SmAppInfo.appInfo.name == 'sqlite-manager') {
      if (window.arguments) {
        //commandline arguments if running with xulrunner
        try {
          var cmdLine = window.arguments[0];
          cmdLine = cmdLine.QueryInterface(Ci.nsICommandLine);
          var fArg = cmdLine.handleFlagWithParam("f", true);
          if (fArg != null) {
            bOpenLastDb = false;
            var file = cmdLine.resolveFile(fArg);
            this.setDatabase(file);
            if (!this.mDb.isConnected())
              alert('Failed to connect to ' + file.path);
          }
        } catch (e) {
          sm_log('Command line error: ' + e.message);
        }
      }
    }
///////////////////////////////////////////////////////////////

    //try opening the last db
    if (bOpenLastDb)
      this.openLastDb();

    //load the previously opened tab
    this.loadTabWithId(this.getSelectedTabId());
    return;
  },

  // Shutdown: called ONCE during the browser window "unload" event
  Shutdown: function() {
    //close the current database
    this.closeDatabase(false);
    //Destruction - this should be done once you're done observing
    //Failure to do so may result in memory leaks.
    this.prefs.removeObserver("", this);

    this.clipService= null;
    SmUdf.close();
  },

  openLastDb: function() {
    // opening with last used DB if preferences set to do so
    var bPrefVal = sm_prefsBranch.getBoolPref("openWithLastDb");
    if(!bPrefVal)
      return;

    var sPath = SmGlobals.mru.getLatest();
    if(sPath == null)
      return;

    //Last used DB found, open this DB
    var newfile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
    try {
      newfile.initWithPath(sPath);
    } catch (e) {
      smPrompt.alert(null, sm_getLStr("extName"), 'Failed to init local file using ' + sPath);
      return;
    }
    //if the last used file is not found, bail out
    if(!newfile.exists()) {
      smPrompt.alert(null, sm_getLStr("extName"), sm_getLFStr("lastDbDoesNotExist",[sPath]));
      return;
    }

    bPrefVal = sm_prefsBranch.getBoolPref("promptForLastDb");
    if(bPrefVal) {
      var check = {value: false}; // default the checkbox to false
      var result = smPrompt.confirmCheck(null, sm_getLStr("extName") + " - " + sm_getLStr("promptLastDbTitle"), sm_getLStr("promptLastDbAsk")+ "\n" + sPath + "?", sm_getLStr("promptLastDbOpen"), check);

      if(!result)
        return;
      //update the promptForLastDb preference
      bPrefVal = sm_prefsBranch.setBoolPref("promptForLastDb", !check.value);
    }
    //assign the new file (nsIFile) to the current database
    this.setDatabase(newfile);
  },

  createMenu: function() {
    var suffixes = ["table", "index", "view", "trigger"];

    var mpdb = $$("mp-dbstructure");
    for(var i = 0; i < suffixes.length; i++) {
      var suffix = suffixes[i];
      var mp = $$("menu-" + suffix);
      var ch = mp.querySelector('menupopup').childNodes;
      for (var c = 0; c < ch.length; c++) {
        var clone = ch[c].cloneNode(true);
        clone.setAttribute("smType", suffix);
        mpdb.appendChild(clone);
      }
      var mp = $$("mp-create-" + suffix);
      var ch = mp.childNodes;
      for (var c = 0; c < ch.length; c++) {
        var clone = ch[c].cloneNode(true);
        clone.setAttribute("smType", "create-" + suffix);
        mpdb.appendChild(clone);
      }
    }
  },

  changeDbSetting: function(sSetting) {
    if (sSetting == "schema_version") {
      var bConfirm = sm_confirm(sm_getLStr("dangerous.op"), sm_getLStr("confirm.changeSchemaVersion") + "\n\n" + sm_getLStr("q.proceed"));
      if (!bConfirm)
        return false;
    }
    var node = $$("pr-" + sSetting);
    var sVal = node.value;
    var newVal = this.mDb.setSetting(sSetting, sVal);
    node.value = newVal;

    var sMessage = sm_getLFStr("pragma.changed", [sSetting, newVal]);
    sm_notify("boxNotifyDbInfo", sMessage, "info");
  },

  toggleSidebar: function() {
    if ($$("localsplitter").getAttribute("state") == "collapsed")
      $$("localsplitter").setAttribute("state", "open");
    else
      $$("localsplitter").setAttribute("state", "collapsed");
  },

  //mainly to remove use of Database from treeDbStructure.js
  getTableInfo: function(sTable, sLogicalDb) {
    return this.mDb.getTableInfo(sTable, sLogicalDb);
  },

  setTreeStructureContextMenu: function() {
    var tree = $$(smStructTrees[this.miDbObjects].treeId);
    var idx = tree.currentIndex;
    // idx = -1 if nothing is selected; says xulplanet element reference
    if(idx == -1)
      idx = 0;
    var objName = tree.view.getCellText(idx, tree.columns.getColumnAt(0));
    var level = tree.view.getLevel(idx);
    var info = smStructTrees[this.miDbObjects].getSmType(idx);

    //there is a database object at level 1 only
    var mpId = "";
    if (level == 0) {
      if(info.indexOf("all-") == 0) {
        info = info.substring("all-".length).toLowerCase();
        if (this.aObjTypes.indexOf(info) > 0) //thus omit master
          mpId = "create-" + info;
      }
    }
    if (level == 1) {
       if (this.aObjTypes.indexOf(info) != -1)
         mpId = info;
    }
    var mpdb = $$("mp-dbstructure");
    var ch = mpdb.childNodes;
    for(var i = 0; i < ch.length; i++) {
      var suffix = ch[i].getAttribute("smType");
      if (suffix == mpId)
        ch[i].hidden = false;
      else
        ch[i].hidden = true;
    }
  },

  showMruList: function() {
    var aList = SmGlobals.mru.getList();

    var menupopupNode = $$("menu-mru").firstChild;
    SmGlobals.$empty(menupopupNode);
    for (var i = 0; i < aList.length; i++) {
      var mp = $$("mi-mru");
      var mi = mp.cloneNode(true);
      mi.setAttribute("id", "mi-mru-" + i);
      mi.setAttribute("label", aList[i]);
      mi.removeAttribute("hidden");
      menupopupNode.appendChild(mi);
    }
  },

  observe: function(subject, topic, data) {
    if (topic != "nsPref:changed")
      return;

    switch(data) {
      case "jsonDataTreeStyle":
        if (SmGlobals.stylerDataTree.addTreeStyle())
          this.loadTabBrowse(false); //TODO: effect shown only when browsed object changes
        break;
      case "jsonMruData":
        this.showMruList();
        break;
      case "hideMainToolbar":
        var bPrefVal = sm_prefsBranch.getBoolPref("hideMainToolbar");
        $$("hbox-main-toolbar").hidden = bPrefVal;
        break;
      case "showMainToolbarDatabase":
        var bPrefVal = sm_prefsBranch.getBoolPref("showMainToolbarDatabase");
        $$("sm-toolbar-database").hidden = !bPrefVal;
        break;
      case "showMainToolbarTable":
        var bPrefVal = sm_prefsBranch.getBoolPref("showMainToolbarTable");
        $$("sm-toolbar-table").hidden = !bPrefVal;
        break;
      case "showMainToolbarIndex":
        var bPrefVal = sm_prefsBranch.getBoolPref("showMainToolbarIndex");
        $$("sm-toolbar-index").hidden = !bPrefVal;
        break;
      case "showMainToolbarDebug":
        var bPrefVal = sm_prefsBranch.getBoolPref("showMainToolbarDebug");
        $$("sm-toolbar-debug").hidden = !bPrefVal;
        break;
      case "sqliteFileExtensions":
        var sExt = sm_prefsBranch.getCharPref("sqliteFileExtensions");
        this.maFileExt = sExt.split(",");
        for (var iC = 0; iC < this.maFileExt.length; iC++) {
          this.maFileExt[iC] = this.maFileExt[iC].trim();
        }
        // Load profile folder's sqlite db files list into dropdown
        this.populateDBList("profile");
        break;
      case "searchToggler":
        var sPrefVal = sm_prefsBranch.getCharPref("searchCriteria", "");
        //because multiple windows can be open at the same time,
        //we first check whether browse tab has to be refreshed for
        //this instance of the application
        if (sPrefVal = this.mInstanceId) {
          this.loadTabBrowse(false);
        }
        break;
      case "displayNumRecords":
        var iPrefVal = sm_prefsBranch.getIntPref("displayNumRecords");
        this.miLimit = iPrefVal;
        if (this.miLimit == 0) this.miLimit = -1;
        this.miOffset = 0;
        break;
      case "identifierQuoteChar":
        var sQuoteChar = sm_prefsBranch.getCharPref("identifierQuoteChar");
        SQLiteFn.setQuoteChar(sQuoteChar);
        break;
      case "textForBlob":
      case "showBlobSize":
      case "maxSizeToShowBlobData":
      case "blob.howToShowData":
        var obj = {};
        obj.sStrForBlob = sm_prefsBranch.getCharPref("textForBlob");
        obj.bShowSize = sm_prefsBranch.getBoolPref("showBlobSize");
        obj.iMaxSizeToShowData = sm_prefsBranch.getIntPref("maxSizeToShowBlobData");
        obj.iHowToShowData = sm_prefsBranch.getIntPref("blob.howToShowData");

        this.mDb.setBlobPrefs(obj);
        break;
      case "handleADS": //for ADS on Windows/NTFS
        $$("mi-connect-ads-win").hidden = true;
        if (navigator.oscpu.indexOf("Windows") >= 0) {
          var iPrefVal = sm_prefsBranch.getIntPref("handleADS");
          if (iPrefVal == 1)
            $$("mi-connect-ads-win").hidden = false;
        }
        break;
      case "posInTargetApp":
      if(SmAppInfo.appInfo.ID == "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}") {
        var md = window.QueryInterface(Ci.nsIInterfaceRequestor)
          .getInterface(Ci.nsIWebNavigation)
          .QueryInterface(Ci.nsIDocShellTreeItem).rootTreeItem
          .QueryInterface(Ci.nsIInterfaceRequestor)
          .getInterface(Ci.nsIDOMWindow).document;
        var iVal = sm_prefsBranch.getIntPref("posInTargetApp");
        var mi = md.getElementById("menuitem-sqlitemanager");
        if (mi) {
          if (iVal == 0)
            mi.setAttribute("hidden", true);
          if (iVal == 1)
            mi.setAttribute("hidden", false);
        }
      }
    }
  },

  refresh: function() {
    if (!this.mDb.isConnected())
      return false;
    this.refreshDbStructure();
    return true;
  },
  //Issue #108
  reconnect: function() {
    if (!this.mDb.isConnected())
      return true;
    //check whether the file still exists
    var sPath = this.mDb.getFile().path;
    if(!this.mDb.getFile().exists()) {
      alert(sm_getLStr("sqlm.alert.fileNotFound") + sPath);
      this.closeDatabase(false);
      SmGlobals.mru.remove(sPath);
      this.setDatabase(null);
      return true;
    }

    //Issue #149: must connect in exclusive mode to connect to the actual file rather than the cached file; correspondingly, make exclusive mode the default one.
    $$("menu-general-sharedPagerCache").removeAttribute("checked");
    this.openDatabaseWithPath(sPath);
  },

  //refreshDbStructure: populates the schematree based on selected database
  //must be called whenever a database is opened/closed
  //and whenever the schema changes
  refreshDbStructure: function() {
    //1. if no database is selected
    if (!this.mDb.isConnected()) {
      smStructTrees[0].removeChildData();

      for(var i = 0; i < this.aObjTypes.length; i++) {
        var type = this.aObjTypes[i];
        this.aCurrObjNames[type] = null;
      }
      return;
    }

    //2. if db is being opened, set nodes to expand
    if (this.mbDbJustOpened) {
      //set the expandable nodes here
      var aExpand = [["all-table"],[]];
      //check whether aExpand data is in smextmgmt table and use it
      if (smExtManager.getUsage()) {
        aExpand = smExtManager.getStructTreeState();
      }
      smStructTrees[0].setExpandableNodes(aExpand);
    }

    //3.
    var tree = $$(smStructTrees[this.miDbObjects].treeId);

    //requery for all the objects afresh and redraw the tree
    for (var iC = 0; iC < this.aObjTypes.length; iC++) {
      var sType = this.aObjTypes[iC];
      this.aObjNames[sType] = this.mDb.getObjectList(sType, "");
    }

    var idx = tree.currentIndex;
    smStructTrees[this.miDbObjects].setChildData(this.aObjNames);

    if (idx >= smStructTrees[this.miDbObjects].visibleDataLength)
      idx = 0;

    tree.view.selection.select(idx); //triggers getDbObjectInfo function

    //now assign the current objects
    for(var i = 0; i < this.aObjTypes.length; i++) {
      var type = this.aObjTypes[i];
      if(this.aObjNames[type].length > 0) {
        var bFound = false;
        if(this.aCurrObjNames[type]) {
          for(var n = 0; n < this.aObjNames[type].length; n++) {
            if(this.aCurrObjNames[type] == this.aObjNames[type][n]) {
              bFound = true;
              break;
            }
          }
        }
        if(!bFound)
          this.aCurrObjNames[type] = this.aObjNames[type][0];
      }
      else
        this.aCurrObjNames[type] = null;
    }
  },

  //getDbObjectInfo: this function must show the structural info about the
  // selected database object (table, index, view & trigger)
  //this function is triggered by the select event on the tree
  getDbObjectInfo: function() {
    this.miDbInfoCallCount++;

    var tree = $$(smStructTrees[this.miDbObjects].treeId);
    var idx = tree.currentIndex;

    // idx = -1 if nothing is selected; says xulplanet element reference
    if(idx < 0 || idx >= tree.view.rowCount)
      idx = 1; //first table

    var level = tree.view.getLevel(idx);

    var r_name, r_type;
    //there is a database object at level 1 only
    if(level == 0) {
      if (this.miDbInfoCallCount > 1) {
        this.mostCurrObjName = null;
        this.mostCurrObjType = null;
        return false;
      }
      else {
        r_name = 'sqlite_master';
        r_type = 'master';
      }
    }
    else {
      //level 2 is a field name of the parent table
      if(level == 2) {
        idx = tree.view.getParentIndex(idx);
      }
      r_name = tree.view.getCellText(idx, tree.columns.getColumnAt(0));
      r_type = smStructTrees[this.miDbObjects].getSmType(idx);
    }

    //assign current selection in tree as current object
    this.aCurrObjNames[r_type] = r_name;

    this.mostCurrObjName = r_name;
    this.mostCurrObjType = r_type;

    this.loadTabStructure();
    this.loadTabBrowse(false);

    return true;
  },

  hideTabStructure: function() {
    //hide the hboxes containing object specific operation buttons; later enable one appropriate hbox according to the selection in tree
    smHide(["d-master-ops", "d-more-info", "gb-master-info"]);
  },

  emptyTabStructure: function() {
    //hide the hboxes containing object specific operation buttons
    //later enable one appropriate hbox according to the selection in tree
    this.hideTabStructure();

    $$("str-sql").value = "";

    this.printTableInfo(null, "table");
  },

  loadTabStructure: function() {
    //no need to waste resources if this tab is not selected
    if(this.getSelectedTabId() != "tab-structure")
      return false;

    this.hideTabStructure();
    this.cancelEditColumn();

    if (!this.mDb || !this.mDb.isConnected())
      return false;

    //there is a database object at level 1 only
    if(this.mostCurrObjName == null) {
      return false;
    }

    var r_name = this.mostCurrObjName;
    var r_type = this.mostCurrObjType;

    $$("d-master-ops").hidden = false;
    $$("d-master-ops").selectedPanel = $$("gb-master-ops-" + r_type);

    if (r_name == "sqlite_master" || r_name == "sqlite_temp_master") {
      $$("cap-object-info").label = 'TABLE' + ': ' + r_name;
    }
    else {
      var row = this.mDb.getMasterInfo(r_name, '');
      $$("cap-object-info").label = row.type.toUpperCase() + ': ' + row.name;
      if (row.sql != null) {
        $$("gb-master-info").hidden = false;
        $$("str-sql").value = row.sql;
        $$("desc-sql").textContent = row.sql;

        //let there be no scrollbars in the textbox
        var iMinRows = 1, iMaxRows = 20;
        if (row.type == 'table' || row.type == 'index') {
          iMaxRows = 10;
        }
        var ta = $$("str-sql");
        adjustTextboxRows(ta, iMinRows, iMaxRows);
      }
    }
    //do the following for table/index
    if(r_type == "table" || r_type == "master") {
      this.printTableInfo(this.aCurrObjNames[r_type], r_type);
    }
    if(r_type == "index") {
      this.printIndexInfo(this.aCurrObjNames[r_type]);
    }
    return true;
  },

  printTableInfo: function(sTable, sType) {
    if (this.miDbObjects == 1) //no add column option for master tables
      sType = "master";

    $$("d-more-info").hidden = false;
    $$("d-more-info").selectedPanel = $$("gb-more-info-table");

    SmGlobals.$empty($$("smTableColumns"));
    if (sTable == null)
      return;

    smShow(["hb-addcol", "mp-opTableColumn"]);
    if (sTable.indexOf("sqlite_") == 0) {
      //no add/edit/drop column for master tables
      smHide(["hb-addcol", "mp-opTableColumn"]);
     }

    $$("treeTabCols").setAttribute("smTableName", sTable);
    var cols = this.mDb.getTableInfo(sTable, "");
    $$("capColumns").label = $$("capColumns").getAttribute("labelPrefix") + " (" + cols.length + ")";

    SmGlobals.$empty($$("smTableColumns"));
    var hhh = '';
    for(var i = 0; i < cols.length; i++) {
/* the following is useful with jquery
      hhh += '<treeitem><treerow>';
      hhh += '<treecell label="' + cols[i].cid + '"/>';
      hhh += '<treecell label="' + cols[i].name + '"/>';
      hhh += '<treecell label="' + cols[i].type + '"/>';
      hhh += '<treecell label="' + cols[i].notnull + '"/>';
      hhh += '<treecell label="' + cols[i].dflt_value + '"/>';
      hhh += '<treecell label="' + cols[i].pk + '"/>';
      hhh += '</treerow/></treeitem>';
*/
      var trow = document.createElement("treerow");

      var tcell = document.createElement("treecell");
      tcell.setAttribute("label", cols[i].cid);
      trow.appendChild(tcell);

      var tcell = document.createElement("treecell");
      tcell.setAttribute("label", cols[i].name);
      trow.appendChild(tcell);

      var tcell = document.createElement("treecell");
      tcell.setAttribute("label", cols[i].type);
      trow.appendChild(tcell);

      var tcell = document.createElement("treecell");
      tcell.setAttribute("label", cols[i].notnull);
      trow.appendChild(tcell);

      var tcell = document.createElement("treecell");
      tcell.setAttribute("label", cols[i].dflt_value);
      if (cols[i].dflt_value == null)
        tcell.setAttribute("class", "nullvalue");
      trow.appendChild(tcell);

      var tcell = document.createElement("treecell");
      tcell.setAttribute("label", cols[i].pk);
      trow.appendChild(tcell);

      var titem = document.createElement("treeitem");
      titem.appendChild(trow);
      $$("smTableColumns").appendChild(titem);
    }
    //TODO: sort this funny issue!! the assignment below succeeds but when I select a master table, the border of the tree encloses only so many rows as were visible in the previously shown table.
    //TODO: set a user-pref for max/min rows or a splitter?
    var iRows = (cols.length <= 5)? 5 : cols.length;
    $$("treeTabCols").setAttribute("rows", cols.length);

    var aObj = this.mDb.getObjectCount(sTable, "");
    $$("numRecords").value = this.mDb.getRowCount(sTable, "");
    $$("numIndexes").value = aObj.indexCount;
    $$("numTriggers").value = aObj.triggerCount;
  },

  printIndexInfo: function(sIndex) {
    $$("d-more-info").hidden = false;
    $$("d-more-info").selectedPanel = $$("gb-more-info-index");

    var aIndexInfo = this.mDb.getIndexDetails(sIndex, '');
    $$("tabletoindex").value = aIndexInfo.tbl_name;
    $$("duplicatevalues").value = sm_getLStr("allowed");
    if(aIndexInfo.unique == 1)
      $$("duplicatevalues").value = sm_getLStr("notAllowed");

    var cols = this.mDb.getIndexInfo(sIndex, "");

    SmGlobals.$empty($$("smIndexColumns"));
    for(var i = 0; i < cols.length; i++) {
      var trow = document.createElement("treerow");

      var tcell = document.createElement("treecell");
      tcell.setAttribute("label", cols[i].seqno);
      trow.appendChild(tcell);

      var tcell = document.createElement("treecell");
      tcell.setAttribute("label", cols[i].cid);
      trow.appendChild(tcell);

      var tcell = document.createElement("treecell");
      tcell.setAttribute("label", cols[i].name);
      trow.appendChild(tcell);

      var titem = document.createElement("treeitem");
      titem.appendChild(trow);
      $$("smIndexColumns").appendChild(titem);
    }
  },

  changeSortOrder: function(sColName) {
    var bFound = false;
    for(var i = 0; i < this.maSortInfo.length; i++) {
      if (this.maSortInfo[i][0] == sColName) {
        bFound = true;
        switch (this.maSortInfo[i][1]) {
          case "none":
            this.maSortInfo[i][1] = "asc";
            break;
          case "asc":
            this.maSortInfo[i][1] = "desc";
            break;
          case "desc":
            this.maSortInfo[i][1] = "none";
            break;
        }
        var aTemp = this.maSortInfo[i];
        this.maSortInfo.splice(i, 1);

        if (aTemp[1] != "none")
          this.maSortInfo.splice(0, 0, aTemp);
      }
    }
    if (!bFound)
      this.maSortInfo.splice(0, 0, [sColName, "asc"]);

    return this.maSortInfo;
  },

  //loadTabBrowse: populates the table list and the tree view for current table; must be called whenever a database is opened/closed and whenever the schema changes; depends entirely upon the values in "browse-type" and "browse-name" controls
  loadTabBrowse: function(bForce) {
    //no need to waste resources if this tab is not selected
    if (!bForce)
      if(this.getSelectedTabId() != "tab-browse")
        return false;

    if (!this.mDb.isConnected())
      return false;

    if (this.mostCurrObjType == null)
      return false;

    var sObjType = this.mostCurrObjType.toLowerCase();
    if (sObjType != "table" && sObjType != "master" && sObjType != "view")
      return false;

    $$("browse-type").value = sObjType.toUpperCase();
    if ($$("browse-name").value != this.mostCurrObjName)
      this.maSortInfo = [];

    $$("browse-name").value = this.mostCurrObjName;

    //populate the treeview
    var sObjName = this.mostCurrObjName;
    var bBrowseObjectChanged = false;
    if (sObjName != this.msBrowseObjName) {
      bBrowseObjectChanged = true;
      this.miOffset = 0;
      this.msBrowseObjName = sObjName;
      this.msBrowseCondition = "";
    }

    //some UI depends on whether table/master tables/view is shown
    var btnAdd =  $$("btnAddRecord");
    var btnDup =  $$("btnAddDupRecord");
    var btnEdit =  $$("btnEditRecord");
    var btnDelete =  $$("btnDeleteRecord");

    var treeChildren = $$("browse-treechildren");

    var setting = [false, "mp-editTableRow", "SQLiteManager.operateOnTable('update')"];
    if (sObjType == "table" && (this.mostCurrObjName == "sqlite_master" || this.mostCurrObjName == "sqlite_temp_master")) {
      setting = [true, "mp-browse-copy", ""];
    }
    if (sObjType == "master") {
      setting = [true, "mp-browse-copy", ""];
    }

    btnAdd.disabled = setting[0];
    btnDup.disabled = setting[0];
    btnEdit.disabled = setting[0];
    btnDelete.disabled = setting[0];

    $$("mp-editTableRow-mi-update").hidden = false;
    $$("mp-editTableRow-mi-delete").hidden = false;
    $$("mp-editTableRow-mi-duplicate").hidden = false;

    if (sObjType == "view") {
      var aRet = this.mDb.getAllowedOpsOnView(sObjName, "");
      btnAdd.disabled = !aRet["insert"];
      btnDup.disabled = !aRet["insert"];
      btnEdit.disabled = !aRet["update"];
      btnDelete.disabled = !aRet["delete"];

      $$("mp-editTableRow-mi-update").hidden = !aRet["update"];
      $$("mp-editTableRow-mi-delete").hidden = !aRet["delete"];
      $$("mp-editTableRow-mi-duplicate").hidden = !aRet["duplicate"];
    }

    treeChildren.setAttribute("context", setting[1]);
    treeChildren.setAttribute("ondblclick", setting[2]);

    if (bBrowseObjectChanged || bForce)
      treeBrowse.ShowTable(false);

    try {
      var aArgs = {sWhere: this.msBrowseCondition, iLimit: this.miLimit, iOffset: this.miOffset, aOrder: this.maSortInfo};
      var iRetVal = this.mDb.loadTableData(sObjType, sObjName, aArgs);
      var timeElapsed = this.mDb.getElapsedTime();
    } catch (e) {
      sm_message(e + "\n" + sm_getLStr("loadDataFailed"), 0x3);
      return false;
    }
    if (iRetVal == -1)
      return false;

    var records = this.mDb.getRecords();
    var types = this.mDb.getRecordTypes();
    var columns = this.mDb.getColumns();
    this.miCount = this.mDb.getRowCount(sObjName, this.msBrowseCondition);
    $$("sbQueryTime").label = "ET: " + timeElapsed + " ms";

    this.manageNavigationControls();
    if (records && columns) {
      $$("browse-tree").setAttribute("smObjType", sObjType);
      $$("browse-tree").setAttribute("smObjName", sObjName);

      if (bBrowseObjectChanged || bForce) {
        treeBrowse.createColumns(columns, iRetVal, this.maSortInfo);

        var jsonColInfo = smExtManager.getBrowseTreeColState(sObjType, sObjName);
        var objColInfo = {};
        if (jsonColInfo != "") {
          objColInfo = JSON.parse(jsonColInfo);
          treeBrowse.adjustColumns(objColInfo);
        }

        treeBrowse.PopulateTableData(records, columns, types);
        treeBrowse.ShowTable(true);

        //scrollToHorizontalPosition works only after PopulateTableData
        //also it does not work without some alert in between
        //it appears we need some time delay; why, I do not know.
        if (objColInfo.horizontalPosition) {
          //window.setTimeout(function() { $$("browse-tree").treeBoxObject.scrollToHorizontalPosition(objColInfo.horizontalPosition);}, 5000);

          $$("browse-tree").treeBoxObject.scrollToHorizontalPosition(objColInfo.horizontalPosition);
        }
      }
      else {
        treeBrowse.PopulateTableData(records, columns, types);
      }
    }
    return true;
  },

  //TODO: Issue #378
  copyColumnName: function(ctrl) {
    alert(ctrl.tagName);
    alert(ctrl.parentNode.tagName);
    alert(ctrl.parentNode.parentNode.tagName);
  },

  onBrowseNavigate: function(sType) {
    switch(sType) {
      case "first":
        this.miOffset = 0;
        break;
      case "previous":
        this.miOffset = this.miOffset - this.miLimit;
        if (this.miOffset < 0)
          this.miOffset = 0;
        break;
      case "next":
        this.miOffset = this.miOffset + this.miLimit;
        break;
      case "last":
        //change to correctly handle navigation to last screen if miLimit divides miCount
        var iRem = this.miCount % this.miLimit;
        this.miOffset = this.miCount - ((iRem==0)?this.miLimit:iRem);
        break;
    }
    this.loadTabBrowse(false);
  },

  manageNavigationControls: function() {
    //manage textboxes
    $$("nav-total-val").value = this.miCount;
    var iStart = (this.miCount == 0) ? 0 : (this.miOffset + 1);
    $$("nav-start-val").value = iStart;
    var iEnd = this.miOffset + this.miLimit;
    iEnd = ((iEnd > this.miCount) || (this.miLimit <= 0)) ? this.miCount : iEnd;
    $$("nav-end-val").value = iEnd;

    //manage buttons
    var btnFirst = $$("btn-nav-first");
    var btnPrevious = $$("btn-nav-previous");
    var btnNext = $$("btn-nav-next");
    var btnLast = $$("btn-nav-last");

    btnFirst.disabled = false;
    btnPrevious.disabled = false;
    btnNext.disabled = false;
    btnLast.disabled = false;

    //manage the navigate buttons
    if (this.miLimit < 0 || this.miLimit >= this.miCount) {
      btnFirst.disabled = true;
      btnPrevious.disabled = true;
      btnNext.disabled = true;
      btnLast.disabled = true;
      return;
    }

    if (this.miOffset == 0) {
      btnFirst.disabled = true;
      btnPrevious.disabled = true;
    }
    else {
      btnFirst.disabled = false;
      btnPrevious.disabled = false;
    }
    //change condition so that we do not have next/last enabled when we reach the end
    if (this.miOffset + this.miLimit >= this.miCount) {
      btnNext.disabled = true;
      btnLast.disabled = true;
    }
    else {
      btnNext.disabled = false;
      btnLast.disabled = false;
    }
  },

  //loadTabExecute: anything to be done when that tab is shown goes here
  loadTabExecute: function() {
    this.populateQueryListbox();
  },

  //loadTabDbInfo: anything to be done when that tab is shown goes here
  loadTabDbInfo: function() {
    //no need to waste resources if this tab is not selected
    if(this.getSelectedTabId() != "tab-dbinfo")
      return false;

    if (!this.mDb.isConnected())
      return false;
//assume sqlite >= 3.7.4
    //the commented values have a set operation but no get operation
    var aSettings = ["application_id", "auto_vacuum", "automatic_index", "busy_timeout", "cache_size", "cache_spill", /*"case_sensitive_like",*/ "checkpoint_fullfsync", "defer_foreign_keys", "encoding", "foreign_keys", "freelist_count", "fullfsync", /*"ignore_check_constraints",*/  "journal_mode", "journal_size_limit", "legacy_file_format", "locking_mode", "max_page_count", "mmap_size", "page_count", "page_size", "query_only", "read_uncommitted", "recursive_triggers", "reverse_unordered_selects", "schema_version", "secure_delete", "soft_heap_limit", "synchronous", "temp_store", "user_version", "wal_autocheckpoint"/*, "writable_schema"*/];

    for(var i = 0; i < aSettings.length; i++)  {
      var sSetting = aSettings[i];
      var node = $$("pr-" + sSetting);
      var newVal = this.mDb.getSetting(sSetting);
      node.value = newVal;
    }
    return true;
  },

  search: function() {
    var oType = $$("browse-type").value.toUpperCase();
    var oName = $$("browse-name").value;
    if (oType == "VIEW")
      return this.searchView(oName);
    if (oType == "TABLE" || oType == "MASTER") {
      var aRetVals = {instanceId: this.mInstanceId};
      window.openDialog("chrome://sqlitemanager/content/RowOperations.xul", "RowOperations", "chrome, resizable, centerscreen, modal, dialog", this.mDb, oName, "search", "", "table", aRetVals);
      if (aRetVals.ok) {
        this.msBrowseCondition = aRetVals.sWhere;
        //because search criteria has changed, set offset for navigating to zero
        this.miOffset = 0;
        this.loadTabBrowse(false);
      }
      return true;
    }
  },

  searchView1: function(sViewName) {
    var aArgs = {sWhere: "", iLimit: 1, iOffset: 0};
    this.mDb.loadTableData("view", sViewName, aArgs);
    var records = this.mDb.getRecords();
    if (records.length == 0) {
      alert(sm_getLStr("noRecord"));
      return false;
    }

    var columns = this.mDb.getColumns();
    var names = [], types = [];
    for (var col in columns) {
      names[col] = columns[col][0];
      types[col] = '';
    }
    var aColumns = [names, types];

    this.aFieldNames = aColumns[0];
    var aTypes = aColumns[1];

    var grbox = $$("hb-sliding");
    SmGlobals.$empty(grbox);
//        var cap = document.createElement("caption");
//        cap.setAttribute("label", "Enter Field Values");
//        grbox.appendChild(cap);

    for (var i = 0; i < this.aFieldNames.length; i++) {
      var hbox = document.createElement("hbox");
      hbox.setAttribute("flex", "1");
      hbox.setAttribute("style", "margin:2px 3px 2px 3px");

      var lbl = document.createElement("label");
      var lblVal = (i+1) + ". " + this.aFieldNames[i];
      lblVal += " ( " + aTypes[i] + " )";
      lbl.setAttribute("value", lblVal);
      lbl.setAttribute("style", "padding-top:5px;width:25ex");
      lbl.setAttribute("accesskey", (i+1));
      lbl.setAttribute("control", "ctrl-" + this.aFieldNames[i]);
      hbox.appendChild(lbl);

      var spacer = document.createElement("spacer");
      spacer.flex = "1";
      hbox.appendChild(spacer);

      var vb = RowOperations.getSearchMenuList(this.aFieldNames[i]);
      hbox.appendChild(vb);

      var inp = RowOperations.getInputField(i);
      hbox.appendChild(inp);

      var vb = RowOperations.getInputToggleImage(i);
      hbox.appendChild(vb);

      grbox.appendChild(hbox);
    }
    return true;
  },

  searchView: function(sViewName) {
    var aArgs = {sWhere: "", iLimit: 1, iOffset: 0};
    this.mDb.loadTableData("view", sViewName, aArgs);
    var records = this.mDb.getRecords();
    if (records.length == 0) {
      alert(sm_getLStr("noRecord"));
      return false;
    }

    var columns = this.mDb.getColumns();
    var names = [], types = [];
    for (var col in columns) {
      names[col] = columns[col][0];
      types[col] = '';
    }
    var cols = [names, types];
    var aRetVals = {instanceId: this.mInstanceId};
    window.openDialog("chrome://sqlitemanager/content/RowOperations.xul",  "RowOperations", "chrome, resizable, centerscreen, modal, dialog", this.mDb, sViewName, "search-view", cols, "view", aRetVals);
    if (aRetVals.ok) {
      this.msBrowseCondition = aRetVals.sWhere;
      //because search criteria has changed, set offset for navigating to zero
      this.miOffset = 0;
      this.loadTabBrowse(false);
    }
    return true;
  },

  showAll: function() {
    this.msBrowseCondition = "";
    //because search criteria has changed, set offset for navigating to zero
    this.miOffset = 0;
    this.loadTabBrowse(false);
  },

  //getSelectedTabId: returns the id of the selected tab
  getSelectedTabId: function() {
    return $$("sm-tabs").selectedItem.id;
  },

  //selectStructTab: called when onselect event fires on tabs[id="sm-tabs-db"]
  selectStructTab: function(oSelectedTab) {
    var id = oSelectedTab.getAttribute("id");
    switch(id) {
      case "tab-db-norm":
        this.miDbObjects = 0;
        break;
    }
    this.refreshDbStructure();
    return true;
  },

  loadTabWithId: function(sId) {
    switch(sId) {
      case "tab-structure":
        this.loadTabStructure();
        break;
      case "tab-browse":
        this.loadTabBrowse(false);
        break;
      case "tab-execute":
        this.loadTabExecute();
        break;
      case "tab-dbinfo":
        this.loadTabDbInfo();
        break;
      case "tab-exim":
        $$(sId).collapsed = false;
        $$("sm-tabs").selectedItem = $$(sId);
        break;
      case "tab-udf":
        $$(sId).collapsed = false;
        $$("sm-tabs").selectedItem = $$(sId);
        break;
      case "tab-connectSql":
        $$(sId).collapsed = false;
        $$("sm-tabs").selectedItem = $$(sId);
        break;
    }
    //closebutton should be shown if exim/udf/connectSql tab is displayed
    if (this.getSelectedTabId() == "tab-exim" || this.getSelectedTabId() == "tab-udf" || this.getSelectedTabId() == "tab-connectSql") {
      $$("sm-tabs").setAttribute("closebutton", true);
    }
    else {
      $$("sm-tabs").setAttribute("closebutton", false);
    }
    return true;
  },

  closeTab: function() {
    var sId = $$("sm-tabs").selectedItem.id;
    switch(sId) {
      case "tab-structure":
      case "tab-browse":
      case "tab-execute":
      case "tab-dbinfo":
        return true;
        break;
      case "tab-exim":
      case "tab-udf":
      case "tab-connectSql":
        $$(sId).collapsed = true;
        break;
    }
    var iCurr = $$("sm-tabs").selectedIndex;
    var iLength = $$("sm-tabs").itemCount;
    if (iCurr > -1 && iCurr < iLength) {
      var iNew = iCurr - 1;
      if (iNew < 0)
        iNew = iLength - 1;
      while ($$("sm-tabs").getItemAtIndex(iNew).collapsed) {
        iNew--;
        if (iNew < 0)
          iNew = iLength - 1;
        if (iNew == iCurr)
          break;
      }
      $$("sm-tabs").selectedIndex = iNew;
    }
//    $$("sm-tabs").advanceSelectedTab(-1, true);
//    while ($$($$("sm-tabs").selectedItem.id).collapsed)
//      $$("sm-tabs").advanceSelectedTab(-1, true);
    return true;
  },

  //bImplicit: false = called from menuitem; true = function call
  useExtensionManagementTable: function(bUse, bImplicit) {
    var mi = $$("menu-general-extensionTable");

    if (!this.mDb.isConnected()) {
      //revert to the state before clicking
      mi.removeAttribute("checked");
      if (!bImplicit) alert(sm_getLStr("firstOpenADb"));
      return false;
    }

    smExtManager.setUsage(bUse, bImplicit);
    if (bUse) {
      mi.setAttribute("checked", "true");
      this.populateQueryListbox();
    }
    else
      mi.removeAttribute("checked");

    //refresh the structure tree here so that mgmt table is shown/removed
    this.refresh();

    //hide/show the images for query history in the execute sql tab
    var aId = ["queryHistoryPrevImage", "queryHistoryNextImage", "querySaveByNameImage", "queryHistoryClearImage", "listbox-queries"];
    if (bUse)
      smShow(aId);
    else
      smHide(aId);

    return true;
  },

  showPrevSql: function() {
    var sQuery = smExtManager.getPrevSql();
    if (!sQuery) return;
    $$("txtSqlStatement").value = sQuery;
  },

  showNextSql: function() {
    var sQuery = smExtManager.getNextSql();
    if (!sQuery) return;
    $$("txtSqlStatement").value = sQuery;
  },

  saveSqlByName: function()  {
    var sQuery = $$("txtSqlStatement").value;
    if (sQuery.length <= 0)
      alert(sm_getLStr("sqlm.nothingToSave"));

    if (smExtManager.saveSqlByName(sQuery))
      this.populateQueryListbox();
  },

  clearSqlHistory: function() {
    smExtManager.clearSqlHistory();
  },

  onSelectQuery: function() {
    var sVal = $$("listbox-queries").value;
    if (sVal != this.msQuerySelectInstruction)
      $$("txtSqlStatement").value = sVal;
  },

  populateQueryListbox: function() {
    var listbox = $$("listbox-queries");
    if (!this.mDb.isConnected()) {
      listbox.hidden = true;
      return false;
    }
    var aQueries = smExtManager.getQueryList();
    if (aQueries.length)
      aQueries.unshift(this.msQuerySelectInstruction);
    else
      aQueries = [this.msQuerySelectInstruction];
    var sDefault = listbox.selectedItem;
    if (sDefault != null)
      sDefault = sDefault.label;
    PopulateDropDownItems(aQueries, listbox, sDefault);
  },

  runSqlStatement: function(sType) {
    if(this.getSelectedTabId() != "tab-execute")
      return false;

    if (!this.mDb.isConnected()) {
      alert(sm_getLStr("firstOpenADb"));
      return false;
    }

    //get the query string from an xul page
    var sQuery = $$("txtSqlStatement").value;

    var queries = sql_tokenizer(sQuery);
    if (queries.length == 0) {
      alert(sm_getLStr("writeSomeSql"));
      return false;
    }
    var aData, aColumns, aTypes;
    var timeElapsed = 0;
    var bRet = false;
//    if(sType == "select")
    if (queries.length == 1) {
      sQuery = queries[0];
      bRet = this.mDb.selectQuery(sQuery);
      timeElapsed = this.mDb.getElapsedTime();
      //store the query in config db
      if (bRet) {
        aData = this.mDb.getRecords();
        aColumns = this.mDb.getColumns();
        aTypes = this.mDb.getRecordTypes();
         sm_message(sm_getLFStr("rowsReturned", [aData.length]), 0x2);
        smExtManager.addQuery(sQuery);
      }
      //set this value so that query history is reset to latest query
      //that is previous will again begin from the latest query
      smExtManager.goToLastQuery();
    }
    else {
      bRet = this.mDb.executeTransaction(queries);
      timeElapsed = this.mDb.getElapsedTime();
    }

    //display the last error in the textbox
    $$("sqlLastError").value = this.mDb.getLastError();
    if (bRet) {
      $$("sbQueryTime").label = "ET: " + timeElapsed + " ms";
    }

    //the following two lines must be before the code for tree
    //otherwise, it does not refresh the structure tree as expected
    this.refreshDbStructure();
    this.loadTabBrowse(false);

    this.setQueryView("table");
    treeExecute.ShowTable(false);
    if (bRet && queries.length == 1) {
      treeExecute.createColumns(aColumns, 0, []);
      treeExecute.PopulateTableData(aData, aColumns, aTypes);
      treeExecute.ShowTable(true);
    }
  },

  setQueryView: function(sView) {
    var aViewTypes = ["table", "csv"];
    $$("sqlOutput").selectedIndex = aViewTypes.indexOf(sView);
    if (sView == "csv") {
      var sText = treeExecute.exportAllRows("csv");
      $$("txtSqlOutput").value = sText;
    }
  },

  saveQuery: function(sFormat) {
    var sText = treeExecute.exportAllRows(sFormat);
    this.saveToFile(sText, sFormat);
  },

  saveToFile: function(sText, sFormat) {
    const nsIFilePicker = Ci.nsIFilePicker;
    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
    fp.init(window, sm_getLStr("exim.exportToFile"), nsIFilePicker.modeSave);
    fp.appendFilters(nsIFilePicker.filterAll);
    fp.defaultString = "output." + sFormat.substring(0,3);

    var rv = fp.show();

    //if chosen then
    if (rv != nsIFilePicker.returnOK && rv != nsIFilePicker.returnReplace) {
      alert(sm_getLStr("exim.chooseFileExport"));
      return false;
    }
    var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
    file.initWithFile(fp.file);

    var foStream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
    // use 0x02 | 0x10 to open file for appending.
    foStream.init(file, 0x02 | 0x08 | 0x20, 0664, 0); // write, create, truncate

    var os = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(Ci.nsIConverterOutputStream);

    // This assumes that fos is the nsIOutputStream you want to write to
    os.init(foStream, "UTF-8", 0, 0x0000);

    os.writeString(sText);

    os.close();
    foStream.close();
  },

  newDatabase: function() {
    var sExt = "." + this.maFileExt[0];
    //prompt for a file name
    var fname = prompt(sm_getLFStr("sqlm.enterDatabaseName", [sExt]), "", sm_getLStr("sqlm.enterDatabaseName.title"));

    //if cancelled, abort
    if (fname == "" || fname == null)
      return false;

    //append the extension to the chosen name
    fname += sExt;

    //let the user choose the folder for the new db file
    var dir = SmGlobals.chooseDirectory(sm_getLStr("selectFolderForDb"));
    if (dir != null) {
      //access this new copied file
      var newfile = Cc["@mozilla.org/file/local;1"]
                .createInstance(Ci.nsILocalFile);
      newfile.initWithPath(dir.path);
      newfile.append(fname);

      //if the file already exists, alert user that existing file will be opened
      if(newfile.exists()) {
        alert(sm_getLStr("dbFileExists"));
      }

      //if another file is already open,
      //confirm from user that it should be closed
      if(this.closeDatabase(false)) {
        //if the file does not exist, openDatabase will create it
        this.setDatabase(newfile);
        return true;
      }
    }
    return false;
  },

  //closeDatabase:
  closeDatabase: function(bAlert) {
    //nothing to close if no database is already open
    if (!this.mDb.isConnected()) {
       if(bAlert)
        alert(sm_getLStr("noOpenDb"));
      return true;
    }

     //if another file is already open, confirm before closing
     var answer = true;
     if(bAlert)
      answer = smPrompt.confirm(null, sm_getLStr("extName"), sm_getLStr("confirmClose"));

    if(!answer)
      return false;

    //if extmgmt table is in use
    if (smExtManager.getUsage()) {
      //save StructureTreeState
      smExtManager.setStructTreeState(smStructTrees[0].aExpandedNodes);
      //save info on attached tables
      var aAttached = this.mDb.getAttachedDbList();
      smExtManager.setAttachedDbList(aAttached);
    }
    //make the current database as null and
    //call setDatabase to do appropriate things
    this.mDb.closeConnection();
    this.setDatabase(null);
    return true;
  },

  copyDatabase: function() {
     if (!this.mDb.isConnected()) {
      alert(sm_getLStr("firstOpenADb"));
      return;
    }
    var sExt = "." + this.maFileExt[0];
    //prompt for a file name
    var fname = prompt(sm_getLFStr("sqlm.enterDatabaseName", [sExt]), "", sm_getLStr("sqlm.enterDatabaseName.title"));

    //if cancelled, abort
    if (fname == "" || fname == null)
      return;
    else
      fname += sExt;

    //let the user choose the folder for the new db file
    var dir = SmGlobals.chooseDirectory(sm_getLStr("selectFolderForDb"));
    if (dir != null) {
      //copy the opened file to chosen location
      this.mDb.getFile().copyTo(dir, fname);

      //access this new copied file
      var newfile = Cc["@mozilla.org/file/local;1"]
                .createInstance(Ci.nsILocalFile);
      newfile.initWithPath(dir.path);
      newfile.append(fname);

      //if the file does not exist, openDatabase will create it
      if(!newfile.exists()) {
        var ans = smPrompt.confirm(null, sm_getLStr("extName"), sm_getLStr("copyFailed"));
        if(!ans)
          return;
      }

      //assign the new file (nsIFile) to the current database
      if(this.closeDatabase(false)) {
        this.setDatabase(newfile);
        return;
      }
    }
    return;
  },

  compactDatabase: function() {
    if (!this.mDb.isConnected()) {
      alert(sm_getLStr("firstOpenADb"));
      return false;
    }
    var befPageCount = this.mDb.getSetting("page_count");
    var pageSize = this.mDb.getSetting("page_size");
    var sQuery = "VACUUM";
    //cannot vacuum from within a transaction
    this.mDb.selectQuery(sQuery);
    var aftPageCount = this.mDb.getSetting("page_count");
    sm_alert(sm_getLStr("vacuum.title"), sm_getLFStr("vacuum.details", [befPageCount, befPageCount*pageSize, aftPageCount, aftPageCount*pageSize]));
    return true;
  },

  analyzeDatabase: function() {
    if (!this.mDb.isConnected()) {
      alert(sm_getLStr("firstOpenADb"));
      return false;
    }
    var sQuery = "ANALYZE";
    this.mDb.selectQuery(sQuery);
    return true;
  },

  checkIntegrity: function(checkType) {
    if (!this.mDb.isConnected()) {
      alert(sm_getLStr("firstOpenADb"));
      return false;
    }
    var sQuery = "PRAGMA integrity_check";
    if (checkType == "quick")
      sQuery = "PRAGMA quick_check";

    this.mDb.selectQuery(sQuery);
    var records = this.mDb.getRecords();
    var columns = this.mDb.getColumns();

    var txt = sm_getLFStr("integrityResultPrefix", [sQuery]) + ": ";
    //report OK if i row returned containing the value "ok"
    if (records.length == 1 && records[0][0] == "ok")
      alert(txt + sm_getLStr("ok"));
    else
      alert(txt + sm_getLFStr("notOk", [sQuery]));
    return true;
  },

  openDatabase: function() {
    const nsIFilePicker = Ci.nsIFilePicker;
    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
    fp.init(window, sm_getLStr("selectDb"), nsIFilePicker.modeOpen);
    var sExt = "";
    for (var iCnt = 0; iCnt < this.maFileExt.length; iCnt++) {
      sExt += "*." + this.maFileExt[iCnt] + ";";
    }
    fp.appendFilter(sm_getLStr("sqliteDbFiles") + " (" + sExt + ")", sExt);
    fp.appendFilters(nsIFilePicker.filterAll);

    var rv = fp.show();
    if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace) {
      // work with returned nsILocalFile...
      if(this.closeDatabase(false)) {
        this.setDatabase(fp.file);
        return true;
      }
    }
    return false;
  },

  openDatabaseADS: function() {
    const nsIFilePicker = Ci.nsIFilePicker;
    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
    fp.init(window, sm_getLStr("selectDb"), nsIFilePicker.modeOpen);
    var sExt = "";
    for (var iCnt = 0; iCnt < this.maFileExt.length; iCnt++) {
      sExt += "*." + this.maFileExt[iCnt] + ";";
    }
    fp.appendFilter(sm_getLStr("sqliteDbFiles") + " (" + sExt + ")", sExt);
    fp.appendFilters(nsIFilePicker.filterAll);

    var rv = fp.show();
    if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace) {
      var check = {value: false};// default the checkbox to false
      var input = {value: ""}; // default the edit field to table name
      var result = smPrompt.prompt(null, sm_getLStr("sqlm.enterADSName") + fp.file.leafName, sm_getLStr("sqlm.enterADSName.descr"), input, null, check);
      var sAdsName = input.value;
      //returns true on OK, false on cancel
      if (!result || sAdsName.length == 0)
        return false;

      var sPath = fp.file.path + ":" + sAdsName;
      return this.openDatabaseWithPath(sPath);
    }
    return false;
  },

  openDatabaseWithPath: function(sPath) {
    var newfile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
    try {
      newfile.initWithPath(sPath);
    } catch (e) {
      alert(sm_getLStr("sqlm.alert.fileNotFound") + sPath);
      SmGlobals.mru.remove(sPath);
      return false;
    }
    if(newfile.exists()) {
      if(this.closeDatabase(false)) {
        this.setDatabase(newfile);
        return true;
      }
    }
    else {
      alert(sm_getLStr("sqlm.alert.fileNotFound") + sPath);
      SmGlobals.mru.remove(sPath);
    }
    return false;
  },

  saveDatabase: function() {
  },

  openUdfTab: function() {
    this.loadTabWithId("tab-udf");
    SmUdf.loadTab();
  },

  openConnectSqlTab: function() {
    this.loadTabWithId("tab-connectSql");
    SmConnectSql.loadTab();
  },

  createTable: function() {
    if (!this.mDb.isConnected()) {
      alert(sm_getLStr("firstOpenADb"));
      return false;
    }

    var aRetVals = {};
    window.openDialog("chrome://sqlitemanager/content/createTable.xul", "createTable", "chrome, resizable, centerscreen, modal, dialog", this.mDb, aRetVals);
     if (aRetVals.ok) {
      this.mDb.confirmAndExecute([aRetVals.createQuery], sm_getLFStr("sqlm.confirm.createTable", [aRetVals.tableName]), "confirm.create");
      this.refreshDbStructure();
      this.loadTabBrowse(false);
    }
  },

  createObject: function(sObjectType) {
    if (!this.mDb.isConnected()) {
      alert(sm_getLStr("firstOpenADb"));
      return false;
    }

    var xul = "chrome://sqlitemanager/content/create" + sObjectType + ".xul";
    if (sObjectType == "view") {
       var aRetVals = {dbName: this.mDb.logicalDbName, tableName: this.aCurrObjNames["table"]};
      window.openDialog(xul, "create" + sObjectType,
              "chrome, resizable, centerscreen, modal, dialog",
              this.mDb, aRetVals);
      if (aRetVals.ok) {
        this.mDb.confirmAndExecute(aRetVals.queries, sm_getLFStr("sqlm.confirm.createObj", [sObjectType, aRetVals.objectName]), "confirm.create");
        this.refreshDbStructure();
        this.loadTabBrowse(false);
      }
    }
    else
      window.openDialog(xul, "create" + sObjectType,
              "chrome, resizable, centerscreen, modal, dialog",
              this.mDb, this.aCurrObjNames["table"], sObjectType);

    this.refreshDbStructure();
    this.loadTabBrowse(false);
    return true;
  },

  modifyView: function() {
    var sViewName = this.aCurrObjNames["view"];
    var info = this.mDb.getMasterInfo(sViewName, "");
    var sOldSql = info.sql;
    var sSelect = getViewSchemaSelectStmt(sOldSql);

    var aRetVals = {dbName: this.mDb.logicalDbName, objectName: sViewName, modify: 1, selectStmt: sSelect};
    aRetVals.readonlyFlags = ["dbnames", "viewname"];
    window.openDialog("chrome://sqlitemanager/content/createview.xul", "createView", "chrome, resizable, centerscreen, modal, dialog", this.mDb, aRetVals);
    if (aRetVals.ok) {
      this.mDb.confirmAndExecute(aRetVals.queries, sm_getLFStr("sqlm.confirm.modifyView", [aRetVals.objectName]), "confirm.create");
      this.refreshDbStructure();
      this.loadTabBrowse(false);
    }
  },

  modifyTable: function(sTableName) {
//    alert("modtab: " + sTableName);
  },

  cancelEditColumn: function() {
    $$("gb-editColumn").hidden = true;
  },

  startEditColumn: function() {
//    var bConfirm = sm_confirm(sm_getLStr("dangerous.op"), "This is a potentially dangerous operation. SQLite does not support statements that can alter a column in a table. Here, we attempt to reconstruct the new CREATE SQL statement by looking at the pragma table_info which does not contain complete information about the structure of the existing table.\n\n" + sm_getLStr("q.proceed"));
//    if (!bConfirm)
//      return false;

    var treeCol = $$("treeTabCols");
    var row = treeCol.view.selection.currentIndex;
    var col = treeCol.columns.getColumnAt(1);
    var sOldName = treeCol.view.getCellText(row, col);
    var col = treeCol.columns.getColumnAt(2);
    var sOldType = treeCol.view.getCellText(row, col);
    var col = treeCol.columns.getColumnAt(4);
    var sOldDefault = treeCol.view.getCellText(row, col);

    var sTable = treeCol.getAttribute("smTableName");
    $$("tb-ec-table").value = sTable;

    $$("tb-ec-oldName").value = sOldName;
    $$("tb-ec-oldType").value = sOldType;
    $$("tb-ec-oldDefault").value = sOldDefault;
    $$("tb-ec-newName").value = sOldName;
    $$("tb-ec-newType").value = sOldType;
    $$("tb-ec-newDefault").value = sOldDefault;

    $$("gb-editColumn").hidden = false;
    $$("tb-ec-newName").focus();
  },

  alterColumn: function() {
    var bConfirm = sm_confirm(sm_getLStr("dangerous.op"), sm_getLStr("sqlm.confirm.dangerousOp") + sm_getLStr("q.proceed"));
    if (!bConfirm)
      return false;

    var sTable = $$("tb-ec-table").value;
    var sOldName = $$("tb-ec-oldName").value;
    var sNewName = $$("tb-ec-newName").value;
    if (sNewName.length == 0) {
      alert(sm_getLStr("sqlm.alterColumn.name"));
      return false;
    }
    var sNewType = $$("tb-ec-newType").value;
    var sNewDefVal = $$("tb-ec-newDefault").value;
    if (sNewDefVal.length == 0)
      sNewDefVal = null;

    var aNewInfo = {oldColName: sOldName,
                    newColName: sNewName,
                    newColType: sNewType,
                    newDefaultValue: sNewDefVal,
                    info: sm_getLFStr("createMngr.alterColumn", [sOldName, sTable], 2)};
    var bReturn = this.mDb.alterColumn(sTable, aNewInfo);
    if(bReturn) {
      this.cancelEditColumn();

      this.refreshDbStructure();
      this.loadTabStructure();
      this.loadTabBrowse(true);
    }
    return bReturn;
  },

  dropColumn: function() {
    var bConfirm = sm_confirm(sm_getLStr("dangerous.op"), sm_getLStr("sqlm.confirm.dangerousOp") + sm_getLStr("q.proceed"));
    if (!bConfirm)
      return false;
//    var bConfirm = sm_prefsBranch.getBoolPref("allowUnsafeTableAlteration");
    var treeCol = $$("treeTabCols");
    var row = treeCol.view.selection.currentIndex;
    var col = treeCol.columns.getColumnAt(1);
    var sColumn = treeCol.view.getCellText(row, col);
    var sTable = treeCol.getAttribute("smTableName");

    var oNewInfo = {oldColName: sColumn,
                    info: sm_getLFStr("createMngr.dropColumn", [sColumn, sTable], 2)};

    var bReturn = this.mDb.dropColumn(sTable, oNewInfo);
    if(bReturn) {
      this.refreshDbStructure();
      this.loadTabStructure();
      this.loadTabBrowse(true);
    }
    return bReturn;
  },

  reindexIndex: function() {
    var sCurrIndex = this.aCurrObjNames["index"];
    if(sCurrIndex != null && sCurrIndex != undefined && sCurrIndex.length > 0) {
      var bReturn = this.mDb.reindexObject("INDEX", sCurrIndex);
      return bReturn;
    }
    return false;
  },

  dropObject: function(sObjectType) {
    if (!this.mDb.isConnected()) {
      alert(sm_getLStr("firstOpenADb"));
      return false;
    }

    var sObjectName = "";
    sObjectName = this.aCurrObjNames[sObjectType];

    var aNames = this.aObjNames[sObjectType];

    if(aNames.length == 0) {
      alert(sm_getLStr("noObjectToDelete") + ": " + sObjectType);
      return false;
    }
    var bReturn = this.mDb.dropObject(sObjectType, sObjectName);
    if(bReturn) {
      sm_message(sm_getLStr("dropDone"), 0x2);
      this.refreshDbStructure();
      this.loadTabBrowse(false);
    }
    return bReturn;
  },

  exportAll: function(sWhat) {
    if (!this.mDb.isConnected()) {
      alert(sm_getLStr("firstOpenADb"));
      return false;
    }
    var sDbName = this.mDb.logicalDbName; //"main";
    var sExpType = "sql";
    var sFileName = sDbName;
    if (sDbName == "main") {
      sFileName = this.mDb.getFileName();
      var iPos = sFileName.lastIndexOf(".");
      if (iPos > 0)
        sFileName = sFileName.substr(0, iPos);
    }
    // get export file
    const nsIFilePicker = Ci.nsIFilePicker;
    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
    fp.init(window, sm_getLStr("sqlm.export.fp.title"), nsIFilePicker.modeSave);
    fp.appendFilters(nsIFilePicker.filterAll);
    fp.defaultString = sFileName + "." + sExpType;

    var rv = fp.show();

    //if chosen then
    if (rv != nsIFilePicker.returnOK && rv != nsIFilePicker.returnReplace) {
      alert(sm_getLStr("sqlm.export.fp.descr"));
      return false;
    }
    var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
    file.initWithFile(fp.file);

    var foStream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
    // use 0x02 | 0x10 to open file for appending.
    foStream.init(file, 0x02 | 0x08 | 0x20, 0664, 0); // write, create, truncate

    var os = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(Ci.nsIConverterOutputStream);

    // This assumes that fos is the nsIOutputStream you want to write to
    os.init(foStream, "UTF-8", 0, 0x0000);

    //Issue #463: exclude objects beginning with "sqlite_"
    if (sWhat == "tables" || sWhat == "db") {
      var bCreate = true, bTransact = false;
      var iExportNum = 0;
      var aTableNames = this.mDb.getObjectList("table", sDbName);
      for (var i = 0; i < aTableNames.length; i++) {
        if (aTableNames[i].indexOf("sqlite_") != 0)
          iExportNum = SmExim.writeSqlContent(os, sDbName, aTableNames[i], bCreate, bTransact);
      }
    }
    var aObjNames = [];
    if (sWhat == "dbstructure") {
      var aTableNames = this.mDb.getObjectList("table", sDbName);
      aObjNames = aObjNames.concat(aTableNames);
    }
    if (sWhat == "db" || sWhat == "dbstructure") {
      var aViewNames = this.mDb.getObjectList("view", sDbName);
      aObjNames = aObjNames.concat(aViewNames);
      var aTriggerNames = this.mDb.getObjectList("trigger", sDbName);
      aObjNames = aObjNames.concat(aTriggerNames);
      var aIndexNames = this.mDb.getObjectList("index", sDbName);
      aObjNames = aObjNames.concat(aIndexNames);
      for (var i = 0; i < aObjNames.length; i++) {
        var sSql = this.mDb.getMasterInfo(aObjNames[i], sDbName);
        if (sSql.sql != null && aObjNames[i].indexOf("sqlite_") != 0)
          os.writeString(sSql.sql + ";\n");
      }
    }
    os.close();
    foStream.close();

    if (sWhat == "db")
      sm_message(sm_getLFStr("sqlm.export.db", [fp.file.path]), 0x3);
    if (sWhat == "dbstructure")
      sm_message(sm_getLFStr("sqlm.export.dbstructure", [fp.file.path]), 0x3);
    if (sWhat == "tables")
      sm_message(sm_getLFStr("sqlm.export.tables", [aTableNames.length, fp.file.path]), 0x3);
    return true;
  },

  importFromFile: function() {
    if (!this.mDb.isConnected()) {
      alert(sm_getLStr("firstOpenADb"));
      return false;
    }
    this.loadTabWithId("tab-exim");
    SmExim.loadDialog("import");
  },

  exportObject: function(sObjectType) {
    if (!this.mDb.isConnected()) {
      alert(sm_getLStr("firstOpenADb"));
      return false;
    }
    this.loadTabWithId("tab-exim");

    var sObjectName = this.aCurrObjNames[sObjectType];
    SmExim.loadDialog("export", sObjectType, sObjectName);
    return true;
  },

  copyTable: function(sTableName) {
    var xul = "chrome://sqlitemanager/content/copyTable.xul";
    var aRetVals = {};
    var ret = window.openDialog(xul, "copyTable", "chrome, centerscreen, modal, dialog", this.mDb.logicalDbName, this.aCurrObjNames["table"], this.mDb.getDatabaseList(), aRetVals);
    var sNewDb = aRetVals.newDbName;
    var sNewTable = aRetVals.newTableName;
    var bOnlyStructure = aRetVals.onlyStructure;

    if (sNewTable.length == 0)
      return false;

    var info = this.mDb.getMasterInfo(sTableName, "");
    var r_sql = info.sql;
    sNewTable = this.mDb.getPrefixedName(sNewTable, sNewDb);
    var sOldTable = this.mDb.getPrefixedName(sTableName, "");

    var sNewSql = replaceObjectNameInSql(r_sql, sNewTable);
    if (sNewSql == "") {
      alert(sm_getLStr("sqlm.copyTable.newSqlFailed"));
      return;
    }

    var aQueries = [sNewSql];
    if(!bOnlyStructure) {
      aQueries.push("INSERT INTO " + sNewTable + " SELECT * FROM " + sOldTable);
    }
    return this.mDb.confirmAndExecute(aQueries, sm_getLStr("sqlm.copyTable.confirm") + ": " + sTableName);
  },

  renameTable: function(sTableName)  {
    var check = {value: false};
    var input = {value: sTableName};
    var result = smPrompt.prompt(null, sm_getLFStr("sqlm.renameTable", [sTableName]), sm_getLStr("sqlm.renameTable.descr"), input, null, check);
    var sNewName = input.value;
    //returns true on OK, false on cancel
    if (!result || sNewName.length == 0)
      return false;
    return this.mDb.renameTable(sTableName, sNewName, '');
  },

  renameObject: function(sObjType)  {
    var sObjName = this.aCurrObjNames[sObjType];
    var check = {value: false};   // default the checkbox to false
    var input = {value: sObjName};   // default the edit field to object name
    var result = smPrompt.prompt(null, sm_getLFStr("sqlm.renameObj", [sObjType, sObjName]), sm_getLFStr("sqlm.renameObj.descr", [sObjType]), input, null, check);
    var sNewName = input.value;
    //returns true on OK, false on cancel
    if (!result || sNewName.length == 0)
      return false;

    sNewName = this.mDb.getPrefixedName(sNewName, "");
    var info = this.mDb.getMasterInfo(sObjName, "");
    var sOldSql = info.sql;
    var sNewSql = replaceObjectNameInSql(sOldSql, sNewName);
    if (sNewSql == "") {
      alert(sm_getLStr("sqlm.renameObj.newSqlFailed"));
      return;
    }
    var sOldName = this.mDb.getPrefixedName(sObjName, "");

    var aQueries = [];
    aQueries.push("DROP " + sObjType + " " + sOldName);
    aQueries.push(sNewSql);
    var bReturn = this.mDb.confirmAndExecute(aQueries, sm_getLFStr("sqlm.renameObj.confirm", [sObjType, sOldName]));
    if(bReturn)  this.refresh();
  },

// operateOnTable: various operations on a given table
// sOperation = rename | copy | reindex | delete  |
//              insert | duplicate | update
  operateOnTable: function(sOperation) {
    var oType = $$("browse-type").value.toUpperCase();
    if (oType == "VIEW" && (sOperation == "insert" || sOperation == "duplicate" || sOperation == "update" || sOperation == "delete")) {
      return this.operateOnView(sOperation);
    }
    //these operations make sense in the context of some table
    //so, take action only if there is a valid selected db and table
    if (!this.mDb.isConnected() || this.aCurrObjNames["table"] == null) {
      alert(sm_getLStr("noDbOrTable"));
      return false;
    }
    var sCurrTable = this.aCurrObjNames["table"];
    var bReturn = false;
    var bRefresh = false; //to reload tabs
    switch(sOperation) {
      case "reindex":
        return this.mDb.reindexObject("TABLE", sCurrTable);
        break;
      case "analyze":
        return this.mDb.analyzeTable(sCurrTable);
        break;
    }
    if(sOperation == "copy") {
      var bReturn = this.copyTable(sCurrTable);
      if(bReturn)  this.refresh();
      return bReturn;
    }
    if(sOperation == "rename") {
      var bReturn = this.renameTable(sCurrTable);
      if(bReturn)  this.refresh();
      return bReturn;
    }
    if(sOperation == "drop") {
      var bReturn = this.mDb.dropObject("TABLE", sCurrTable);
      if(bReturn)  this.refresh();
      return bReturn;
    }
    if(sOperation == "modify") {
      this.modifyTable(sCurrTable);
      return;
    }
    if(sOperation == "empty") {
      var bReturn = this.mDb.emptyTable(sCurrTable);
      if(bReturn)  this.refresh();
      return bReturn;
    }
    if(sOperation == "addColumn") {
      var newCol = [];
      newCol["name"] = $$("tb-addcol-name").value;
      newCol["type"] = $$("tb-addcol-type").value;
      newCol["notnull"] = $$("tb-addcol-notnull").checked;
      newCol["dflt_value"] = $$("tb-addcol-default").value;

      var bReturn = this.mDb.addColumn(sCurrTable, newCol);
      if(bReturn) {
        $$("tb-addcol-name").value = "";
        $$("tb-addcol-type").value = "";
        $$("tb-addcol-notnull").checked = false;
        $$("tb-addcol-default").value = "";
        this.refresh();
        this.loadTabBrowse(true);
      }
      $$("tb-addcol-name").focus();
      return bReturn;
    }

    //update the first selected row in the tree, else alert to select
    //if selection exists, pass the rowid as the last arg of openDialog
    var aRowIds = [];
    var rowCriteria = "";
    if(sOperation == "update" || sOperation == "delete" || sOperation == "duplicate") {
      var colMain = this.mDb.getTableRowidCol(this.aCurrObjNames["table"]);
      colMain["name"] = SQLiteFn.quoteIdentifier(colMain["name"]);

      //allowing for multiple selection in the tree
      var tree = $$("browse-tree");
      var start = new Object();
      var end = new Object();
      var numRanges = tree.view.selection.getRangeCount();

      for (var t = 0; t < numRanges; t++) {
        tree.view.selection.getRangeAt(t,start,end);
        for (var v = start.value; v <= end.value; v++) {
          var rowid = tree.view.getCellText(v,
              tree.columns.getColumnAt(colMain["cid"]));
          aRowIds.push(rowid);
        }
      }
      //do nothing, if nothing is selected
      if(aRowIds.length == 0)  {
        alert(sm_getLStr("noRecord"));
        return false;
      }
      //if editing, should select only one record
      if (sOperation == "update" || sOperation == "duplicate")  {
        if (aRowIds.length != 1) {
          alert(sm_getLStr("onlyOneRecord"));
          return false;
        }
        rowCriteria = " " + colMain["name"] + " = " + aRowIds[0];
      }
      //if deleting, pass as argument rowid of all selected records to delete
      if (sOperation == "delete") {
        var criteria = colMain["name"] + " IN (" + aRowIds.toString() + ")";
        var sQuery = "DELETE FROM " + this.mDb.getPrefixedName(sCurrTable, "") + " WHERE " + criteria;
        //IMPORTANT: the last parameter is totally undocumented.
        var bReturn = this.mDb.confirmAndExecute([sQuery], [sm_getLFStr("sqlm.deleteRecs", [aRowIds.length, sCurrTable]), false]);
        if(bReturn)
          this.loadTabBrowse(false);
        return bReturn;
      }
    }
/* following code if dialog is popped up for editing etc. */
    var bUseWindow = true;
    if (bUseWindow) {
      var aRetVals = {instanceId: this.mInstanceId};
      window.openDialog("chrome://sqlitemanager/content/RowOperations.xul", "RowOperations", "chrome, resizable, centerscreen, modal, dialog", this.mDb, this.aCurrObjNames["table"], sOperation, rowCriteria, "table", aRetVals);
      if(sOperation != "update") {
        this.refreshDbStructure();
      }
      this.loadTabBrowse(false);
    }
    else {
      RowOps.loadDialog(this.aCurrObjNames["table"], sOperation, rowCriteria);
    }

    return true;
  },

// operateOnView: various operations on a given view
// sOperation = delete | insert | duplicate | update
  operateOnView: function(sOperation) {
    //these operations make sense in the context of some view
    //so, take action only if there is a valid selected db and view
    if (!this.mDb.isConnected() || this.aCurrObjNames["view"] == null) {
      alert(sm_getLStr("noDbOrTable"));//TODO: change message to noDbOrView
      return false;
    }
    var sCurrView = this.aCurrObjNames["view"];
    var bReturn = false;
    var bRefresh = false; //to reload tabs

    //update the first selected row in the tree, else alert to select
    //if selection exists, pass the rowid as the last arg of openDialog
    var aRowIds = [];
    var rowCriteria = "";
    if(sOperation == "update" || sOperation == "delete" || sOperation == "duplicate") {
      //allowing for multiple selection in the tree
      var tree = $$("browse-tree");
      var start = new Object();
      var end = new Object();
      var numRanges = tree.view.selection.getRangeCount();

      for (var t = 0; t < numRanges; t++) {
        tree.view.selection.getRangeAt(t,start,end);
        for (var v = start.value; v <= end.value; v++) {
          var cols = tree.columns;
          //where criteria has to be based on all columns
          var aWhere = [];
          for (var colCnt = 0; colCnt < cols.length; colCnt++) {
            var colName = cols.getColumnAt(colCnt).element.getAttribute("label");
            var colValue = tree.view.getCellText(v, cols.getColumnAt(colCnt));
            var dataType = treeBrowse.treeView.getCellDataType(v, cols.getColumnAt(colCnt));
            var sCondition = '"' + colName + '"';
            if (dataType == SQLiteTypes.INTEGER || dataType == SQLiteTypes.REAL || dataType == SQLiteTypes.BLOB)
              sCondition += "=" + colValue;
            else if (dataType == SQLiteTypes.NULL)
              sCondition += " ISNULL";
            else
              sCondition += "='" + colValue + "'";
            aWhere.push(sCondition);
          }
          aRowIds.push(aWhere.join(" AND "));
        }
      }
      //do nothing, if nothing is selected
      if(aRowIds.length == 0) {
        alert(sm_getLStr("noRecord"));
        return false;
      }
      //if editing, should select only one record
      if (sOperation == "update" || sOperation == "duplicate") {
        if (aRowIds.length != 1) {
          alert(sm_getLStr("onlyOneRecord"));
          return false;
        }
        rowCriteria = aRowIds[0];
      }
      //if deleting, pass as argument rowid of all selected records to delete
      if (sOperation == "delete") {
        var aQueries = [];
        for (var t = 0; t < aRowIds.length; t++) {
          var sQuery = "DELETE FROM " + this.mDb.getPrefixedName(sCurrView, "") + " WHERE " + aRowIds[t];
          aQueries.push(sQuery);
        }
        //IMPORTANT: the last parameter is totally undocumented.
        var bReturn = this.mDb.confirmAndExecute(aQueries, [sm_getLFStr("sqlm.deleteRecs", [aRowIds.length, sCurrView]), false]);
        if(bReturn)
          this.loadTabBrowse(false);
        return bReturn;
      }
    }
    // following code if dialog is popped up for editing etc.
    var bUseWindow = true;
    if (bUseWindow) {
      var aRetVals = {instanceId: this.mInstanceId};
      window.openDialog("chrome://sqlitemanager/content/RowOperations.xul", "RowOperations", "chrome, resizable, centerscreen, modal, dialog", this.mDb, this.aCurrObjNames["view"], sOperation, rowCriteria, "view", aRetVals);
      if(sOperation != "update") {
        this.refreshDbStructure();
      }
      this.loadTabBrowse(false);
    }
    else {
      RowOps.loadDialog(this.aCurrObjNames["view"], sOperation, rowCriteria);
    }

    return true;
  },

  selectDefaultDir: function(sType) {
    var file = SmGlobals.chooseDirectory(sm_getLStr("sqlm.selectDefaultDir"));

    // 1. Write to prefs
    var relFile = Cc["@mozilla.org/pref-relativefile;1"]
                  .createInstance(Ci.nsIRelativeFilePref);
    relFile.relativeToKey = "ProfD";
    relFile.file = file;      // |file| is nsILocalFile
    sm_prefsBranch.setComplexValue("userDir", Ci.nsIRelativeFilePref, relFile);
    this.populateDBList("user");
  },

  // populateDBList: Load list of files with default file extensions
  populateDBList: function(sType) {
    var fileList;
    var sTooltip = sm_getLStr("sqlm.tooltip.profileDir");
    var sSelectString = sm_getLStr("selectProfileDb");
    if (sType == "profile")
      // Get the nsIFile object pointing to the profile directory
      fileList = Cc["@mozilla.org/file/directory_service;1"]
            .getService(Ci.nsIProperties).get("ProfD", Ci.nsIFile)
            .directoryEntries;
    if (sType == "user") {
      sSelectString = sm_getLStr("selectDbInDefaultDir");
      //Read from prefs
      var value = sm_prefsBranch.getComplexValue("userDir",Ci.nsIRelativeFilePref);
      // |value.file| is the file.
      sTooltip = value.file.path;
      var lFile = value.file;
      fileList = lFile.directoryEntries;
    }
    //get the node for the popup menus to show profile db list
    var listbox = $$("listbox-profileDB");
    listbox.setAttribute("dirType", sType);
    listbox.setAttribute("tooltiptext", sTooltip);
    $$("menu-DbList").setAttribute("tooltiptext", sTooltip);

    listbox.removeAllItems();
    listbox.appendItem(sSelectString, "");
    listbox.selectedIndex = 0;

    var aSplit, sExt;
    var file;
    var iFileCount = 0;
    while (fileList.hasMoreElements()) {
      file = fileList.getNext().QueryInterface(Ci.nsIFile);
      aSplit = file.leafName.split(".");
      sExt = aSplit[aSplit.length - 1];

      if (this.maFileExt.indexOf(sExt) != -1) {
        iFileCount++;
        listbox.appendItem(file.leafName, file.path);
      }
    }
    sm_message(sm_getLStr("filesInProfileDbList") + ": " + iFileCount, 0x2);
  },

  // openSelectedDatabase: open a file from the database dropdown list
  openSelectedDatabase: function(sMenuListId) {
    //get the node for dropdown menu in which profile db list is shown
    var listbox = $$(sMenuListId);
    var sPath = listbox.selectedItem.value;
    var sType = listbox.getAttribute("dirType"); //profile/user

    var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
    file.initWithPath(sPath);

    //proceed only if the file exists
    //we are in the profile folder via the listbox, so open if the file exists
    //do not attempt to create new file
    if(!file.exists()) {
      alert(sm_getLStr("invalidProfileDb"));
      return false;
    }
    if(this.closeDatabase(false))  {
      this.setDatabase(file);
      return true;
    }
    return false;
  },

  changeAttachedDb: function() {
    var mlist = $$("ml-dbNames");
    var mi = mlist.selectedItem;
    var sDbName = mi.getAttribute("dbName");
    if (sDbName == "")
     return false;

    this.mDb.setLogicalDbName(sDbName);
    this.refreshDbStructure();
    return true;
  },

  detachDatabase: function() {
    var mlist = $$("ml-dbNames");
    var mi = mlist.selectedItem;
    var sDbName = mi.getAttribute("dbName");
    if (mlist.selectedIndex <= 2) {
      alert(sm_getLStr("sqlm.detachDb.alert"));
      return false;
    }

    var answer = smPrompt.confirm(null, sm_getLStr("extName"), sm_getLFStr("sqlm.detachDb.confirm", [sDbName]) + mi.getAttribute("tooltiptext"));
    if(!answer) {
      return false;
     }
    var sQuery = "DETACH DATABASE " + SQLiteFn.quoteIdentifier(sDbName);
    if (this.mDb.selectQuery(sQuery)) {
      var mi = mlist.removeItemAt(mlist.selectedIndex);
      mlist.selectedIndex = 0;
      this.changeAttachedDb();
      sm_message(sm_getLFStr("sqlm.detachDb.msgOk", [sDbName]), 0x2);
      return true;
    }
    else {
      sm_message(sm_getLFStr("sqlm.detachDb.msgFailed", [sDbName]), 0x2);
      return false;
    }
  },

  attachDatabase: function() {
    if (!this.mDb.isConnected()) {
      alert(sm_getLStr("firstOpenADb"));
      return;
    }
    const nsIFilePicker = Ci.nsIFilePicker;
    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
    fp.init(window, sm_getLStr("selectDb"), nsIFilePicker.modeOpen);
    var sExt = "";
    for (var iCnt = 0; iCnt < this.maFileExt.length; iCnt++) {
      sExt += "*." + this.maFileExt[iCnt] + ";";
    }
    fp.appendFilter(sm_getLStr("sqliteDbFiles") + " (" + sExt + ")", sExt);
    fp.appendFilters(nsIFilePicker.filterAll);

    var rv = fp.show();
    if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace) {
      // work with returned nsILocalFile...
      var sPath = fp.file.path;

      var check = {value: false};
      var input = {value: ""};
      var result = smPrompt.prompt(null, sm_getLFStr("sqlm.attachDb", [sPath]), sm_getLStr("sqlm.attachDb.descr"), input, null, check);
      var sDbName = input.value;
      //returns true on OK, false on cancel
      if (!result || sDbName.length == 0)
        return false;

      if (this.mDb.attachDatabase(sDbName, sPath)) {
        var mi = $$("ml-dbNames").appendItem(sDbName, sDbName, fp.file.leafName);
        mi.setAttribute("dbName", sDbName);
        mi.setAttribute("tooltiptext", sPath);

        sm_message(sm_getLFStr("sqlm.attachDb.msgOk", [sPath, sDbName]), 0x2);
        return true;
      }
      else {
        sm_message(sm_getLFStr("sqlm.attachDb.msgFailed", [sPath]), 0x2);
        return false;
      }
    }
    return false;
  },

  initDbListMenu: function(leafName, path) {
    var mlist = $$("ml-dbNames");
    mlist.removeAllItems();

    var mi = mlist.appendItem(leafName, leafName, "");
    mi.setAttribute("dbName", "main");
    mi.setAttribute("tooltiptext", path);

    var mi = mlist.appendItem(sm_getLStr("sqlm.tooltip.tempObj"), sm_getLStr("sqlm.tooltip.tempObj"), "");
    mi.setAttribute("dbName", "temp");
    mi.setAttribute("tooltiptext", sm_getLStr("sqlm.tooltip.tempDbObj"));

    var mi = mlist.appendItem(sm_getLStr("sqlm.tooltip.attachedDbs"), sm_getLStr("sqlm.tooltip.attachedDbs"), "");
    mi.setAttribute("dbName", "");
    mi.setAttribute("disabled", "true");

    //attach all db that were attached when this db was last closed
    var aAttached = smExtManager.getAttachedDbList();
    for (var i = 0; i < aAttached.length; i++) {
      var sName = aAttached[i].name;
      var sPath = aAttached[i].file;
      if (this.mDb.attachDatabase(sName, sPath)) {
        var mi = mlist.appendItem(sName, sName, sPath);
        mi.setAttribute("dbName", sName);
        mi.setAttribute("tooltiptext", sPath);
      }
    }
    mlist.selectedIndex = 0;
    this.changeAttachedDb();
  },

  createTimestampedBackup: function(nsiFileObj) {
    if (!nsiFileObj.exists()) //exit if no such file
      return false;

    switch (sm_prefsBranch.getCharPref("autoBackup")) {
      case "off":     return false;
      case "on":      break;
      case "prompt":
        var bAnswer = smPrompt.confirm(null, sm_getLStr("extName"), sm_getLStr("confirmBackup"));
        if (!bAnswer) return false;
        break;
      default:        return false;
    }

    //construct a name for the new file as originalname_timestamp.ext
//    var dt = new Date();
//    var sTimestamp = dt.getFullYear() + dt.getMonth() + dt.getDate();
    var sTimestamp = SmGlobals.getISODateTimeFormat(null, "", "s");//Date.now();
    var sFileName = nsiFileObj.leafName;
    var sMainName = sFileName, sExt = "";
    var iPos = sFileName.lastIndexOf(".");
    if (iPos > 0) {
      sMainName = sFileName.substr(0, iPos);
      sExt = sFileName.substr(iPos);
    }
    var sBackupFileName = sMainName + "_" + sTimestamp + sExt;

    //copy the file in the same location as the original file
    try {
      nsiFileObj.copyTo(null, sBackupFileName);
    } catch (e) {
      alert(sm_getLFStr("sqlm.backup.failed", [sBackupFileName, e.message]));
    }
    return true;
  },

  openMemoryDatabase: function() {
    if(this.closeDatabase(false)) {
      this.setDatabase("memory");
      return true;
    }
    return false;
  },

  // setDatabase: set the current database to nsiFileObj
  // If nsiFileObj is a string, then openSpecialDatabase
  setDatabase: function(nsiFileObj) {
  //when passed as arg, works but fails to show .path and .leafName properties

    this.mbDbJustOpened = true;

    var mlist = $$("ml-dbNames");
    mlist.removeAllItems();

    treeBrowse.ShowTable(false);
    treeExecute.ShowTable(false);

    $$("sbSharedMode").label = "---";

    //try connecting to database
    var bConnected = false;
    try  {
      if(nsiFileObj != null) {
        if (nsiFileObj == "memory") {
          bConnected = this.mDb.openSpecialDatabase("memory");
        }
        else if (('nsPIPlacesDatabase' in Ci) && (nsiFileObj.parent.equals(this.mProfileDir)) && (nsiFileObj.leafName.toLowerCase() == "places.sqlite")) {
          bConnected = this.mDb.openSpecialProfileDatabase(nsiFileObj);
        }
        else {
         //create backup before opening
          this.createTimestampedBackup(nsiFileObj);

          var mi = $$("menu-general-sharedPagerCache");
          var bSharedPagerCache = mi.hasAttribute("checked");
          bConnected = this.mDb.openDatabase(nsiFileObj, bSharedPagerCache);
        }
        smShow(["vb-structureTab", "vb-browseTab", "vb-executeTab", "vb-dbInfoTab"]);

        $$("bc-dbOpen").removeAttribute("disabled");
      }
      if(nsiFileObj == null) {
        this.mDb.closeConnection();
        //call it to hide all things there - Issue #90, etc.
        $$("bc-dbOpen").setAttribute("disabled", true);

        this.emptyTabStructure();
        smHide(["vb-structureTab", "vb-browseTab", "vb-executeTab", "vb-dbInfoTab"]);
        smExtManager = null; //appropriate coz' we are closing db
        SmConnectSql.loadTab();
      }
    }
    catch (e)  {
      Components.utils.reportError('in function setDatabase - ' + e);
      sm_message("Connect to '" + nsiFileObj.path + "' failed: " + e, 0x3);
      return;
    }

    var path = "", leafName = "";
    if (bConnected) {
      this.miDbInfoCallCount = 0;

      $$("sbSharedMode").label = this.mDb.getOpenStatus();

      if (nsiFileObj == "memory") {
        path = "in-memory database";
        leafName = "in-memory";
      }
      else { //we have a db in some file
        path = this.mDb.getFile().path;
        leafName = this.mDb.getFile().leafName;
        //add this path to mru list
        SmGlobals.mru.add(path);
      }

      //extension related mgmt info
      smExtManager = new SMExtensionManager();
      this.useExtensionManagementTable(smExtManager.getUsage(), true);

      //here, execute the on-connect sql statements
      //first, those statements which are for all database
      this.runOnConnectSqlForAllDb();
      //then, those statements which are for this db only. These statements must be fetched from ExtensionManagementTable and, hence, this must be done after initializing smExtManager
      this.runOnConnectSqlForThisDb();

      //load this tab so that the db specific section can be enabled if possible
      SmConnectSql.loadTab();

      //init the db menulist with main, temp & attached db
      this.initDbListMenu(leafName, path);

      //display the sqlite version in the status bar
      var sV = sm_getLStr("sqlite") + " " + this.mDb.sqliteVersion;
      $$("sbSqliteVersion").setAttribute("label",sV);

      this.createFunctions(false);
    }

    if (!bConnected) {
    }
    //change window title to show db file path
    document.title = sm_getLStr("extName") + " - " + path;
    //reload the two tabs
    this.refreshDbStructure();

    this.mbDbJustOpened = false;
  },

  createFunctions: function(bAppendMode) {
    if (!this.mDb.isConnected()) {
      sm_log('createFunctions: returning because not connected to any database');
      return;
    }

    //before creating functions here, remove all
    if (!bAppendMode)
      this.mDb.removeAllFunctions();

    //get all functions that need to be created for this db
    var udf = SmUdf.getFunctions();

    for (var fn in udf) {
      var bAdded = this.mDb.createFunction(udf[fn].fName, udf[fn].fLength, udf[fn].onFunctionCall);

      if (bAdded)
        sm_log("Loaded user-defined function: " + udf[fn].fName + ", args.length = " + udf[fn].fLength);
    }

    //get all functions that need to be created for this db
    var udf = SmUdf.getAggregateFunctions();

    for (var fn in udf) {
      if (this.mDb.createAggregateFunction(udf[fn].fName, udf[fn].fLength, udf[fn].objFunc))
        sm_log("Loaded user-defined aggregate function: " + udf[fn].fName + ", args.length = " + udf[fn].fLength);
    }
  },

  runOnConnectSqlForAllDb: function() {
    var txtOnConnectSql = sm_prefsBranch.getComplexValue("onConnectSql", Ci.nsISupportsString).data;
    var queries = sql_tokenizer(txtOnConnectSql);
    this.mDb.executeSimpleSQLs(queries);
  },

  runOnConnectSqlForThisDb: function() {
    var txtOnConnectSql = smExtManager.getOnConnectSql();
    var queries = sql_tokenizer(txtOnConnectSql);
    this.mDb.executeSimpleSQLs(queries);
  },

  selectAllRecords: function() {
    var t;
    if(this.getSelectedTabId() == "tab-browse")
      t = $$("browse-tree");
    else if(this.getSelectedTabId() == "tab-execute")
      t = $$("treeSqlOutput");
    else
      return;

    t.view.selection.selectAll();
    t.focus();
  },

  openOptionsWindow: function(aElt) {
    var instantApply = SmGlobals.allPrefs.getBoolPref("browser.preferences.instantApply");
    var features = "chrome,titlebar,toolbar,centerscreen" + (instantApply ? ",dialog=no" : ",modal");
    openDialog(SmGlobals.chromes.preferences, 'preferences', features);
  },

  openConsoleWindow: function(aElt) {
    window.open(SmGlobals.chromes.console, 'console', 'chrome,resizable,titlebar,toolbar,centerscreen');
  },

  openAboutConfigWindow: function(aElt) {
    window.open(SmGlobals.chromes.aboutconfig, 'aboutconfig', 'chrome,resizable,titlebar,toolbar,centerscreen');
  },

  openDomIWindow: function(aElt) {
    // Load the Window DataSource so that browser windows opened subsequent to DOM Inspector show up in the DOM Inspector's window list.
    var windowDS = Cc["@mozilla.org/rdf/datasource;1?name=window-mediator"].getService(Ci.nsIWindowDataSource);
    var tmpNameSpace = {};
    var sl = Cc["@mozilla.org/moz/jssubscript-loader;1"].createInstance(Ci.mozIJSSubScriptLoader);
    sl.loadSubScript("chrome://inspector/content/hooks.js", tmpNameSpace);
    tmpNameSpace.inspectDOMDocument(document);
  },

  saveBrowseTreeColState: function(aElt) {
    while (aElt.nodeName != "tree") {
      aElt = aElt.parentNode;
    }
    if (aElt.id == "browse-tree") {
      var aWidth = [];
      var aId = [];
      var aCols = aElt.querySelectorAll("treecol");
      for (var i = 0; i < aCols.length; i++) {
        aWidth.push(aCols.item(i).width);
        aId.push(aCols.item(i).id);
      }
      var objColInfo = {};
      objColInfo.arrWidth = aWidth;
      objColInfo.arrId = aId;
      objColInfo.sObjType = aElt.getAttribute("smObjType");
      objColInfo.sObjName = aElt.getAttribute("smObjName");
      objColInfo.horizontalPosition = aElt.treeBoxObject.horizontalPosition;
      var jsonObjColInfo = JSON.stringify(objColInfo);
      smExtManager.saveBrowseTreeColState(objColInfo.sObjType, objColInfo.sObjName, jsonObjColInfo);
//      alert(jsonObjColInfo);
    }
  },

  setSqlText: function(val) {
    $$("txtSqlStatement").value = val;
  }
};

SmGlobals.stylerDataTree = {
  mStyleSheet: null,

  getStyleSheet: function() {
    if (this.mStyleSheet != null)
      return;

    var cssTreeDataTable = "chrome://sqlitemanager/skin/dynaTreeDataTable.css";
    var ss = document.styleSheets;
    for (var i = 0; i < ss.length; i++) {
      if (ss[i].href == cssTreeDataTable) {
        this.mStyleSheet = ss[i];
        return;
      }
    }
  },

  convert: function() {
    //we are handling conversion from pref jsonDataTreeStyle version 1 to version 2 only
    //users coming from pref styleDataTree will lose their color settings (very few users)
    //users having older versions will not be affected
    try {
      var obj = SmGlobals.getJsonPref("jsonDataTreeStyle");
      //if jsonDataTreeStyle preference exists and has version 2, then no conversion needed
      if(obj.meta.version == "2") //do nothing
        return true;
    } catch (e) {
      return false;
    }

    //we are here means obj.meta.version < 2
    switch (obj.meta.version) {
      case "1":
        //obj.textFont has been added in version 2
        obj.meta.version = "2";
        obj.textFont = {"unselected":{"font-size":100,"font-family":""}};
        obj.rowHeight = 0;
        break;
    }

    var newPref = JSON.stringify(obj);
    sm_prefsBranch.setCharPref("jsonDataTreeStyle", newPref);
    return true;
  },

  addTreeStyle: function() {
    try {
      this.convert();
    } catch (e) {}

    this.getStyleSheet();
    this.deleteAllRules();

    var obj = SmGlobals.getJsonPref("jsonDataTreeStyle");
    if (obj.setting == 'none') {
      return true;
    }

    var aIdx = ["nullvalue", "integervalue", "floatvalue", "textvalue", "blobvalue"];
    for (var k = 0; k < aIdx.length; k++) {
      var j = aIdx[k];
      var ruleSelCell = 'treechildren::-moz-tree-cell(' + j + ' selected) { ';
      var ruleCell = 'treechildren::-moz-tree-cell(' + j + ') { ';
      var ruleSelText = 'treechildren::-moz-tree-cell-text(' + j + ' selected) { ';
      var ruleText = 'treechildren::-moz-tree-cell-text(' + j + ') { ';

      if (obj[j]['selected']) {
        if (obj[j]['selected']['background-color'])
          ruleSelCell += 'background-color: ' + obj[j]['selected']['background-color'] + "; ";
        if (obj[j]['selected']['background-color'])
          ruleSelText += 'color: ' + obj[j]['selected']['color'] + "; ";
      }
      if (obj[j]['unselected']) {
        if (obj[j]['unselected']['background-color'])
          ruleCell += 'background-color: ' + obj[j]['unselected']['background-color'] + "; ";
        if (obj[j]['unselected']['background-color'])
          ruleText += 'color: ' + obj[j]['unselected']['color'] + "; ";
      }

      ruleSelCell += "}";
      ruleCell += "}";
      ruleSelText += "}";
      ruleText += "}";

      //rule for selected should be inserted first
      this.mStyleSheet.insertRule(ruleSelCell, 0);
      this.mStyleSheet.insertRule(ruleCell, 0);
      this.mStyleSheet.insertRule(ruleSelText, 0);
      this.mStyleSheet.insertRule(ruleText, 0);
    }

    //to insert rules for user selected font preferences
    var ruleMore = "treechildren#browse-treechildren::-moz-tree-cell-text, treechildren#sqloutput-treechildren::-moz-tree-cell-text {font-size:" + obj.textFont.unselected['font-size'] + "%;font-family:" + obj.textFont.unselected['font-family'] + "}";
    this.mStyleSheet.insertRule(ruleMore, 0);
    if (obj.rowHeight > 0) {
      ruleMore = "treechildren#browse-treechildren::-moz-tree-row, treechildren#sqloutput-treechildren::-moz-tree-row {height:" + obj.rowHeight + "px;}";
      this.mStyleSheet.insertRule(ruleMore, 0);
    }

    return true;
  },

  deleteAllRules: function() {
    if (this.mStyleSheet == null)
      return;

    while (this.mStyleSheet.cssRules.length > 0) {
      this.mStyleSheet.deleteRule(0);
    }
  }
};

//this object handles MRU using one preference 'jsonMruData'
SmGlobals.mru = {
  mbInit: false,
  mSize: 0,
  mList: [],
  mProfilePath: '',

  initialize: function() {
    try {
      this.convert();
    } catch (e) {}

    this.getPref();

    this.mProfilePath = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties).get("ProfD", Ci.nsIFile).path;
    this.mbInit = true;
  },

  convert: function() {
    //use the two prefs and remove them; so, the following can happen only once.
    var sPref = sm_prefsBranch.getComplexValue("mruPath.1", Ci.nsISupportsString).data;
    this.mList = sPref.split(",");
    this.mSize = sm_prefsBranch.getIntPref("mruSize");

    sm_prefsBranch.clearUserPref("mruPath.1");
    sm_prefsBranch.clearUserPref("mruSize");

    this.setPref();
    return true;
  },

  add: function(sPath) {
    if (sPath.indexOf(this.mProfilePath) == 0)
      sPath = "[ProfD]" + sPath.substring(this.mProfilePath.length);

    var iPos = this.mList.indexOf(sPath);
    if (iPos >= 0) {
      //remove at iPos
      this.mList.splice(iPos, 1);
    }
    //add in the beginning
    this.mList.splice(0, 0, sPath);

    if (this.mList.length > this.mSize) {
      //remove the extra entries
      this.mList.splice(this.mSize, this.mList.length  - this.mSize);
    }

    this.setPref();
  },

  remove: function(sPath) {
    if (sPath.indexOf(this.mProfilePath) == 0)
      sPath = "[ProfD]" + sPath.substring(this.mProfilePath.length);

    var iPos = this.mList.indexOf(sPath);
    if (iPos >= 0) {
      //remove at iPos
      this.mList.splice(iPos, 1);
      this.setPref();
      return true;
    }
    return false;
  },

  getList: function() {
    if (!this.mbInit)
      this.initialize();

    var aList = [];
    for (var i = 0; i < this.mList.length; i++) {
      aList.push(this.getFullPath(this.mList[i]));
    }
    return aList;
  },

  getLatest: function() {
    if (!this.mbInit)
      this.initialize();

    if (this.mList.length > 0)
      return this.getFullPath(this.mList[0]);
    else
      return null;
  },

  getFullPath: function(sVal) {
    var sRelConst = "[ProfD]";
    if (sVal.indexOf(sRelConst) == 0)
      sVal = this.mProfilePath + sVal.substring(sRelConst.length);

    return sVal;
  },

  getPref: function() {
    try {
      var sPref = sm_prefsBranch.getComplexValue("jsonMruData", Ci.nsISupportsString).data;
    } catch (e) {
      var sPref = sm_prefsBranch.getCharPref("jsonMruData");
    }
    var obj = JSON.parse(sPref);
    this.mList = obj.list;
    this.mSize = obj.size;
  },

  setPref: function() {
    try {
      var sPref = sm_prefsBranch.getComplexValue("jsonMruData", Ci.nsISupportsString).data;
    } catch (e) {
      var sPref = sm_prefsBranch.getCharPref("jsonMruData");
    }
    var obj = JSON.parse(sPref);
    obj.list = this.mList;
    obj.size = this.mSize;
    sPref = JSON.stringify(obj);
    sm_setUnicodePref("jsonMruData", sPref);
  }
};
