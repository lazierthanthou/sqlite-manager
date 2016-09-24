//TODO: some documentation for this file
//TODO: some simplification
//as of now, depends on mFuncConfirm (a function), mBlobPrefs (from prefs) & setStrForNull (in sqlitefn); but the latter 2 have default values and even if the first one is not set, there will be no confirmation before executing. So, this file is pretty independent now.

let EXPORTED_SYMBOLS = ["SQLiteTypes", "SQLiteHandler", "SQLiteFn"];

//https://developer.mozilla.org/en/mozIStorageValueArray
const SQLiteTypes = {
  NULL   : 0,
  INTEGER: 1,
  REAL  : 2,
  TEXT   : 3,
  BLOB   : 4
};

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

const promptService  = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);

//promptService.alert(null, "SQLite Manager Alert", sMsg);

var stmtCallback = {
  handleResult: function(aResultSet) {
    Cu.reportError("in handleResult: ");
    for (let row = aResultSet.getNextRow(); row; row = aResultSet.getNextRow()) {
//      Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService).logStringMessage("handleResult\n" + 11);
//       let value = row.getResultByName("column_name");
    }
  },

  handleError: function(aError) {
    Cu.reportError("Error in executeAsync: " + aError.message);
  },

  handleCompletion: function(aReason) {
    Cu.reportError("in handleCompletion: " + aReason);
    switch (aReason) {
      case Ci.mozIStorageStatementCallback.REASON_FINISHED:
        return true;
      case Ci.mozIStorageStatementCallback.REASON_CANCELED:
      case Ci.mozIStorageStatementCallback.REASON_ERROR:
        alert("Query canceled or aborted!");
        return false;
    }
  }
};

function SQLiteHandler() {
  this.storageService = Cc["@mozilla.org/storage/service;1"].getService(Ci.mozIStorageService);
  this.consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
  this.promptService = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
}

