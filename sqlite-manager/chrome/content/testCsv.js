Components.utils.import("resource://sqlitemanager/fileIO.js");

var SmTestExim = {
  importWorker: null, //for worker thread

  mTestFiles: [],
  mCurr: 0,

  doOKImport: function() {
    var req = new XMLHttpRequest();
    req.open('GET', "file:///home/user/sqlite-manager/testdata/import.txt", false);
    req.overrideMimeType('text/plain; charset=UTF-8');
    req.send(null);
    var contents = "";
    if(req.status == 0) {
      contents = req.responseText;
    }
    var func = new Function("arg", contents);
    this.mTestFiles = func();
    this.mCurr = 0;
    this.readCsvContent(this.mTestFiles[this.mCurr][1]);
  },

  handleImportCompletion: function(iStatus) {
    this.importWorker.terminate();
    SQLiteManager.refreshDbStructure();

    this.mCurr++;
    if (this.mCurr < this.mTestFiles.length)    
      this.readCsvContent(this.mTestFiles[this.mCurr][1]);
//    $$("eximStatus").hidden = true;
//    this.reportImportResult(iStatus);
  },

  showImportStatus: function(str) {
    $$("eximStatusLabel").value = str;
  },

  reportImportResult: function(iImportNum) {
    if (iImportNum > 0) {
      var sMessage = sm_getLStr("exim.importNum.title");
      sMessage += " " + sm_getLFStr("exim.importNum.records", [iImportNum], 1);
      var sType = "info";
      sm_notify("boxNotifyExim", sMessage, sType);
    }
    else if (iImportNum == 0) {
      var sMessage = sm_getLStr("exim.importCancelled");
      var sType = "info";
      sm_notify("boxNotifyExim", sMessage, sType);
    }
    else {
      var sMessage = sm_getLStr("exim.importFailed");
      var sType = "critical";
      sm_notify("boxNotifyExim", sMessage, sType);
    }
    $$("eximStatus").hidden = true;
  },

  readCsvContent: function(csvParams) {
    this.importWorker = new Worker('workerCsv.js');
    this.importWorker.onmessage = function(event) {
      var obj = event.data;

      if (typeof obj == 'string') {
//        sm_log("Importing: " + event.data);
        SmExim.showImportStatus("Importing: " + event.data);
        return;
      }

      //if the worker failed, terminate it
      if (obj.success == 0) {
        alert(obj.description);
        SmTestExim.handleImportCompletion(-1);
        return;
      }

      //if the worker succeeded, do things that should be done after the completed stage
      switch (obj.stage) {
        case 1: //file read; create table query is to be made
          var sDbName = SQLiteManager.mDb.logicalDbName;
          var aRet = SmTestExim.getCreateTableQuery(obj.tableName, sDbName, obj.columns, false);
          if (aRet.error) {
            SmTestExim.handleImportCompletion(-1);
            return;
          }
          var params = {stage: 2};
          params.createTableQuery = aRet.query;
          params.tableName = aRet.tableName;
          SmTestExim.importWorker.postMessage(params);
          break;
        case 2: //queries created; execution to be done
          var answer = true;//smPrompt.confirm(null, sm_getLStr("exim.confirm.rows.title"), sm_getLStr("exim.confirm.rows.msg") + obj.numRecords);
          sm_log(null, sm_getLStr("exim.confirm.rows.title"), sm_getLStr("exim.confirm.rows.msg") + obj.numRecords);
          if(answer) {
            if (obj.badLines.length > 0) {
              var err = sm_getLFStr("exim.import.failed", [obj.badLines.length], 1) + obj.badLines.join(", ");
              sm_log(err);
            }
            sm_log("Importing: inserting " + obj.numRecords + " records in the database...");
            if (obj.createTableQuery != "") {
              obj.queries.unshift(obj.createTableQuery);
            }
            var bReturn = SQLiteManager.mDb.executeTransaction(obj.queries);

            //BEGIN async use
            //did not really help
            //firstly, to use async, create query must be executed separately from insert queries (because, executeAsync expects array of statements, not strings; and createStatement fails if the table has not already been created.
            //secondly, executeAsync runs out of memory for queries which run ok with executeTransaction above
            /*
            var bReturn = true;
            if (obj.createTableQuery != "") {
              bReturn = SQLiteManager.mDb.executeTransaction([obj.createTableQuery]);
            }

            if (bReturn)
              bReturn = SQLiteManager.mDb.executeAsync(obj.queries);
            */
            //END async use

            //TODO: we should also try returning queries from the worker through postmessage so that they can be executed as they are received. Of course, this will require giving up the execution of all the queries in a single transaction
            //provide an option for this in the import tab so that the user can decide whether they want a transaction or not
            if (bReturn) {
              SmTestExim.handleImportCompletion(obj.numRecords);
              return;
            }
          }
          SmTestExim.handleImportCompletion(-1);
          return;
          break;
      }
    };

    this.importWorker.onerror = function(error) {
      alert(["CSV Worker error!", error.message, 'File name: ' + error.filename, 'Line number: ' + error.lineno].join('\n'));
      SmTestExim.handleImportCompletion(-1);
    };

    csvParams.stage = 1;
    this.importWorker.postMessage(csvParams);
  },

  getCreateTableQuery: function(sTabName, sDbName, aCols, bReadOnlyColNames) {
    //importing to an existing table
    if (SQLiteManager.mDb.tableExists(sTabName, sDbName)) {
      sTabName = SQLiteManager.mDb.getPrefixedName(sTabName, sDbName);
      //confirm before proceeding
      //TODO: the buttons should say Continue (=OK), Abort (=Cancel)
      // and Let me modify = open createTable.xul
      var answer = smPrompt.confirm(null, sm_getLStr("exim.confirm.tabName.title"), sm_getLFStr("exim.confirm.tabName.msg", [sTabName], 1));
      return {error: !answer, query: "", tableName: sTabName};
    }

    //table needs to be created
    var sQuery = "";
    //ask whether the user wants to modify the new table
    var answer = false;//smPrompt.confirm(null, sm_getLStr("exim.confirm.createTable.title"), sm_getLFStr("exim.confirm.createTable.msg", [sTabName],1));
    if(answer) { //if yes, call create table dialog
      var aRetVals = {tableName: sTabName, colNames: aCols};
      if (bReadOnlyColNames)
        aRetVals.readonlyFlags = ["colnames"];
      window.openDialog("chrome://sqlitemanager/content/createTable.xul",  "createTable", "chrome, resizable, centerscreen, modal, dialog", SQLiteManager.mDb, aRetVals);
      if (aRetVals.ok) {
        sQuery = aRetVals.createQuery;
        return {error: false, query: sQuery, tableName: aRetVals.tableName};
      }
    }
    //user chose not to modify, or pressed cancel in create table dialog
    sTabName = SQLiteManager.mDb.getPrefixedName(sTabName, sDbName);
    for (var ic = 0; ic < aCols.length; ic++)
      aCols[ic] = SQLiteFn.quoteIdentifier(aCols[ic]);
    var sCols = aCols.toString();
    sQuery = "CREATE TABLE IF NOT EXISTS " + sTabName + " (" + sCols + ")";
    return {error: false, query: sQuery, tableName: sTabName};
  }
};
