function SMExtensionManager(objDb) {
  this.m_db = SQLiteManager.mDb;//Database;
  this.m_tbl = sm_prefsBranch.getCharPref("tableForExtensionManagement");
};

SMExtensionManager.prototype = {
  //variable to handle the current query in query history
  m_queryId: null,
  
  m_bSetUsageDone: false,
  //boolean value: true if m_tbl exists, or is explicitly set to true
  m_bUseConfig: false,

  m_oColStates: {},

  _init: function(dbPath) {
    //if the table does not exist, create it
    if (!this.m_db.tableExists(this.m_tbl))  {
      if (!this.m_bUseConfig)
        return false;

      var aQueries = [];
      aQueries.push("create table " + this.m_tbl + " (`id` integer primary key, `type` text not null , `value` text)");
      this.m_db.executeTransaction(aQueries);
    }
    this.m_db.executeTransaction(["delete from " + this.m_tbl + " where `type` = 'Enabled'", "insert into " + this.m_tbl + "(`type`, `value`) values('Enabled', '1')"]);

    return true;
  },

  setUsage: function(bUse, bImplicit) {
    this.m_bSetUsageDone = true;

    this.m_bUseConfig = bUse;
    if (this.m_bUseConfig) {
      this._init();
    }
    else {
      if (bImplicit) return;

      if (this.m_db.tableExists(this.m_tbl)) {
        var aQueries = [];
        aQueries.push();
        var bRet = confirm(sm_getLFStr("extManager.dropTableConfirm", [this.m_tbl],1));
        if (bRet)
          this.m_db.executeTransaction(["drop table " + this.m_tbl]);
        else
          this.m_db.executeTransaction(["delete from " + this.m_tbl + " where `type` = 'Enabled'", "insert into " + this.m_tbl + "(`type`, `value`) values('Enabled', '0')"]);
      }
    }
  },

  getUsage: function() {
    //check for the table and enable type = 1 to return true;
    if(this.m_db.tableExists(this.m_tbl)) {
      this.m_db.selectQuery("select value from " + this.m_tbl + " where type = 'Enabled'");
      var aData = this.m_db.getRecords();
      if (aData.length > 0 && aData[0][0] == 1) {
        return true;
      }
    }
    return false;
  },

  addQuery: function(sQuery) {
    if (!this.m_bUseConfig)
      return false;

    this.m_db.executeTransaction(["insert into " + this.m_tbl + "(type, value) values('QueryHistory', " + SQLiteFn.quote(sQuery) + ")"]);
    return true;
  },

  //TODO: these functions must avoid saving and returning duplicates
  getPrevSql: function() {
    if (!this.m_bUseConfig)
      return false;

    var crit2 = "";
    if (this.m_queryId != null)
      crit2 = " and id < " + this.m_queryId;

    this.m_db.selectQuery('select "id", "value" from ' + this.m_tbl + " where type = 'QueryHistory' and id = (select max(id) from " + this.m_tbl + " where type = 'QueryHistory' " + crit2 + ")");
    var aData = this.m_db.getRecords();
    if (aData.length > 0) {
      this.m_queryId = aData[0][0];
      return aData[0][1];
    }

    return null;
  },

  getNextSql: function() {
    if (!this.m_bUseConfig)
      return false;

    if (this.m_queryId == null)
      return null;

    this.m_db.selectQuery("select id, value from " + this.m_tbl + " where type = 'QueryHistory' and id = (select min(id) from " + this.m_tbl + " where type = 'QueryHistory' and id > " + this.m_queryId + ")");
    var aData = this.m_db.getRecords();
    if (aData.length > 0) {
      this.m_queryId = aData[0][0];
      return aData[0][1];
    }

    return null;
  },

  clearSqlHistory: function() {
    if (!this.m_bUseConfig)
      return false;

    this.m_db.executeTransaction(["delete from " + this.m_tbl + " where type = 'QueryHistory'"]);
    alert(sm_getLStr("extManager.deleteQueries") + this.m_tbl);
    this.m_queryId = null;
    return true;
  },

  saveSqlByName: function(sQuery) {
    if (!this.m_bUseConfig)
      return false;

    var qName = prompt(sm_getLStr("extManager.qName.enter"), "");

    //if cancelled, abort
    if (qName == "" || qName == null)
      return false;

    var temp = this.getQueryList(qName);
    if (temp.length > 0) {
      alert(sm_getLStr("extManager.qName.exists"));
      return false;
    }

    this.m_db.executeTransaction(['INSERT INTO ' + this.m_tbl + '("type", "value") VALUES(' + SQLiteFn.quote('NamedQuery:' + qName) + ', ' + SQLiteFn.quote(sQuery) + ')']);
    return true;
  },

  getQueryList: function(sQueryName) {
    if (!this.m_bUseConfig)
      return false;

    var prefix = "NamedQuery:", criteria;
    if (sQueryName == undefined)
      criteria = "like '" + prefix + "%'";
    else
      criteria = "= '" + prefix + sQueryName + "'";

    try {
    this.m_db.selectQuery('SELECT "type", "value" FROM ' + this.m_tbl + ' WHERE "type" ' + criteria + ' ORDER BY "type"');
    } catch (e) {
      alert(e);
    }
    var aData = this.m_db.getRecords();

    var aQueries = new Array();
    var aTemp, sName;
    for (var iC = 0; iC < aData.length; iC++)
    {
      sName = aData[iC][0].substring(prefix.length);
      aTemp = [sName, aData[iC][1]];
      aQueries.push(aTemp);
    }

    return aQueries;
  },

  goToLastQuery: function() {
    if (!this.m_bUseConfig)
      return false;

    this.m_queryId = null;
    return true;
  },
  
  getStructTreeState: function() {
    if (!this.m_bUseConfig)
      return false;

    var sEc = "StructTree:ExpandedCategories", sEo = "StructTree:ExpandedObjects";
    var aExpand = [["all-table"],[]];

    this.m_db.selectQuery('select "id", "value" from ' + this.m_tbl + " where type = '" + sEc + "'");
    var aData = this.m_db.getRecords();
    if (aData.length > 0) {
      aExpand[0] = aData[0][1].split(",");
    }
    this.m_db.selectQuery('select "id", "value" from ' + this.m_tbl + " where type = '" + sEo + "'");
    var aData = this.m_db.getRecords();
    if (aData.length > 0) {
      aExpand[1] = aData[0][1].split(",");
    }

    return aExpand;
  },

  setStructTreeState: function(aExpand) {
    if (!this.m_bUseConfig)
      return false;

    var sEc = "StructTree:ExpandedCategories", sEo = "StructTree:ExpandedObjects";

    var q1 = "delete from " + this.m_tbl + " where type = '" + sEc + "' OR type = '" + sEo + "'";
    var q2 = "insert into " + this.m_tbl + "(type, value) values('" + sEc + "', '" + aExpand[0].toString() + "')";
    var q3 = "insert into " + this.m_tbl + "(type, value) values('" + sEo + "', '" + aExpand[1].toString() + "')";
    this.m_db.executeTransaction([q1,q2,q3]);
  },

  saveBrowseTreeColState: function(objType, objName, objState) {
    var sEc = "BrowseTree:ColState:" + objType + ":" + objName;
    this.m_oColStates[sEc] = objState;

    if (!this.m_bUseConfig) {
      return false;
    }


    var q1 = "delete from " + this.m_tbl + " where type = '" + sEc + "'";
    var q2 = "insert into " + this.m_tbl + "(type, value) values('" + sEc + "', '" + objState + "')";
    this.m_db.executeTransaction([q1,q2]);
  },

  getBrowseTreeColState: function(objType, objName) {
    var sEc = "BrowseTree:ColState:" + objType + ":" + objName;
    if (this.m_oColStates[sEc])
      return this.m_oColStates[sEc];

    if (!this.m_bUseConfig)
      return false;

    var aStr = "";
    this.m_db.selectQuery("select value from " + this.m_tbl + " where type = '" + sEc + "'");
    var aData = this.m_db.getRecords();
    if (aData.length > 0) {
      aStr = aData[0][0];
      this.m_oColStates[sEc] = aStr;
    }

    return aStr;
  },

  getAttachedDbList: function() {
    if (!this.m_bUseConfig)
      return false;

    var sEc = "StructTree:AttachedDb";
    var aAttached = [];

    this.m_db.selectQuery('select "value" from ' + this.m_tbl + " where type = '" + sEc + "'");
    var aData = this.m_db.getRecords();
    if (aData.length > 0) {
      aAttached = JSON.parse(aData[0][0]);
    }

    return aAttached;
  },

  setAttachedDbList: function(aAttached) {
    if (!this.m_bUseConfig)
      return false;

    var sEc = "StructTree:AttachedDb";

    var q1 = "delete from " + this.m_tbl + " where type = '" + sEc + "'";
    var q2 = "insert into " + this.m_tbl + "(type, value) values('" + sEc + "', '" + JSON.stringify(aAttached) + "')";
    this.m_db.executeTransaction([q1,q2]);
  }
};