SQLiteHandler.prototype = {
  dbConn: null,
  mbShared: true,
  mOpenStatus: "",

  aTableData: null,       // Stores 2D array of table data
  aTableType: null,
  aColumns: null,

  colNameArray: null,
  resultsArray: null,
  statsArray: null,

  maDbList: ["main", "temp"],
  mLogicalDbName: "main", //for main, temp and attached databases

  lastError: "",
  lastErrorString: "",
  miTime: 0, //time elapsed during queries (in milliseconds)

  mFuncConfirm: null,
  mBlobPrefs: {sStrForBlob: 'BLOB', bShowSize: true, iMaxSizeToShowData: 100, iHowToShowData: 0},

  //issue #413: we should not attempt to close the places.sqlite
  //the following variable tells us that we are connected to places.sqlite
  mbPlacesDb: false, //true, if places.sqlite in profile dir is open

  //array to hold names of added functions; will be used in removing functions
  maAddedFunctions: [],

  // openDatabase: opens a connection to the db file nsIFile
  // bShared = true: first attempt shared mode, then unshared
  // bShared = false: attempt unshared cache mode only
  openDatabase: function(nsIFile, bShared) {
    this.closeConnection();

    try {
      if (!bShared) // dummy exception to reach catch to use openUnsharedDatabase
        throw 0;

      this.dbConn = this.storageService.openDatabase(nsIFile);
      this.mbShared = true;
      // if the db does not exist it does not give us any indication
      // this.dbConn.lastErrorString returns "not an error"
    }
    catch (e) { //attempt unshared connection
      try {
        this.dbConn = this.storageService.openUnsharedDatabase(nsIFile);
        this.mbShared = false;
        // if the db does not exist it does not give us any indication
        // this.dbConn.lastErrorString returns "not an error"
      }
      catch (e) {
        var msg = this.onSqlError(e, "Error in opening file " + nsIFile.leafName + " - either the file is encrypted or corrupt", null, true);
        Cu.reportError(msg);
        return false;
      }
    }

    if(this.dbConn == null)
      return false;

    this.mOpenStatus = this.mbShared?"Shared":"Exclusive";
    return true;
  },

  //for places.sqlite
  openSpecialProfileDatabase: function(nsIFile) {
    this.closeConnection();

    try {
      this.dbConn = Cc["@mozilla.org/browser/nav-history-service;1"].getService(Ci.nsINavHistoryService).QueryInterface(Ci.nsPIPlacesDatabase).DBConnection;
    }
    catch (e) {
      var msg = this.onSqlError(e, "Error in opening places.sqlite", null, true);
      Cu.reportError(msg);
      return false;
    }

    if(this.dbConn == null)
      return false;

    this.mbPlacesDb = true;
    this.mOpenStatus = "Shared";
    return true;
  },

  openSpecialDatabase: function(sSpecialName) {
    if (sSpecialName != "memory")
      return false;

    this.closeConnection();

    try {
      this.dbConn = this.storageService.openSpecialDatabase(sSpecialName);
    }
    catch (e) {
      var msg = this.onSqlError(e, "Error in opening in memory database", null, true);
      Cu.reportError(msg);
      return false;
    }

    if(this.dbConn == null)
      return false;

    this.mOpenStatus = "Memory";
    return true;
  },

  closeConnection: function() {
    if (this.dbConn != null) {
      //remove all functions added by us otherwise db which remain open after our connection to it closes (e.g., places.sqlite) will continue to have these functions
      this.removeAllFunctions();
      this.maAddedFunctions = [];
    }

    //for places.sqlite, do not attempt to close the connection
    if (this.mbPlacesDb) {
      this.dbConn = null;
      this.mbPlacesDb = false;
    }

    if (this.dbConn != null) {
      try {
        this.dbConn.close();
      } catch (e) {
        this.dbConn = null;
      }
    }

    this.dbConn = null;
    this.aTableData = null;
    this.aTableType = null;
    this.aColumns = null;
    this.mOpenStatus = "";
  },

  createFunction: function(fnName, argLength, fnObject) {
    if (funcNamesAll.indexOf(fnName) != -1) {
      this.logMessage("Cannot create function called: " + fnName + "\nThis name belongs to a core, aggregate or datetime function.");
      return;
    }
    try {
      this.dbConn.createFunction(fnName, argLength, fnObject);
    } catch (e) {
      var msg = "Failed to create storage function: " + fnName + "\nA function by this name may already have been created.";
      var msg = this.onSqlError(e, msg, null, false);
      Cu.reportError(msg);
      return false;
    }

    if (this.maAddedFunctions.indexOf(fnName) < 0)
      this.maAddedFunctions.push(fnName);

    return true;
  },

  createAggregateFunction: function(fnName, argLength, fnObject) {
    if (funcNamesAll.indexOf(fnName) != -1) {
      this.logMessage("Cannot create aggregate function called: " + fnName + "\nThis name belongs to a core, aggregate or datetime function.");
      return;
    }
    try {
      this.dbConn.createAggregateFunction(fnName, argLength, fnObject);
    } catch (e) {
      var msg = "Failed to create storage function: " + fnName + "\nA function by this name may already have been created.";
      var msg = this.onSqlError(e, msg, null, false);
      Cu.reportError(msg);
      return false;
    }

    if (this.maAddedFunctions.indexOf(fnName) < 0)
      this.maAddedFunctions.push(fnName);

    return true;
  },

  //remove all functions created by createFunction & createAggregateFunction
  removeAllFunctions: function() {
    var i = 0;
    while (i < this.maAddedFunctions.length) {
      try {
        var step = 0;
        var fnName = this.maAddedFunctions[i];
        step = 1;
        this.dbConn.removeFunction(fnName);
        step = 2;
        this.maAddedFunctions.splice(i, 1);
      } catch (e) {
        i++;
        var msg = this.onSqlError(e, "removeAllFunctions: Failed while attempting to remove storage function: " + fnName + '\nstep: ' + step, null, false);
        Cu.reportError(msg);
      }
    }
  },

  getOpenStatus: function() { return this.mOpenStatus; },
  getElapsedTime: function() {
    //in milliseconds
    return this.miTime;
  },
  getRecords: function() { return this.aTableData; },
  getRecordTypes: function() { return this.aTableType; },
  getColumns: function() { return this.aColumns; },
  getLastErrorId: function() { return this.lastError; },
  getLastError: function() { return this.lastErrorString; },

  setErrorString: function() {
    this.lastError = this.dbConn.lastError;
    this.lastErrorString = this.dbConn.lastErrorString;
  },

  get logicalDbName() { return this.mLogicalDbName; },
  get schemaVersion() { return this.dbConn.schemaVersion; },

  setLogicalDbName: function(sDbName) {
    this.mLogicalDbName = sDbName;
  },

  setBlobPrefs: function(objBlobPrefs) {
    this.mBlobPrefs = objBlobPrefs;
  },

  setFuncConfirm: function(oFunc) {
    this.mFuncConfirm = oFunc;
  },

  getPrefixedName: function(objName, sDbName) {
    if (sDbName == "")
      sDbName = this.mLogicalDbName;

    return SQLiteFn.quoteIdentifier(sDbName) + "." + SQLiteFn.quoteIdentifier(objName);
  },

  getPrefixedMasterName: function(sDbName) {
    if (sDbName == "")
      sDbName = this.mLogicalDbName;

    if (sDbName == "temp")
      return "sqlite_temp_master";
    else
      return SQLiteFn.quoteIdentifier(sDbName) + ".sqlite_master";
  },

  getFileName: function() {
    if (this.dbConn != null)
      return this.dbConn.databaseFile.leafName;
    return null;
  },

  getFile: function() {
    if (this.dbConn != null)
      return this.dbConn.databaseFile;
    return null;
  },

  isConnected: function() {
    if (this.dbConn != null)
      return true;
    return false;
  },

  get sqliteVersion() {
    this.selectQuery("SELECT sqlite_version()");
    return this.aTableData[0][0];
  },

  setSetting: function(sSetting, sValue) {
    if (sSetting == "encoding")
      sValue = "'" + sValue + "'";
    var sQuery = "PRAGMA " + sSetting + " = " + sValue;
    //do not execute in a transaction; some settings will cause error
    this.selectQuery(sQuery);

    return this.getSetting(sSetting);
  },

  getSetting: function(sSetting) {
    var iValue = null;
    try {
      this.selectQuery("PRAGMA " + sSetting);
      iValue = this.aTableData[0][0];
      return iValue;
    } catch (e) {
      this.alert("PRAGMA " + sSetting + ": exception - " + e.message);
    }
  },
  
  tableExists: function(sTable, sDbName) {
    if (typeof sDbName == "undefined")
      return this.dbConn.tableExists(sTable);
    else {
      var aList = this.getObjectList("table", sDbName);
      if (aList.indexOf(sTable) >= 0)
        return true;
    }
    return false;
  },

  // Type = table|index|view|trigger,
  objectExists: function(sType, sObjName) {
    var aList = this.getObjectList(sType, "");
    if (aList.indexOf(sObjName) >= 0)
      return true;

    return false;
  },

  //getObjectList: must return an array of names of type=argument 
  // Type = master|table|index|view|trigger,
  //empty array if no object found
  getObjectList: function(sType, sDb) {
    if (sDb == "")
      sDb = this.mLogicalDbName;

    var aResult = [];

    if (sType == "master") {
      aResult = ["sqlite_master"];
      if (sDb == "temp")
        aResult = ["sqlite_temp_master"];
      return aResult;    
    }

    var sTable = this.getPrefixedMasterName(sDb);
    var sQuery = "SELECT name FROM " + sTable + " WHERE type = '"
          + sType + "' ORDER BY name";
    this.selectQuery(sQuery);

    for (var i = 0; i < this.aTableData.length; i++)
      aResult.push(this.aTableData[i][0]);

    return aResult;
  },
  // loadTableData: retrieves data from a table including rowid if needed
  // return r: -1 = error, 0 = ok without extracol,
  // r > 0 means column number of extracol starting with 1
  loadTableData: function(sObjType, sObjName, aArgs) {
    if (sObjType != "master" && sObjType != "table" && sObjType != "view")
      return -1;

    var sCondition = aArgs.sWhere?aArgs.sWhere:"";
    var iLimit = aArgs.iLimit?aArgs.iLimit:-1;
    var iOffset = aArgs.iOffset?aArgs.iOffset:0;
    var sOrder = "";
    if (aArgs.aOrder && aArgs.aOrder.length > 0) {
      var aTemp = [];
      for (var i = 0; i < aArgs.aOrder.length; i++) {
        aTemp.push(SQLiteFn.quoteIdentifier(aArgs.aOrder[i][0]) + " " + aArgs.aOrder[i][1]);
      }
      sOrder = " ORDER BY " + aTemp.join(", ") + " ";
    }

    var extracol = "";
    var iRetVal = 0;
    var sLimitClause = " LIMIT " + iLimit + " OFFSET " + iOffset;
    
    if (sObjType == "table" || sObjType == "master") {
      //find whether the rowid is needed 
      //or the table has an integer primary key
      var rowidcol = this.getTableRowidCol(sObjName);
      if (rowidcol["name"] == "rowid") {
        extracol = " `rowid`, ";
        iRetVal = 1;
      }
    }
    //table having columns called rowid behave erratically
    sObjName = this.getPrefixedName(sObjName, "");
    this.selectQuery("SELECT " + extracol + " * FROM " + sObjName + " " + sCondition + sOrder + sLimitClause);
    return iRetVal;
  },

  //for tables and views
  getRowCount: function(sObjName, sCondition) {
    var iValue = 0;
    sObjName = this.getPrefixedName(sObjName, "");
    var sQuery = "SELECT count(*) FROM " + sObjName + " " + sCondition;
    this.selectQuery(sQuery);

    iValue = this.aTableData[0][0];
    return iValue;
  },

  //for count of indexes/triggers of a table
  getObjectCount: function(sTable, sDb) {
    var sMaster = this.getPrefixedMasterName(sDb);
    var sQuery = "SELECT type, count(*) AS cnt FROM " + sMaster + " WHERE tbl_name = '" + sTable + "' AND type IN ('index', 'trigger') GROUP BY type";

    var oRow = {indexCount: 0, triggerCount: 0};
    try {
      var stmt = this.dbConn.createStatement(sQuery);
      //Cu.reportError("createStatement");
      while (stmt.executeStep()) {
        if (stmt.row.type == 'index')
          oRow.indexCount = stmt.row.cnt;
        if (stmt.row.type == 'trigger')
          oRow.triggerCount = stmt.row.cnt;
      }
      stmt.finalize();
      //Cu.reportError("finalize");
    }
    catch (e) {
      var msg = this.onSqlError(e, "Likely SQL syntax error: " + sQuery, this.dbConn.lastErrorString, true);
      Cu.reportError(msg);
      this.setErrorString();
    }
    return oRow;
  },
  
  emptyTable: function(sTableName) {
    var sQuery = "DELETE FROM " + this.getPrefixedName(sTableName, "");
    return this.confirmAndExecute([sQuery], "Delete All Records");
  },

  renameTable: function(sOldName, sNewName, sDb) {
    var sQuery = "ALTER TABLE " + this.getPrefixedName(sOldName, sDb) + " RENAME TO " + SQLiteFn.quoteIdentifier(sNewName);
    return this.confirmAndExecute([sQuery], "Rename table " + sOldName);
  },

  analyzeTable: function(sTableName) {
    var sQuery = "ANALYZE " + this.getPrefixedName(sTableName, "");
    return this.confirmAndExecute([sQuery], "Analyze Table");
  },

  //sObject = TABLE/INDEX/COLLATION;
  reindexObject: function(sObjectType, sObjectName) {
    var sQuery = "REINDEX " + this.getPrefixedName(sObjectName, "");
    return this.confirmAndExecute([sQuery], sQuery);
  },

  //sObjType = TABLE/INDEX/VIEW/TRIGGER;
  dropObject: function(sObjType, sObjectName) {
    var sQuery = "DROP " + sObjType + " " + this.getPrefixedName(sObjectName, "");
    return this.confirmAndExecute([sQuery], sQuery);
  },

  addColumn: function(sTable, aColumn) {
    var aQueries = [];
    var coldef = SQLiteFn.quoteIdentifier(aColumn["name"]) + " " + aColumn["type"];
    if (aColumn["notnull"])
      coldef += " NOT NULL ";
    if (aColumn["dflt_value"] != "") {
      coldef += " DEFAULT " + aColumn["dflt_value"];
    }
    var sTab = this.getPrefixedName(sTable, "");
    var sQuery = "ALTER TABLE " + sTab + " ADD COLUMN " + coldef;
    return this.confirmAndExecute([sQuery], "Add Column to Table " + sTable);
  },

  alterColumn: function(sTable, oColumn) {
    //get the columns
    var cols = this.getTableInfo(sTable, "");
//    var oldCols = cols; //this seems to create an alias for cols instead of a copy
    var oldCols = this.getTableInfo(sTable, "");
    //correct the cols array
    for(var i = 0; i < cols.length; i++) {
      if (cols[i].name == oColumn.oldColName) {
        cols[i].name = oColumn.newColName;
        cols[i].type = oColumn.newColType;
        cols[i].dflt_value = oColumn.newDefaultValue;
      }
    }
    return this.modifyTable(sTable, oColumn.info, cols, oldCols);
  },

  dropColumn: function(sTable, oColumn) {
    //get the columns
    var cols = this.getTableInfo(sTable, "");
    //correct the cols array
    for(var i = 0; i < cols.length; i++) {
      if (cols[i].name == oColumn.oldColName) {
        cols.splice(i, 1);
      }
    }
    return this.modifyTable(sTable, oColumn.info, cols, cols);
  },

  modifyTable: function(sTable, sInfo, cols, oldCols) {
    //use oldCols to work out the colList to be used to select columns to be inserted in the altered table
    var colList = [];
    for(var i = 0; i < oldCols.length; i++) {
      var colname = oldCols[i].name;
      colname = SQLiteFn.quoteIdentifier(colname);
      colList.push(colname);
    }
    colList = colList.toString();

    var aPK = [], aCols = [], aColNames = [];
    for(var i = 0; i < cols.length; i++) {
      var colname = cols[i].name;
      colname = SQLiteFn.quoteIdentifier(colname);
      aColNames.push(colname);

      var col = [i, colname];
      aCols.push(col);
      if(cols[i].pk == 1)
        aPK.push(colname);
    }

    var aColDefs = [];
    for(var i = 0; i < aCols.length; i++) {
      var j = aCols[i][0]
      var datatype = cols[j].type;

      var txtNull = " NOT NULL ";
      if(cols[j].notnull == 0)
        txtNull = "";

      //Issue #433: apply () around default value because pragma returns values without these; an extra set of () around the value will in any case be harmless
      var defaultvalue = "";
      if(cols[j].dflt_value != null)
        defaultvalue = " DEFAULT (" + cols[j].dflt_value + ") ";

      var pk = "";
      if(aPK.length == 1 && aPK[0] == aCols[i][1])
        pk = " PRIMARY KEY ";
      var col = aCols[i][1] + " " + datatype + pk + txtNull + defaultvalue;
      aColDefs.push(col);
    }
    var coldef = aColDefs.toString();

    //this is the primary key constraint on multiple columns
    var constraintPK = "";
    if(aPK.length > 1)
      constraintPK = ", PRIMARY KEY (" + aPK.toString() + ") ";

    coldef += constraintPK;

////////////////////////////
    var sTab = this.getPrefixedName(sTable, "");
    var sSomePrefix = "oXHFcGcd04oXHFcGcd04_";
    var sTempTable = this.getPrefixedName(sSomePrefix + sTable, "");
    var sTempTableName = SQLiteFn.quoteIdentifier(sSomePrefix + sTable);

    var aQueries = [];
    aQueries.push("ALTER TABLE " + sTab + " RENAME TO " + sTempTableName);
    aQueries.push("CREATE TABLE " + sTab + " (" + coldef + ")");    
    aQueries.push("INSERT INTO " + sTab + " SELECT " + colList + " FROM " + sTempTable);
    aQueries.push("DROP TABLE " + sTempTable);    

    var bReturn = this.confirmAndExecute(aQueries, sInfo, "confirm.otherSql");
    return bReturn;
  },

  // selectQuery : execute a select query and store the results
  selectQuery: function(sQuery, bBlobAsHex) {
    this.aTableData = new Array();
    this.aTableType = new Array();
    // if aColumns is not null, there is a problem in tree display
    this.aColumns = null;        
    var bResult = false;
 
    var timeStart = Date.now();
    try { // mozIStorageStatement
      var stmt = this.dbConn.createStatement(sQuery);
      //Cu.reportError("createStatement");
    }
    catch (e) {
      // statement will be undefined because it throws error);
      var msg = this.onSqlError(e, "Likely SQL syntax error: " + sQuery, this.dbConn.lastErrorString, true);
      Cu.reportError(msg);
      this.setErrorString();
      return false;
    }
    
    var iCols = 0;
    var iType, colName;
    try {
      // do not use stmt.columnCount in the for loop, fetches the value again and again
      iCols = stmt.columnCount;
      this.aColumns = new Array();
      var aTemp, aType;
      for (var i = 0; i < iCols; i++) {
        colName = stmt.getColumnName(i);
        aTemp = [colName, iType];
        this.aColumns.push(aTemp);  
      }
    } catch (e) {
      stmt.finalize();
      //Cu.reportError("finalize");
      var msg = this.onSqlError(e, "Error while fetching column name: " + colName, null, true);
      Cu.reportError(msg);
      this.setErrorString();
      return false;
    }

    var cell;
    var bFirstRow = true;
    try {
      while (stmt.executeStep()) {
        aTemp = [];
        aType = [];
        for (i = 0; i < iCols; i++) {
          iType = stmt.getTypeOfIndex(i);
          if (bFirstRow) {
            this.aColumns[i][1] = iType;
          }
          switch (iType) {
            case stmt.VALUE_TYPE_NULL: 
              cell = null;
              break;
            case stmt.VALUE_TYPE_INTEGER:
              cell = stmt.getInt64(i);
              break;
            case stmt.VALUE_TYPE_FLOAT:
              cell = stmt.getDouble(i);
              break;
            case stmt.VALUE_TYPE_TEXT:
              cell = stmt.getString(i);
              break;
            case stmt.VALUE_TYPE_BLOB: //TODO: handle blob properly
              if (bBlobAsHex) {
                  var iDataSize = {value:0};
                  var aData = {value:null};
                  stmt.getBlob(i, iDataSize, aData);
                  cell = SQLiteFn.blobToHex(aData.value);
              }
              else {
                cell = this.mBlobPrefs.sStrForBlob;
                if (this.mBlobPrefs.bShowSize) {
                  var iDataSize = {value:0};
                  var aData = {value:null};
                  stmt.getBlob(i, iDataSize, aData);
                  cell += " (Size: " + iDataSize.value + ")";
                  if (iDataSize.value <= this.mBlobPrefs.iMaxSizeToShowData || this.mBlobPrefs.iMaxSizeToShowData < 0) {
                    if (this.mBlobPrefs.iHowToShowData == 1)
                      cell = this.convertBlobToStr(aData.value);
                    if (this.mBlobPrefs.iHowToShowData == 0)
                      cell = SQLiteFn.blobToHex(aData.value);
                  }
                }
              }
              break;
            default: sData = "<unknown>"; 
          }
          aTemp.push(cell);
          aType.push(iType);
        }
        this.aTableData.push(aTemp);
        this.aTableType.push(aType);
        bFirstRow = false;
      }
      this.miTime = Date.now() - timeStart;
    } catch (e) {
      stmt.finalize();
      //Cu.reportError("finalize");
      var msg = this.onSqlError(e, "Query: " + sQuery + " - executeStep failed", null, true);
      Cu.reportError(msg);
      this.setErrorString();
      return false;
    }
    stmt.finalize();
    //Cu.reportError("finalize");
    this.setErrorString();
    return true;
  },

  exportTable: function(sTableName, sDbName, oFormat) {
    var sQuery = "SELECT * FROM " + this.getPrefixedName(sTableName, sDbName);
    this.selectQuery(sQuery, true);
    var arrData = this.getRecords();
    var arrColumns = this.getColumns();
    var arrTypes = this.getRecordTypes();

    if (oFormat.name == "csv")
      return getCsvFromArray(arrData, arrTypes, arrColumns, oFormat);
  },

  convertBlobToStr: function(aData) {
    var str = '';
    for (var i = 0; i < aData.length; i++) {
      str += String.fromCharCode(aData[i]);
    }
    return str;
  },

  // selectBlob : execute a select query to return blob
  selectBlob: function(sTable, sField, sWhere) {
    var sQuery = ["SELECT", SQLiteFn.quoteIdentifier(sField), "FROM", this.getPrefixedName(sTable, ""), "WHERE", sWhere].join(' ');
    try { // mozIStorageStatement
      var stmt = this.dbConn.createStatement(sQuery);
      //Cu.reportError("createStatement");
    }
    catch (e) {
      // statement will be undefined because it throws error);
      var msg = this.onSqlError(e, "Likely SQL syntax error: " + sQuery, this.dbConn.lastErrorString, true);
      Cu.reportError(msg);
      this.setErrorString();
      return false;
    }
    
    if (stmt.columnCount != 1)
      return false;

    var cell;
    try {
      stmt.executeStep();
      if (stmt.getTypeOfIndex(0) != stmt.VALUE_TYPE_BLOB)
        return false;

      var iDataSize = {value:0};
      var aData = {value:null};
      stmt.getBlob(0, iDataSize, aData);
      cell = "BLOB (Size: " + iDataSize.value + ")";
      //return [iDataSize.value, aData.value];
      return aData.value;
    } catch (e) {
      stmt.finalize();
      //Cu.reportError("finalize");
      var msg = this.onSqlError(e, "Query: " + sQuery + " - executeStep failed", null, true);
      Cu.reportError(msg);
      this.setErrorString();
      return false;
    }
    this.setErrorString();
    return true;
  },

  // getTableRowidCol : execute a pragma query and return the results
  getTableRowidCol: function(sTableName) {
    var aCols = this.getTableInfo(sTableName, "");
    var aReturn = [];

    var iNumPk = 0, iIntPk = 0;
    for(var i = 0; i < aCols.length; i++) {
      var row = this.aTableData[i];
      var type = aCols[i].type;
      var pk = aCols[i].pk;
      type = type.toUpperCase();
      if(pk == 1) {
        iNumPk++;
        if (type == "INTEGER") {
          iIntPk++;
          aReturn["name"] = aCols[i].name;
          aReturn["cid"] = aCols[i].cid;
        }
      }
    }
    if (iNumPk == 1 && iIntPk == 1)
      return aReturn;
    
    aReturn["name"] = "rowid";
    aReturn["cid"] = 0;
    return aReturn;
  },

  getPragmaSchemaQuery: function(sPragma, sObject, sDbName) {
    if (sDbName == "")
      sDbName = this.mLogicalDbName;
    return "PRAGMA " + SQLiteFn.quoteIdentifier(sDbName) + "." + sPragma + "(" + SQLiteFn.quoteIdentifier(sObject) + ")";
  },

  getIndexDetails: function(sIndexName, sDb) {
    var aReturn = {tbl_name: '', unique: 0};

    var row = this.getMasterInfo(sIndexName, '');
    aReturn.tbl_name = row.tbl_name;

    //to find whether duplicates allowed
    var aList = this.getIndexList(aReturn.tbl_name, "");
    for(var i = 0; i < aList.length; i++) {
      if(aList[i].name == sIndexName)
        aReturn.unique = aList[i].unique;
    }
    
    return aReturn;
  },
    
  select : function(file,sql,param) {
    var ourTransaction = false;
    if (this.dbConn.transactionInProgress) {
      ourTransaction = true;
      this.dbConn.beginTransactionAs(this.dbConn.TRANSACTION_DEFERRED);
    }
    var statement = this.dbConn.createStatement(sql);
    //Cu.reportError("createStatement");
    if (param) {
      for (var m = 2, arg = null; arg = arguments[m]; m++) 
        statement.bindUTF8StringParameter(m-2, arg);
    }
    try {
      var dataset = [];
      while (statement.executeStep()) {
        var row = [];
        for (var i = 0, k = statement.columnCount; i < k; i++)
          row[statement.getColumnName(i)] = statement.getUTF8String(i);

        dataset.push(row);
      }
      // return dataset;
    }
    finally {
      statement.finalize();
      //Cu.reportError("finalize");
    }
    if (ourTransaction) {
      this.dbConn.commitTransaction();
    }
    return dataset;
  },

  executeAsync: function(aQueries) {
    var timeStart = Date.now();

    var stmt, aStmt = [];
    for(var i = 0; i < aQueries.length; i++) {
      try {
        stmt = this.dbConn.createStatement(aQueries[i]);
        //Cu.reportError("createStatement");
//        aStmt.push(stmt);
        stmt.executeAsync(stmtCallback);
      }
      catch (e) {
//        stmt.finalize();
        //Cu.reportError("finalize");
        this.setErrorString();
        var msg = this.onSqlError(e, "Error in createStatement: " + aQueries[i], this.dbConn.lastErrorString, true);
        Cu.reportError(msg);
        return false;
      }
    }

//    var stmtPending = this.dbConn.executeAsync(aStmt, aStmt.length, stmtCallback);
//    this.setErrorString();

    this.miTime = Date.now() - timeStart;
    return true;
  },  

  executeTransaction: function(aQueries) {
    //IS THIS NEEDED?
    //commit, if some leftover transaction is in progress
    if (this.dbConn.transactionInProgress)
      this.dbConn.commitTransaction();

    var timeStart = Date.now();
    //begin a transaction, iff no transaction in progress
    if (!this.dbConn.transactionInProgress)
      this.dbConn.beginTransaction();

    for(var i = 0; i < aQueries.length; i++) {
      try {
        var statement = this.dbConn.createStatement(aQueries[i]);
        statement.execute();
      }
      catch (e) {
        if (statement != undefined)
          statement.finalize();

        this.setErrorString();
        var msg = this.onSqlError(e, aQueries[i], this.dbConn.lastErrorString, true);
        Cu.reportError(msg);
        this.setErrorString();
        if (this.dbConn.transactionInProgress) {
          this.dbConn.rollbackTransaction();
        }
        return false;
      }
      finally {
        if (statement != undefined)
          statement.finalize();
      }
    }
    //commit transaction, if reached here
    if (this.dbConn.transactionInProgress)
      this.dbConn.commitTransaction();

    this.miTime = Date.now() - timeStart;
    return true;
  },  

  // executeWithParams : execute a query with parameter binding
  executeWithParams: function(sQuery, aParamData) {
    //create the statement
    try {
      var stmt = this.dbConn.createStatement(sQuery);
      //Cu.reportError("createStatement");
    } catch (e) {
      var msg = this.onSqlError(e, "Create statement failed (executeWithParams): " + sQuery, this.dbConn.lastErrorString, true);
      Cu.reportError(msg);
      this.setErrorString();
      return false;
    }
    //bind the parameters
    try {
      for (var i = 0; i < aParamData.length; i++) {
        var aData = aParamData[i];
        switch (aData[2]) {
          case SQLiteTypes.NULL:
            stmt.bindNullParameter(aData[0]);
            break;
          case SQLiteTypes.INTEGER:
            stmt.bindInt64Parameter(aData[0], aData[1]);
            break;
          case SQLiteTypes.REAL:
            stmt.bindDoubleParameter(aData[0], aData[1]);
            break;
          case SQLiteTypes.TEXT:
            stmt.bindStringParameter(aData[0], aData[1]);
            break;
          case SQLiteTypes.BLOB:
            if (typeof aData[1] == "string")
              aData[1] = this.textToBlob(aData[1]);
            stmt.bindBlobParameter(aData[0], aData[1], aData[1].length);
            break;
        }
      }
    } catch (e) {
      stmt.finalize();
      //Cu.reportError("finalize");
      var msg = this.onSqlError(e, "Binding failed for parameter: " + aData[0] + ". data length = " + aData[1].length, this.dbConn.lastErrorString, true);
      Cu.reportError(msg);
      this.setErrorString();
      return false;
    }
    //now execute the statement
    try {
      stmt.execute();
    } catch (e) {
      stmt.finalize();
      //Cu.reportError("finalize");
      var msg = this.onSqlError(e, "Execute failed: " + sQuery, this.dbConn.lastErrorString, true);
      Cu.reportError(msg);
      this.setErrorString();
      return false;
    }

    try {
      stmt.finalize();
      //Cu.reportError("finalize");
    } catch (e) {
      var msg = this.onSqlError(e, "Failed to reset/finalize", this.dbConn.lastErrorString, true);
      Cu.reportError(msg);
      this.setErrorString();
      return false;
    }
    return true;
  },

  blobToHex: function(aData) {
    var sQuery = "SELECT quote(" + aData + ") AS outstr";
    try {
      var stmt = this.dbConn.createStatement(sQuery);
      //Cu.reportError("createStatement");
      while (stmt.executeStep()) {
        return stmt.row.outstr;
      }
      stmt.finalize();
      //Cu.reportError("finalize");
    } catch (e) {
      var msg = this.onSqlError(e, "", null, false);
      Cu.reportError(msg);
    }
  },

  textToBlob: function(sData) {
    var sHex = "";
    if (sData != null && sData != "") {
      var sQuery = "SELECT hex(" + sData + ") AS outhex";
      try {
        var stmt = this.dbConn.createStatement(sQuery);
        //Cu.reportError("createStatement");
        while (stmt.executeStep()) {
          sHex = stmt.row.outhex;
        }
        stmt.finalize();
        //Cu.reportError("finalize");
      } catch (e) {
        var msg = this.onSqlError(e, "textToBlob: " + sQuery, null, false);
        Cu.reportError(msg);
        //if failed, sData must be passed as a string
        return this.textToBlob(SQLiteFn.quote(sData));
      }
    }

    //now we have a hexadecimal string of even length
    //convert it into blob
    return SQLiteFn.hexToBlob(sHex);
  },

  confirmAndExecute: function(aQueries, sMessage, confirmPrefName, aParamData) {
    var answer = true;
    //function for confirmation should not be hardcoded
    if (this.mFuncConfirm != null)
      answer = (this.mFuncConfirm)(aQueries, sMessage, confirmPrefName);

    if(answer) {
      if (aParamData)
        return this.executeWithParams(aQueries[0], aParamData);
      else
        return this.executeTransaction(aQueries);
    }
    return false;
  },

  executeWithoutConfirm: function(aQueries, aParamData) {
    if (aParamData)
      return this.executeWithParams(aQueries[0], aParamData);
    else
      return this.executeTransaction(aQueries);
  },

  executeSimpleSQLs: function(aQueries) {
    for (var i=0; i < aQueries.length; i++) {
      this.dbConn.executeSimpleSQL(aQueries[i]);
    }
  },

  attachDatabase: function(sName, sPath) {
    if (sName == 'main' || sName == 'temp')
      return false;

    var sQuery = "ATTACH DATABASE " + SQLiteFn.quote(sPath) + " AS " + SQLiteFn.quoteIdentifier(sName);
    return this.selectQuery(sQuery);
  },

  onSqlError: function(ex, msg, SQLmsg, bAlert) {
    msg = "SQLiteManager: " + msg;
    if (SQLmsg != null)
      msg += " [ " + SQLmsg + " ]";

    msg += "\n";
    msg += "Exception Name: " + ex.name + "\n" +
          "Exception Message: " + ex.message;

    if (bAlert)
      this.alert(msg);
    return msg;
  },

  alert: function(sMsg) {
    this.promptService.alert(null, "SQLite Manager Alert", sMsg);
  },

  logMessage: function(sMsg) {
    this.consoleService.logStringMessage("SQLiteManager: " + sMsg);
  },

  getAllowedOpsOnView: function(sViewName, sDbName) {
    if (sDbName == "")
      sDbName = this.mLogicalDbName;

    var aReturn = {"delete": true, "insert": true, "update": true};
    var aCols = this.getTableInfo(sViewName, sDbName);
    var sQuery = 'DELETE FROM "' + sViewName + '"';
    try {
      var stmt = this.dbConn.createStatement(sQuery);
      stmt.finalize();
    }
    catch (e) {
      aReturn["delete"] = false;
      var msg = this.onSqlError(e, "Error in SQL: " + sQuery, this.dbConn.lastErrorString, false);
      this.setErrorString();
    }

    var sQuery = 'UPDATE "' + sViewName + '" SET "' + aCols[0]["name"] + '" = 1';
    try {
      var stmt = this.dbConn.createStatement(sQuery);
      stmt.finalize();
    }
    catch (e) {
      aReturn["update"] = false;
      var msg = this.onSqlError(e, "Error in SQL: " + sQuery, this.dbConn.lastErrorString, false);
      this.setErrorString();
    }

    var aVal = [];
    for (var i = 0; i < aCols.length; i++) {
      aVal.push(1);
    }
    var sQuery = 'INSERT INTO "' + sViewName + '" VALUES (' + aVal.join(",") + ')';
    try {
      var stmt = this.dbConn.createStatement(sQuery);
      stmt.finalize();
    }
    catch (e) {
      aReturn["insert"] = false;
      var msg = this.onSqlError(e, "Error in SQL: " + sQuery, this.dbConn.lastErrorString, false);
      this.setErrorString();
    }

    return aReturn;
  },

  getMasterInfo: function(sObjName, sDbName) {
    var sTable = this.getPrefixedMasterName(sDbName);
    var sQuery = "SELECT * FROM " + sTable + " WHERE name = '" + sObjName + "'";
    var aRows = [];
    try {
      var stmt = this.dbConn.createStatement(sQuery);
      //Cu.reportError("createStatement");
      while (stmt.executeStep()) {
        var oRow = {};

        oRow.type = stmt.row.type;
        oRow.name = stmt.row.name;
        oRow.tbl_name = stmt.row.tbl_name;
        oRow.rootpage = stmt.row.rootpage;
        oRow.sql = stmt.row.sql;

        aRows.push(oRow);
      }
      stmt.finalize();
      //Cu.reportError("finalize");
    }
    catch (e) {
      var msg = this.onSqlError(e, "Likely SQL syntax error: " + sQuery, this.dbConn.lastErrorString, true);
      Cu.reportError(msg);
      this.setErrorString();
    }
    if (aRows.length > 0)
      return aRows[0];
    else
      return aRows;
  },

/////////////////////////////////////////////
//The following functions are for Pragmas to query the database schema
/////////////////////////////////////////////

//function for attached db list (not main & temp)
//returns all columns
  getAttachedDbList: function() {
    var sQuery = "PRAGMA database_list";
    var aRows = [];
    try {
      var stmt = this.dbConn.createStatement(sQuery);
      //Cu.reportError("createStatement");
      while (stmt.executeStep()) {
        if (stmt.row.seq > 1) {//excludes main & temp
          var oRow = {};

          oRow.seq = stmt.row.seq;
          oRow.name = stmt.row.name;
          oRow.file = stmt.row.file;

          aRows.push(oRow);
        }
      }
      stmt.finalize();
      //Cu.reportError("finalize");
    }
    catch (e) {
      var msg = this.onSqlError(e, "Likely SQL syntax error: " + sQuery, this.dbConn.lastErrorString, true);
      Cu.reportError(msg);
      this.setErrorString();
    }
    return aRows;
  },

//function for db list (main, temp and attached)
//returns only name, not file
  getDatabaseList: function() {
    var sQuery = "PRAGMA database_list";
    var aRows = ["main", "temp"];
    try {
      var stmt = this.dbConn.createStatement(sQuery);
      //Cu.reportError("createStatement");
      while (stmt.executeStep()) {
        if (stmt.row.seq > 1) //sometimes, temp is not returned
          aRows.push(stmt.row.name);
      }
      stmt.finalize();
      //Cu.reportError("finalize");
    }
    catch (e) {
      var msg = this.onSqlError(e, "Likely SQL syntax error: " + sQuery, this.dbConn.lastErrorString, true);
      Cu.reportError(msg);
      this.setErrorString();
    }
    return aRows;
  },

  getTableInfo: function(sTableName, sDbName) {
    var sQuery = this.getPragmaSchemaQuery("table_info", sTableName, sDbName);
    var aRows = [];
    try {
      var stmt = this.dbConn.createStatement(sQuery);
      //Cu.reportError("createStatement");
      while (stmt.executeStep()) {
        var oRow = {};

        oRow.cid = stmt.row.cid;
        oRow.name = stmt.row.name;
        oRow.type = stmt.row.type;
        oRow.notnull = stmt.row.notnull;
        oRow.dflt_value = stmt.row.dflt_value;
        oRow.pk = stmt.row.pk;

        aRows.push(oRow);
      }
      stmt.finalize();
      //Cu.reportError("finalize");
    }
    catch (e) {
      var msg = this.onSqlError(e, "Likely SQL syntax error: " + sQuery, this.dbConn.lastErrorString, true);
      Cu.reportError(msg);
      this.setErrorString();
    }
    return aRows;
  },

  getIndexList: function(sTableName, sDbName) {
    var sQuery = this.getPragmaSchemaQuery("index_list", sTableName, sDbName);
    var aRows = [];
    try {
      var stmt = this.dbConn.createStatement(sQuery);
      //Cu.reportError("createStatement");
      while (stmt.executeStep()) {
        var oRow = {};

        oRow.seq = stmt.row.seq;
        oRow.name = stmt.row.name;
        oRow.unique = stmt.row.unique;

        aRows.push(oRow);
      }
      stmt.finalize();
      //Cu.reportError("finalize");
    }
    catch (e) {
      var msg = this.onSqlError(e, "Likely SQL syntax error: " + sQuery, this.dbConn.lastErrorString, true);
      Cu.reportError(msg);
      this.setErrorString();
    }
    return aRows;
  },

  getIndexInfo: function(sIndexName, sDbName) {
    var sQuery = this.getPragmaSchemaQuery("index_info", sIndexName, sDbName);
    var aRows = [];
    try {
      var stmt = this.dbConn.createStatement(sQuery);
      //Cu.reportError("createStatement");
      while (stmt.executeStep()) {
        var oRow = {};

        oRow.seqno = stmt.row.seqno;
        oRow.cid = stmt.row.cid;
        oRow.name = stmt.row.name;

        aRows.push(oRow);
      }
      stmt.finalize();
      //Cu.reportError("finalize");
    }
    catch (e) {
      var msg = this.onSqlError(e, "Likely SQL syntax error: " + sQuery, this.dbConn.lastErrorString, true);
      Cu.reportError(msg);
      this.setErrorString();
    }
    return aRows;
  },

  getCollationList: function(sIndexName, sDbName) {
    var sQuery = "PRAGMA collation_list";
    var aRows = [];
    try {
      var stmt = this.dbConn.createStatement(sQuery);
      //Cu.reportError("createStatement");
      while (stmt.executeStep()) {
        var oRow = {};

        oRow.seq = stmt.row.seq;
        oRow.name = stmt.row.name;

        aRows.push(oRow);
      }
      stmt.finalize();
      //Cu.reportError("finalize");
    }
    catch (e) {
      var msg = this.onSqlError(e, "Likely SQL syntax error: " + sQuery, this.dbConn.lastErrorString, true);
      Cu.reportError(msg);
      this.setErrorString();
    }
    return aRows;
  },
//////////////////////////////////////////////////////////////////
  determineType: function(str) {
    //depending on typeof is a safe bet for screening, but it is possible that regular expressions may be enough; especially because expressions like typeof(3+4), etc. will be integer but in sql they are strings. Also, literals like current_date, etc. are not to be treated as text while forming the sql statement
/*
    var sTypeof = "text";
    var sQuery = "SELECT typeof(" + str + ") AS ttt";
    try {
      var stmt = this.dbConn.createStatement(sQuery);
      //Cu.reportError("createStatement");
      while (stmt.executeStep()) {
        sTypeof = stmt.row.ttt;
      }
    } catch (e) {
      sTypeof = "text";
    }
*/

    //any space makes the str as text. If this is not desirable, first do the following:
    //str = str.trim();
    var reInt = new RegExp(SQLiteRegex.mInteger);
    if (reInt.test(str) || str == "0")
      return {type: SQLiteTypes.INTEGER, value: Number(str)};

    var reReal = new RegExp(SQLiteRegex.mReal);
    if (reReal.test(str) && (str.indexOf('.') >= 0 || str.indexOf('e') >= 0 || str.indexOf('E') >= 0)) {
      //var reBadPrefix = new RegExp("^[-+]?[0][^\.][.]*$");
      //if (!reBadPrefix.test(str))
        return {type: SQLiteTypes.REAL, value: Number(str)};
    }

    var reBlob = new RegExp(SQLiteRegex.mBlob);
    if (reBlob.test(str))
      return {type: SQLiteTypes.BLOB, value: this.textToBlob(str)};

    var reNull = new RegExp(SQLiteRegex.mNull);
    if (reNull.test(str))
      return {type: SQLiteTypes.NULL, value: str};

    if (SQLiteFn.isSpecialLiteral(str))
      return {type: SQLiteTypes.TEXT, value: str, isConstant: true};

    return {type: SQLiteTypes.TEXT, value: SQLiteFn.quote(str)};
  }
};

