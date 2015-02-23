var SmTestExim = {
  importWorker: null, //for worker thread

  mTestFiles: [],
  mCurr: 0,

  mPath: null,

  doOKImport: function(csvMetadataFile) {
    var req = new XMLHttpRequest();
    req.open('GET', csvMetadataFile, false);
    req.overrideMimeType('text/plain; charset=UTF-8');
    req.send(null);
    var contents = "";
    if(req.status == 0 || req.status == 200) {
      try {
      contents = JSON.parse(req.responseText);
      }
      catch (e) { alert(e.name); }
    }

    this.mTestFiles = contents.csvArray;
    this.mPath = contents.csvPath;
    this.mCurr = 0;
    this.mTestFiles[this.mCurr].file = this.mPath + this.mTestFiles[this.mCurr].file;
    SmExim.readCsvContent(this.mTestFiles[this.mCurr], SmTestExim.handleImportCompletion, false);
  },

  handleImportCompletion: function(iStatus) {
    SmExim.importWorker.terminate();
    SQLiteManager.refreshDbStructure();

    SmTestExim.mCurr++;
    if (SmTestExim.mCurr < SmTestExim.mTestFiles.length) {
      SmTestExim.mTestFiles[SmTestExim.mCurr].file = SmTestExim.mPath + SmTestExim.mTestFiles[SmTestExim.mCurr].file;
      SmExim.readCsvContent(SmTestExim.mTestFiles[SmTestExim.mCurr], SmTestExim.handleImportCompletion, false);
    }
  }
};
