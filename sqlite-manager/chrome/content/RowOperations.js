Components.utils.import("resource://sqlitemanager/sqlite.js");

var RowOperations = {
  mDb: null,
  mbConfirmationNeeded: false,

  maQueries: [],
  maParamData: [],

  mNotifyMessages: ["Execution successful", "Execution failed"],
  mAcceptAction: null,

  mIntervalID: null,

  //arrays with information for each field
  maFieldInfo: null, //contains objects

  aColumns: null,
  mRowId: null, //for update, delete and duplicate
  sCurrentTable: null,
  sObject: null,
  sOperation: null,

  aOps: [
      ["=", "=", ""],
      ["!=", "!=", ""],
      ["<", "<", ""],
      ["<=", "<=", ""],
      [">", ">", ""],
      [">=", ">=", ""],
      ["LIKE", "LIKE '", "'"],
      ["contains", "LIKE '%", "%'"],
      ["begins with", "LIKE '", "%'"],
      ["ends with", "LIKE '%", "'"],
      ["IS NULL", "", ""],
      ["IS NOT NULL", "", ""],
      ["IN", "IN (", ")"],
      ["custom", "", ""]
    ],

  loadDialog: function () {
    this.mDb = window.arguments[0];
    this.sCurrentTable = window.arguments[1];
    this.sOperation = window.arguments[2];
    this.mRowId = window.arguments[3];
    this.mObjType = window.arguments[4];

    this.mbConfirmationNeeded = sm_prefsBranch.getBoolPref("confirm.records");
    this.mbMultiline = sm_prefsBranch.getBoolPref("whetherMultilineInput");

    if (this.mObjType == "view") {
      $$("tablenames").hidden = true;
      $$("label-name").value = sm_getLStr("rowOp.viewName") + this.sCurrentTable;
    }

    switch (this.sOperation) {
      case "insert":
      case "duplicate":
        document.title = sm_getLStr("rowOp.insert.title");
        this.mAcceptAction = "doOKInsert";
        this.setAcceptAction(this.mAcceptAction);
        this.mNotifyMessages = [sm_getLStr("rowOp.insertSuccess.msg"), sm_getLStr("rowOp.insertFailure.msg")];
        break;
      case "update":
        document.title = sm_getLStr("rowOp.update.title");
        this.mAcceptAction = "doOKUpdate";
        this.setAcceptAction(this.mAcceptAction);
        this.mNotifyMessages = [sm_getLStr("rowOp.updateSuccess.msg"), sm_getLStr("rowOp.updateFailure.msg")];
        break;
      case "delete":
        document.title = sm_getLStr("rowOp.delete.title");
        this.mAcceptAction = "doOKDelete";
        this.setAcceptAction(this.mAcceptAction);
        break;
      case "search":
        document.title = sm_getLStr("rowOp.search.title") + this.sCurrentTable;
        this.setAcceptAction("doOKSearch");
        break;
      case "search-view":
        document.title = sm_getLStr("rowOp.searchView.title") + this.sCurrentTable;
        this.setAcceptAction("doOKSearch");
        this.loadForViewRecord(this.sCurrentTable, window.arguments[3]);
        window.sizeToContent();
        return;
    }

    this.loadForTableRecord();
    this.loadTableNames();
    window.sizeToContent();
  },

  setAcceptAction: function(sFunctionName) {
    var dlg = $$("dialog-table-operations");
    dlg.setAttribute("ondialogaccept",
        "return RowOperations." + sFunctionName + "();");
  },

  setCancelAction: function(sFunctionName) {
    var dlg = $$("dialog-table-operations");
    dlg.setAttribute("ondialogcancel",
        "return RowOperations." + sFunctionName + "();");
  },

  loadTableNames: function() {
    this.sObject = "TABLE";
    var listbox = $$("tablenames");

    var aNormTableNames = this.mDb.getObjectList("table", "");
    var aTempTableNames = [];
    var aTableNames = aNormTableNames.concat(aTempTableNames);
    PopulateDropDownItems(aTableNames, listbox, this.sCurrentTable);
  },

  selectTable: function(sID) {
    var sTable = $$(sID).value;
    //TODO: if the table dropdown is enabled
  },

  doOK: function() {
  },

  onSelectOperator: function(selectedOp, sFieldName) {
    var ctrl = "ctrl-tb-" + sFieldName;
    var node = $$(ctrl);
    switch (this.aOps[selectedOp][0]) {
      case "IS NULL":
      case "IS NOT NULL":
        node.disabled = true;
        break;
      default:
        node.disabled = false;
    }
  },

  initFieldData: function(iCols) {
    this.maFieldInfo = [];

    for (var i = 0; i < iCols; i++) {
      var oInfo = {colName: "", colType: "",
                   oldValue: "", dflt_value: null, notnull: 0,
                   oldType: SQLiteTypes.TEXT, newType: SQLiteTypes.TEXT,
                   oldBlob: null, newBlob: null,
                   isConstant: false, isDefault: false, hasChanged: false,
                   isColPk: false};
      this.maFieldInfo.push(oInfo);
    }
  },

  populateFieldData: function(sTableName, sRowCriteria) {
    var sql = "SELECT * FROM " + this.mDb.getPrefixedName(sTableName, "") + " WHERE " + sRowCriteria;
    this.mDb.selectQuery(sql);
    var row = this.mDb.getRecords();
    if (row.length == 0) {
      alert("ERROR:\nNo matching record found.\nSQL: " + sql);
      return false;
    }
    row = row[0];
    var cols = this.mDb.getColumns();
    var rowTypes = this.mDb.getRecordTypes()[0];
    for (var j = 0; j < this.maFieldInfo.length; j++) {
      for (var k = 0; k < cols.length; k++) {
        if (cols[k][0] == this.maFieldInfo[j].colName) {
          this.maFieldInfo[j].oldValue = row[k];
          this.maFieldInfo[j].oldType = rowTypes[k];
          this.maFieldInfo[j].newType = rowTypes[k];
          this.maFieldInfo[j].oldBlob = null;
          this.maFieldInfo[j].newBlob = null;
          this.maFieldInfo[j].isConstant = false;
        }
      }
      //for blobs, do the following
      if (this.maFieldInfo[j].oldType == SQLiteTypes.BLOB) {
        var data = this.mDb.selectBlob(sTableName, this.maFieldInfo[j].colName, sRowCriteria);
        this.maFieldInfo[j].oldBlob = data;
        if (this.sOperation == "duplicate") {
          this.maFieldInfo[j].newBlob = data;
        }
      }
    }

    //now, manage the textbox
    for (var i = 0; i < this.maFieldInfo.length; i++) {
      var txtBox = $$("ctrl-tb-" + i);
      txtBox.value = this.maFieldInfo[i].oldValue;
      this.onInputValue(txtBox, false);
    }
    return true;
  },

  loadForTableRecord: function() {
    $$("tablenames").setAttribute("disabled", true);
    var sTableName = this.sCurrentTable;

    var cols = this.mDb.getTableInfo(sTableName, "");
    this.aColumns = cols;

    var colPK = null;
    var rowidcol = this.mDb.getTableRowidCol(this.sCurrentTable);
    if (rowidcol["name"] != "rowid")
      colPK = rowidcol["name"];

    this.initFieldData(cols.length);

    for (var i = 0; i < cols.length; i++) {
      this.maFieldInfo[i].colName = cols[i].name;
      this.maFieldInfo[i].colType = cols[i].type;
      this.maFieldInfo[i].dflt_value = cols[i].dflt_value;
      this.maFieldInfo[i].notnull = cols[i].notnull;
      if (this.maFieldInfo[i].colName == colPK)
        this.maFieldInfo[i].isColPk = true;
    }

    var grbox = $$("columnEntryFields");
    SmGlobals.$empty(grbox);
    var cap = document.createElement("caption");
    cap.setAttribute("label", sm_getLStr("rowOp.enterFieldValues"));
    grbox.appendChild(cap);

    for (var i = 0; i < this.maFieldInfo.length; i++) {
      var hbox = document.createElement("hbox");
      hbox.setAttribute("flex", "0");
      hbox.setAttribute("style", "margin:2px 3px 2px 3px");

      var lbl = document.createElement("label");
      var lblVal = (i+1) + ". " + this.maFieldInfo[i].colName;
      if(this.maFieldInfo[i].colType.length > 0)
        lblVal += " ( " + this.maFieldInfo[i].colType + " )";
      lbl.setAttribute("value", lblVal);
      lbl.setAttribute("style", "padding-top:5px;width:25ex");
      if (i < 9)
        lbl.setAttribute("accesskey", (i+1));
      lbl.setAttribute("control", "ctrl-tb-" + i);
      hbox.appendChild(lbl);

      var spacer = document.createElement("spacer");
      spacer.flex = "1";
      hbox.appendChild(spacer);

      if (this.sOperation == "search") {
        var vb = this.getSearchMenuList(this.maFieldInfo[i].colName);
        hbox.appendChild(vb);
      }

      var inp1 = this.getInputField(i);
      hbox.appendChild(inp1);

      var vb = this.getInputToggleImage(i, this.sOperation);
      hbox.appendChild(vb);

      grbox.appendChild(hbox);
    }

    if (this.sOperation == "update" || this.sOperation == "delete" || this.sOperation == "duplicate") {
      this.populateFieldData(this.sCurrentTable, this.mRowId);
    }

    if (this.sOperation == "insert")
      this.setInsertValues(true);

    window.sizeToContent();
  },

  saveBlob: function(iIndex) {
    if (this.sOperation != "update")
      return false;

    const nsIFilePicker = Ci.nsIFilePicker;

    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
    fp.init(window, sm_getLStr("rowOp.saveBlob.fp.title"), nsIFilePicker.modeSave);
    fp.appendFilters(nsIFilePicker.filterAll);

    var rv = fp.show();
    if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace) {
      var data = this.maFieldInfo[iIndex].newBlob;
      if (data == null)
        data = this.maFieldInfo[iIndex].oldBlob;

      if (data.length == 0) //nothing to write
        return false;

      var file = fp.file;
      // Get the path as string. Note that you usually won't
      // need to work with the string paths.
      var path = fp.file.path;

      // file is nsIFile, data is a string
      var foStream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);

      // use 0x02 | 0x10 to open file for appending.
      foStream.init(file, 0x02 | 0x08 | 0x20, 0666, 0);
      // write, create, truncate
      // In a c file operation, we have no need to set file mode with or operation,
      // directly using "r" or "w" usually.

      var bostream = Cc['@mozilla.org/binaryoutputstream;1'].createInstance(Ci.nsIBinaryOutputStream);
      bostream.setOutputStream(foStream);
      bostream.writeByteArray(data, data.length);

      bostream.close();
      foStream.close();
    }
  },

  addBlob: function(iIndex) {
    const nsIFilePicker = Ci.nsIFilePicker;

    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
    fp.init(window, sm_getLStr("rowOp.addBlob.fp.title"), nsIFilePicker.modeOpen);
    fp.appendFilters(nsIFilePicker.filterAll);

    var rv = fp.show();
    if (rv == nsIFilePicker.returnOK) {
      var fistream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
      var bininput = Cc['@mozilla.org/binaryinputstream;1'].createInstance(Ci.nsIBinaryInputStream);

      var mimeservice = Cc['@mozilla.org/mime;1'].createInstance(Ci.nsIMIMEService);

//      var type = mimeservice.getTypeFromFile(fp.file);
//      if(!type)
//        type = "application/octet-stream";

      fistream.init(fp.file, 0x01, 0, 5);
      bininput.setInputStream(fistream);
      var fileCounts = fistream.available();
      var fileContents = bininput.readByteArray(fileCounts);
      bininput.close();
      fistream.close();

      this.maFieldInfo[iIndex].newBlob = fileContents;

      var ctrltb = $$("ctrl-tb-" + iIndex);
      var val = sm_prefsBranch.getCharPref("textForBlob");
      if (sm_prefsBranch.getBoolPref("showBlobSize"))
        val += sm_getLFStr("rowOp.addBlob.showBlobSize", [fileCounts],1);

      ctrltb.value = val;
      this.maFieldInfo[iIndex].newType = SQLiteTypes.BLOB;
      this.maFieldInfo[iIndex].hasChanged = true; //added to handle issue #655
      //ctrltb.setAttribute("readonly", "true");

      this.onInputValue(ctrltb, false);
    }
  },

  removeBlob: function(iIndex) {
    var ctrltb = $$("ctrl-tb-" + iIndex);
    ctrltb.value = "";

    this.maFieldInfo[iIndex].newType = SQLiteTypes.TEXT;
    //ctrltb.removeAttribute("readonly");

    this.onInputValue(ctrltb, false);
  },

  getSearchMenuList: function(sField) {
    var ml = document.createElement("menulist");
    ml.setAttribute("id", "op-" + sField);
    ml.setAttribute("sizetopopup", "always");
    ml.setAttribute("style", "max-width: 25ex");
    ml.setAttribute("oncommand", "RowOperations.onSelectOperator(this.value, '" +  sField + "')");

    var mp = document.createElement("menupopup");

    for(var iOp = 0; iOp < this.aOps.length; iOp++) {
      var mi = document.createElement("menuitem");
      mi.setAttribute("label", this.aOps[iOp][0]);
      mi.setAttribute("value", iOp);
      if (iOp == 0)
        mi.setAttribute("selected", "true");
      mp.appendChild(mi);
    }
    ml.appendChild(mp);
    var vb = document.createElement("vbox");
    vb.appendChild(ml);
    return vb;
  },

  getInputToggleImage: function(iIndex, sOperation) {
    var hb = document.createElement("hbox");
    var vb = document.createElement("vbox");
    var img = document.createElement("image");
    img.setAttribute("id", "img-" + iIndex);
    img.setAttribute("src", "chrome://sqlitemanager/skin/images/expand.png");
    img.setAttribute("style", "margin-top:5px;");
    img.setAttribute("tooltiptext", sm_getLStr("rowOp.tooltip.expandInput"));
    img.setAttribute("onclick", 'RowOperations.collapseInputField("' + iIndex + '")');
    vb.appendChild(img);
    hb.appendChild(vb);

    if (sOperation == "update" || sOperation == "insert" || sOperation == "duplicate") {
      var vb1 = document.createElement('vbox');
      var img1 = document.createElement('image');
      img1.setAttribute('id', 'img-addBlob-' + iIndex);
      img1.setAttribute('src', 'chrome://sqlitemanager/skin/images/attachBlob.gif');
      img1.setAttribute("style", "margin-top:5px;");
      img1.setAttribute("tooltiptext", sm_getLStr("rowOp.tooltip.addBlob"));
      img1.setAttribute("onclick", 'RowOperations.addBlob(' + iIndex + ')');
      vb1.appendChild(img1);
      hb.appendChild(vb1);

      var vb2 = document.createElement('vbox');
      var img2 = document.createElement('image');
      img2.setAttribute('id', 'img-saveBlob-' + iIndex);
      img2.setAttribute('src', 'chrome://sqlitemanager/skin/images/saveBlob.png');
      img2.setAttribute('style', 'margin-top:5px;');
      img2.setAttribute("tooltiptext", sm_getLStr("rowOp.tooltip.saveBlob"));
      img2.setAttribute('onclick', 'RowOperations.saveBlob(' + iIndex + ')');
      img2.setAttribute('hidden', 'true');
      vb2.appendChild(img2);
      hb.appendChild(vb2);

      var vb3 = document.createElement('vbox');
      var img3 = document.createElement('image');
      img3.setAttribute('id', 'img-removeBlob-' + iIndex);
      img3.setAttribute('src', 'chrome://sqlitemanager/skin/images/delete_red.gif');
      img3.setAttribute('style', 'margin-top:5px;');
      img3.setAttribute("tooltiptext", sm_getLStr("rowOp.tooltip.deleteBlob"));
      img3.setAttribute('onclick', 'RowOperations.removeBlob(' + iIndex + ')');
      img3.setAttribute('hidden', 'true');
      vb3.appendChild(img3);
      hb.appendChild(vb3);
    }
    return hb;
  },

  getTextBoxHeight: function() {
    //show the reference textbox, get the height and hide it
    //needed because multiline is taller than normal textbox even when rows=1
    var oRef = $$("reference");
    oRef.hidden = false;
    var iHeight = oRef.boxObject.height;
    oRef.hidden = true;
    return iHeight;
  },

  onInputValue: function(elt, bAnalyzeValue) {
    var iIndex = elt.getAttribute("fieldindex");

    //issue #428: for integer primary key column, do the following and return
    if (this.maFieldInfo[iIndex].isColPk) {
      elt.setAttribute("placeholder", "Primary key (will autoincrement)");
      elt.setAttribute("style", "-moz-appearance: none;background-color:#ffff99;");
      this.maFieldInfo[iIndex].newType = SQLiteTypes.INTEGER;
      this.maFieldInfo[iIndex].hasChanged = true;
      if (elt.value == "")
        this.maFieldInfo[iIndex].hasChanged = false;
      return;
    }

    if (bAnalyzeValue) {
      var valInfo = this.mDb.determineType(elt.value);
      this.maFieldInfo[iIndex].newType = valInfo.type;

      //if the value is a blob
      this.maFieldInfo[iIndex].newBlob = null;
      if (valInfo.type == SQLiteTypes.BLOB)
        this.maFieldInfo[iIndex].newBlob = valInfo.value;

      //if the value is one of the case independent keywords for date/time
      this.maFieldInfo[iIndex].isConstant = false;
      if (valInfo.type == SQLiteTypes.TEXT && valInfo.isConstant)
        this.maFieldInfo[iIndex].isConstant = true;

      //if we have re-analyzed the input, we consider it has changed (for insert stmt)
      this.maFieldInfo[iIndex].hasChanged = true;
    }

    //make ui adjustments dependent on new data type
    var imgSave = $$("img-saveBlob-" + iIndex);
    var imgRemove = $$("img-removeBlob-" + iIndex);
    if (imgSave)
      imgSave.setAttribute("hidden", "true");
    if (imgRemove)
      imgRemove.setAttribute("hidden","true");

    var iType = this.maFieldInfo[iIndex].newType;
    elt.setAttribute("placeholder", "Empty string");
    switch (iType) {
      case SQLiteTypes.NULL:
        elt.setAttribute("placeholder", "Null");
        elt.setAttribute("style", "-moz-appearance: none;background-color:#ffcccc;");
        break;
      case SQLiteTypes.INTEGER:
        elt.setAttribute("style", "-moz-appearance: none;background-color:#ccffcc;");
        break;
      case SQLiteTypes.REAL:
        elt.setAttribute("style", "-moz-appearance: none;background-color:#66ff66;");
        break;
      case SQLiteTypes.TEXT:
        if (this.maFieldInfo[iIndex].isConstant)
          elt.setAttribute("style", "-moz-appearance: none;background-color:#ff9966;");
        else
          elt.setAttribute("style", "-moz-appearance: none;background-color:#ccffff;");
        break;
      case SQLiteTypes.BLOB:
        elt.setAttribute("placeholder", "Empty blob");
        if (imgSave)
          imgSave.setAttribute("hidden", "false");
        if (imgRemove)
          imgRemove.setAttribute("hidden","false");
        elt.setAttribute("style", "-moz-appearance: none;background-color:#ccccff;");
        break;
    }
  },

  onKeyPressValue: function(evt) {
    if (evt.ctrlKey) {
      var elt = evt.target;
      var iIndex = elt.getAttribute("fieldindex");
      var iType = this.maFieldInfo[iIndex].newType;
      switch (String.fromCharCode(evt.charCode)) {
        case '0': //restore the original values
          elt.value = this.maFieldInfo[iIndex].oldValue;
          this.maFieldInfo[iIndex].newType = this.maFieldInfo[iIndex].oldType;
          this.maFieldInfo[iIndex].newBlob = null;
          if (this.sOperation == "duplicate") {
            this.maFieldInfo[iIndex].newBlob = this.maFieldInfo[iIndex].oldBlob;
          }
          this.maFieldInfo[iIndex].isConstant = false;
          this.onInputValue(elt, false);
          return;
          break;

        case 'd': //for the default value, if any
          if (this.sOperation == "update") //TODO: implement for update too
            return;

          if (this.populateWithDefault(iIndex)) {
            elt.value = this.maFieldInfo[iIndex].oldValue;
            this.onInputValue(elt, false);
          }
          else {
            sm_alert(sm_getLStr("defaultval.title"), sm_getLStr("defaultval.message"));
          }
          return;
          break;

        case 'n': //treat the value as null
          if (this.maFieldInfo[iIndex].newType != SQLiteTypes.NULL)
            this.maFieldInfo[iIndex].hasChanged = true;

          elt.value = "";
          this.maFieldInfo[iIndex].newType = SQLiteTypes.NULL;
          this.onInputValue(elt, false);
          return;
          break;

        case 't': //treat the value as text
          if (this.maFieldInfo[iIndex].newType != SQLiteTypes.TEXT)
            this.maFieldInfo[iIndex].hasChanged = true;

          this.maFieldInfo[iIndex].newType = SQLiteTypes.TEXT;
          this.onInputValue(elt, false);
          return;
          break;

        case 'b': //treat the value as blob
          if (this.maFieldInfo[iIndex].newType != SQLiteTypes.BLOB)
            this.maFieldInfo[iIndex].hasChanged = true;

          this.maFieldInfo[iIndex].newType = SQLiteTypes.BLOB;
          var aBlob = this.mDb.textToBlob(elt.value);
          this.maFieldInfo[iIndex].newBlob = aBlob;
          this.onInputValue(elt, false);
          return;
          break;

        case '1':
          elt.value = "CURRENT_DATE";
          break;
        case '2':
          elt.value = "CURRENT_TIME";
          break;
        case '3':
          elt.value = "CURRENT_TIMESTAMP";
          break;
      }
      this.onInputValue(elt, true);
    }
    else if (evt.keyCode && !this.mbMultiline) {
      var elt = evt.target;
      var iIndex = elt.getAttribute("fieldindex");
      iIndex = parseInt(iIndex);

      switch(evt.keyCode.toString()) {
        case "40":
          var newIdx = iIndex + 1;
          var nextInp = document.getElementById("ctrl-tb-" + newIdx);
          if (nextInp) {
            nextInp.focus();
            nextInp.select();
          };
          break;

        case "38":
          var newIdx = iIndex - 1;
          var prevInp = document.getElementById("ctrl-tb-" + newIdx);
          if (prevInp) {
            prevInp.focus();
            prevInp.select();
          };
          break;

        default:
          break;
      }
    }
  },

  getInputField: function(iIndex) {
    var inp1 = document.createElement("textbox");
    inp1.setAttribute("id", "ctrl-tb-" + iIndex);
    inp1.setAttribute("flex", "30");
    inp1.setAttribute("multiline", this.mbMultiline);
    inp1.setAttribute("rows", "1");
    inp1.setAttribute("oninput", "RowOperations.onInputValue(this, true);");
    inp1.setAttribute("onkeypress", "RowOperations.onKeyPressValue(event);");
    inp1.setAttribute("onfocus", "this.select();");

    //following attributes are not in xul
    inp1.setAttribute("fieldindex", iIndex);

    var iHeight = this.getTextBoxHeight();
    inp1.setAttribute("height", iHeight);

    return inp1;
  },

  populateWithDefault: function(iIndex) {
    //dflt_value == null => there is no default value.
    //In such cases, the function below will return null too
    var sDefaultValue = this.maFieldInfo[iIndex].dflt_value;

    //if the column has a default value, analyze it, display it, etc.
    if (sDefaultValue != null) {
      var oRet = SQLiteFn.analyzeDefaultValue(sDefaultValue);
      this.maFieldInfo[iIndex].oldValue = oRet.displayValue;
      this.maFieldInfo[iIndex].oldType = oRet.type;
      this.maFieldInfo[iIndex].newType = oRet.type;
      this.maFieldInfo[iIndex].oldBlob = null;
      this.maFieldInfo[iIndex].newBlob = null;
      this.maFieldInfo[iIndex].isDefault = true;

      if (this.sOperation == "duplicate" || this.sOperation == "insert") {
        this.maFieldInfo[iIndex].hasChanged = false;
      }

      //for blobs, do the following
      if (this.maFieldInfo[iIndex].oldType == SQLiteTypes.BLOB) {
        this.maFieldInfo[iIndex].oldBlob = oRet.value;
        this.maFieldInfo[iIndex].newBlob = oRet.value;
      }
      return true;
    }
    //to allow callers to check that there is no default value
    return false;
  },

  setInsertValues: function(bForceDefault) {
    //Issue #169
    if (!bForceDefault) {
      var sInsertFieldStatus = sm_prefsBranch.getCharPref("whenInsertingShow");
      if (sInsertFieldStatus != "default")
        return false;
    }

    for(var i = 0; i < this.maFieldInfo.length; i++) {
      if (!this.populateWithDefault(i)) {
        //in here means the column does not have a default value
        this.maFieldInfo[i].oldValue = "";
        this.maFieldInfo[i].oldBlob = null;
        this.maFieldInfo[i].newBlob = null;
        this.maFieldInfo[i].isDefault = false;

        //let the value be null until changed by user
        this.maFieldInfo[i].oldType = SQLiteTypes.NULL;
        this.maFieldInfo[i].newType = SQLiteTypes.NULL;
        this.maFieldInfo[i].hasChanged = false;

        //however, if null is not allowed, make it empty text
        if (this.maFieldInfo[i].notnull == 1) {
          this.maFieldInfo[i].oldType = SQLiteTypes.TEXT;
          this.maFieldInfo[i].newType = SQLiteTypes.TEXT;
          this.maFieldInfo[i].hasChanged = true;
        }
      }
    }

    //now, manage the textbox
    for (var i = 0; i < this.maFieldInfo.length; i++) {
      var txtBox = $$("ctrl-tb-" + i);
      txtBox.value = this.maFieldInfo[i].oldValue;
      this.onInputValue(txtBox, false);
    }
  },

  collapseInputField: function(id) {
    var inptb = $$("ctrl-tb-" + id);
    var iLines = inptb.getAttribute("rows");
    var bMultiline = inptb.hasAttribute("multiline");
    var iMinRows = 1, iMaxRows = 10;

    var img = $$("img-" + id);
    if (iLines == 1) {
      inptb.removeAttribute("height");
      adjustTextboxRows(inptb, iMinRows, iMaxRows);
      img.setAttribute('src', 'chrome://sqlitemanager/skin/images/collapse.png');
      img.setAttribute("tooltiptext", sm_getLStr("rowOp.tooltip.collapseInput"));
    }
    else {
      var iHeight = this.getTextBoxHeight();
      inptb.setAttribute("height", iHeight);
      inptb.setAttribute("rows", 1);
      img.setAttribute('src', 'chrome://sqlitemanager/skin/images/expand.png');
      img.setAttribute("tooltiptext", sm_getLStr("rowOp.tooltip.expandInput"));
    }
  },

  loadForViewRecord: function(sViewName, aViewColInfo) {
    $$("tablenames").hidden = true;
    $$("label-name").value = sm_getLStr("rowOp.viewName") + sViewName;

    var aNames = aViewColInfo[0];
    var aTypes = aViewColInfo[1];

    var grbox = $$("columnEntryFields");
    SmGlobals.$empty(grbox);
    var cap = document.createElement("caption");
    cap.setAttribute("label", sm_getLStr("rowOp.enterFieldValues"));
    grbox.appendChild(cap);

    this.aColumns = [];
    for(var i = 0; i < aNames.length; i++) {
      var oneCol = {};
      oneCol.name = aNames[i];
      this.aColumns.push(oneCol);

      var hbox = document.createElement("hbox");
      hbox.setAttribute("flex", "1");
      hbox.setAttribute("style", "margin:2px 3px 2px 3px");

      var lbl = document.createElement("label");
      var lblVal = (i+1) + ". " + aNames[i];
      lblVal += " ( " + aTypes[i] + " )";
      lbl.setAttribute("value", lblVal);
      lbl.setAttribute("style", "padding-top:5px;width:25ex");
      if (i < 9)
        lbl.setAttribute("accesskey", (i+1));
      lbl.setAttribute("control", "ctrl-tb-" + i);
      hbox.appendChild(lbl);

      var spacer = document.createElement("spacer");
      spacer.flex = "1";
      hbox.appendChild(spacer);

      var vb = this.getSearchMenuList(aNames[i]);
      hbox.appendChild(vb);

      var inp = this.getInputField(i);
      hbox.appendChild(inp);

      var vb = this.getInputToggleImage(i);
      hbox.appendChild(vb);

      grbox.appendChild(hbox);
    }
  },

  doOKInsert: function() {
    var inpval, fld;
    var aCols = [];
    var aVals = [];

    var iParamCounter = 1;
    var aParamData = [];
    for(var i = 0; i < this.maFieldInfo.length; i++) {
      var ctrltb = $$("ctrl-tb-" + i);
      inpval = ctrltb.value;

      var iTypeNew = this.maFieldInfo[i].newType;

      //if the column has not changed, ignore it
      // this allows autoincrement of primary key columns, accepts default values where available, null if null is allowed and empty string if null is not allowed.
      if (this.sOperation == "insert") {
        if (!this.maFieldInfo[i].hasChanged)
          continue;
      }

      fld = SQLiteFn.quoteIdentifier(this.maFieldInfo[i].colName);

      if (iTypeNew == SQLiteTypes.BLOB) {
        //if we try to update a field to x'' or empty blob, the field gets updated to null
        //so, until a proper solution can be found, do the following if ... else ...
        if (this.maFieldInfo[i].newBlob.length == 0) {
          inpval = "X''";
        }
        else {
          inpval = "?" + iParamCounter;
          aParamData.push([(iParamCounter-1), this.maFieldInfo[i].newBlob, iTypeNew]);
          iParamCounter++;
        }
      }
      if (iTypeNew == SQLiteTypes.TEXT) {
        if (this.maFieldInfo[i].isConstant) {
          inpval = ctrltb.value;
        }
        else {
          inpval = "?" + iParamCounter;
          aParamData.push([(iParamCounter-1), ctrltb.value, iTypeNew]);
          iParamCounter++;
        }
      }
      if (iTypeNew == SQLiteTypes.NULL || iTypeNew == SQLiteTypes.INTEGER || iTypeNew == SQLiteTypes.REAL) {
        //Issue 464: if primary key, avoid binding with integer; directly use value in sql statement. We handle it here because for colPK, type will be INTEGER
        if (this.maFieldInfo[i].isColPk) {
          inpval = ctrltb.value;
        }
        else {
          inpval = "?" + iParamCounter;
          aParamData.push([(iParamCounter-1), ctrltb.value, iTypeNew]);
          iParamCounter++;
        }
      }

      aCols.push(fld);
      aVals.push(inpval);
    }
    if (aCols.length == 0) {
      this.maQueries = ["INSERT INTO " + this.mDb.getPrefixedName(this.sCurrentTable, "") + " DEFAULT VALUES"];
    }
    else {
      var cols = "(" + aCols.toString() + ")";
      var vals = "(" + aVals.toString() + ")";

      this.maQueries = ["INSERT INTO " + this.mDb.getPrefixedName(this.sCurrentTable, "") + " " + cols + " VALUES " + vals];
      this.maParamData = aParamData;
    }
    if (this.mbConfirmationNeeded)
      this.seekConfirmation();
    else
      this.doOKConfirm();
    return false;
  },

  notify: function(sMessage, sType) {
    sm_notify("boxNotify", sMessage, sType);
  },

  doOKUpdate: function() {
    var inpval, inpOriginalVal;
    var iTypeOld, iTypeNew;
    var cols = [], vals = "", fld;
    var aParamData = [];
    var iParamCounter = 1;
    for(var i = 0; i < this.aColumns.length; i++) {
      var ctrltb = $$("ctrl-tb-" + i);
      inpval = ctrltb.value;
      inpOriginalVal = this.maFieldInfo[i].oldValue;

      iTypeOld = this.maFieldInfo[i].oldType;
      iTypeNew = this.maFieldInfo[i].newType;

      //ignore column if it did not change
      if (iTypeOld == iTypeNew) {
        //1. if null, displayed values, etc. do not matter
        if (iTypeOld == SQLiteTypes.NULL)
          continue;

        //2. for other types, values should match to be ignored
        if (inpOriginalVal == inpval)
          continue;
      }

      if (iTypeNew == SQLiteTypes.BLOB) {
        //if we try to update a field to x'' or empty blob, the field gets updated to null
        //so, until a proper solution can be found, do the following if ... else ...
        if (this.maFieldInfo[i].newBlob.length == 0) {
          inpval = "X''";
        }
        else {
          inpval = "?" + iParamCounter;
          aParamData.push([(iParamCounter-1), this.maFieldInfo[i].newBlob, iTypeNew]);
          iParamCounter++;
        }
      }
      if (iTypeNew == SQLiteTypes.TEXT) {
        if (this.maFieldInfo[i].isConstant) {
          inpval = ctrltb.value;
        }
        else {
          inpval = "?" + iParamCounter;
          aParamData.push([(iParamCounter-1), ctrltb.value, iTypeNew]);
          iParamCounter++;
        }
      }
      if (iTypeNew == SQLiteTypes.NULL || iTypeNew == SQLiteTypes.INTEGER || iTypeNew == SQLiteTypes.REAL) {
        inpval = "?" + iParamCounter;
        aParamData.push([(iParamCounter-1), ctrltb.value, iTypeNew]);
        iParamCounter++;
      }

      fld = SQLiteFn.quoteIdentifier(this.aColumns[i].name);
      cols.push(fld + " = " + inpval);
    }

    if (cols.length == 0) {
      alert(sm_getLStr("rowOp.noChanges"));
      return false;
    }

    this.maQueries = ["UPDATE " + this.mDb.getPrefixedName(this.sCurrentTable, "") + " SET " + cols.join(", ") + " WHERE " + this.mRowId];
    this.maParamData = aParamData

    if (this.mbConfirmationNeeded)
      this.seekConfirmation();
    else
      this.doOKConfirm();

    return false;
  },

