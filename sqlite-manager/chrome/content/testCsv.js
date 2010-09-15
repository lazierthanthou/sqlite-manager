var SmTestExim = {
  importWorker: null, //for worker thread

  mTestFiles: [],
  mCurr: 0,

  doOKImport: function(csvMetadataFile) {
    var req = new XMLHttpRequest();
    req.open('GET', csvMetadataFile, false);
    req.overrideMimeType('text/plain; charset=UTF-8');
    req.send(null);
    var contents = "";
    if(req.status == 0) {
      contents = req.responseText;
    }
    var func = new Function("arg", contents);
    this.mTestFiles = func();
    this.mCurr = 0;
    SmExim.readCsvContent(this.mTestFiles[this.mCurr][1], SmTestExim.handleImportCompletion, false);
  },

  handleImportCompletion: function(iStatus) {
    SmExim.importWorker.terminate();
    SQLiteManager.refreshDbStructure();

    SmTestExim.mCurr++;
    if (SmTestExim.mCurr < SmTestExim.mTestFiles.length)    
      SmExim.readCsvContent(SmTestExim.mTestFiles[SmTestExim.mCurr][1], SmTestExim.handleImportCompletion, false);
  }
};
