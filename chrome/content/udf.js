Components.utils.import("resource://sqlitemanager/fileIO.js");

//var Database;
var SmUdf = {
  dbFunc: null,

  init: function() {
    try {
      //open connection to udf db
      if (this.dbFunc == null)
        this.dbFunc = new SQLiteHandler();

      var fUserFile = this.getUserFile();
      var bConnected = false;
      if (fUserFile != null)
        bConnected = this.dbFunc.openDatabase(fUserFile);

      if (bConnected) {
        //if connected & if tables do not exist, create them and insert example rows
        if (!this.dbFunc.tableExists('functions')) {
          var aQ = this.getFuncQueries();
          this.dbFunc.executeTransaction(aQ);
        }
        if (!this.dbFunc.tableExists('aggregateFunctions')) {
          var aQ = this.getAggFuncQueries();
          this.dbFunc.executeTransaction(aQ);
        }
        return true;
      }
    } catch (e) {
      Components.utils.reportError('Failed to open a connection to UDF database\n' + (fUserFile != null)?'db: user selected':'db: supplied');
    }

    this.dbFunc = null;
    return false;
  },

  getFuncQueries: function() {
    var aSql = [];
    aSql.push('DROP TABLE IF EXISTS "functions";');
    aSql.push('CREATE TABLE "functions" ("name" TEXT PRIMARY KEY  NOT NULL, "body" TEXT NOT NULL, "argLength" INTEGER, "aggregate" INTEGER NOT NULL  DEFAULT 0, "enabled" INTEGER NOT NULL  DEFAULT 1, "extraInfo" TEXT);');
    aSql.push('INSERT INTO "functions" VALUES("regexp",\'var regExp = new RegExp(aValues.getString(0));\nvar strVal = new String(aValues.getString(1));\n\nif (strVal.match(regExp)) return 1;\nelse return 0;\',2,0,1,NULL);');
    aSql.push('INSERT INTO "functions" VALUES("addAll","var sum = 0;\nfor (var j = 0; j < aValues.numEntries; j++) {\n  sum += aValues.getInt32(j);\n}\nreturn sum;",-1,0,1,NULL);');
    aSql.push('INSERT INTO "functions" VALUES("joinValues","var valArr = [];\n\nfor (var j = 0; j < aValues.numEntries; j++) {\n  switch (aValues.getTypeOfIndex(j)) {\n    case 0: //NULL\n      valArr.push(null);\n      break;\n    case 1: //INTEGER\n      valArr.push(aValues.getInt64(j));\n      break;\n    case 2: //FLOAT\n      valArr.push(aValues.getDouble(j));\n      break;\n    case 3: //TEXT\n      default:\n      valArr.push(aValues.getString(j));\n  }\n}\nreturn valArr.join(\',\');",-1,0,1,NULL);');
    return aSql;
  },

  getAggFuncQueries: function() {
    var aSql = [];
    aSql.push('DROP TABLE IF EXISTS "aggregateFunctions";');
    aSql.push('CREATE TABLE "aggregateFunctions" ("name" TEXT PRIMARY KEY  NOT NULL, "argLength" INTEGER, "onStepBody" TEXT, "onFinalBody" TEXT, "enabled" INTEGER NOT NULL DEFAULT 1, "extraInfo" TEXT);');
    aSql.push('INSERT INTO "aggregateFunctions" ("name", "argLength", "onStepBody", "onFinalBody", "enabled", "extraInfo") VALUES("stdDev", 1, "this._store.push(aValues.getInt32(0));", "var iLength = this._store.length;\nlet total = 0;\nthis._store.forEach(function(elt) { total += elt });\nlet mean = total / iLength;\nlet data = this._store.map(function(elt) {\n  let value = elt - mean;\n  return value * value;\n});\ntotal = 0;\ndata.forEach(function(elt) { total += elt });\nthis._store = [];\nreturn Math.sqrt(total / iLength);",1,NULL);');
    return aSql;
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
    this.populateFuncMenuList(false);
    this.populateFuncMenuList(true);
  },

  selectUdfDir: function() {
    //select a dir
    var dir = SmGlobals.chooseDirectory("Choose location of user-defined functions database (smFunctions.sqlite)...");
    if (dir == null) {
      alert("Please choose a directory before proceeding.\nIf you already have smFunctions.sqlite file, then choose the directory where it is located.\nIf you do NOT have an existing smFunctions.sqlite file, then one will be created in the directory you choose.\nThe chosen location should have read/write permissions.");
    }
    else {
      sm_prefsBranch.setCharPref("udfDbDirPath", dir.path);
      //reload this tab
      this.loadTab();
    }
  },

  getUserFile: function() {
    var udfDbDirPath = sm_prefsBranch.getCharPref("udfDbDirPath");
    if (udfDbDirPath == null || udfDbDirPath == '')
      return null;

    var fileDb = FileIO.getFile(udfDbDirPath);
    if (fileDb == null)
      return null;

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

  //this function populates the menu in 'Simple Functions' tab
  populateFuncMenuList: function(bAggregate) {
    //of course, we cannot proceed without a db connection
    if (this.dbFunc == null)
      return;

    var sMlId = "udfFuncMenuList";
    var sQuery = 'SELECT name FROM functions ORDER BY name';
    if (bAggregate) {
      sMlId = "udfAggFuncMenuList";
      sQuery = 'SELECT name FROM aggregateFunctions ORDER BY name';
    }

    var records = [];
    try {
      this.dbFunc.selectQuery(sQuery);
      records = this.dbFunc.getRecords();
    } catch (e) {
      sm_log(e.message);
      return false;
    }

    var ml = $$(sMlId);
    ml.removeAllItems();
    var mi;
    if (records.length > 0) {
      mi = ml.appendItem('--Select Function--', '--');
    }
    mi.setAttribute("disabled", "true");

    for (var i in records) {
      ml.appendItem(records[i][0], records[i][0]);
    }
    if (records.length > 0) {
      mi = ml.appendItem('--------------------------', '--');
      mi.setAttribute("disabled", "true");
    }
    mi = ml.appendItem('--Add New Function--', '--');
    ml.selectedIndex = 0;
    return true;
  },

  saveFunction: function() {
    var sName = $$("udfNewFuncName").value;
    var iArg = $$("udfNewFuncArgLength").value;
    var iEnabled = $$("udfNewFuncEnabled").checked?1:0;
    var sBody = $$("udfNewFuncBody").value;

    try {
      var sQuery = "INSERT INTO functions (name, body, argLength, enabled) VALUES (" + SQLiteFn.quote(sName) + "," + SQLiteFn.quote(sBody) + "," + iArg + "," + iEnabled + ")";
      this.dbFunc.executeSimpleSQLs([sQuery]);
    } catch (e) {
      sm_log(e.message);
      return false;
    }
    //populate menulist with all function names
    this.populateFuncMenuList(false);
    //notify the user
    sm_notify('udfNotifyBox', 'New function added: ' + sName + '. Press "Reload Functions" button to access this function in SQL statements.', 'info', 4);
    return true;
  },

  saveAggFunction: function() {
    var sName = $$("udfNewAggFuncName").value;
    var iArg = $$("udfNewAggFuncArgLength").value;
    var iEnabled = $$("udfNewAggFuncEnabled").checked?1:0;
    var sOnStepBody = $$("udfNewAggFuncOnStepBody").value;
    var sOnFinalBody = $$("udfNewAggFuncOnFinalBody").value;

    try {
      var sQuery = "INSERT INTO aggregateFunctions (name, argLength, onStepBody, onFinalBody, enabled) VALUES (" + SQLiteFn.quote(sName) + "," + iArg + "," + SQLiteFn.quote(sOnStepBody) + "," + SQLiteFn.quote(sOnFinalBody) + "," + iEnabled + ")";
      this.dbFunc.executeSimpleSQLs([sQuery]);
    } catch (e) {
      sm_log(e.message);
      return false;
    }
    //populate menulist with all function names
    this.populateFuncMenuList(true);
    //notify the user
    sm_notify('udfNotifyBox', 'New aggregate function added: ' + sName + '. Press "Reload Functions" button to access this function in SQL statements.', 'info', 4);
    return true;
  },

  reloadFunctions: function() {
    SQLiteManager.createFunctions(false);
  },

  addFunction: function() {
    if (this.dbFunc == null)
      return;

    $$("udfVbFuncEdit").hidden = false;
    $$("udfVbFuncView").hidden = true;
  },

  viewFunction: function() {
    if (this.dbFunc == null)
      return;

    $$("udfVbFuncEdit").hidden = true;
    $$("udfVbFuncView").hidden = false;

    $$("udfViewFuncHead").textContent = '';
    $$("udfViewFuncBody").textContent = '';
    $$("udfViewFuncTail").textContent = '';
    var sFuncName = $$("udfFuncMenuList").value;
    if (sFuncName == '--')
      return false;

    var records = [];
    try {
      this.dbFunc.selectQuery("SELECT name, body, argLength, enabled FROM functions WHERE name = '" + sFuncName + "' ORDER BY name");
      records = this.dbFunc.getRecords();
    } catch (e) {
      sm_log(e.message);
      return false;
    }

    var sTxt = [], sBody;
    for (var i in records) {
      sTxt.push('// name      = ' + records[i][0]);
      sTxt.push('// argLength = ' + records[i][2]);
      sTxt.push('// enabled   = ' + records[i][3]);
      sTxt.push('function ' + records[i][0] + ' (aValues) {');
      sBody = records[i][1];
    }
    $$("udfViewFuncHead").textContent = sTxt.join('\n');
    $$("udfViewFuncBody").textContent = sBody;
    $$("udfViewFuncTail").textContent = '}';
    return true;
  },

  getFunctions: function() {
    //of course, we cannot proceed without a db connection
    if (this.dbFunc == null)
      return;

    var allUdf = [];

    this.dbFunc.selectQuery('SELECT name, body, argLength FROM functions WHERE enabled = 1 AND aggregate = 0');
    var records = this.dbFunc.getRecords();

    for (var i in records) {
      try {
        var func = new Function("aValues", records[i][1]);
        var udf = {fName: records[i][0], fLength: records[i][2], onFunctionCall: func};
        allUdf.push(udf);
      } catch (e) {
        sm_log("Failed to create function: " + records[i][0]);
      }
    }
    return allUdf;
  },

  getAggregateFunctions: function() {
    //of course, we cannot proceed without a db connection
    if (this.dbFunc == null)
      return;

    var allUdf = [];

    this.dbFunc.selectQuery('SELECT name, argLength, onStepBody, onFinalBody FROM aggregateFunctions WHERE enabled = 1');
    var records = this.dbFunc.getRecords();
    for (var i in records) {
      try {
        var objAggFunc = {
          _store: [],
          onStep: new Function("aValues", records[i][2]),
          onFinal: new Function(records[i][3])
        };
        var udf = {fName: records[i][0], fLength: records[i][1], objFunc: objAggFunc};
        allUdf.push(udf);
      } catch (e) {
        sm_log("Failed to create function: " + records[i][0]);
      }
    }
    return allUdf;
  },

  showHelp: function(sArg) {
    switch (sArg) {
      case 'newFunctionArgLength':
        smPrompt.alert(null, sm_getLStr("extName"), 'The number of arguments that the function will accept should be an integer.\n-1 means unlimited number of arguments.');
        break;
      case 'newFunctionBody':
        smPrompt.alert(null, sm_getLStr("extName"), 'Write the function body without braces.\nThe argument to the function is "aValues" which can be used within the function body as in the example functions which you can see under the Available Functions tab.');
        break;
    }
  },
};

