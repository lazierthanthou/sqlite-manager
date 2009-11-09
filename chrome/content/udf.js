Components.utils.import("resource://sqlitemanager/fileIO.js");

//var Database;
var SmUdf = {
  dbFunc: null,

  init: function() {
    //open connection to udf db
    if (this.dbFunc == null)
      this.dbFunc = new SQLiteHandler();

    try {
      var fUserFile = this.getUserFile();
      if (fUserFile != null)
        this.dbFunc.openDatabase(fUserFile);
      else
        this.dbFunc.openDatabase(this.getSuppliedFile());
    } catch (e) {
      sm_log('Failed to open a connection to UDF database\n' + (fUserFile != null)?'db: user selected':'db: supplied');
      return false;
    }
    return true;
  },

  close: function() {
    //close connection to udf db
    try {
      if (this.dbFunc != null)
        this.dbFunc.closeConnection();
    } catch (e) {
      sm_log('Failed to close the connection to UDF database');
      this.dbFunc = null;
      return false;
    }

    return true;
  },
  
  loadTab: function() {
    //connect to udf db
    this.init();

    //get udfDbDirPath from prefs
    $$("udfDbDirPath").value = sm_prefsBranch.getCharPref("udfDbDirPath");

    //populate menulist with all function names
    this.populateFuncMenuList();
  },

  selectUdfDir: function() {
    //select a dir
    var dir = SmGlobals.chooseDirectory("Choose location of user-defined functions database (smFunctions.sqlite)...");
    if (dir == null) {
      alert("Please choose a directory before proceeding.\nIf you already have smFunctions.sqlite file, then choose the directory where it is located.\nIf you do NOT have an existing smFunctions.sqlite file, then one will be created in the directory you choose.\nThe chosen location should have read/write permissions.");
    }
    else {
      sm_prefsBranch.setCharPref("udfDbDirPath", dir.path);

      try {
        //copy the supplied db if none exists
        var fUser = this.getUserFile();
        if (!fUser.exists()) {
          this.copySuppliedFile();
        }
        //if user file exists/created, connect to it, etc.
        this.loadTab();
      } catch (e) {
        var udfDbDirPath = sm_prefsBranch.getCharPref("udfDbDirPath");
        alert(e.message);
        Cu.reportError('SQLiteManager: ' + e.message + '\nudfDbDirPath: ' + udfDbDirPath);
      }
    }
  },

  copySuppliedFile: function() {
    var fileOrig = this.getSuppliedFile();
    var dirUser = this.getUserDir();
    if (dirUser != null) {
      fileOrig.copyTo(dirUser, "");
      return true;
    }
    return false;
  },

  getSuppliedFile: function() {
    //find the location of this extension/xul app
    var fileOrig = FileIO.getFile(SmGlobals.extLocation);
    fileOrig.append('extra');
    fileOrig.append('smFunctions.sqlite');
    return fileOrig;
  },

  getUserDir: function() {
    var udfDbDirPath = sm_prefsBranch.getCharPref("udfDbDirPath");
    var fileDb = FileIO.getFile(udfDbDirPath);
    return fileDb;
  },

  getUserFile: function() {
    var fileDb = this.getUserDir();
    if (fileDb != null)
      fileDb.append("smFunctions.sqlite");
    return fileDb;
  },

  onSelectTab: function() {
    var sId = $$("udfTabs").selectedItem.id;
    switch(sId) {
      case "udfTabNew":
        break;
      case "udfTabView":
        break;
    }
  },

  //this function populates the menu in 'Available Functions' tab
  populateFuncMenuList: function() {
    //of course, we cannot proceed without a db connection
    if (this.dbFunc == null)
      return;

    var records = [];
    try {
      this.dbFunc.selectQuery('SELECT name FROM functions ORDER BY name');
      records = this.dbFunc.getRecords();
    } catch (e) {
      sm_log(e.message);
      return false;
    }

    $$("udfFuncMenuList").removeAllItems();
    var mi;
    if (records.length == 0) {
      mi = $$("udfFuncMenuList").appendItem('--No Function Found--', '--');
    }
    else {
      mi = $$("udfFuncMenuList").appendItem('--Select Function--', '--');
    }
    mi.setAttribute("disabled", "true");
    $$("udfFuncMenuList").selectedIndex = 0;

    for (var i in records) {
      $$("udfFuncMenuList").appendItem(records[i][0], records[i][0]);
    }
    return true;
  },

  onSelectFuncName: function() {
    $$("udfViewFunc").textContent = '';
    var sFuncName = $$("udfFuncMenuList").value;
    if (sFuncName == '--')
      return false;

    var records = [];
    try {
      this.dbFunc.selectQuery("SELECT name, body, argLength, enabled, aggregate FROM functions WHERE name = '" + sFuncName + "' ORDER BY name");
      records = this.dbFunc.getRecords();
    } catch (e) {
      sm_log(e.message);
      return false;
    }

    var sTxt = [];
    for (var i in records) {
      sTxt.push('// name      = ' + records[i][0]);
      sTxt.push('// argLength = ' + records[i][2]);
      sTxt.push('// aggregate = ' + records[i][4]);
      sTxt.push('// enabled   = ' + records[i][3]);
      sTxt.push('function ' + records[i][0] + ' (aValues) {');
      sTxt.push(records[i][1]);
      sTxt.push('}');
    }
    $$("udfViewFunc").textContent = sTxt.join('\n');
    return true;
  },

  getDbFunctions: function() {
    //of course, we cannot proceed without a db connection
    if (this.dbFunc == null)
      return;

    var allUdf = [];

    this.dbFunc.selectQuery('SELECT name, body, argLength FROM functions WHERE enabled = 1 AND aggregate = 0');
    var records = this.dbFunc.getRecords();

    for (var i in records) {
      var func = new Function("aValues", records[i][1]);
      var udf = {fName: records[i][0], fLength: records[i][2],
                  onFunctionCall: func};
      allUdf.push(udf);
    }
    return allUdf;
  },

  showHelp: function(sArg) {
    switch (sArg) {
      case 'newFunctionArgLength':
        alert('-1 means unlimited');
        break;
      case 'newFunctionBody':
        alert('body without braces');
        break;
    }
  }
};