var SQLiteRegex = {
  mNull: "^[nN][uU][lL][lL]$",
  mInteger: "^[-+]?[1-9][0-9]*$",
  mReal: "^[-+]?[0-9]*[\.]?[0-9]+([eE][-+]?[0-9]+)?$",
  mBlob: "^[xX]\'([0-9a-fA-F][0-9a-fA-F])*\'$"
};

var SQLiteFn = {
  msQuoteChar: '""',//this allows for alternates like '[]', etc.

  maTypes: ["null", "integer", "real", "text", "blob"],

  getTypeDescription: function(iType) {
    return this.maTypes[iType];
  },

  setQuoteChar: function(sQuoteChar) {
    this.msQuoteChar = sQuoteChar;
  },

  quoteIdentifier: function(str) {
  //http://sqlite.org/lang_keywords.html
  //"keyword" A keyword in double-quotes is an identifier
  //assume str does not need any escaping, etc. Simply, enclose it.
    return this.msQuoteChar[0] + str + this.msQuoteChar[1];
  },

  quote: function(str) {
    if (typeof str == "string")
      str = str.replace(/'/g,"''");
    return "'" + str + "'";
  },

  isSpecialLiteral: function(str) {
    var sUp = str.toUpperCase();
    if (sUp == "CURRENT_DATE" || sUp == "CURRENT_TIME" || sUp == "CURRENT_TIMESTAMP")
      return true;

    return false;
  },

  makeSqlValue: function(str) {
    var reNull = new RegExp(SQLiteRegex.mNull);
    if (reNull.test(str))
      return "NULL";

    var reReal = new RegExp(SQLiteRegex.mReal);
    if (reReal.test(str))
      return Number(str);

    if (SQLiteFn.isSpecialLiteral(str))
      return str.toUpperCase();

    if (str.length == 0)
      return "NULL";

    return this.quote(str);
  },

  analyzeDefaultValue: function(str) {
    //if str corresponds to there being no default value, return null.
    if (str == null)
      return null;

    var reNull = new RegExp(SQLiteRegex.mNull);
    if (reNull.test(str))
      return {type: SQLiteTypes.NULL, value: str, displayValue: "NULL"};

    var reBlob = new RegExp(SQLiteRegex.mBlob);
    if (reBlob.test(str))
      return {type: SQLiteTypes.BLOB, value: this.textToBlob(str), displayValue: str};

    var reInt = new RegExp(SQLiteRegex.mInteger);
    if (reInt.test(str))
      return {type: SQLiteTypes.INTEGER, value: Number(str), displayValue: Number(str)};

    var reReal = new RegExp(SQLiteRegex.mReal);
    if (reReal.test(str))
      return {type: SQLiteTypes.REAL, value: Number(str), displayValue: Number(str)};

    if (SQLiteFn.isSpecialLiteral(str))
      return {type: SQLiteTypes.TEXT, value: str, displayValue: str, isConstant: true};

    //if the first character is ' or ", then it is definitely text
    var ch = str[0];
    if (ch == "'" || ch == '"') {
      var newStr = "";
      for (var i = 1; i < str.length - 1; i++) {//TODO: use replace
        if (i >= 2)
          if (str[i] == ch && str[i-1] == ch)
            continue;

        newStr += str[i];
      }
      return {type: SQLiteTypes.TEXT, value: newStr, displayValue: newStr};
    }

    //this should be checked after integer because it includes integers too.
    var reUnquotedText = new RegExp("^[0-9a-zA-Z_]+$");
    if (reUnquotedText.test(str))
      return {type: SQLiteTypes.TEXT, value: str, displayValue: str};

    //otherwise hope that we have a number, but doing Number(str) may give NaN,
    //e.g., for str = "11 + 22/2", etc.
    //avoid eval because of warning while loading at AMO
    return {type: SQLiteTypes.REAL, value: str, displayValue: str};
  },

  blobToHex: function(aData) {
    var hex_tab = '0123456789ABCDEF';
    var str = '';
    for (var i = 0; i < aData.length; i++) {
      str += hex_tab.charAt(aData[i] >> 4 & 0xF) + hex_tab.charAt(aData[i] & 0xF);
    }
    return "X'" + str + "'";
  },

  hexToBlob: function(sHex) {
    var aRet = [];
    for (var i = 0; i < sHex.length; i = i + 2) {
      aRet.push(Number("0x" + sHex.substr(i,2)));
    }
    return aRet;
  }
};

//for export purposes
function getCsvFromArray(arrData, arrTypes, arrColumns, oCsv) {
  var strDelimiter = oCsv.delimiter;
  if(oCsv.bColNames) {
    var arrRow = [], types = [];
    var i = 0;
    for(var i in arrColumns) {
      arrRow.push(arrColumns[i][0]);
      types.push(SQLiteTypes.TEXT);
    }
    var data = getCsvRowFromArray(arrRow, types, oCsv);
    aLines.push(data);
  }

  for(var i = 0; i < arrData.length; i++) {
    var arrRow = arrData[i];
    var types = arrTypes[i];
    var data = getCsvRowFromArray(arrRow, types, oCsv);
    aLines.push(data);
  }
  return aLines.join("\n");
}

function getCsvRowFromArray(arrRow, arrTypes, oCsv) {
  var strDelimiter = oCsv.delimiter;
  if (arrTypes == []) {
    for (var i = 0; i < arrRow.length; i++)
      arrTypes.push(SQLiteTypes.TEXT);
  }

  for (var i = 0; i < arrRow.length; i++) {
    switch (arrTypes[i]) {
      case SQLiteTypes.INTEGER:
      case SQLiteTypes.REAL:
      case SQLiteTypes.BLOB:
        break;
      case SQLiteTypes.NULL: 
        arrRow[i] = "";
        break;
      case SQLiteTypes.TEXT:
      default:
        arrRow[i] = arrRow[i].replace(/"/g,"\"\"");
        arrRow[i] = '"' + arrRow[i] + '"';
        break;
    }
  }
  return arrRow.join(strDelimiter);
}

//arrays populated on 2011-01-16
//SQLite Core Functions
//http://sqlite.org/lang_corefunc.html
var funcNamesCore = ['abs', 'changes', 'coalesce', 'glob', 'ifnull', 'hex', 'last_insert_rowid', 'length', 'like', 'load_extension', 'lower', 'ltrim', 'max', 'min', 'nullif', 'quote', 'random', 'randomblob', 'replace', 'round', 'rtrim', 'soundex', 'sqlite_compileoption_get', 'sqlite_compileoption_used', 'sqlite_source_id', 'sqlite_version', 'substr', 'total_changes', 'trim', 'typeof', 'upper', 'zeroblob'];

//SQLite Aggregate Functions
//http://sqlite.org/lang_aggfunc.html
var funcNamesAggregate = ['avg', 'count', 'group_concat', 'max', 'min', 'sum', 'total'];

//SQLite Date And Time Functions
//http://sqlite.org/lang_datefunc.html
var funcNamesDate = ['date', 'time', 'datetime', 'julianday', 'strftime'];

var funcNamesAll = [];
funcNamesAll = funcNamesAll.concat(funcNamesCore);
funcNamesAll = funcNamesAll.concat(funcNamesAggregate);
funcNamesAll = funcNamesAll.concat(funcNamesDate);