//required in case delete option is added to the edit record dialog
  doOKDelete: function() {
    this.maQueries = ["DELETE FROM " +
          this.mDb.getPrefixedName(this.sCurrentTable, "")+ " WHERE " + this.mRowId];
    this.maParamData = null;
    if (this.mbConfirmationNeeded)
      this.seekConfirmation();
    else
      this.doOKConfirm();
    return false;
  },

  //used for searching within table/view
  doOKSearch: function() {
    var inpval, opval, fld;
    var where = [];
    for(var i = 0; i < this.aColumns.length; i++) {
      var ctrltb = $$("ctrl-tb-" + i);
      inpval = ctrltb.value;
      opval = $$("op-" + this.aColumns[i].name).value;

      //fixed issue #490
      if (inpval.length == 0 && (this.aOps[opval][0] != "IS NULL" && this.aOps[opval][0] != "IS NOT NULL"))
        continue;
//      if (this.aOps[opval][0] == g_strIgnore)
//        continue;

      switch (this.aOps[opval][0]) {
        case "IS NULL":
          inpval = " ISNULL ";
          break;
        case "IS NOT NULL":
          inpval = " NOTNULL ";
          break;
        case "IN":
          inpval = this.aOps[opval][1] + inpval + this.aOps[opval][2];
          break;
        case "custom":
          inpval = this.aOps[opval][1] + inpval + this.aOps[opval][2];
          break;
        default:
          if (this.aOps[opval][2] != "") {
            inpval = this.aOps[opval][1] + inpval + this.aOps[opval][2];
          }
          else {//figure out whether value is string/constant
            inpval = this.aOps[opval][1] + SQLiteFn.makeSqlValue(inpval);
          }
          break;
      }
      inpval = SQLiteFn.quoteIdentifier(this.aColumns[i].name) + " " + inpval;
      where.push(inpval);
    }
    var extracol = "";
    if (this.sOperation == "search") {  //do this for table, not for view
      var rowidcol = this.mDb.getTableRowidCol(this.sCurrentTable);
      if (rowidcol["name"] == "rowid")
        extracol = " rowid, ";
    }

    if(where.length > 0)
      where = " WHERE " + where.join(" AND ");

    var answer = true;
    if(answer) {
      var aRetVals = window.arguments[5];
      aRetVals.sWhere = where;
      aRetVals.ok = true;
      return true;
    }
    //return false so that window stays there for more queries
    //the user must cross, escape or cancel to exit
    //return false; //commented due to Issue #32
  },

  doCancel: function() {
      return true;
  },

  doOKConfirm: function() {
    this.changeState(0);
    var bRet = this.mDb.executeWithoutConfirm(this.maQueries, this.maParamData);
    if (bRet) {
      this.notify(this.mNotifyMessages[0], "info");
      var aRetVals = window.arguments[5];
      //do the following to trigger SQLiteManager.loadTabBrowse();
      sm_setUnicodePref("searchCriteria", aRetVals.instanceId);
      //the value of searchToggler should toggle for loadTabBrowse() to be called.
      var bTemp = sm_prefsBranch.getBoolPref("searchToggler");
      sm_prefsBranch.setBoolPref("searchToggler", !bTemp);
    }
    else {
      this.notify(this.mNotifyMessages[1], "warning");
    }

    if (this.mAcceptAction == "doOKInsert") {
      this.setInsertValues(false);
      $$("ctrl-tb-0").focus();
    }
    if (this.mAcceptAction == "doOKUpdate") {
      //reset values so that no further change means no more update
      this.populateFieldData(this.sCurrentTable, this.mRowId);
    }
    return false;
  },

  doCancelConfirm: function() {
    this.changeState(0);
    return false;
  },

  changeState: function(iNewState) {
    $$("deck-rowedit").selectedIndex = iNewState;
    if (iNewState == 0) {
      this.setAcceptAction(this.mAcceptAction);
      this.setCancelAction("doCancel");
    }
    if (iNewState == 1) {
      this.setAcceptAction("doOKConfirm");
      this.setCancelAction("doCancelConfirm");
    }
  },

  seekConfirmation: function() {
    var ask = sm_getLStr("rowOp.confirmation");
    var txt = ask + "\n\n" + this.maQueries.join("\n");
    if (this.maQueries.length == 1 && this.maParamData.length > 0) {
      txt += "\nParameters:\n";
      for (var i = 0; i < this.maParamData.length; i++) {
        var sType = SQLiteFn.getTypeDescription(this.maParamData[i][2]);
        var sVal = this.maParamData[i][1];
        if (sType == "null") sVal = "NULL";
        if (sType == "blob") sVal = SQLiteFn.blobToHex(this.maParamData[i][1]);
        txt += "param " + (i + 1) + " (" + sType + "): " + sVal + "\n";
      }
    }
    $$("tbMessage").value = txt; //Issue #648
    this.changeState(1);
  }
};
