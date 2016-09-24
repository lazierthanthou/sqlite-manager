Components.utils.import("resource://sqlitemanager/sqlite.js");

var CreateManager = {
  //arrays with information for each field
  aFieldNames: null,
  aFieldTypes: null,

  sCurrentTable: null,
  sObject: null,
  sOperation: null,

  numOfEmptyColumns: 20, //shown during create table

  loadEmptyColumns: function() {
    var node = $$("rows-all");
    this.numOfEmptyColumns = sm_prefsBranch.getIntPref("maxColumnsInTable");

    var row = $$("row-template");
    for(var i = 0; i < this.numOfEmptyColumns; i++) {
      var clone = row.cloneNode(true);
      clone.setAttribute("id", "row-" + i);
      clone.setAttribute("style", "");
      var children = clone.childNodes;
      var id;
      for (var j = 0; j < children.length; j++) {
        id = children[j].getAttribute("id") + "-" + i;
        children[j].setAttribute("id", id);
      };

      node.appendChild(clone);
    }
  },

  loadOccupiedColumns: function(sTableName) {
    var bReadOnlyColNames = false;
    var aRetVals = window.arguments[1];
    if (typeof aRetVals.readonlyFlags != "undefined") {
      if (aRetVals.readonlyFlags.indexOf("colnames") >= 0)
        bReadOnlyColNames = true;
    }

    $$("tablename").value = aRetVals.tableName;
    var node = $$("rows-all");
    this.numOfEmptyColumns = aRetVals.colNames.length;

    var row = $$("row-template");
    for(var i = 0; i < this.numOfEmptyColumns; i++) {
      var clone = row.cloneNode(true);
      clone.setAttribute("id", "row-" + i);
      clone.setAttribute("style", "");
      var children = clone.childNodes;
      var id;
       for (var j = 0; j < children.length; j++) {
           id = children[j].getAttribute("id");
           if (id == "colname") {
            children[j].setAttribute("value", aRetVals.colNames[i]);
            if (bReadOnlyColNames)
              children[j].setAttribute("readonly", bReadOnlyColNames);
          }
           children[j].setAttribute("id", id + "-" + i);
       };

      node.appendChild(clone);
    }
  },

  mDb: null,

  loadCreateTableDialog: function () {
    this.mDb = window.arguments[0];
    var aRetVals = window.arguments[1];

    this.sObject = "TABLE";
    
    this.loadDbNames("dbName", this.mDb.logicalDbName);

    if (typeof aRetVals.tableName == "undefined")
      this.loadEmptyColumns();
    else
      this.loadOccupiedColumns();
    window.sizeToContent();
  },
    
  changeDataType: function(sId) {
    var sVal = $$(sId).value;
    var sNum = sId.substr(sId.lastIndexOf("-")+1);
    var sPkeyId = "primarykey-" + sNum;
    var sAutoId = "autoincrement-" + sNum;

    if (sVal.toUpperCase() == "INTEGER" && $$(sPkeyId).checked)
      $$(sAutoId).disabled = false;
    else {
      $$(sAutoId).disabled = true;
      $$(sAutoId).checked = false;
    }
  },

  togglePrimaryKey: function(sId) {
    var bPk = $$(sId).checked;
    var sNum = sId.substr(sId.lastIndexOf("-")+1);
    var sNullId = "allownull-" + sNum;
    var sDefId = "defaultvalue-" + sNum;
    var sAutoId = "autoincrement-" + sNum;
    var sTypeId = "datatype-" + sNum;
    if ($$(sTypeId).value.toUpperCase() == "INTEGER" && bPk)
      $$(sAutoId).disabled = false;
    else {
      $$(sAutoId).disabled = true;
      $$(sAutoId).checked = false;
    }

    if (bPk) {
      $$(sNullId).checked = !bPk;
    }
  },

  selectDb: function(sID) {
    this.loadTableNames("tabletoindex", this.sCurrentTable, false);
  },

  selectTable: function(sID) {
    var sTable = $$(sID).value;
    //function names have been assigned in the main load functions
    if(this.sObject == "INDEX")
      this.loadFieldNames(sTable);
  },

  loadCreateIndexDialog: function () {
    this.mDb = window.arguments[0];
    this.sCurrentTable = window.arguments[1];

    this.sObject = "INDEX";

    this.loadDbNames("dbName", this.mDb.logicalDbName);
    this.loadTableNames("tabletoindex", this.sCurrentTable, false);

    this.loadFieldNames(this.sCurrentTable);
  },

  loadFieldNames: function(sTableName) {
    document.title = sm_getLFStr("createMngr.index.title", [sTableName], 1);
     var dbName = $$("dbName").value;
    var cols = this.mDb.getTableInfo(sTableName, dbName);
    this.aFieldNames = [], aTypes = [];
    for(var i = 0; i < cols.length; i++) {
      this.aFieldNames.push(cols[i].name);
      aTypes.push(cols[i].type);
    }
    var vbox = $$("definecolumns");

    while (vbox.firstChild) {
       vbox.removeChild(vbox.firstChild);
    }
      
    for(var i = 0; i < this.aFieldNames.length; i++) {
      var radgr = document.createElement("radiogroup");
      radgr.setAttribute("id", "rad-" + (i+1));

      var hbox = document.createElement("hbox");
      hbox.setAttribute("flex", "1");
      hbox.setAttribute("style", "margin:2px 3px 2px 3px");
      hbox.setAttribute("align", "right");
      
      var lbl = document.createElement("label");
      lbl.setAttribute("value", (i+1) + ". " + this.aFieldNames[i]);
      lbl.setAttribute("style", "padding-top:5px;width:100px;");
      lbl.setAttribute("accesskey", (i+1));
      lbl.setAttribute("control", "rad-" + (i+1));
      hbox.appendChild(lbl);
      
      var radio;
      radio = document.createElement("radio");
      radio.setAttribute("label", sm_getLStr("createMngr.index.donotuse"));
      radio.setAttribute("selected", "true");
      radio.setAttribute("value", "");
      hbox.appendChild(radio);

      radio = document.createElement("radio");
      radio.setAttribute("label", sm_getLStr("createMngr.index.ascending"));
      radio.setAttribute("value", SQLiteFn.quoteIdentifier(this.aFieldNames[i]) + " ASC");
      hbox.appendChild(radio);

      radio = document.createElement("radio");
      radio.setAttribute("label", sm_getLStr("createMngr.index.descending"));
      radio.setAttribute("value", SQLiteFn.quoteIdentifier(this.aFieldNames[i]) + " DESC");
      hbox.appendChild(radio);

      radgr.appendChild(hbox);
      
      vbox.appendChild(radgr);
    }
  },

  doOKCreateIndex: function() {
    var sName = $$("indexname").value;
    if(sName == "") {
      alert(sm_getLStr("createMngr.index.cannotBeNull"));
      return false;
    }

    var dbName = $$("dbName").value;
     sName = this.mDb.getPrefixedName(sName, dbName);

    var tbl = $$("tabletoindex").value;
    var dup = $$("duplicatevalues").selectedItem.value;
    
    var radgr, radval;
    var cols = "";
    for(var i = 0; i < this.aFieldNames.length; i++) {
      radgr = $$("rad-" + (i+1));
      radval = radgr.value;
      if(radval != "") {
        if(cols != "")
          radval = ", " + radval;
        
        cols = cols + radval;
      }
    }  
    if(cols == "") {
      alert(sm_getLStr("createMngr.index.noFieldsSelected"));
      return false;
    }
    
    var sQuery = "CREATE " + dup + " INDEX " + sName + " ON " + SQLiteFn.quoteIdentifier(tbl) +  " (" + cols + ")";
    return this.mDb.confirmAndExecute([sQuery], sm_getLFStr("createMngr.index.confirm", [sName], 1), "confirm.create");
  },

  loadCreateTriggerDialog: function () {
    this.mDb = window.arguments[0];
    this.sCurrentTable = window.arguments[1];

    this.sObject = "trigger";

    this.loadDbNames("dbName", this.mDb.logicalDbName);
    this.loadTableNames("tabletoindex", this.sCurrentTable, false);
  },

  //used for create index/trigger dialogs;
  loadTableNames: function(sListBoxId, sTableName, bMaster) {
    var dbName = $$("dbName").value;
    var listbox = $$(sListBoxId);

    var aMastTableNames = [];
    if (bMaster)
      aMastTableNames = this.mDb.getObjectList("master", dbName);
    var aNormTableNames = this.mDb.getObjectList("table", dbName);
    var aObjectNames = aMastTableNames.concat(aNormTableNames);
    if(this.sObject == "trigger") {
      var aViewNames = this.mDb.getObjectList("view", dbName);
      aObjectNames = aObjectNames.concat(aViewNames);
    }
    PopulateDropDownItems(aObjectNames, listbox, sTableName);

    if(this.sObject == "INDEX")
      this.selectTable("tabletoindex");
  },

  loadDbNames: function(sListBoxId, sDbName) {
    var listbox = $$(sListBoxId);
    var aObjectNames = this.mDb.getDatabaseList();
    PopulateDropDownItems(aObjectNames, listbox, sDbName);
  },

  doOK: function() {
  },

  doOKCreateTable: function() {
    var sName = $$("tablename").value;
    if(sName == "") {
      alert(sm_getLStr("createMngr.tbl.cannotBeNull"));
      return false;
    }
    if(sName.indexOf("sqlite_") == 0) {
      alert(sm_getLStr("createMngr.tbl.cannotBeginSqlite"));
      return false;
    }

    var txtTemp = "";
    if($$("temptable").checked)
      txtTemp = " TEMP ";

    //temp object will be created in temp db only
    if (txtTemp == "") {
      var dbName = $$("dbName").value;
      sName = this.mDb.getPrefixedName(sName, dbName);
    }
    else
      sName = SQLiteFn.quoteIdentifier(sName);

    var txtExist = "";
    if($$("ifnotexists").checked)
      txtExist = " IF NOT EXISTS ";

    //find which textboxes contain valid entry for column name
    var iTotalRows = this.numOfEmptyColumns;
    var aCols = [];
    for(var i = 0; i < iTotalRows; i++) {
      var colname = $$("colname-" + i).value;
      if(colname.length == 0 || colname == null || colname == undefined) {
        continue;
      }
      if(colname == "rowid" || colname == "_rowid_" || colname == "oid") {
        alert(sm_getLStr("createMngr.invalidColname"));
        return false;
      }
      //if colname is valid, get the col definition details in aCols array; coldef needs name, datatype, pk, autoinc, default, allownull
      var col = [];
      colname = SQLiteFn.quoteIdentifier(colname);
      col["name"] = colname;
      col["type"] = $$("datatype-" + i).value;
      col["check"] = "";
      var si = $$("datatype-" + i).selectedItem;
      if (si != null) {
        if (si.hasAttribute('sm_check')) {
          col["type"] = si.getAttribute('sm_type');
          col["check"] = si.getAttribute('sm_check');
          col["check"] = col["check"].replace(/zzzz/g, colname);
        }
      }
      col["pk"] = $$("primarykey-" + i).checked;
      col["autoinc"] = $$("autoincrement-" + i).checked;
      col["defValue"] = $$("defaultvalue-" + i).value;
      col["allowNull"] = $$("allownull-" + i).checked;
      col["unique"] = $$("cb-unique-" + i).checked;
      aCols.push(col);
    }

    //populate arrays for primary key and count autoincrement columns
    var aPK = [], iAutoIncCols = 0;
    for(var i = 0; i < aCols.length; i++) {
      if(aCols[i]["pk"]) {
        aPK.push(aCols[i]["name"]);
      }
      if(aCols[i]["autoinc"]) {
        iAutoIncCols++;
      }
    }
    //some checks follow
    if(iAutoIncCols > 1) {
      alert(sm_getLStr("createMngr.autoincError.cols"));
      return false; //do not leave the dialog
    }
    if(iAutoIncCols > 0 && aPK.length > 1) {
      alert(sm_getLStr("createMngr.autoincError.PK"));
      return false; //do not leave the dialog
    }
    
    //prepare an array of column definitions
    var aColDefs = [];
    for(var i = 0; i < aCols.length; i++) {
      var sColDef = aCols[i]["name"] + " " + aCols[i]["type"];

      if(aPK.length == 1 && aCols[i]["pk"])
        sColDef += " PRIMARY KEY ";
      if(aCols[i]["autoinc"])
        sColDef += " AUTOINCREMENT ";

      if(!aCols[i]["allowNull"])
        sColDef += " NOT NULL ";
        
      if(aCols[i]["unique"])
        sColDef += " UNIQUE ";
        
      if(aCols[i]["check"] != "")
        sColDef += " " + aCols[i]["check"] + " ";
        
      var sDefValue = aCols[i]["defValue"];
      if (sDefValue != "")
        sColDef += " DEFAULT " + sDefValue;

      aColDefs.push(sColDef);
    }

    //this is the primary key constraint on multiple columns
    if(aPK.length > 1) {
      var constraintPK = "PRIMARY KEY (" + aPK.join(", ") + ")";
      aColDefs.push(constraintPK);
    }

    var sQuery = "CREATE " + txtTemp + " TABLE " + txtExist + sName + " (" + aColDefs.join(", ") + ")";

    var aRetVals = window.arguments[1];
    aRetVals.tableName = sName;
    aRetVals.createQuery = sQuery;
    aRetVals.ok = true;
    return true;
  },

  loadCreateViewDialog: function () {
    this.mDb = window.arguments[0];
    var aRetVals = window.arguments[1];
    this.loadDbNames("dbName", aRetVals.dbName);
    if (typeof aRetVals.readonlyFlags != "undefined") {
      if (aRetVals.readonlyFlags.indexOf("dbnames") >= 0)
        $$("dbName").setAttribute("disabled", true);
      if (aRetVals.readonlyFlags.indexOf("viewname") >= 0)
        $$("objectName").setAttribute("readonly", true);
    }
    if (typeof aRetVals.modify != "undefined") {
      $$("objectName").value = aRetVals.objectName;
      $$("txtSelectStatement").value = aRetVals.selectStmt;
      $$("tempObject").disabled = true;
      $$("ifnotexists").disabled = true;

      $$("txtSelectStatement").focus();
      document.title = sm_getLStr("createMngr.modifyView");
    }
  },
  
  doOKCreateView: function() {
    var sName = $$("objectName").value;
    if(sName == "") {
      alert(sm_getLStr("createMngr.view.cannotBeNull"));
      return false;
    }

    var txtTemp = "";
    if($$("tempObject").checked)
      txtTemp = " TEMP ";
      
    //temp object will be created in temp db only
    if (txtTemp == "") {
      var dbName = $$("dbName").value;
       sName = this.mDb.getPrefixedName(sName, dbName);
     }
     else
       sName = SQLiteFn.quoteIdentifier(sName);

    var txtExist = "";
    if($$("ifnotexists").checked)
      txtExist = " IF NOT EXISTS ";
        
    var selectStatement = $$("txtSelectStatement").value;
    if(selectStatement == "") {
      alert(sm_getLStr("createMngr.statement.cannotBeNull"));
      return false;
    }

    var aRetVals = window.arguments[1];
    var aQueries = [];
    if (typeof aRetVals.modify != "undefined") {
      aQueries.push("DROP VIEW " + sName);
    }
    var sQuery = "CREATE " + txtTemp + " VIEW " + txtExist + sName 
          + " AS " + selectStatement;
    aQueries.push(sQuery);

    aRetVals.objectName = sName;
    aRetVals.queries = aQueries;
    aRetVals.ok = true;
    return true;
  },

  doOKCreateTrigger: function() {
    var sName = $$("objectName").value;
    if(sName == "") {
      alert(sm_getLStr("createMngr.trigger.cannotBeNull"));
      return false;
    }

    var txtTemp = "";
    if($$("tempObject").checked)
      txtTemp = " TEMP ";

    //temp object will be created in temp db only
    if (txtTemp == "") {
      var dbName = $$("dbName").value;
      sName = this.mDb.getPrefixedName(sName, dbName);
    }
    else
      sName = SQLiteFn.quoteIdentifier(sName);

    var txtExist = "";
    if($$("ifnotexists").checked)
      txtExist = " IF NOT EXISTS ";
        
    var txtForEachRow = "";
    if($$("foreachrow").checked)
      txtForEachRow = " FOR EACH ROW ";
        
    var whenExpression = $$("txtWhenExpression").value;
    if(whenExpression == "" || whenExpression == null) {
      whenExpression = "";
    }
    else
      whenExpression = " WHEN " + whenExpression + " ";

    var steps = $$("txtTriggerSteps").value;
    if(steps == "") {
      alert(sm_getLStr("createMngr.trigger.cannotBeEmpty"));
      return false;
    }

    var txtTable = $$("tabletoindex").value;
    var txtTime = $$("triggerTime").selectedItem.label;
    var txtEvent = $$("dbEvent").selectedItem.label;

    var sQuery = "CREATE " + txtTemp + " TRIGGER " + txtExist + sName + " " + txtTime + " " + txtEvent + " ON " + SQLiteFn.quoteIdentifier(txtTable) + txtForEachRow + whenExpression + " BEGIN " + steps + " END";
    return this.mDb.confirmAndExecute([sQuery], sm_getLFStr("createMngr.trigger.confirm", [sName], 1), "confirm.create");
  },

  doCancel: function() {
    return true;
  }
};
